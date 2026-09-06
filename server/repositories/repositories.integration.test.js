import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pool } from 'pg'
import { runMigrations } from '../db/migrate.js'
import { withDeadlineTransaction, withTransaction } from '../db/pool.js'
import { createCampaignRepository, RevisionConflictError } from './campaignRepository.js'
import { createSettingsRepository } from './settingsRepository.js'
import { createTemplateRepository } from './templateRepository.js'
import { createUserRepository } from './userRepository.js'
import { createAuditRepository } from './auditRepository.js'
import { createIdempotencyRepository } from './idempotencyRepository.js'
import { createWorkflowService } from '../services/workflowService.js'
import { createIdempotencyService } from '../services/idempotencyService.js'
import { createGenerationControlPlane } from './generationJobRepository.js'
import { createGenerationService } from '../services/generationService.js'
import { createMockProvider } from '../providers/mockProvider.js'
import { buildApp } from '../app.js'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { createAuthenticator } from '../auth/verifyToken.js'
import { createGenerationProviderRegistry } from '../providers/registry.js'
import { reconcileGenerationSettings } from '../services/generationSettingsService.js'
import { createServerRuntime } from '../bootstrap.js'
import { createMemoryAssetStore } from '../storage/memoryAssetStore.js'
import sharp from 'sharp'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'
import { campaignVersionSnapshotSchema } from '../../shared/contracts.js'
import { createVersionService } from '../services/versionService.js'
import { createInProcessRenderer } from '../rendering/inProcessRenderer.js'
import { createVersionRepository } from './versionRepository.js'
import { createReviewService } from '../services/reviewService.js'
import { createReviewRepository } from './reviewRepository.js'
import { createDeliveryService } from '../services/deliveryService.js'
import { createDeliveryRepository } from './deliveryRepository.js'
import { createAssetService } from '../services/assetService.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
const pools = new Set()
const temporaryDirectories = new Set()

function makePool({ max = 4 } = {}) {
  const pool = new Pool({ connectionString: databaseUrl, max })
  pools.add(pool)
  return pool
}

function observeSettlementWithin(promise, timeoutMs) {
  let timer
  const settled = promise.then(
    (value) => ({ kind: 'fulfilled', value }),
    (error) => ({ kind: 'rejected', error }),
  )
  const observed = Promise.race([
    settled,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'deadline_ignored' }), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
  return { observed, settled }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((settle, fail) => { resolve = settle; reject = fail })
  return { promise, resolve, reject }
}

function storedZipEntries(bytes) {
  const entries = []
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('Expected deterministic stored ZIP directory')
  const count = bytes.readUInt16LE(eocd + 10)
  let offset = bytes.readUInt32LE(eocd + 16)
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Expected deterministic stored ZIP entries')
    const method = bytes.readUInt16LE(offset + 10)
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const filenameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const localOffset = bytes.readUInt32LE(offset + 42)
    const localFilenameLength = bytes.readUInt16LE(localOffset + 26)
    const localExtraLength = bytes.readUInt16LE(localOffset + 28)
    if (method !== 0) throw new Error('Expected deterministic stored ZIP entries')
    const filenameStart = offset + 46
    const dataStart = localOffset + 30 + localFilenameLength + localExtraLength
    entries.push({
      filename: bytes.subarray(filenameStart, filenameStart + filenameLength).toString('utf8'),
      bytes: bytes.subarray(dataStart, dataStart + compressedSize),
    })
    offset = filenameStart + filenameLength + extraLength + commentLength
  }
  return entries
}

async function waitForAdvisoryWait(pool, minimum = 1) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await pool.query(
      `SELECT count(*)::int AS count FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event = 'advisory'`,
    )
    if (result.rows[0].count >= minimum) return
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error(`Expected ${minimum} advisory-lock waiter(s)`)
}

async function resetDatabase() {
  const pool = makePool()
  const result = await pool.query('SELECT current_database() AS name')
  if (result.rows[0].name !== 'banner_studio_test') {
    throw new Error(`Refusing to reset unexpected database ${result.rows[0].name}`)
  }
  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
  await pool.end()
  pools.delete(pool)
}

async function insertUser(client, overrides = {}) {
  const id = overrides.id ?? randomUUID()
  await client.query(
    `INSERT INTO users (id, email, firebase_uid, role, display_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, overrides.email ?? `${id}@example.test`, overrides.firebaseUid ?? `firebase-${id}`, overrides.role ?? 'marketer', overrides.displayName ?? 'Test User'],
  )
  return id
}

async function insertCampaign(client, createdBy, overrides = {}) {
  const repository = createCampaignRepository(client)
  return repository.create({
    id: overrides.id ?? randomUUID(),
    title: overrides.title ?? 'Autumn launch',
    brief: overrides.brief ?? { product: 'Course', audience: 'Learners', objective: 'Signups', offer: '', locale: 'en', notes: '' },
    createdBy,
  })
}

async function insertVersion(client, campaignId, createdBy, overrides = {}) {
  const repository = createCampaignRepository(client)
  return repository.createVersion({
    id: overrides.id ?? randomUUID(),
    campaignId,
    versionNumber: overrides.versionNumber ?? 1,
    snapshot: overrides.snapshot ?? { headline: 'Learn faster' },
    contentHash: overrides.contentHash ?? 'a'.repeat(64),
    createdBy,
  })
}

async function makeMigrationDirectory(files) {
  const directory = await mkdtemp(join(tmpdir(), 'banner-studio-migrations-'))
  temporaryDirectories.add(directory)
  await Promise.all(Object.entries(files).map(([name, sql]) => writeFile(join(directory, name), sql)))
  return directory
}

async function migrationDirectoryThrough(maximumVersion) {
  const files = {}
  for (const name of await readdir(join(process.cwd(), 'server/db/migrations'))) {
    const version = Number.parseInt(name.split('_', 1)[0], 10)
    if (version <= maximumVersion) files[name] = await readFile(join(process.cwd(), 'server/db/migrations', name), 'utf8')
  }
  return makeMigrationDirectory(files)
}

beforeEach(async () => {
  await resetDatabase()
  const pool = makePool()
  await runMigrations({ pool })
  await pool.end()
  pools.delete(pool)
})

afterAll(async () => {
  await Promise.all([...pools].map((pool) => pool.end().catch(() => {})))
})

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })))
  temporaryDirectories.clear()
})

describe('migration runner', () => {
  test('serializes concurrent runners and safely replays tracked checksummed migrations', async () => {
    await resetDatabase()
    const firstPool = makePool()
    const secondPool = makePool()

    await Promise.all([
      runMigrations({ pool: firstPool }),
      runMigrations({ pool: secondPool }),
    ])
    await runMigrations({ pool: firstPool })

    const tracked = await firstPool.query('SELECT name, checksum FROM schema_migrations ORDER BY name')
    expect(tracked.rows).toHaveLength(28)
    expect(tracked.rows.map((row) => row.name)).toEqual(['001_core.sql', '002_harden_persistence.sql', '003_retryable_idempotency.sql', '004_crash_safe_commands.sql', '005_authentication.sql', '006_disabled_rollout_compatibility.sql', '007_generation_control_plane.sql', '008_correct_generation_budget_day.sql', '009_generated_asset_integrity.sql', '010_immutable_review_versions.sql', '011_immutable_version_provenance.sql', '012_exact_version_provenance.sql', '013_migrate_legacy_image_provenance.sql', '014_preserve_legacy_multi_source_provenance.sql', '015_human_review_gates.sql', '016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'])
    expect(tracked.rows.every((row) => /^[a-f0-9]{64}$/.test(row.checksum))).toBe(true)
    await Promise.all([firstPool.end(), secondPool.end()])
    pools.delete(firstPool)
    pools.delete(secondPool)
  })

  test('persists repository data after all clients disconnect', async () => {
    const firstPool = makePool()
    const actorId = await insertUser(firstPool)
    const created = await insertCampaign(firstPool, actorId, { id: 'persistent-campaign' })
    expect(created.revision).toBe(0)
    await firstPool.end()
    pools.delete(firstPool)

    const reconnectedPool = makePool()
    const loaded = await createCampaignRepository(reconnectedPool).findById('persistent-campaign')
    expect(loaded).toMatchObject({ id: 'persistent-campaign', title: 'Autumn launch', status: 'draft', revision: 0 })
    await reconnectedPool.end()
    pools.delete(reconnectedPool)
  })

  test('orders numeric migration prefixes numerically', async () => {
    const pool = makePool()
    const directory = await makeMigrationDirectory({
      '10_tenth.sql': 'INSERT INTO migration_order (position) VALUES (10);',
      '2_second.sql': 'CREATE TABLE migration_order (position integer NOT NULL); INSERT INTO migration_order (position) VALUES (2);',
    })

    await runMigrations({ pool, directory })

    const order = await pool.query('SELECT position FROM migration_order')
    expect(order.rows.map((row) => row.position)).toEqual([2, 10])
    await pool.end()
    pools.delete(pool)
  })

  test('rejects duplicate numeric migration prefixes', async () => {
    const pool = makePool()
    const directory = await makeMigrationDirectory({
      '2_first.sql': 'SELECT 1;',
      '02_duplicate.sql': 'SELECT 2;',
    })

    await expect(runMigrations({ pool, directory })).rejects.toThrow('Duplicate migration version 2')
    await pool.end()
    pools.delete(pool)
  })

  test('rejects a changed checksum for an applied migration', async () => {
    const pool = makePool()
    const directory = await makeMigrationDirectory({
      '2_checksum.sql': 'CREATE TABLE checksum_guard (id integer PRIMARY KEY);',
    })
    await runMigrations({ pool, directory })
    await writeFile(join(directory, '2_checksum.sql'), 'CREATE TABLE checksum_guard_changed (id integer PRIMARY KEY);')

    await expect(runMigrations({ pool, directory })).rejects.toThrow('Migration checksum mismatch for 2_checksum.sql')
    expect((await pool.query("SELECT to_regclass('checksum_guard_changed') AS name")).rows[0].name).toBeNull()
    await pool.end()
    pools.delete(pool)
  })

  test('rolls back failed migration SQL and does not track it', async () => {
    const pool = makePool()
    const directory = await makeMigrationDirectory({
      '2_broken.sql': 'CREATE TABLE rolled_back_table (id integer); SELECT missing_column FROM rolled_back_table;',
    })

    await expect(runMigrations({ pool, directory })).rejects.toMatchObject({ code: '42703' })
    expect((await pool.query("SELECT to_regclass('rolled_back_table') AS name")).rows[0].name).toBeNull()
    expect((await pool.query('SELECT name FROM schema_migrations WHERE name = $1', ['2_broken.sql'])).rowCount).toBe(0)
    await pool.end()
    pools.delete(pool)
  })

  test('upgrades an original Task 6 database without checksum failure or data loss', async () => {
    await resetDatabase()
    const pool = makePool()
    const originalMigration = await readFile(join(process.cwd(), 'server/db/migrations/001_core.sql'), 'utf8')
    const originalChecksum = createHash('sha256').update(originalMigration).digest('hex')
    expect(originalChecksum).toBe('ec612d4f294390b992f06f4b75d93f21e95a1e2333bb243417bc5ea0fe0fdb3d')
    const baseDirectory = await makeMigrationDirectory({ '001_core.sql': originalMigration })
    expect(await runMigrations({ pool, directory: baseDirectory })).toEqual({ applied: ['001_core.sql'] })

    const actorId = await insertUser(pool, { id: 'upgrade-admin', role: 'admin' })
    const legacyCampaign = await insertCampaign(pool, actorId, { id: 'legacy-generation-campaign' })
    await pool.query(
      `INSERT INTO generation_jobs
         (id, campaign_id, step, provider, model, region, status, reserved_cost_microunits, idempotency_key, timeout_at, created_at, updated_at)
       VALUES ('legacy-generation-job', $1, 'brief_analysis', 'mock', 'mock-v1', 'europe-west6', 'failed', 1000, 'legacy-key',
               '2026-01-01T00:00:00Z', '2025-12-31T23:30:00Z', '2025-12-31T23:30:00Z')`,
      [legacyCampaign.id],
    )
    await pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, sha256, source, generation_job_id)
       VALUES
         ('legacy-generated-1', $1, 'direction', 'legacy/generated-1.png', 'image/png', 10, $2, 'generation', 'legacy-generation-job'),
         ('legacy-generated-2', $1, 'direction', 'legacy/generated-2.png', 'image/png', 11, $3, 'generation', 'legacy-generation-job')`,
      [legacyCampaign.id, '5'.repeat(64), '6'.repeat(64)],
    )
    await pool.query('UPDATE users SET disabled = true WHERE id = $1', [actorId])
    await pool.query(
      'UPDATE settings SET daily_budget_microunits = $1, updated_by = $2 WHERE singleton = $3',
      [5_000_000, actorId, true],
    )
    await pool.query(
      `INSERT INTO templates (id, version, name, manifest, manifest_hash, created_by, created_at)
       VALUES
         ($1, '1.9.0', 'Upgrade template', $2, $3, $4, '2026-01-01T00:00:00Z'),
         ($1, '1.10.0', 'Upgrade template', $5, $6, $4, '2026-01-01T00:00:00Z')`,
      ['upgrade-template', { version: '1.9.0' }, '3'.repeat(64), actorId, { version: '1.10.0' }, '4'.repeat(64)],
    )

    expect(await runMigrations({ pool })).toEqual({ applied: ['002_harden_persistence.sql', '003_retryable_idempotency.sql', '004_crash_safe_commands.sql', '005_authentication.sql', '006_disabled_rollout_compatibility.sql', '007_generation_control_plane.sql', '008_correct_generation_budget_day.sql', '009_generated_asset_integrity.sql', '010_immutable_review_versions.sql', '011_immutable_version_provenance.sql', '012_exact_version_provenance.sql', '013_migrate_legacy_image_provenance.sql', '014_preserve_legacy_multi_source_provenance.sql', '015_human_review_gates.sql', '016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'] })
    expect(await runMigrations({ pool })).toEqual({ applied: [] })

    const tracked = await pool.query('SELECT name, checksum FROM schema_migrations ORDER BY name')
    expect(tracked.rows.map((row) => row.name)).toEqual(['001_core.sql', '002_harden_persistence.sql', '003_retryable_idempotency.sql', '004_crash_safe_commands.sql', '005_authentication.sql', '006_disabled_rollout_compatibility.sql', '007_generation_control_plane.sql', '008_correct_generation_budget_day.sql', '009_generated_asset_integrity.sql', '010_immutable_review_versions.sql', '011_immutable_version_provenance.sql', '012_exact_version_provenance.sql', '013_migrate_legacy_image_provenance.sql', '014_preserve_legacy_multi_source_provenance.sql', '015_human_review_gates.sql', '016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'])
    expect((await pool.query("SELECT budget_day::text AS day FROM generation_jobs WHERE id = 'legacy-generation-job'")).rows[0].day).toBe('2025-12-31')
    expect(tracked.rows[0].checksum).toBe('ec612d4f294390b992f06f4b75d93f21e95a1e2333bb243417bc5ea0fe0fdb3d')
    expect((await createSettingsRepository(pool).get()).dailyBudgetMicrounits).toBe(5_000_000)
    expect((await pool.query('SELECT disabled, disabled_at FROM users WHERE id = $1', [actorId])).rows[0])
      .toMatchObject({ disabled: true, disabled_at: expect.any(Date) })
    expect((await pool.query(
      `SELECT id, integrity_version FROM assets WHERE id LIKE 'legacy-generated-%' ORDER BY id`,
    )).rows).toEqual([
      { id: 'legacy-generated-1', integrity_version: 0 },
      { id: 'legacy-generated-2', integrity_version: 0 },
    ])
    await expect(pool.query(
      `INSERT INTO assets (id, campaign_id, kind, object_key, mime_type, byte_size, sha256, source)
       VALUES ('new-invalid-generated', $1, 'direction', 'new/invalid.png', 'image/png', 12, $2, 'generation')`,
      [legacyCampaign.id, '7'.repeat(64)],
    )).rejects.toMatchObject({ code: '23514' })
    await expect(pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, generation_job_id, integrity_version)
       VALUES ('new-bypass-generated', $1, 'direction', 'new/bypass.png', 'image/png', 12, 1, 1, $2, 'generation', 'legacy-generation-job', 0)`,
      [legacyCampaign.id, 'b'.repeat(64)],
    )).rejects.toMatchObject({ code: '23514' })
    await pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, generation_job_id)
       VALUES ('new-generated-1', $1, 'direction', 'new/generated-1.png', 'image/png', 13, 1, 1, $2, 'generation', 'legacy-generation-job')`,
      [legacyCampaign.id, '8'.repeat(64)],
    )
    await expect(pool.query(
      `UPDATE assets SET integrity_version = 0 WHERE id = 'new-generated-1'`,
    )).rejects.toMatchObject({ code: '23514' })
    await expect(pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, generation_job_id)
       VALUES ('new-generated-2', $1, 'direction', 'new/generated-2.png', 'image/png', 14, 1, 1, $2, 'generation', 'legacy-generation-job')`,
      [legacyCampaign.id, '9'.repeat(64)],
    )).rejects.toMatchObject({ code: '23505' })
    expect(await createTemplateRepository(pool).listLatest())
      .toEqual([expect.objectContaining({ id: 'upgrade-template', version: '1.10.0', manifest: { version: '1.10.0' } })])
    const sequences = await pool.query(
      'SELECT version, publication_sequence FROM templates WHERE id = $1 ORDER BY publication_sequence',
      ['upgrade-template'],
    )
    expect(sequences.rows.map((row) => row.version)).toEqual(['1.9.0', '1.10.0'])
    await expect(pool.query('UPDATE settings SET daily_budget_microunits = $1 WHERE singleton = $2', ['9007199254740992', true]))
      .rejects.toMatchObject({ code: '23514' })
    const indexes = await pool.query(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'templates'",
    )
    expect(indexes.rows.some((row) => row.indexdef.includes('(id, publication_sequence DESC)'))).toBe(true)
    expect(indexes.rows.some((row) => row.indexdef.includes('(id, created_at DESC)'))).toBe(false)
    await pool.end()
    pools.delete(pool)
  })

  test('fails the exact-provenance migration on unresolved historical source hashes', async () => {
    await resetDatabase()
    const pool = makePool()
    const migrationFiles = {}
    for (const name of [
      '001_core.sql', '002_harden_persistence.sql', '003_retryable_idempotency.sql',
      '004_crash_safe_commands.sql', '005_authentication.sql', '006_disabled_rollout_compatibility.sql',
      '007_generation_control_plane.sql', '008_correct_generation_budget_day.sql',
      '009_generated_asset_integrity.sql', '010_immutable_review_versions.sql',
    ]) migrationFiles[name] = await readFile(join(process.cwd(), 'server/db/migrations', name), 'utf8')
    const preProvenanceDirectory = await makeMigrationDirectory(migrationFiles)
    await runMigrations({ pool, directory: preProvenanceDirectory })
    const actorId = await insertUser(pool, { id: 'provenance-backfill-actor' })
    const campaign = await insertCampaign(pool, actorId, { id: 'provenance-backfill-campaign' })
    await pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source)
       VALUES
         ('matching-source', $1, 'direction', 'backfill/matching.png', 'image/png', 1, 1, 1, $2, 'upload'),
         ('mismatched-source', $1, 'direction', 'backfill/mismatched.png', 'image/png', 1, 1, 1, $2, 'upload')`,
      [campaign.id, 'a'.repeat(64)],
    )
    await insertVersion(pool, campaign.id, actorId, {
      id: 'matching-history', versionNumber: 1,
      snapshot: { assets: [{ id: 'matching-source', kind: 'direction', sha256: 'a'.repeat(64) }] },
    })
    await insertVersion(pool, campaign.id, actorId, {
      id: 'mismatched-history', versionNumber: 2,
      snapshot: { assets: [{ id: 'mismatched-source', kind: 'direction', sha256: 'b'.repeat(64) }] },
    })

    await expect(runMigrations({ pool })).rejects.toMatchObject({ code: '23514' })
    expect((await pool.query(
      'SELECT version_id, asset_id, asset_sha256 FROM campaign_version_source_assets ORDER BY version_id',
    )).rows).toEqual([{
      version_id: 'matching-history', asset_id: 'matching-source', asset_sha256: 'a'.repeat(64),
    }])
    expect((await pool.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0].name)
      .toBe('011_immutable_version_provenance.sql')
    await pool.end()
    pools.delete(pool)
  })
})

describe('generation settings reconciliation', () => {
  const providerRegistry = createGenerationProviderRegistry({
    provider: 'gemini', textModel: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image', region: 'eu',
  })
  const selected = { provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu' }

  test('reconciles a freshly migrated seed row while preserving control values', async () => {
    const pool = makePool()
    await pool.query(
      'UPDATE settings SET daily_budget_microunits = $1, per_step_regeneration_limit = $2, generation_disabled = $3 WHERE singleton = $4',
      [321, 8, true, true],
    )

    await reconcileGenerationSettings({ pool, providerRegistry, selected })

    expect(await createSettingsRepository(pool).get()).toMatchObject({
      ...selected, dailyBudgetMicrounits: 321, perStepRegenerationLimit: 8,
      generationDisabled: true, revision: 0, updatedBy: null,
    })
    await pool.end()
    pools.delete(pool)
  })

  test('does not overwrite admin-modified settings that conflict with the active registry', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createSettingsRepository(pool).update({
      expectedRevision: 0, provider: 'mock', model: 'mock-v1', region: 'europe-west6',
      dailyBudgetMicrounits: 500, perStepRegenerationLimit: 4, generationDisabled: true, updatedBy: adminId,
    })

    await expect(reconcileGenerationSettings({ pool, providerRegistry, selected }))
      .rejects.toMatchObject({ code: 'generation_settings_conflict' })
    expect(await createSettingsRepository(pool).get()).toMatchObject({
      provider: 'mock', model: 'mock-v1', region: 'europe-west6', revision: 1, updatedBy: adminId,
      dailyBudgetMicrounits: 500, perStepRegenerationLimit: 4, generationDisabled: true,
    })
    await pool.end()
    pools.delete(pool)
  })
})

describe('non-production Gemini runtime settings reconciliation', () => {
  test.each(['development', 'test'])('reconciles the untouched seed in a fresh %s database runtime', async (nodeEnv) => {
    const provider = { close: vi.fn(async () => {}) }
    const verifier = { close: vi.fn(async () => {}) }
    const app = { close: vi.fn(async () => {}) }

    const runtime = await createServerRuntime({
      environment: {
        NODE_ENV: nodeEnv, DATABASE_URL: databaseUrl, GENERATION_PROVIDER: 'gemini',
        VERTEX_AI_PROJECT_ID: 'banner-project', VERTEX_AI_LOCATION: 'eu',
        GEMINI_TEXT_MODEL: 'gemini-3.5-flash', GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image',
      },
      dependencies: {
        createGeminiProvider: vi.fn(() => provider),
        createGenerationControlPlane: vi.fn(() => ({})),
        createGenerationService: vi.fn(() => ({})),
        createFirebaseTokenVerifier: vi.fn(() => verifier),
        createAuthenticator: vi.fn(() => vi.fn()),
        buildApp: vi.fn(() => app),
      },
    })

    const pool = makePool()
    expect(await createSettingsRepository(pool).get()).toMatchObject({
      provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu',
      revision: 0, updatedBy: null,
    })
    await runtime.close()
    await pool.end()
    pools.delete(pool)
  })
})

describe('transaction ownership', () => {
  test('rejects a caller-owned client without committing or releasing it', async () => {
    const pool = makePool()
    const client = await pool.connect()
    await client.query('BEGIN')
    await client.query('CREATE TEMP TABLE caller_transaction (value integer) ON COMMIT DROP')
    await client.query('INSERT INTO caller_transaction (value) VALUES (1)')

    try {
      await expect(withTransaction(client, async () => {}))
        .rejects.toThrow('withTransaction requires a PostgreSQL pool')
      expect((await client.query('SELECT value FROM caller_transaction')).rows).toEqual([{ value: 1 }])
    } finally {
      await client.query('ROLLBACK')
      client.release()
      await pool.end()
      pools.delete(pool)
    }
  })
})

describe('persistent workflow API checkpoint', () => {
  test('creates through HTTP, reloads after restart, executes a command, and persists its audit row', async () => {
    const firstPool = makePool()
    const actorId = await insertUser(firstPool, { id: 'workflow-admin', role: 'admin' })
    const actor = { id: actorId, role: 'admin', disabled: false }
    const firstService = createWorkflowService({ pool: firstPool })
    const firstApp = buildApp({ resolveActor: async () => actor, workflowService: firstService })
    const response = await firstApp.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      payload: {
        title: 'Persistent HTTP campaign',
        brief: { product: 'Course', audience: 'Learners', objective: 'Signups', offer: '', locale: 'en', notes: '' },
      },
    })
    expect(response.statusCode).toBe(201)
    expect(response.headers.etag).toBe('"0"')
    const campaignId = response.json().id
    await firstApp.close()
    await firstPool.end()
    pools.delete(firstPool)

    const restartedPool = makePool()
    const restartedService = createWorkflowService({ pool: restartedPool })
    const restartedApp = buildApp({ resolveActor: async () => actor, workflowService: restartedService })
    const reloaded = await restartedApp.inject({ method: 'GET', url: `/api/v1/campaigns/${campaignId}` })
    expect(reloaded.statusCode).toBe(200)
    expect(reloaded.json()).toMatchObject({ id: campaignId, title: 'Persistent HTTP campaign', status: 'draft', revision: 0 })

    const transitioned = await restartedService.executeCampaignCommand({
      actor,
      campaignId,
      expectedRevision: 0,
      action: 'campaign.mock_transition',
      validate: () => true,
      apply: (campaign) => ({ ...campaign, status: 'copy_ready' }),
      auditPayload: { checkpoint: true },
    })
    expect(transitioned).toMatchObject({ status: 'copy_ready', revision: 1 })
    const staleEdit = await restartedApp.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}`,
      headers: { 'if-match': '"0"' },
      payload: { title: 'Stale overwrite' },
    })
    expect(staleEdit.statusCode).toBe(409)
    expect(staleEdit.json()).toMatchObject({ code: 'revision_conflict' })
    const auditRows = await createAuditRepository(restartedPool).listForEntity({ entityType: 'campaign', entityId: campaignId })
    expect(auditRows).toEqual([
      expect.objectContaining({ action: 'campaign.mock_transition', beforeStatus: 'draft', afterStatus: 'copy_ready', payload: { checkpoint: true } }),
      expect.objectContaining({ action: 'campaign.created', beforeStatus: null, afterStatus: 'draft' }),
    ])
    await restartedApp.close()
    await restartedPool.end()
    pools.delete(restartedPool)
  })

  test('soft-archives through DELETE while preserving the campaign and history rows', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool, { role: 'admin' })
    const actor = { id: actorId, role: 'admin', disabled: false }
    const created = await insertCampaign(pool, actorId, { id: 'archive-campaign' })
    const version = await insertVersion(pool, created.id, actorId, { id: 'archive-version' })
    const service = createWorkflowService({ pool, clock: () => new Date('2026-09-04T12:00:00.000Z') })
    const app = buildApp({ resolveActor: async () => actor, workflowService: service })

    const response = await app.inject({ method: 'DELETE', url: `/api/v1/campaigns/${created.id}`, headers: { 'if-match': '"0"' } })

    expect(response.statusCode).toBe(204)
    expect(response.headers.etag).toBe('"1"')
    expect((await app.inject({ method: 'GET', url: `/api/v1/campaigns/${created.id}` })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/v1/campaigns' })).json().campaigns).toEqual([])
    expect(await createCampaignRepository(pool).findById(created.id)).toBeNull()
    expect((await pool.query('SELECT archived_at, revision FROM campaigns WHERE id = $1', [created.id])).rows[0])
      .toEqual({ archived_at: new Date('2026-09-04T12:00:00.000Z'), revision: 1 })
    expect((await pool.query('SELECT id FROM campaign_versions WHERE id = $1', [version.id])).rows).toEqual([{ id: version.id }])
    expect(await createAuditRepository(pool).listForEntity({ entityType: 'campaign', entityId: created.id }))
      .toEqual([expect.objectContaining({ action: 'campaign.archived', entityId: created.id })])
    await app.close()
    await pool.end()
    pools.delete(pool)
  })
})

describe('campaign repository and relational constraints', () => {
  test('rejects a stale expected revision without overwriting newer state', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const repository = createCampaignRepository(pool)

    const updated = await repository.updateState({
      id: campaign.id,
      expectedRevision: 0,
      title: 'Winter launch',
      status: 'copy_ready',
      brief: campaign.brief,
      selectedCopyId: null,
      selectedDirectionId: null,
      compositionId: null,
      currentVersionNumber: 0,
      openVersionId: null,
    })

    expect(updated).toMatchObject({ title: 'Winter launch', status: 'copy_ready', revision: 1 })
    await expect(repository.updateState({
      id: campaign.id,
      expectedRevision: 0,
      title: 'Stale overwrite',
      status: 'draft',
      brief: campaign.brief,
      selectedCopyId: null,
      selectedDirectionId: null,
      compositionId: null,
      currentVersionNumber: 0,
      openVersionId: null,
    })).rejects.toBeInstanceOf(RevisionConflictError)
    expect((await repository.findById(campaign.id)).title).toBe('Winter launch')
    await pool.end()
    pools.delete(pool)
  })

  test('enforces unique version numbers and a same-campaign open-version reference', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const otherCampaign = await insertCampaign(pool, actorId)
    const version = await insertVersion(pool, campaign.id, actorId, { id: 'version-one' })

    await expect(insertVersion(pool, campaign.id, actorId, { versionNumber: 1, contentHash: 'b'.repeat(64) }))
      .rejects.toMatchObject({ code: '23505' })
    await expect(pool.query(
      'UPDATE campaigns SET open_version_id = $1 WHERE id = $2',
      [version.id, otherCampaign.id],
    )).rejects.toMatchObject({ code: '23503' })

    const opened = await createCampaignRepository(pool).setOpenVersion({
      campaignId: campaign.id,
      versionId: version.id,
      expectedRevision: 0,
    })
    expect(opened).toMatchObject({ openVersionId: version.id, revision: 1 })
    await pool.end()
    pools.delete(pool)
  })

  test('increments revision when opening and closing a version and rejects stale revisions', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const version = await insertVersion(pool, campaign.id, actorId)
    const repository = createCampaignRepository(pool)

    expect(await repository.setOpenVersion({ campaignId: campaign.id, versionId: version.id, expectedRevision: 0 }))
      .toMatchObject({ openVersionId: version.id, revision: 1 })
    await expect(repository.clearOpenVersion({ campaignId: campaign.id, versionId: version.id, expectedRevision: 0 }))
      .rejects.toBeInstanceOf(RevisionConflictError)
    expect(await repository.clearOpenVersion({ campaignId: campaign.id, versionId: version.id, expectedRevision: 1 }))
      .toMatchObject({ openVersionId: null, revision: 2 })
    await pool.end()
    pools.delete(pool)
  })

  test('allows only one delivery for a campaign version', async () => {
    const pool = makePool()
    const constraint = await pool.query(
      `SELECT contype
       FROM pg_constraint
       WHERE conrelid = 'deliveries'::regclass
         AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                             WHERE attrelid = 'deliveries'::regclass AND attname = 'version_id')]::smallint[]`,
    )
    expect(constraint.rows).toContainEqual({ contype: 'u' })
    await pool.end()
    pools.delete(pool)
  })

  test('rejects selecting an artifact owned by another campaign', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const otherCampaign = await insertCampaign(pool, actorId)
    await pool.query(
      `INSERT INTO copy_sets (id, campaign_id, candidates)
       VALUES ($1, $2, $3)`,
      ['other-copy', otherCampaign.id, JSON.stringify([{ id: 'candidate-1' }])],
    )

    await expect(pool.query(
      'UPDATE campaigns SET selected_copy_id = $1 WHERE id = $2',
      ['other-copy', campaign.id],
    )).rejects.toMatchObject({ code: '23503' })
    await pool.end()
    pools.delete(pool)
  })
})

describe('append-only history', () => {
  test.each([
    ['campaign_versions', async (pool, actorId, campaignId) => insertVersion(pool, campaignId, actorId, { id: 'immutable-version' })],
    ['review_events', async (pool, actorId, campaignId) => {
      const reviewPngId = randomUUID()
      const manifestId = randomUUID()
      const reviewPngHash = 'b'.repeat(64)
      const manifestHash = 'c'.repeat(64)
      const snapshot = { assets: [
        { id: reviewPngId, kind: 'review_png', sha256: reviewPngHash },
        { id: manifestId, kind: 'manifest', sha256: manifestHash },
      ] }
      const version = await insertVersion(pool, campaignId, actorId, {
        snapshot, contentHash: hashCanonical(snapshot),
      })
      await pool.query(
        `INSERT INTO assets
           (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, version_id)
         VALUES
           ($1, $3, 'review_png', $4, 'image/png', 1, 1, 1, $5, 'render', $2),
           ($6, $3, 'manifest', $7, 'application/json', 1, NULL, NULL, $8, 'render', $2)`,
        [reviewPngId, version.id, campaignId, `campaigns/${campaignId}/${reviewPngId}.png`, reviewPngHash,
          manifestId, `campaigns/${campaignId}/${manifestId}.json`, manifestHash],
      )
      await pool.query("UPDATE campaigns SET status = 'composed', revision = 1 WHERE id = $1", [campaignId])
      await withTransaction(pool, async (client) => {
        await client.query(
          `UPDATE campaigns
           SET status = 'in_review', current_version_number = $2, open_version_id = $3,
               revision = revision + 1
           WHERE id = $1`,
          [campaignId, version.versionNumber, version.id],
        )
        await client.query(
          `INSERT INTO review_events (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
           VALUES ('immutable-review', $1, $2, $3, 'marketer', 'sent', $4)`,
          [campaignId, version.id, actorId, {
            contentHash: version.contentHash, assetHashes: [reviewPngHash, manifestHash].sort(),
          }],
        )
        await client.query(
          `INSERT INTO audit_events
             (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
           VALUES ('immutable-review-audit', $1, 'marketer', 'campaign.sent_for_review', 'campaign', $2,
                   'composed', 'in_review', $3, $4)`,
          [actorId, campaignId, version.id, {
            reviewEventId: 'immutable-review', versionNumber: version.versionNumber,
            contentHash: version.contentHash,
          }],
        )
      })
      return { id: 'immutable-review' }
    }],
    ['audit_events', async (pool, actorId, campaignId) => {
      await createAuditRepository(pool).append({
        id: 'immutable-audit', actorId, actorRole: 'marketer', action: 'campaign.created',
        entityType: 'campaign', entityId: campaignId, beforeStatus: null, afterStatus: 'draft', payload: {},
      })
      return { id: 'immutable-audit' }
    }],
  ])('rejects UPDATE and DELETE on %s', async (table, seed) => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const row = await seed(pool, actorId, campaign.id)

    await expect(pool.query(`UPDATE ${table} SET id = id WHERE id = $1`, [row.id]))
      .rejects.toMatchObject({ code: '55000' })
    await expect(pool.query(`DELETE FROM ${table} WHERE id = $1`, [row.id]))
      .rejects.toMatchObject({ code: '55000' })
    await pool.end()
    pools.delete(pool)
  })

  test('delivery reads fail closed when the complete database fact chain is poisoned', async () => {
    const harness = await approvedDeliveryHarness()
    await harness.deliveryService.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'delivery-read-integrity', input: {},
    })
    const repositoryFactory = (client) => ({
      ...createDeliveryRepository(client),
      isDeliveryStateValid: vi.fn(async () => false),
    })
    const service = createDeliveryService({ pool: harness.pool, assetStore: harness.assetStore, repositoryFactory })
    await expect(service.getDelivery({ actor: harness.actor, versionId: harness.created.body.version.id }))
      .rejects.toMatchObject({ code: 'delivery_integrity_failure' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('orphan cleanup never deletes a finalized delivery object', async () => {
    const harness = await approvedDeliveryHarness()
    const created = await harness.deliveryService.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'finalized-delivery-cleanup', input: {},
    })
    const objectKey = (await harness.pool.query(
      'SELECT object_key FROM assets WHERE id = $1', [created.body.delivery.asset.id],
    )).rows[0].object_key
    await harness.pool.query(
      `INSERT INTO orphaned_uploads (id, object_key, campaign_id, reason)
       VALUES ('finalized-delivery-orphan', $1, $2, 'ambiguous_cleanup_retry')`,
      [objectKey, harness.campaign.id],
    )
    const deleteObject = vi.fn()
    await expect(createGenerationControlPlane({ pool: harness.pool }).cleanupOrphanUpload({
      orphanId: 'finalized-delivery-orphan', deleteObject, cleanedAt: new Date(),
    })).resolves.toEqual({ kind: 'referenced', objectKey })
    expect(deleteObject).not.toHaveBeenCalled()
    await harness.pool.end()
    pools.delete(harness.pool)
  })
})

describe('supporting repositories', () => {
  test('preserves template versions and exposes the latest version', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool, { role: 'admin' })
    const repository = createTemplateRepository(pool)
    await repository.createVersion({ id: 'split-focus', version: '1.0.0', name: 'Split focus', manifest: { slots: [] }, manifestHash: 'd'.repeat(64), createdBy: actorId })
    await repository.createVersion({ id: 'split-focus', version: '1.1.0', name: 'Split focus', manifest: { slots: ['headline'] }, manifestHash: 'e'.repeat(64), createdBy: actorId })

    expect(await repository.findVersion('split-focus', '1.0.0')).toMatchObject({ version: '1.0.0', manifest: { slots: [] } })
    expect(await repository.listLatest()).toEqual([expect.objectContaining({ id: 'split-focus', version: '1.1.0' })])
    await expect(pool.query("UPDATE templates SET name = 'Changed' WHERE id = 'split-focus' AND version = '1.0.0'"))
      .rejects.toMatchObject({ code: '55000' })
    await expect(pool.query("DELETE FROM templates WHERE id = 'split-focus' AND version = '1.0.0'"))
      .rejects.toMatchObject({ code: '55000' })
    await pool.end()
    pools.delete(pool)
  })

  test('uses publication order for latest templates created in one transaction', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool, { role: 'admin' })

    await withTransaction(pool, async (client) => {
      const repository = createTemplateRepository(client)
      await repository.createVersion({ id: 'sequence-test', version: '1.9.0', name: 'Sequence', manifest: {}, manifestHash: '1'.repeat(64), createdBy: actorId })
      await repository.createVersion({ id: 'sequence-test', version: '1.10.0', name: 'Sequence', manifest: {}, manifestHash: '2'.repeat(64), createdBy: actorId })
    })

    expect(await createTemplateRepository(pool).listLatest())
      .toEqual([expect.objectContaining({ id: 'sequence-test', version: '1.10.0' })])
    await pool.end()
    pools.delete(pool)
  })

  test('replaces an expired pending invitation without weakening active uniqueness', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    const repository = createUserRepository(pool)
    await repository.createInvitation({ id: 'expired-invite', email: 'person@example.test', role: 'designer', invitedBy: adminId, expiresAt: new Date('2020-01-01T00:00:00Z') })

    const replacement = await repository.createInvitation({ id: 'replacement-invite', email: ' PERSON@example.test ', role: 'marketer', invitedBy: adminId, expiresAt: new Date('2030-01-01T00:00:00Z') })

    expect(replacement).toMatchObject({ id: 'replacement-invite', email: 'person@example.test', role: 'marketer' })
    const expired = await pool.query('SELECT revoked_at FROM invitations WHERE id = $1', ['expired-invite'])
    expect(expired.rows[0].revoked_at).toBeInstanceOf(Date)
    await expect(repository.createInvitation({ id: 'duplicate-active', email: 'person@example.test', role: 'designer', invitedBy: adminId, expiresAt: new Date('2031-01-01T00:00:00Z') }))
      .rejects.toMatchObject({ code: '23505' })
    await pool.end()
    pools.delete(pool)
  })

  test('persists settings and invitation-bound users through injected clients', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    const users = createUserRepository(pool)
    const invitation = await users.createInvitation({ id: 'invite-1', email: ' Designer@Example.test ', role: 'designer', invitedBy: adminId, expiresAt: new Date('2030-01-01T00:00:00Z') })
    expect(invitation.email).toBe('designer@example.test')
    const user = await users.acceptInvitation({ invitationId: invitation.id, userId: 'designer-1', firebaseUid: 'firebase-designer', verifiedEmail: 'DESIGNER@example.test', displayName: 'Designer' })
    expect(user).toMatchObject({ id: 'designer-1', email: 'designer@example.test', role: 'designer', disabled: false })

    const settings = createSettingsRepository(pool)
    const updated = await settings.update({ expectedRevision: 0, provider: 'gemini', model: 'gemini-2.5-flash', region: 'europe-west6', dailyBudgetMicrounits: 5_000_000, perStepRegenerationLimit: 3, generationDisabled: false, updatedBy: adminId })
    expect(updated).toMatchObject({ revision: 1, dailyBudgetMicrounits: 5_000_000, generationDisabled: false })
    expect(await settings.get()).toMatchObject({ provider: 'gemini', model: 'gemini-2.5-flash' })
    await pool.end()
    pools.delete(pool)
  })

  test('atomically binds concurrent first sign-ins to exactly one invited user', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createUserRepository(pool).createInvitation({
      id: 'race-invite', email: 'race@example.test', role: 'designer', invitedBy: adminId,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })

    const [first, second] = await Promise.all([
      withTransaction(pool, (client) => createUserRepository(client).resolveAuthenticatedUser({
        firebaseUid: 'firebase-race', verifiedEmail: 'race@example.test', displayName: 'Race User', userId: 'race-user-1',
      })),
      withTransaction(pool, (client) => createUserRepository(client).resolveAuthenticatedUser({
        firebaseUid: 'firebase-race', verifiedEmail: 'race@example.test', displayName: 'Race User', userId: 'race-user-2',
      })),
    ])

    expect(first.id).toBe(second.id)
    expect(['race-user-1', 'race-user-2']).toContain(first.id)
    expect((await pool.query('SELECT id FROM users WHERE firebase_uid = $1', ['firebase-race'])).rows).toHaveLength(1)
    expect((await pool.query('SELECT accepted_user_id, accepted_at FROM invitations WHERE id = $1', ['race-invite'])).rows[0])
      .toMatchObject({ accepted_user_id: first.id, accepted_at: expect.any(Date) })
    await pool.end()
    pools.delete(pool)
  })

  test('denies one of two concurrent first sign-ins using different UIDs for one email', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createUserRepository(pool).createInvitation({
      id: 'adversarial-race-invite', email: 'adversarial@example.test', role: 'designer', invitedBy: adminId,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    const authenticateAs = (firebaseUid, userId) => createAuthenticator({
      pool,
      tokenVerifier: { verify: async () => ({ uid: firebaseUid, email: 'adversarial@example.test', email_verified: true }) },
      idGenerator: () => userId,
    })({ headers: { authorization: 'Bearer token' } })

    const outcomes = await Promise.allSettled([
      authenticateAs('firebase-adversary-a', 'adversary-user-a'),
      authenticateAs('firebase-adversary-b', 'adversary-user-b'),
    ])
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ statusCode: 401, code: 'unauthorized', publicMessage: 'Authentication is required' }) }),
    ])
    const persisted = await pool.query(
      `SELECT u.id, u.firebase_uid, i.accepted_user_id
       FROM users u JOIN invitations i ON i.accepted_user_id = u.id
       WHERE i.id = $1`,
      ['adversarial-race-invite'],
    )
    expect(persisted.rows).toHaveLength(1)
    expect(['firebase-adversary-a', 'firebase-adversary-b']).toContain(persisted.rows[0].firebase_uid)
    expect(persisted.rows[0].accepted_user_id).toBe(persisted.rows[0].id)
    await pool.end()
    pools.delete(pool)
  })

  test('requires the accepted invitation UID and verified email on later requests', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createUserRepository(pool).createInvitation({
      id: 'identity-invite', email: 'identity@example.test', role: 'marketer', invitedBy: adminId,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    const repository = createUserRepository(pool)
    const accepted = await withTransaction(pool, (client) => createUserRepository(client).resolveAuthenticatedUser({
      firebaseUid: 'firebase-identity', verifiedEmail: 'identity@example.test', displayName: 'Identity', userId: 'identity-user',
    }))

    expect(accepted).toMatchObject({ id: 'identity-user', role: 'marketer', disabledAt: null })
    await expect(withTransaction(pool, (client) => createUserRepository(client).resolveAuthenticatedUser({
      firebaseUid: 'firebase-identity', verifiedEmail: 'other@example.test', displayName: 'Other', userId: 'other-user',
    }))).resolves.toBeNull()
    await expect(withTransaction(pool, (client) => createUserRepository(client).resolveAuthenticatedUser({
      firebaseUid: 'different-firebase-uid', verifiedEmail: 'identity@example.test', displayName: 'Identity', userId: 'other-user',
    }))).resolves.toBeNull()
    expect(await repository.findByFirebaseUid('firebase-identity')).toMatchObject({ id: 'identity-user' })
    await pool.end()
    pools.delete(pool)
  })

  test('requires the accepted invitation email to keep matching the persisted user and token', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createUserRepository(pool).createInvitation({
      id: 'join-email-invite', email: 'join-email@example.test', role: 'marketer', invitedBy: adminId,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    const authenticate = createAuthenticator({
      pool,
      tokenVerifier: { verify: async () => ({ uid: 'firebase-join-email', email: 'join-email@example.test', email_verified: true }) },
      idGenerator: () => 'join-email-user',
    })
    const authRequest = { headers: { authorization: 'Bearer token' } }
    await expect(authenticate(authRequest)).resolves.toMatchObject({ id: 'join-email-user' })
    await pool.query('UPDATE invitations SET email = $2 WHERE id = $1', ['join-email-invite', 'changed@example.test'])

    await expect(authenticate(authRequest)).rejects.toMatchObject({ statusCode: 401, code: 'unauthorized' })
    await pool.end()
    pools.delete(pool)
  })

  test('denies the next request when an accepted invitation is revoked', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createUserRepository(pool).createInvitation({
      id: 'revoked-accepted-invite', email: 'revoked-accepted@example.test', role: 'designer', invitedBy: adminId,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    const authenticate = createAuthenticator({
      pool,
      tokenVerifier: { verify: async () => ({ uid: 'firebase-revoked-accepted', email: 'revoked-accepted@example.test', email_verified: true }) },
      idGenerator: () => 'revoked-accepted-user',
    })
    const authRequest = { headers: { authorization: 'Bearer token' } }
    await expect(authenticate(authRequest)).resolves.toMatchObject({ id: 'revoked-accepted-user' })
    await pool.query('UPDATE invitations SET revoked_at = now() WHERE id = $1', ['revoked-accepted-invite'])

    await expect(authenticate(authRequest)).rejects.toMatchObject({ statusCode: 401, code: 'unauthorized' })
    await pool.end()
    pools.delete(pool)
  })

  test('reloads role and disabled state from PostgreSQL for every authenticated request', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createUserRepository(pool).createInvitation({
      id: 'live-role-invite', email: 'live-role@example.test', role: 'designer', invitedBy: adminId,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    const authenticate = createAuthenticator({
      pool,
      tokenVerifier: { verify: async () => ({ uid: 'firebase-live-role', email: 'live-role@example.test', email_verified: true }) },
      idGenerator: () => 'live-role-user',
    })
    const authRequest = { headers: { authorization: 'Bearer token' } }

    await expect(authenticate(authRequest)).resolves.toMatchObject({ role: 'designer', disabledAt: null })
    await pool.query('UPDATE users SET role = $2 WHERE id = $1', ['live-role-user', 'admin'])
    await expect(authenticate(authRequest)).resolves.toMatchObject({ role: 'admin', disabledAt: null })
    await pool.query('UPDATE users SET disabled_at = now() WHERE id = $1', ['live-role-user'])
    await expect(authenticate(authRequest)).rejects.toMatchObject({ statusCode: 403, code: 'user_disabled' })
    await pool.end()
    pools.delete(pool)
  })

  test('lets a legacy boolean writer disable access for the new reader', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    const users = createUserRepository(pool)
    const invitation = await users.createInvitation({
      id: 'old-writer-invite', email: 'old-writer@example.test', role: 'designer', invitedBy: adminId,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    await users.acceptInvitation({
      invitationId: invitation.id, userId: 'old-writer-user', firebaseUid: 'firebase-old-writer',
      verifiedEmail: 'old-writer@example.test', displayName: 'Old Writer',
    })
    await pool.query('UPDATE users SET disabled = true WHERE id = $1', ['old-writer-user'])
    const stored = (await pool.query('SELECT disabled, disabled_at FROM users WHERE id = $1', ['old-writer-user'])).rows[0]
    expect(stored).toMatchObject({ disabled: true, disabled_at: expect.any(Date) })
    const authenticate = createAuthenticator({
      pool,
      tokenVerifier: { verify: async () => ({ uid: 'firebase-old-writer', email: 'old-writer@example.test', email_verified: true }) },
    })

    await expect(authenticate({ headers: { authorization: 'Bearer token' } }))
      .rejects.toMatchObject({ statusCode: 403, code: 'user_disabled' })
    await pool.query('UPDATE users SET disabled = false WHERE id = $1', ['old-writer-user'])
    expect((await pool.query('SELECT disabled, disabled_at FROM users WHERE id = $1', ['old-writer-user'])).rows[0])
      .toEqual({ disabled: false, disabled_at: null })
    await expect(authenticate({ headers: { authorization: 'Bearer token' } }))
      .resolves.toMatchObject({ id: 'old-writer-user', disabled: false, disabledAt: null })
    await pool.end()
    pools.delete(pool)
  })

  test('dual-writes disabled state so a legacy boolean reader sees new writes', async () => {
    const pool = makePool()
    const userId = await insertUser(pool, { id: 'new-writer-user' })
    const users = createUserRepository(pool)

    await users.setDisabled({ id: userId, disabled: true })
    expect((await pool.query('SELECT disabled, disabled_at FROM users WHERE id = $1', [userId])).rows[0])
      .toMatchObject({ disabled: true, disabled_at: expect.any(Date) })
    await users.setDisabled({ id: userId, disabled: false })
    expect((await pool.query('SELECT disabled, disabled_at FROM users WHERE id = $1', [userId])).rows[0])
      .toEqual({ disabled: false, disabled_at: null })
    await pool.end()
    pools.delete(pool)
  })

  test('accepts an invitation through the authenticated session route', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createUserRepository(pool).createInvitation({
      id: 'session-invite', email: 'session@example.test', role: 'designer', invitedBy: adminId,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    const resolveActor = createAuthenticator({
      pool,
      tokenVerifier: { verify: async () => ({ uid: 'firebase-session', email: ' SESSION@example.test ', email_verified: true, name: 'Session User' }) },
      idGenerator: () => 'session-user',
    })
    const app = buildApp({ resolveActor, workflowService: {} })

    const response = await app.inject({
      method: 'GET', url: '/api/v1/session', headers: { authorization: 'Bearer valid-session-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: 'session-user', email: 'session@example.test', role: 'designer', displayName: 'Session User',
    })
    expect((await pool.query('SELECT accepted_user_id FROM invitations WHERE id = $1', ['session-invite'])).rows[0])
      .toEqual({ accepted_user_id: 'session-user' })
    await app.close()
    await pool.end()
    pools.delete(pool)
  })

  test('does not accept expired, revoked, or absent invitations', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    await createUserRepository(pool).createInvitation({
      id: 'expired-auth-invite', email: 'expired-auth@example.test', role: 'designer', invitedBy: adminId,
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    })
    const resolve = (email) => withTransaction(pool, (client) => createUserRepository(client).resolveAuthenticatedUser({
      firebaseUid: `firebase-${email}`, verifiedEmail: email, displayName: 'No Access', userId: `user-${email}`,
    }))

    await expect(resolve('expired-auth@example.test')).resolves.toBeNull()
    await expect(resolve('absent@example.test')).resolves.toBeNull()
    expect((await pool.query('SELECT id FROM users WHERE email IN ($1, $2)', ['expired-auth@example.test', 'absent@example.test'])).rowCount).toBe(0)
    await pool.end()
    pools.delete(pool)
  })

  test('round-trips the maximum safe budget and rejects database overflow', async () => {
    const pool = makePool()
    const adminId = await insertUser(pool, { role: 'admin' })
    const repository = createSettingsRepository(pool)

    const settings = await repository.update({ expectedRevision: 0, provider: 'mock', model: 'mock-v1', region: 'europe-west6', dailyBudgetMicrounits: 9_007_199_254_740_991, perStepRegenerationLimit: 3, generationDisabled: false, updatedBy: adminId })
    expect(settings.dailyBudgetMicrounits).toBe(9_007_199_254_740_991)
    expect((await repository.get()).dailyBudgetMicrounits).toBe(9_007_199_254_740_991)
    await expect(pool.query('UPDATE settings SET daily_budget_microunits = $1 WHERE singleton = $2', ['9007199254740992', true]))
      .rejects.toMatchObject({ code: '23514' })
    await pool.end()
    pools.delete(pool)
  })

  test.each([9_007_199_254_740_992, 1.5, -1, Number.NaN])(
    'rejects unsafe budget input %s before querying PostgreSQL',
    async (dailyBudgetMicrounits) => {
      const pool = makePool()
      const adminId = await insertUser(pool, { role: 'admin' })
      const repository = createSettingsRepository(pool)

      await expect(repository.update({ expectedRevision: 0, provider: 'mock', model: 'mock-v1', region: 'europe-west6', dailyBudgetMicrounits, perStepRegenerationLimit: 3, generationDisabled: false, updatedBy: adminId }))
        .rejects.toBeInstanceOf(RangeError)
      expect((await repository.get()).revision).toBe(0)
      await pool.end()
      pools.delete(pool)
    },
  )

  test('refuses to map an unsafe bigint returned by PostgreSQL', async () => {
    const client = {
      async query() {
        return { rows: [{
          provider: 'mock', model: 'mock-v1', region: 'europe-west6',
          daily_budget_microunits: '9007199254740992', per_step_regeneration_limit: 3,
          generation_disabled: false, revision: 0, updated_by: null, updated_at: new Date(0),
        }] }
      },
    }

    await expect(createSettingsRepository(client).get()).rejects.toBeInstanceOf(RangeError)
  })
})

describe('idempotency coordination', () => {
  test('reclaims expired leases after process death and fences the original owner token', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const repository = createIdempotencyRepository(pool)
    const scope = { actorId, method: 'POST', resourceId: 'lease-campaign', key: 'lease-key', fingerprint: 'a'.repeat(64) }

    expect(await repository.claim({ ...scope, ownerToken: 'owner-1', now: new Date('2026-09-04T10:00:00Z'), leaseExpiresAt: new Date('2026-09-04T10:00:10Z') }))
      .toEqual({ kind: 'owner' })
    expect(await repository.claim({ ...scope, ownerToken: 'owner-2', now: new Date('2026-09-04T10:00:05Z'), leaseExpiresAt: new Date('2026-09-04T10:00:15Z') }))
      .toEqual({ kind: 'in_progress' })
    expect(await repository.claim({ ...scope, ownerToken: 'owner-2', now: new Date('2026-09-04T10:00:11Z'), leaseExpiresAt: new Date('2026-09-04T10:00:21Z') }))
      .toEqual({ kind: 'owner' })
    await expect(repository.fail({ ...scope, ownerToken: 'owner-1', failureCode: 'late_owner_failure' }))
      .rejects.toMatchObject({ code: 'idempotency_owner_conflict' })
    expect(await repository.find(scope)).toMatchObject({
      state: 'in_progress', ownerToken: 'owner-2', leaseExpiresAt: new Date('2026-09-04T10:00:21Z'),
    })

    await withTransaction(pool, async (client) => {
      const transactional = createIdempotencyRepository(client)
      expect(await transactional.lockOwner({ ...scope, ownerToken: 'owner-1', now: new Date('2026-09-04T10:00:11Z') })).toBeNull()
      expect(await transactional.lockOwner({ ...scope, ownerToken: 'owner-2', now: new Date('2026-09-04T10:00:11Z') }))
        .toMatchObject({ ownerToken: 'owner-2', state: 'in_progress' })
    })
    await pool.end()
    pools.delete(pool)
  })

  test('bounds expired-lease recovery while the owner row remains locked, then replays its completion', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const repository = createIdempotencyRepository(pool)
    const payload = { command: 'persist' }
    const scope = {
      actorId, method: 'POST', resourceId: 'locked-campaign', key: 'locked-key', fingerprint: hashCanonical(payload),
    }
    await repository.claim({ ...scope, ownerToken: 'owner-1', now: new Date('2026-09-04T10:00:00Z'), leaseExpiresAt: new Date('2026-09-04T10:00:10Z') })

    const client = await pool.connect()
    await client.query('BEGIN')
    const transactional = createIdempotencyRepository(client)
    expect(await transactional.lockOwner({ ...scope, ownerToken: 'owner-1', now: new Date('2026-09-04T10:00:05Z') })).toBeTruthy()
    let logicalNow = new Date('2026-09-04T10:00:11Z').getTime()
    let contenderNumber = 0
    const service = createIdempotencyService({
      pool,
      idGenerator: () => `bounded-contender-${++contenderNumber}`,
      clock: () => new Date(logicalNow),
      wait: async (duration) => { logicalNow += duration },
      leaseMs: 1_000,
      pollIntervalMs: 10,
      timeoutMs: 30,
    })
    const operation = vi.fn(async () => ({ status: 500, body: { shouldNotRun: true } }))
    const contender = service.executeDatabaseCommand({
      actorId, method: 'POST', resourceId: 'locked-campaign', key: 'locked-key', payload, operation,
    })
    let ceilingTimer
    const startedAt = Date.now()
    const observed = await Promise.race([
      contender.then(
        (result) => ({ kind: 'resolved', result }),
        (error) => ({ kind: 'rejected', error }),
      ),
      new Promise((resolve) => { ceilingTimer = setTimeout(() => resolve({ kind: 'wall_clock_ceiling' }), 750) }),
    ])
    clearTimeout(ceilingTimer)
    const elapsedMs = Date.now() - startedAt

    await transactional.complete({ ...scope, ownerToken: 'owner-1', responseStatus: 200, responseBody: { committed: true } })
    await client.query('COMMIT')
    client.release()
    if (observed.kind === 'wall_clock_ceiling') await contender

    expect(observed).toMatchObject({ kind: 'rejected', error: { statusCode: 409, code: 'idempotency_in_progress' } })
    expect(elapsedMs).toBeLessThan(750)
    expect(operation).not.toHaveBeenCalled()
    expect(await service.executeDatabaseCommand({
      actorId, method: 'POST', resourceId: 'locked-campaign', key: 'locked-key', payload, operation,
    })).toEqual({ status: 200, body: { committed: true }, replayed: true })
    await pool.end()
    pools.delete(pool)
  })

  test('rolls domain writes back when response completion fails in the owner transaction', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const repositoryFactory = (client) => {
      const repository = createIdempotencyRepository(client)
      return { ...repository, complete: async () => { throw new Error('forced completion failure') } }
    }
    const service = createIdempotencyService({ pool, repositoryFactory, idGenerator: () => 'rollback-owner' })

    await expect(service.executeDatabaseCommand({
      actorId, method: 'POST', resourceId: 'rollback-campaign', key: 'rollback-key', payload: { title: 'Rollback' },
      operation: async (client) => {
        await createCampaignRepository(client).create({ id: 'rolled-back-campaign', title: 'Rollback', brief: { product: 'P', audience: 'A', objective: 'O', offer: '', locale: 'en', notes: '' }, createdBy: actorId })
        return { status: 201, body: { id: 'rolled-back-campaign' } }
      },
    })).rejects.toThrow('forced completion failure')

    expect((await pool.query('SELECT id FROM campaigns WHERE id = $1', ['rolled-back-campaign'])).rowCount).toBe(0)
    expect(await createIdempotencyRepository(pool).find({ actorId, method: 'POST', resourceId: 'rollback-campaign', key: 'rollback-key' }))
      .toMatchObject({ state: 'failed', ownerToken: 'rollback-owner' })
    await pool.end()
    pools.delete(pool)
  })

  test('persists JSON null and replays it instead of violating SQL null constraints', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    let ownerNumber = 0
    const service = createIdempotencyService({ pool, idGenerator: () => `null-owner-${++ownerNumber}` })
    const operation = vi.fn(async () => ({ status: 204, body: null }))
    const command = { actorId, method: 'POST', resourceId: 'null-campaign', key: 'null-key', payload: {}, operation }

    expect(await service.executeDatabaseCommand(command)).toEqual({ status: 204, body: null, replayed: false })
    expect(await service.executeDatabaseCommand(command)).toEqual({ status: 204, body: null, replayed: true })
    expect(operation).toHaveBeenCalledOnce()
    await pool.end()
    pools.delete(pool)
  })

  test('replays a committed response after the caller loses the commit response', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    let loseResponse = true
    const commitThenLose = async (targetPool, operation) => {
      const result = await withTransaction(targetPool, operation)
      if (loseResponse) {
        loseResponse = false
        throw new Error('connection lost after commit')
      }
      return result
    }
    let ownerNumber = 0
    const service = createIdempotencyService({ pool, transaction: commitThenLose, idGenerator: () => `loss-owner-${++ownerNumber}` })
    const operation = vi.fn(async () => ({ status: 201, body: { id: 'committed-version' } }))
    const command = { actorId, method: 'POST', resourceId: 'loss-campaign', key: 'loss-key', payload: {}, operation }

    await expect(service.executeDatabaseCommand(command)).rejects.toThrow('connection lost after commit')
    expect(await service.executeDatabaseCommand(command)).toEqual({ status: 201, body: { id: 'committed-version' }, replayed: true })
    expect(operation).toHaveBeenCalledOnce()
    await pool.end()
    pools.delete(pool)
  })

  test('marks owner failures and allows only the same fingerprint to retry ownership', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const repository = createIdempotencyRepository(pool)
    const scope = { actorId, method: 'POST', resourceId: 'campaign-failed', key: 'retry-failed' }

    expect(await repository.claim({ ...scope, fingerprint: 'a'.repeat(64), ownerToken: 'owner-1' }))
      .toEqual({ kind: 'owner' })
    await repository.fail({ ...scope, ownerToken: 'owner-1', failureCode: 'operation_failed' })
    expect(await repository.find(scope)).toMatchObject({ state: 'failed', failureCode: 'operation_failed' })
    expect(await repository.claim({ ...scope, fingerprint: 'b'.repeat(64), ownerToken: 'owner-conflict' }))
      .toEqual({ kind: 'conflict' })
    expect(await repository.claim({ ...scope, fingerprint: 'a'.repeat(64), ownerToken: 'owner-2' }))
      .toEqual({ kind: 'owner' })
    expect(await repository.find(scope)).toMatchObject({ state: 'in_progress', ownerToken: 'owner-2', failureCode: null })
    await repository.complete({ ...scope, ownerToken: 'owner-2', responseStatus: 200, responseBody: { recovered: true } })
    expect(await repository.claim({ ...scope, fingerprint: 'a'.repeat(64), ownerToken: 'owner-3' }))
      .toEqual({ kind: 'replay', responseStatus: 200, responseBody: { recovered: true } })
    await pool.end()
    pools.delete(pool)
  })

  test('enforces the unique actor/method/resource/key scope', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const values = [actorId, 'POST', 'campaign-1', 'retry-key', 'f'.repeat(64), 'owner-1', new Date(Date.now() + 30_000)]
    await pool.query(
      `INSERT INTO idempotency_records (actor_id, method, resource_id, key, fingerprint, owner_token, lease_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      values,
    )
    await expect(pool.query(
      `INSERT INTO idempotency_records (actor_id, method, resource_id, key, fingerprint, owner_token, lease_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      values,
    )).rejects.toMatchObject({ code: '23505' })
    await pool.end()
    pools.delete(pool)
  })

  test('returns one owner, conflicts on another fingerprint, and replays a completed response', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const repository = createIdempotencyRepository(pool)
    const scope = { actorId, method: 'post', resourceId: 'campaign-1', key: 'retry-key' }

    expect(await repository.claim({ ...scope, fingerprint: 'a'.repeat(64), ownerToken: 'owner-1' }))
      .toEqual({ kind: 'owner' })
    expect(await repository.claim({ ...scope, fingerprint: 'b'.repeat(64), ownerToken: 'owner-2' }))
      .toEqual({ kind: 'conflict' })
    expect(await repository.claim({ ...scope, fingerprint: 'a'.repeat(64), ownerToken: 'owner-2' }))
      .toEqual({ kind: 'in_progress' })

    await repository.complete({ ...scope, ownerToken: 'owner-1', responseStatus: 201, responseBody: { id: 'version-1' } })
    expect(await repository.claim({ ...scope, fingerprint: 'a'.repeat(64), ownerToken: 'owner-3' }))
      .toEqual({ kind: 'replay', responseStatus: 201, responseBody: { id: 'version-1' } })
    await pool.end()
    pools.delete(pool)
  })

  test('grants exactly one owner to concurrent claims and keeps all later outcomes deterministic', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const repository = createIdempotencyRepository(pool)
    const scope = { actorId, method: 'POST', resourceId: 'campaign-concurrent', key: 'same-key', fingerprint: 'c'.repeat(64) }

    const results = await Promise.all([
      repository.claim({ ...scope, ownerToken: 'owner-a' }),
      repository.claim({ ...scope, ownerToken: 'owner-b' }),
    ])

    expect(results.map((result) => result.kind).sort()).toEqual(['in_progress', 'owner'])
    const ownerToken = results[0].kind === 'owner' ? 'owner-a' : 'owner-b'
    await repository.complete({ ...scope, ownerToken, responseStatus: 202, responseBody: { accepted: true } })
    expect(await repository.claim({ ...scope, ownerToken: 'owner-c' }))
      .toEqual({ kind: 'replay', responseStatus: 202, responseBody: { accepted: true } })
    expect(await repository.claim({ ...scope, fingerprint: 'd'.repeat(64), ownerToken: 'owner-d' }))
      .toEqual({ kind: 'conflict' })
    await pool.end()
    pools.delete(pool)
  })
})

describe('persisted generation control plane', () => {
  async function generationHarness({
    budget = 1_000_000, limit = 3, disabled = false, provider = createMockProvider(),
    providerName = 'mock', model = 'mock-v1', region = 'europe-west6',
    providerRegistry = { mock: [{ model: 'mock-v1', region: 'europe-west6' }] },
    controlPlaneOptions = {}, advanceClockOnWait = false,
    now = new Date('2026-09-04T10:00:00Z'), timeoutMs = 50,
    poolMax = 4,
    assetStore,
    decorateControlPlane = (value) => value,
  } = {}) {
    const pool = makePool({ max: poolMax })
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId, { id: randomUUID() })
    await createSettingsRepository(pool).update({
      expectedRevision: 0, provider: providerName, model, region,
      dailyBudgetMicrounits: budget, perStepRegenerationLimit: limit, generationDisabled: disabled, updatedBy: actorId,
    })
    let currentTime = now
    const waits = []
    const waitOptions = advanceClockOnWait ? {
      wait: async (duration) => {
        waits.push(duration)
        if (waits.length > 10) throw new Error('Generation polling did not converge')
        currentTime = new Date(currentTime.getTime() + duration)
      },
    } : {}
    const controlPlane = createGenerationControlPlane({ pool, clock: () => currentTime, providerRegistry, ...waitOptions, ...controlPlaneOptions })
    const advanceClock = (duration) => { currentTime = new Date(currentTime.getTime() + duration) }
    const service = createGenerationService({
      pool, controlPlane: decorateControlPlane(controlPlane, { advanceClock, pool }), providers: { [providerName]: provider }, timeoutMs, clock: () => currentTime,
      ...(assetStore ? { assetStore } : {}),
    })
    return {
      pool, actor: { id: actorId, role: 'marketer', disabled: false }, campaign, provider, service, controlPlane, waits,
      setTime(value) { currentTime = value },
    }
  }

  test('completes an in-flight legacy image job only when requested dimensions are proven by its fingerprint', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(12) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const now = new Date()
    const harness = await generationHarness({ now, timeoutMs: 5_000 })
    const directionId = `legacy-pending-direction-${randomUUID()}`
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ($1, $2, 'Legacy pending', 'A precisely framed image', 'pending')`,
      [directionId, harness.campaign.id],
    )
    const request = { directionId, width: 1200, height: 628 }
    const jobId = `legacy-pending-image-${randomUUID()}`
    const ownerToken = randomUUID()
    const prepared = await harness.controlPlane.prepareGeneration({
      actor: harness.actor,
      campaignId: harness.campaign.id,
      step: 'image',
      input: request,
      idempotencyKey: 'legacy-pending-image',
      jobId,
      ownerToken,
      maxCostMicrounits: 1_000,
      startedAt: now,
      timeoutAt: new Date(now.getTime() + 60_000),
    })
    await harness.controlPlane.markDispatched({ jobId, ownerToken, dispatchedAt: now })
    await harness.pool.query(
      `UPDATE generation_jobs
       SET input_snapshot = input_snapshot - 'width' - 'height'
       WHERE id = $1`,
      [jobId],
    )

    const completed = await harness.controlPlane.completeGeneratedImage({
      jobId,
      ownerToken,
      directionId,
      requestedWidth: request.width,
      requestedHeight: request.height,
      asset: {
        id: randomUUID(), campaignId: harness.campaign.id,
        objectKey: `campaigns/${harness.campaign.id}/generated/legacy-pending.png`,
        mimeType: 'image/png', byteSize: 12, width: request.width, height: request.height,
        sha256: 'a'.repeat(64), source: 'generation', generationJobId: jobId, versionId: null,
      },
      safety: { verdict: 'safe', categories: [] }, usage: {}, actualCostMicrounits: 10,
      completedAt: new Date(now.getTime() + 1_000),
    })

    expect(completed).toMatchObject({ status: 201, body: { job: { status: 'succeeded' } } })
    expect((await harness.pool.query('SELECT input_snapshot FROM generation_jobs WHERE id = $1', [jobId])).rows[0].input_snapshot)
      .toEqual({ direction: prepared.context.direction, width: 1200, height: 628 })

    const mismatchedDirectionId = `legacy-mismatch-direction-${randomUUID()}`
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ($1, $2, 'Legacy mismatch', 'Must fail closed', 'pending')`,
      [mismatchedDirectionId, harness.campaign.id],
    )
    const mismatchJobId = `legacy-mismatch-image-${randomUUID()}`
    const mismatchOwner = randomUUID()
    await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'image',
      input: { directionId: mismatchedDirectionId, width: 900, height: 900 },
      idempotencyKey: 'legacy-mismatch-image', jobId: mismatchJobId, ownerToken: mismatchOwner,
      maxCostMicrounits: 1_000, startedAt: now, timeoutAt: new Date(now.getTime() + 60_000),
    })
    await harness.controlPlane.markDispatched({ jobId: mismatchJobId, ownerToken: mismatchOwner, dispatchedAt: now })
    await harness.pool.query("UPDATE generation_jobs SET input_snapshot = input_snapshot - 'width' - 'height' WHERE id = $1", [mismatchJobId])
    await expect(harness.controlPlane.completeGeneratedImage({
      jobId: mismatchJobId, ownerToken: mismatchOwner, directionId: mismatchedDirectionId,
      requestedWidth: 901, requestedHeight: 900,
      asset: {
        id: randomUUID(), campaignId: harness.campaign.id,
        objectKey: `campaigns/${harness.campaign.id}/generated/legacy-mismatch.png`,
        mimeType: 'image/png', byteSize: 12, width: 901, height: 900,
        sha256: 'b'.repeat(64), source: 'generation', generationJobId: mismatchJobId, versionId: null,
      },
      safety: { verdict: 'safe', categories: [] }, usage: {}, actualCostMicrounits: 10,
      completedAt: new Date(now.getTime() + 1_000),
    })).rejects.toMatchObject({ code: 'generation_direction_mismatch' })

    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('resolves the persisted Gemini model by generation step before reservation', async () => {
    const providerRegistry = {
      gemini: [{ model: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image', region: 'eu' }],
    }
    const harness = await generationHarness({
      providerName: 'gemini', model: 'gemini-3.5-flash', region: 'eu', providerRegistry,
    })
    const common = {
      actor: harness.actor,
      campaignId: harness.campaign.id,
      input: {},
      maxCostMicrounits: 1_000,
      startedAt: new Date('2026-09-04T10:00:00.000Z'),
      timeoutAt: new Date('2026-09-04T10:00:00.050Z'),
    }
    const text = await harness.controlPlane.prepareGeneration({
      ...common, step: 'brief_analysis', idempotencyKey: 'gemini-text', jobId: 'gemini-text-job', ownerToken: 'text-owner',
    })
    expect(text.job).toMatchObject({ provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu' })

    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('gemini-direction', $1, 'Clean focus', 'Soft daylight.', 'pending')`,
      [harness.campaign.id],
    )
    const image = await harness.controlPlane.prepareGeneration({
      ...common,
      step: 'image',
      input: { directionId: 'gemini-direction', width: 1200, height: 628 },
      idempotencyKey: 'gemini-image', jobId: 'gemini-image-job', ownerToken: 'image-owner',
      maxCostMicrounits: 250_000,
    })
    expect(image.job).toMatchObject({ provider: 'gemini', model: 'gemini-3.1-flash-image', region: 'eu' })
    expect((await harness.pool.query(
      'SELECT input_snapshot FROM generation_jobs WHERE id = $1',
      ['gemini-image-job'],
    )).rows[0].input_snapshot).toEqual({
      direction: {
        id: 'gemini-direction', title: 'Clean focus', prompt: 'Soft daylight.', status: 'pending', previewAssetId: null,
      },
      width: 1200,
      height: 628,
    })

    await expect(harness.controlPlane.prepareGeneration({
      ...common, step: 'video', idempotencyKey: 'gemini-video', jobId: 'gemini-video-job', ownerToken: 'video-owner',
    })).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect((await harness.pool.query('SELECT id FROM generation_jobs ORDER BY id')).rows.map((row) => row.id))
      .toEqual(['gemini-image-job', 'gemini-text-job'])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('persists service-owned jobs, brief metadata, copy sets, and exact idempotent responses', async () => {
    const harness = await generationHarness()
    const analysed = await harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'brief-key', input: {} })
    const copied = await harness.service.generateCopy({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'copy-key', input: {} })
    const replay = await harness.service.generateCopy({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'copy-key', input: {} })

    expect(analysed.body.job).toMatchObject({ status: 'succeeded', step: 'brief_analysis', provider: 'mock', actualCostMicrounits: 80 })
    expect(copied.body.job).toMatchObject({ status: 'succeeded', step: 'copy', actualCostMicrounits: 240, result: { copySetId: expect.any(String), copies: expect.any(Array) } })
    expect(replay).toEqual({ ...copied, replayed: true })
    expect((await harness.pool.query('SELECT candidates FROM copy_sets WHERE generation_job_id = $1', [copied.body.job.id])).rows[0].candidates).toEqual(copied.body.job.result.copies)
    expect((await harness.pool.query('SELECT dispatch_state, response_body FROM generation_jobs WHERE id = $1', [copied.body.job.id])).rows[0])
      .toMatchObject({ dispatch_state: 'dispatched', response_body: copied.body })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('commits generated asset metadata, ready direction link, and the byte-free idempotent response atomically', async () => {
    const baseProvider = createMockProvider()
    const generateImage = vi.fn(baseProvider.generateImage)
    const assetStore = createMemoryAssetStore()
    const harness = await generationHarness({ provider: { ...baseProvider, generateImage }, assetStore, timeoutMs: 500, now: new Date() })
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('durable-direction', $1, 'Clean focus', 'Soft daylight on a clean desk.', 'pending')`,
      [harness.campaign.id],
    )

    const first = await harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'durable-image-key',
      input: { directionId: 'durable-direction', width: 800, height: 800 },
    })
    const replay = await harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'durable-image-key',
      input: { directionId: 'durable-direction', width: 800, height: 800 },
    })
    const assetId = first.body.job.result.image.asset.id
    const asset = (await harness.pool.query('SELECT * FROM assets WHERE id = $1', [assetId])).rows[0]
    const direction = (await harness.pool.query('SELECT status, preview_asset_id FROM visual_directions WHERE id = $1', ['durable-direction'])).rows[0]
    const stored = await assetStore.get({ objectKey: asset.object_key })

    expect(first).toMatchObject({ status: 201, body: { job: { status: 'succeeded', result: { image: { asset: { id: assetId, kind: 'direction', sha256: asset.sha256 }, width: 800, height: 800 } } } } })
    expect(replay).toEqual({ ...first, replayed: true })
    expect(direction).toEqual({ status: 'ready', preview_asset_id: assetId })
    expect(createHash('sha256').update(stored).digest('hex')).toBe(asset.sha256)
    expect(asset).toMatchObject({ campaign_id: harness.campaign.id, generation_job_id: first.body.job.id, source: 'generation', byte_size: String(stored.length) })
    expect(JSON.stringify(first.body)).not.toContain('bytes')
    expect(generateImage).toHaveBeenCalledOnce()
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('replays committed image success without registering its referenced object as an orphan after an ambiguous acknowledgement', async () => {
    const assetStore = createMemoryAssetStore()
    const harness = await generationHarness({
      assetStore,
      timeoutMs: 500,
      now: new Date(),
      decorateControlPlane: (controlPlane) => ({
        ...controlPlane,
        async completeGeneratedImage(input) {
          await controlPlane.completeGeneratedImage(input)
          throw new Error('commit acknowledgement lost')
        },
      }),
    })
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('ambiguous-commit-direction', $1, 'Clean focus', 'Soft daylight.', 'pending')`,
      [harness.campaign.id],
    )

    const result = await harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'ambiguous-image-commit',
      input: { directionId: 'ambiguous-commit-direction', width: 800, height: 800 },
    })

    expect(result).toMatchObject({ status: 201, body: { job: { status: 'succeeded' } } })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM assets')).rows[0].count).toBe(1)
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM orphaned_uploads')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('makes an expired image persistence attempt unknown with only an unreferenced orphan', async () => {
    const assetStore = createMemoryAssetStore()
    const harness = await generationHarness({
      assetStore,
      timeoutMs: 500,
      now: new Date(),
      decorateControlPlane: (controlPlane, { advanceClock }) => ({
        ...controlPlane,
        completeGeneratedImage(input) {
          advanceClock(1_000)
          return controlPlane.completeGeneratedImage(input)
        },
      }),
    })
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('expired-commit-direction', $1, 'Clean focus', 'Soft daylight.', 'pending')`,
      [harness.campaign.id],
    )

    const result = await harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'expired-image-commit',
      input: { directionId: 'expired-commit-direction', width: 800, height: 800 },
    })

    expect(result).toMatchObject({ status: 202, body: { job: { status: 'unknown' } } })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM assets')).rows[0].count).toBe(0)
    expect((await harness.pool.query(
      'SELECT status, unknown_reason FROM generation_jobs WHERE id = $1',
      [result.body.job.id],
    )).rows[0]).toEqual({ status: 'unknown', unknown_reason: 'asset_persistence_timeout' })
    const orphans = await harness.pool.query(
      `SELECT o.object_key FROM orphaned_uploads o
       WHERE NOT EXISTS (SELECT 1 FROM assets a WHERE a.object_key = o.object_key)`,
    )
    expect(orphans.rowCount).toBe(1)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('bounds image recovery when the job row stays locked after completion reaches its deadline', async () => {
    const assetStore = createMemoryAssetStore()
    let releaseBlocker = async () => {}
    const harness = await generationHarness({
      assetStore,
      timeoutMs: 500,
      now: new Date(),
      controlPlaneOptions: { recoveryTimeoutMs: 40 },
      decorateControlPlane: (controlPlane, { pool }) => ({
        ...controlPlane,
        async completeGeneratedImage(input) {
          const blocker = await pool.connect()
          let released = false
          releaseBlocker = async () => {
            if (released) return
            released = true
            await blocker.query('ROLLBACK').catch(() => {})
            blocker.release()
          }
          await blocker.query('BEGIN')
          await blocker.query('SELECT id FROM generation_jobs WHERE id = $1 FOR UPDATE', [input.jobId])
          throw Object.assign(new Error('image completion lock deadline elapsed'), { code: '55P03' })
        },
      }),
    })
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('deadline-lock-direction', $1, 'Clean focus', 'Soft daylight.', 'pending')`,
      [harness.campaign.id],
    )

    const pending = harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'deadline-lock-image',
      input: { directionId: 'deadline-lock-direction', width: 800, height: 800 },
    })
    const { observed, settled } = observeSettlementWithin(pending, 200)
    const outcome = await observed
    const rowWhileBlocked = (await harness.pool.query(
      `SELECT status, response_status FROM generation_jobs
       WHERE id = (SELECT id FROM generation_jobs WHERE idempotency_key = 'deadline-lock-image')`,
    )).rows[0]
    const orphanCountWhileBlocked = (await harness.pool.query('SELECT count(*)::int AS count FROM orphaned_uploads')).rows[0].count
    await releaseBlocker()
    await settled

    expect(outcome).toMatchObject({
      kind: 'rejected',
      error: { statusCode: 503, code: 'generation_recovery_unavailable' },
    })
    expect(rowWhileBlocked).toEqual({ status: 'pending', response_status: null })
    expect(orphanCountWhileBlocked).toBe(0)
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM assets')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('keeps declined image completion recovery atomic when the object advisory lock stays contended', async () => {
    const backingStore = createMemoryAssetStore()
    let harness
    let releaseBlocker = async () => {}
    const assetStore = {
      async put(input) {
        const receipt = await backingStore.put(input)
        const blocker = await harness.pool.connect()
        let released = false
        releaseBlocker = async () => {
          if (released) return
          released = true
          await blocker.query('ROLLBACK').catch(() => {})
          blocker.release()
        }
        await blocker.query('BEGIN')
        await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.objectKey])
        return receipt
      },
      async get(input) {
        return backingStore.get(input)
      },
      delete: (input) => backingStore.delete(input),
    }
    harness = await generationHarness({
      assetStore,
      timeoutMs: 500,
      now: new Date(),
      controlPlaneOptions: { recoveryTimeoutMs: 40 },
      decorateControlPlane: (controlPlane, { advanceClock }) => ({
        ...controlPlane,
        completeGeneratedImage(input) {
          advanceClock(1_000)
          return controlPlane.completeGeneratedImage(input)
        },
      }),
    })
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('recovery-object-lock-direction', $1, 'Clean focus', 'Soft daylight.', 'pending')`,
      [harness.campaign.id],
    )

    const pending = harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'recovery-object-lock-image',
      input: { directionId: 'recovery-object-lock-direction', width: 800, height: 800 },
    })
    const { observed, settled } = observeSettlementWithin(pending, 200)
    const outcome = await observed
    const rowWhileBlocked = (await harness.pool.query(
      `SELECT status, response_status FROM generation_jobs WHERE idempotency_key = 'recovery-object-lock-image'`,
    )).rows[0]
    const orphanCountWhileBlocked = (await harness.pool.query('SELECT count(*)::int AS count FROM orphaned_uploads')).rows[0].count
    await releaseBlocker()
    await settled

    expect(outcome).toMatchObject({
      kind: 'rejected',
      error: { statusCode: 503, code: 'generation_recovery_unavailable' },
    })
    expect(rowWhileBlocked).toEqual({ status: 'pending', response_status: null })
    expect(orphanCountWhileBlocked).toBe(0)
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM assets')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('bounds provider fallback recovery when the dispatched job row stays locked', async () => {
    const baseProvider = createMockProvider()
    let harness
    let releaseBlocker = async () => {}
    const provider = {
      ...baseProvider,
      async generateImage() {
        const blocker = await harness.pool.connect()
        let released = false
        releaseBlocker = async () => {
          if (released) return
          released = true
          await blocker.query('ROLLBACK').catch(() => {})
          blocker.release()
        }
        await blocker.query('BEGIN')
        await blocker.query(
          `SELECT id FROM generation_jobs
           WHERE idempotency_key = 'provider-recovery-lock-image' FOR UPDATE`,
        )
        throw new Error('provider acknowledgement is ambiguous')
      },
    }
    harness = await generationHarness({
      provider,
      assetStore: createMemoryAssetStore(),
      timeoutMs: 500,
      now: new Date(),
      controlPlaneOptions: { recoveryTimeoutMs: 40 },
    })
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('provider-recovery-lock-direction', $1, 'Clean focus', 'Soft daylight.', 'pending')`,
      [harness.campaign.id],
    )

    const pending = harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'provider-recovery-lock-image',
      input: { directionId: 'provider-recovery-lock-direction', width: 800, height: 800 },
    })
    const { observed, settled } = observeSettlementWithin(pending, 200)
    const outcome = await observed
    const rowWhileBlocked = (await harness.pool.query(
      `SELECT status, response_status FROM generation_jobs WHERE idempotency_key = 'provider-recovery-lock-image'`,
    )).rows[0]
    await releaseBlocker()
    await settled

    expect(outcome).toMatchObject({
      kind: 'rejected',
      error: { statusCode: 503, code: 'generation_recovery_unavailable' },
    })
    expect(rowWhileBlocked).toEqual({ status: 'pending', response_status: null })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM orphaned_uploads')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('bounds provider fallback recovery across an exhausted max-one pool checkout', async () => {
    const observerPool = makePool()
    const baseProvider = createMockProvider()
    let harness
    let blocker
    const provider = {
      ...baseProvider,
      async generateImage() {
        blocker = await harness.pool.connect()
        throw new Error('provider acknowledgement is ambiguous')
      },
    }
    harness = await generationHarness({
      provider,
      assetStore: createMemoryAssetStore(),
      timeoutMs: 500,
      now: new Date(),
      poolMax: 1,
      controlPlaneOptions: { recoveryTimeoutMs: 40 },
    })
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('pool-recovery-direction', $1, 'Clean focus', 'Soft daylight.', 'pending')`,
      [harness.campaign.id],
    )

    const pending = harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'pool-recovery-image',
      input: { directionId: 'pool-recovery-direction', width: 800, height: 800 },
    })
    const { observed, settled } = observeSettlementWithin(pending, 200)
    const outcome = await observed
    const rowWhileExhausted = (await observerPool.query(
      `SELECT status, response_status FROM generation_jobs WHERE idempotency_key = 'pool-recovery-image'`,
    )).rows[0]
    blocker.release()
    await settled

    expect(outcome).toMatchObject({
      kind: 'rejected',
      error: { statusCode: 503, code: 'generation_recovery_unavailable' },
    })
    expect(rowWhileExhausted).toEqual({ status: 'pending', response_status: null })
    await Promise.all([harness.pool.end(), observerPool.end()])
    pools.delete(harness.pool)
    pools.delete(observerPool)
  })

  test('re-checks asset references under the object lock before future orphan cleanup deletes bytes', async () => {
    const harness = await generationHarness()
    await harness.pool.query(
      `INSERT INTO assets (id, campaign_id, kind, object_key, mime_type, byte_size, sha256, source)
       VALUES ('referenced-cleanup-asset', $1, 'manifest', 'versions/referenced-manifest.json', 'application/json', 2, $2, 'upload')`,
      [harness.campaign.id, 'a'.repeat(64)],
    )
    await harness.pool.query(
      `INSERT INTO orphaned_uploads (id, object_key, campaign_id, reason)
       VALUES ('referenced-orphan', 'versions/referenced-manifest.json', $1, 'legacy_race')`,
      [harness.campaign.id],
    )
    const deleteObject = vi.fn(async () => ({ deleted: true }))

    await expect(harness.controlPlane.cleanupOrphanUpload({
      orphanId: 'referenced-orphan', deleteObject, cleanedAt: new Date('2026-09-04T10:01:00Z'),
    })).resolves.toEqual({ kind: 'referenced', objectKey: 'versions/referenced-manifest.json' })
    expect(deleteObject).not.toHaveBeenCalled()
    expect((await harness.pool.query('SELECT status FROM orphaned_uploads WHERE id = $1', ['referenced-orphan'])).rows[0].status)
      .toBe('pending')
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test.each([
    { shape: 'legacy', result: { image: { mimeType: 'image/png', width: 1200, height: 628, byteSize: 4096 } } },
    { shape: 'interim', result: { image: { assetId: 'asset-historical', mimeType: 'image/png', width: 1200, height: 628, byteSize: 4096 } } },
  ])('replays a successful historical $shape image outcome before the unavailable gate', async ({ result }) => {
    const baseProvider = createMockProvider()
    const generateImage = vi.fn(baseProvider.generateImage)
    const provider = { ...baseProvider, generateImage }
    const harness = await generationHarness({ provider })
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('direction-input', $1, 'Clean focus', 'Soft daylight on a clean desk.', 'pending')`,
      [harness.campaign.id],
    )

    const prepared = await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'image', idempotencyKey: 'image-input',
      input: { directionId: 'direction-input', width: 1200, height: 628 }, jobId: 'legacy-image-job', ownerToken: 'legacy-owner',
      maxCostMicrounits: 250_000, startedAt: new Date('2026-09-04T10:00:00.000Z'), timeoutAt: new Date('2026-09-04T10:00:00.050Z'),
    })
    const historicalJob = {
      ...prepared.job,
      status: 'succeeded', attempts: 1, safety: { verdict: 'safe', categories: [] }, usage: { inputUnits: 1, outputUnits: 1 },
      actualCostMicrounits: 1_000, result, errorCode: null, updatedAt: '2026-09-04T10:00:00.002Z',
    }
    const stored = { status: 201, body: { job: historicalJob } }
    await harness.pool.query(
      `UPDATE generation_jobs
       SET status = 'succeeded', dispatch_state = 'dispatched', dispatched_at = $2, attempts = 1,
           safety = $3, usage = $4, actual_cost_microunits = 1000, result_metadata = $5,
           completed_at = $6, updated_at = $6, response_status = 201, response_body = $7
       WHERE id = $1`,
      [prepared.job.id, new Date('2026-09-04T10:00:00.001Z'), historicalJob.safety, historicalJob.usage,
        result, new Date(historicalJob.updatedAt), stored.body],
    )

    await expect(harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'image-input',
      input: { directionId: 'direction-input', width: 1200, height: 628 },
    })).resolves.toEqual({ ...stored, replayed: true })
    expect(generateImage).not.toHaveBeenCalled()
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM generation_jobs WHERE step = 'image'")).rows[0].count).toBe(1)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('conflicts when a historical image replay key is reused with changed input', async () => {
    const harness = await generationHarness()
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ('direction-input', $1, 'Clean focus', 'Soft daylight on a clean desk.', 'pending')`,
      [harness.campaign.id],
    )
    await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'image', idempotencyKey: 'image-conflict',
      input: { directionId: 'direction-input', width: 1200, height: 628 }, jobId: 'legacy-conflict-job', ownerToken: 'legacy-owner',
      maxCostMicrounits: 250_000, startedAt: new Date('2026-09-04T10:00:00.000Z'), timeoutAt: new Date('2026-09-04T10:00:00.050Z'),
    })

    await expect(harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'image-conflict',
      input: { directionId: 'direction-input', width: 1080, height: 1080 },
    })).rejects.toMatchObject({ code: 'idempotency_conflict' })

    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects a new image command without creating a reservation or calling the provider', async () => {
    const baseProvider = createMockProvider()
    const provider = { ...baseProvider, generateImage: vi.fn(baseProvider.generateImage) }
    const harness = await generationHarness({ provider })

    await expect(harness.service.generateImage({
      actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'new-image',
      input: { directionId: 'missing-direction', width: 1200, height: 628 },
    })).rejects.toMatchObject({ code: 'image_storage_unavailable', statusCode: 503 })

    expect(provider.generateImage).not.toHaveBeenCalled()
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM generation_jobs WHERE step = 'image'")).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('serializes concurrent UTC-day reservations so requests cannot overspend', async () => {
    const baseProvider = createMockProvider()
    const provider = { ...baseProvider, analyseBrief: vi.fn(baseProvider.analyseBrief) }
    const analyseSpy = provider.analyseBrief
    const first = await generationHarness({ budget: 1_000, provider })
    const secondCampaign = await insertCampaign(first.pool, first.actor.id)

    const outcomes = await Promise.allSettled([
      first.service.analyseBrief({ actor: first.actor, campaignId: first.campaign.id, idempotencyKey: 'concurrent-a', input: {} }),
      first.service.analyseBrief({ actor: first.actor, campaignId: secondCampaign.id, idempotencyKey: 'concurrent-b', input: {} }),
    ])

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')[0].reason).toMatchObject({ code: 'over_budget' })
    expect(analyseSpy).toHaveBeenCalledOnce()
    expect((await first.pool.query("SELECT count(*)::int AS count FROM generation_jobs WHERE budget_day = DATE '2026-09-04'")).rows[0].count).toBe(1)
    await first.pool.end()
    pools.delete(first.pool)
  })

  test('makes concurrent same-key callers wait for and replay the original provider result', async () => {
    const baseProvider = createMockProvider()
    const analyseBrief = vi.fn(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return baseProvider.analyseBrief(...args)
    })
    const provider = { ...baseProvider, analyseBrief }
    const harness = await generationHarness({ budget: 10_000, provider, timeoutMs: 200, controlPlaneOptions: { waitTimeoutMs: 20 } })

    const [first, concurrent] = await Promise.all([
      harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'one-call', input: {} }),
      harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'one-call', input: {} }),
    ])

    expect(first.status).toBe(201)
    expect(concurrent.status).toBe(201)
    expect(concurrent.body).toEqual(first.body)
    expect(analyseBrief).toHaveBeenCalledOnce()
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('uses bounded fake-clock polling through the persisted deadline and stores unknown at expiry', async () => {
    const harness = await generationHarness({ advanceClockOnWait: true, timeoutMs: 25 })
    await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'brief_analysis', input: {}, idempotencyKey: 'wait-deadline',
      jobId: 'wait-deadline-job', ownerToken: 'owner-wait', maxCostMicrounits: 1_000,
      startedAt: new Date('2026-09-04T10:00:00.000Z'), timeoutAt: new Date('2026-09-04T10:00:00.025Z'),
    })
    await harness.controlPlane.markDispatched({ jobId: 'wait-deadline-job', ownerToken: 'owner-wait', dispatchedAt: new Date('2026-09-04T10:00:00.001Z') })

    const response = await harness.controlPlane.waitForResult({ jobId: 'wait-deadline-job' })

    expect(response).toMatchObject({ status: 202, body: { job: { id: 'wait-deadline-job', status: 'unknown' } } })
    expect(harness.waits).toEqual([10, 10, 5])
    expect((await harness.pool.query("SELECT status, response_status FROM generation_jobs WHERE id = 'wait-deadline-job'")).rows[0])
      .toEqual({ status: 'unknown', response_status: 202 })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('stores unknown at the deadline when a dispatch loser waits on a replacement owner that never dispatches', async () => {
    const harness = await generationHarness({ advanceClockOnWait: true, timeoutMs: 25 })
    await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'brief_analysis', input: {}, idempotencyKey: 'lost-owner-deadline',
      jobId: 'lost-owner-job', ownerToken: 'first-owner', maxCostMicrounits: 1_000,
      startedAt: new Date('2026-09-04T10:00:00.000Z'), timeoutAt: new Date('2026-09-04T10:00:00.025Z'),
    })
    await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'brief_analysis', input: {}, idempotencyKey: 'lost-owner-deadline',
      jobId: 'unused-job-id', ownerToken: 'replacement-owner', maxCostMicrounits: 1_000,
      startedAt: new Date('2026-09-04T10:00:00.000Z'), timeoutAt: new Date('2026-09-04T10:00:00.025Z'),
    })

    const response = await harness.controlPlane.waitForResult({ jobId: 'lost-owner-job' })

    expect(response).toMatchObject({ status: 202, body: { job: { id: 'lost-owner-job', status: 'unknown' } } })
    expect(harness.waits).toEqual([10, 10, 5])
    expect((await harness.pool.query("SELECT status, dispatch_state, response_status FROM generation_jobs WHERE id = 'lost-owner-job'")).rows[0])
      .toEqual({ status: 'unknown', dispatch_state: 'not_dispatched', response_status: 202 })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('uses UTC calendar-day boundaries for budget reservations', async () => {
    const harness = await generationHarness({ budget: 1_000, limit: 5, now: new Date('2026-09-04T23:59:59.900Z') })
    await harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'day-one', input: {} })
    await expect(harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'same-day', input: {} }))
      .rejects.toMatchObject({ code: 'over_budget' })
    harness.setTime(new Date('2026-09-05T00:00:00.100Z'))
    await expect(harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'day-two', input: {} }))
      .resolves.toMatchObject({ body: { job: { status: 'succeeded' } } })
    expect((await harness.pool.query('SELECT budget_day::text AS day FROM generation_jobs ORDER BY budget_day')).rows.map((row) => row.day)).toEqual(['2026-09-04', '2026-09-05'])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('normalizes kill-switch and regeneration-cap failures before any provider call', async () => {
    const baseProvider = createMockProvider()
    const provider = { ...baseProvider, analyseBrief: vi.fn(baseProvider.analyseBrief) }
    const analyseSpy = provider.analyseBrief
    const killed = await generationHarness({ disabled: true, provider })
    await expect(killed.service.analyseBrief({ actor: killed.actor, campaignId: killed.campaign.id, idempotencyKey: 'killed', input: {} }))
      .rejects.toMatchObject({ code: 'kill_switch_active' })
    expect(analyseSpy).not.toHaveBeenCalled()
    expect((await killed.pool.query('SELECT count(*)::int AS count FROM generation_jobs')).rows[0].count).toBe(0)
    await killed.pool.end()
    pools.delete(killed.pool)

    await resetDatabase()
    const migrationPool = makePool()
    await runMigrations({ pool: migrationPool })
    await migrationPool.end()
    pools.delete(migrationPool)
    const capped = await generationHarness({ limit: 0, provider })
    await expect(capped.service.analyseBrief({ actor: capped.actor, campaignId: capped.campaign.id, idempotencyKey: 'capped', input: {} }))
      .rejects.toMatchObject({ code: 'regeneration_cap_reached' })
    expect(analyseSpy).not.toHaveBeenCalled()
    expect((await capped.pool.query('SELECT count(*)::int AS count FROM generation_jobs')).rows[0].count).toBe(0)
    await capped.pool.end()
    pools.delete(capped.pool)
  })

  test('rechecks the kill switch before reclaiming a pending job proven not dispatched', async () => {
    const baseProvider = createMockProvider()
    const provider = { ...baseProvider, analyseBrief: vi.fn(baseProvider.analyseBrief) }
    const harness = await generationHarness({ provider })
    const prepared = await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'brief_analysis', input: {}, idempotencyKey: 'not-dispatched',
      jobId: 'not-dispatched-job', ownerToken: 'dead-owner', maxCostMicrounits: 1_000,
      startedAt: new Date('2026-09-04T10:00:00.000Z'), timeoutAt: new Date('2026-09-04T10:00:00.050Z'),
    })
    expect(prepared.kind).toBe('owner')
    await createSettingsRepository(harness.pool).update({
      expectedRevision: 1, provider: 'mock', model: 'mock-v1', region: 'europe-west6',
      dailyBudgetMicrounits: 1_000_000, perStepRegenerationLimit: 3, generationDisabled: true, updatedBy: harness.actor.id,
    })

    await expect(harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'not-dispatched', input: {} }))
      .rejects.toMatchObject({ code: 'kill_switch_active' })
    expect(provider.analyseBrief).not.toHaveBeenCalled()
    expect((await harness.pool.query("SELECT status, dispatch_state, reserved_cost_microunits::int AS reserved FROM generation_jobs WHERE id = 'not-dispatched-job'")).rows[0])
      .toEqual({ status: 'pending', dispatch_state: 'not_dispatched', reserved: 1000 })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test.each([
    { model: 'unregistered-model', region: 'europe-west6' },
    { model: 'mock-v1', region: 'unregistered-region' },
  ])('rejects unregistered provider tuple $model / $region before reservation and dispatch', async ({ model, region }) => {
    const baseProvider = createMockProvider()
    const provider = { ...baseProvider, analyseBrief: vi.fn(baseProvider.analyseBrief) }
    const harness = await generationHarness({ provider, model, region })

    await expect(harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'bad-tuple', input: {} }))
      .rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(provider.analyseBrief).not.toHaveBeenCalled()
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM generation_jobs')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects stale brief analysis after the campaign brief changes without calling copy generation', async () => {
    const baseProvider = createMockProvider()
    const provider = { ...baseProvider, generateCopy: vi.fn(baseProvider.generateCopy) }
    const harness = await generationHarness({ provider })
    await harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'analysis-before-edit', input: {} })
    await harness.pool.query(
      `UPDATE campaigns SET brief = jsonb_set(brief, '{objective}', '"Purchases"'::jsonb), revision = revision + 1, updated_at = now()
       WHERE id = $1`,
      [harness.campaign.id],
    )

    await expect(harness.service.generateCopy({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'copy-after-edit', input: {} }))
      .rejects.toMatchObject({ code: 'brief_analysis_stale' })
    expect(provider.generateCopy).not.toHaveBeenCalled()
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM generation_jobs WHERE step = 'copy'")).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('persists ambiguous calls as unknown, retains their full reservation, and never redispatches the key', async () => {
    const baseProvider = createMockProvider()
    const call = vi.fn(() => new Promise(() => {}))
    const provider = { ...baseProvider, analyseBrief: call }
    const harness = await generationHarness({ provider, timeoutMs: 10, budget: 1_000 })

    const first = await harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'ambiguous', input: {} })
    const retry = await harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'ambiguous', input: {} })

    expect(first.body.job).toMatchObject({ status: 'unknown', reservedCostMicrounits: 1_000, actualCostMicrounits: null })
    expect(retry).toEqual({ ...first, replayed: true })
    expect(call).toHaveBeenCalledOnce()
    await expect(harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'new-key', input: {} }))
      .rejects.toMatchObject({ code: 'over_budget' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('derives unknown after a simulated crash following persisted dispatch and never calls the provider on retry', async () => {
    const baseProvider = createMockProvider()
    const provider = { ...baseProvider, analyseBrief: vi.fn(baseProvider.analyseBrief) }
    const harness = await generationHarness({ provider, budget: 2_000, timeoutMs: 10 })
    const prepared = await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'brief_analysis', input: {}, idempotencyKey: 'crashed',
      jobId: 'crashed-job', ownerToken: 'dead-process', maxCostMicrounits: 1_000,
      startedAt: new Date('2026-09-04T10:00:00.000Z'), timeoutAt: new Date('2026-09-04T10:00:00.010Z'),
    })
    expect(prepared.kind).toBe('owner')
    expect(await harness.controlPlane.markDispatched({ jobId: 'crashed-job', ownerToken: 'dead-process', dispatchedAt: new Date('2026-09-04T10:00:00.001Z') })).toBe(true)
    harness.setTime(new Date('2026-09-04T10:00:01.000Z'))

    const retry = await harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'crashed', input: {} })

    expect(retry.body.job).toMatchObject({ id: 'crashed-job', status: 'unknown', reservedCostMicrounits: 1_000, actualCostMicrounits: null })
    expect(provider.analyseBrief).not.toHaveBeenCalled()
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('runs copy and direction selections through pure workflow transitions with revision and audit in one transaction', async () => {
    const harness = await generationHarness({ budget: 1_000_000 })
    await harness.service.analyseBrief({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'analysis', input: {} })
    const copied = await harness.service.generateCopy({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'copy', input: {} })
    const selectedCopy = await harness.service.selectCopy({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 1, input: { copyId: copied.body.job.result.copies[0].id } })
    const directions = await harness.service.generateDirections({ actor: harness.actor, campaignId: harness.campaign.id, idempotencyKey: 'directions', input: {} })
    const direction = directions.body.job.result.directions[0]
    await harness.pool.query(
      `INSERT INTO assets (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, generation_job_id)
       VALUES ($1, $2, 'direction', $3, 'image/png', 1, 1200, 628, $4, 'generation', $5)`,
      ['preview-1', harness.campaign.id, `campaigns/${harness.campaign.id}/preview-1.png`, 'a'.repeat(64), directions.body.job.id],
    )
    await harness.pool.query("UPDATE visual_directions SET status = 'ready', preview_asset_id = 'preview-1' WHERE id = $1", [direction.id])
    const selectedDirection = await harness.service.selectDirection({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: selectedCopy.revision, input: { directionId: direction.id } })

    expect(selectedCopy).toMatchObject({ status: 'copy_ready', revision: 2, selectedCopyId: copied.body.job.result.copySetId })
    expect(selectedDirection).toMatchObject({ status: 'direction_selected', revision: 3, selectedDirectionId: direction.id })
    expect((await harness.pool.query("SELECT action FROM audit_events WHERE action IN ('campaign.copy_selected', 'campaign.direction_selected') ORDER BY created_at, action")).rows.map((row) => row.action).sort())
      .toEqual(['campaign.copy_selected', 'campaign.direction_selected'])
    await harness.pool.end()
    pools.delete(harness.pool)
  })
})

async function immutableVersionHarness({
  assetStore: injectedStore,
  renderer = createInProcessRenderer(),
  idGenerator,
  serviceOptions = {},
  templateManifest = pilotTemplateFixture,
} = {}) {
  const pool = makePool({ max: 8 })
  const marketerId = await insertUser(pool, { id: `version-marketer-${randomUUID()}`, role: 'marketer' })
  const designerId = await insertUser(pool, { id: `version-designer-${randomUUID()}`, role: 'designer' })
  const actor = { id: marketerId, role: 'marketer', disabled: false }
  const campaign = await insertCampaign(pool, marketerId, { id: `version-campaign-${randomUUID()}` })
  await createTemplateRepository(pool).createVersion({
    id: templateManifest.id,
    version: templateManifest.version,
    name: templateManifest.name,
    manifest: templateManifest,
    manifestHash: hashCanonical(templateManifest),
    createdBy: marketerId,
  })

  const copy = {
    id: 'selected-copy', headline: 'Learn Norwegian with confidence',
    body: 'Short, focused lessons built for busy adults.', offer: '', cta: 'Start learning',
    visualPrompt: 'A calm Norwegian learning scene',
  }
  const analysis = {
    summary: 'A focused language-learning course for busy adults.',
    themes: ['clarity', 'confidence'],
    warnings: [],
  }
  const analysisJobId = `${campaign.id}:brief-analysis-job`
  const copyJobId = `${campaign.id}:copy-job`
  const directionsJobId = `${campaign.id}:directions-job`
  const imageJobId = `${campaign.id}:image-job`
  const copySetId = `${campaign.id}:copy-set`
  const directionId = `${campaign.id}:direction-1`
  const sourceAssetId = `${campaign.id}:source-asset`
  const pendingDirection = {
    id: directionId, title: 'Nordic focus', prompt: 'A calm Norwegian learning scene',
    status: 'pending', previewAssetId: null,
  }
  const now = new Date('2026-09-04T10:00:00.000Z')
  const timeout = new Date('2026-09-04T10:05:00.000Z')
  for (const [id, step, result] of [
    ['brief-analysis-job', 'brief_analysis', { analysis }],
    ['copy-job', 'copy', { copySetId, copies: [copy] }],
    ['directions-job', 'directions', { directions: [pendingDirection] }],
    ['image-job', 'image', { image: { asset: { id: sourceAssetId, kind: 'direction', sha256: '0'.repeat(64) } } }],
  ]) {
    await pool.query(
      `INSERT INTO generation_jobs
         (id, campaign_id, actor_id, method, step, provider, model, region, status, attempts,
          safety, usage, reserved_cost_microunits, actual_cost_microunits, idempotency_key,
          request_fingerprint, owner_token, dispatch_state, dispatched_at, budget_day,
          input_snapshot, result_metadata, timeout_at, completed_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'POST', $4, 'mock', 'mock-v1', 'europe-west6', 'succeeded', 1,
               '{"verdict":"safe","categories":[]}', '{}', 0, 0, $5,
               $6, $7, 'dispatched', $8, '2026-09-04', $9, $10, $11, $8, $8, $8)`,
      [`${campaign.id}:${id}`, campaign.id, marketerId, step, `${id}-key`,
        step === 'image'
          ? hashCanonical({ step: 'image', input: { directionId, width: 1000, height: 1000 } })
          : hashCanonical({ id }), `${id}-owner`, now,
        step === 'brief_analysis' ? { brief: campaign.brief }
          : step === 'copy' ? { brief: campaign.brief, analysis }
            : step === 'directions' ? { brief: campaign.brief, copy }
              : { direction: pendingDirection, width: 1000, height: 1000 }, result, timeout],
    )
  }
  const sourceBytes = await sharp({ create: { width: 1000, height: 1000, channels: 4, background: '#db2777' } }).png().toBuffer()
  const sourceHash = createHash('sha256').update(sourceBytes).digest('hex')
  const sourceObjectKey = `campaigns/${createHash('sha256').update(campaign.id).digest('hex')}/generated/source.png`
  const assetStore = injectedStore ?? createMemoryAssetStore()
  await assetStore.put({ objectKey: sourceObjectKey, bytes: sourceBytes, contentType: 'image/png' })
  await pool.query(
    `INSERT INTO copy_sets (id, campaign_id, generation_job_id, candidates, selected_candidate_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [copySetId, campaign.id, copyJobId, JSON.stringify([copy]), copy.id],
  )
  await pool.query(
    `INSERT INTO assets
       (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, generation_job_id)
     VALUES ($1, $2, 'direction', $3, 'image/png', $4, 1000, 1000, $5, 'generation', $6)`,
    [sourceAssetId, campaign.id, sourceObjectKey, sourceBytes.length, sourceHash, imageJobId],
  )
  await pool.query(
    `INSERT INTO visual_directions
       (id, campaign_id, generation_job_id, title, prompt, status, preview_asset_id)
     VALUES ($1, $2, $3, 'Nordic focus', 'A calm Norwegian learning scene', 'ready', $4)`,
    [directionId, campaign.id, directionsJobId, sourceAssetId],
  )
  await pool.query(
    `UPDATE generation_jobs SET input_snapshot = $2, result_metadata = $3 WHERE id = $1`,
    [imageJobId, { direction: pendingDirection, width: 1000, height: 1000 }, {
      image: {
        asset: { id: sourceAssetId, kind: 'direction', sha256: sourceHash },
        mimeType: 'image/png', width: 1000, height: 1000, byteSize: sourceBytes.length,
      },
    }],
  )
  await pool.query(
    `UPDATE campaigns
     SET status = 'direction_selected', revision = 2, selected_copy_id = $2, selected_direction_id = $3, updated_at = $4
     WHERE id = $1`,
    [campaign.id, copySetId, directionId, now],
  )
  const service = createVersionService({ pool, assetStore, renderer, ...(idGenerator ? { idGenerator } : {}), ...serviceOptions })
  return {
    pool, service, assetStore, actor, designer: { id: designerId, role: 'designer', disabled: false },
    campaign: { ...campaign, status: 'direction_selected', revision: 2, selectedCopyId: copySetId, selectedDirectionId: directionId },
    analysis, analysisJobId, copy, directionId, sourceAssetId, sourceBytes, sourceHash,
    compositionInput: {
      templateId: templateManifest.id, templateVersion: templateManifest.version,
      ratioIds: templateManifest.ratios.map((ratio) => ratio.id),
      slotValues: { headline: copy.headline, body: copy.body, cta: copy.cta, image: sourceAssetId },
    },
  }
}

async function insertLegacyFinalImage(harness, {
  jobId, assetId, associatedObjectName, color, fingerprintDimensions = { width: 1000, height: 1000 },
}) {
  const bytes = await sharp({ create: { width: 1000, height: 1000, channels: 4, background: color } }).png().toBuffer()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const objectKey = `campaigns/${harness.campaign.id}/uploads/${associatedObjectName}.png`
  const direction = {
    id: harness.directionId, title: 'Nordic focus', prompt: 'A calm Norwegian learning scene',
    status: 'pending', previewAssetId: null,
  }
  await harness.assetStore.put({ objectKey, bytes, contentType: 'image/png' })
  await harness.pool.query(
    `INSERT INTO generation_jobs
       (id, campaign_id, actor_id, method, step, provider, model, region, status, attempts,
        safety, usage, reserved_cost_microunits, actual_cost_microunits, idempotency_key,
        request_fingerprint, owner_token, dispatch_state, dispatched_at, budget_day,
        input_snapshot, result_metadata, timeout_at, completed_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'POST', 'image', 'mock', 'mock-v1', 'europe-west6', 'succeeded', 1,
             '{"verdict":"safe","categories":[]}', '{}', 0, 0, $4, $5, $6, 'dispatched', $7,
             '2026-09-04', $8, $9, $10, $7, $7, $7)`,
    [jobId, harness.campaign.id, harness.actor.id, `${jobId}-key`, hashCanonical({
      step: 'image', input: { directionId: harness.directionId, ...fingerprintDimensions },
    }), `${jobId}-owner`, new Date('2026-09-04T10:00:00.000Z'), { direction }, {
      image: {
        asset: { id: assetId, kind: 'final_image', sha256 },
        mimeType: 'image/png', width: 1000, height: 1000, byteSize: bytes.length,
      },
    }, new Date('2026-09-04T10:05:00.000Z')],
  )
  await harness.pool.query(
    `INSERT INTO assets
       (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, generation_job_id)
     VALUES ($1, $2, 'final_image', $3, 'image/png', $4, 1000, 1000, $5, 'generation', $6)`,
    [assetId, harness.campaign.id, objectKey, bytes.length, sha256, jobId],
  )
  return { bytes, sha256, objectKey }
}

describe('immutable review version workflow', () => {
  test('requires the idempotency lease to outlive the full operation and recovery budget', () => {
    expect(() => createVersionService({
      pool: { query() {} },
      assetStore: createMemoryAssetStore(),
      timeoutMs: 1_000,
      recoveryTimeoutMs: 250,
      leaseMs: 1_250,
    })).toThrow('Version lease must exceed the operation and recovery deadlines')
  })

  test('uses a proven legacy succeeded image snapshot during rolling migration', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(12) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await immutableVersionHarness()
    const imageJobId = `${harness.campaign.id}:image-job`
    await harness.pool.query(
      `UPDATE generation_jobs
       SET input_snapshot = input_snapshot - 'width' - 'height'
       WHERE id = $1`,
      [imageJobId],
    )
    const saved = await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'legacy-succeeded-version', input: {},
    })

    expect(saved.campaign).toMatchObject({ status: 'composed', revision: 3 })
    expect(created).toMatchObject({ status: 201, body: { campaign: { status: 'in_review' } } })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 013 backfills only exact succeeded legacy image provenance and is rerunnable', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(12) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await immutableVersionHarness()
    const imageJobId = `${harness.campaign.id}:image-job`
    await harness.pool.query("UPDATE generation_jobs SET input_snapshot = input_snapshot - 'width' - 'height' WHERE id = $1", [imageJobId])

    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: ['013_migrate_legacy_image_provenance.sql', '014_preserve_legacy_multi_source_provenance.sql', '015_human_review_gates.sql', '016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'] })
    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: [] })
    expect((await harness.pool.query('SELECT input_snapshot FROM generation_jobs WHERE id = $1', [imageJobId])).rows[0].input_snapshot)
      .toMatchObject({ width: 1000, height: 1000 })
    expect((await harness.pool.query('SELECT status, selected_direction_id FROM campaigns WHERE id = $1', [harness.campaign.id])).rows[0])
      .toMatchObject({ status: 'direction_selected', selected_direction_id: harness.directionId })
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM audit_events WHERE action LIKE 'migration.%'")).rows[0].count).toBe(0)

    const saved = await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: saved.campaign.revision,
      idempotencyKey: 'migrated-succeeded-version', input: {},
    })
    expect(created.status).toBe(201)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 013 fences mismatched succeeded legacy images and their editable composition', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(12) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await immutableVersionHarness()
    const saved = await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const imageJobId = `${harness.campaign.id}:image-job`
    await harness.pool.query(
      `UPDATE generation_jobs
       SET input_snapshot = input_snapshot - 'width' - 'height',
           result_metadata = jsonb_set(result_metadata, '{image,width}', '999'::jsonb)
       WHERE id = $1`,
      [imageJobId],
    )

    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: ['013_migrate_legacy_image_provenance.sql', '014_preserve_legacy_multi_source_provenance.sql', '015_human_review_gates.sql', '016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'] })
    expect((await harness.pool.query(
      'SELECT status, error_code, response_status, response_body FROM generation_jobs WHERE id = $1',
      [imageJobId],
    )).rows[0]).toMatchObject({
      status: 'failed', error_code: 'legacy_image_provenance_unresolved', response_status: 201,
      response_body: { job: { status: 'failed', errorCode: 'legacy_image_provenance_unresolved' } },
    })
    expect((await harness.pool.query('SELECT stale FROM visual_directions WHERE id = $1', [harness.directionId])).rows[0].stale).toBe(true)
    expect((await harness.pool.query('SELECT stale FROM compositions WHERE id = $1', [saved.composition.id])).rows[0].stale).toBe(true)
    expect((await harness.pool.query(
      'SELECT status, revision, selected_direction_id, composition_id FROM campaigns WHERE id = $1',
      [harness.campaign.id],
    )).rows[0]).toEqual({ status: 'copy_ready', revision: 4, selected_direction_id: null, composition_id: null })
    expect((await harness.pool.query(
      `SELECT action, actor_id, actor_role, entity_type, entity_id, payload
       FROM audit_events WHERE action = 'migration.legacy_image_provenance_fenced'`,
    )).rows).toEqual([expect.objectContaining({
      action: 'migration.legacy_image_provenance_fenced', actor_id: harness.actor.id,
      actor_role: 'marketer', entity_type: 'campaign', entity_id: harness.campaign.id,
      payload: expect.objectContaining({
        jobId: imageJobId, campaignId: harness.campaign.id,
        reason: 'legacy_image_provenance_unresolved', responseStatus: 201,
      }),
    })])

    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 4,
      idempotencyKey: 'fenced-version', input: {},
    })).rejects.toMatchObject({ code: 'transition_not_allowed' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 013 fences unresolved pending images and prevents legacy rows from returning', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(12) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const now = new Date()
    const harness = await (async () => {
      const pool = makePool()
      const actorId = await insertUser(pool)
      const campaign = await insertCampaign(pool, actorId)
      await createSettingsRepository(pool).update({
        expectedRevision: 0, provider: 'mock', model: 'mock-v1', region: 'europe-west6',
        dailyBudgetMicrounits: 1_000_000, perStepRegenerationLimit: 3, generationDisabled: false, updatedBy: actorId,
      })
      return {
        pool, campaign, actor: { id: actorId, role: 'marketer', disabled: false },
        controlPlane: createGenerationControlPlane({ pool, clock: () => now }),
      }
    })()
    const directionId = `legacy-unresolved-direction-${randomUUID()}`
    await harness.pool.query(
      `INSERT INTO visual_directions (id, campaign_id, title, prompt, status)
       VALUES ($1, $2, 'Unresolved legacy', 'Regenerate me', 'pending')`,
      [directionId, harness.campaign.id],
    )
    const jobId = `legacy-unresolved-job-${randomUUID()}`
    const ownerToken = randomUUID()
    await harness.controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'image',
      input: { directionId, width: 1200, height: 628 }, idempotencyKey: 'legacy-unresolved',
      jobId, ownerToken, maxCostMicrounits: 1_000, startedAt: now,
      timeoutAt: new Date(now.getTime() + 60_000),
    })
    await harness.controlPlane.markDispatched({ jobId, ownerToken, dispatchedAt: now })
    await harness.pool.query("UPDATE generation_jobs SET input_snapshot = input_snapshot - 'width' - 'height' WHERE id = $1", [jobId])

    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: ['013_migrate_legacy_image_provenance.sql', '014_preserve_legacy_multi_source_provenance.sql', '015_human_review_gates.sql', '016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'] })
    expect((await harness.pool.query(
      'SELECT status, unknown_reason, response_status, response_body FROM generation_jobs WHERE id = $1', [jobId],
    )).rows[0]).toMatchObject({
      status: 'unknown', unknown_reason: 'legacy_image_dimensions_unavailable', response_status: 202,
      response_body: { job: { status: 'unknown' } },
    })
    expect((await harness.pool.query(
      `SELECT action, payload FROM audit_events
       WHERE action = 'migration.legacy_image_provenance_fenced' AND payload->>'jobId' = $1`, [jobId],
    )).rows).toEqual([expect.objectContaining({
      payload: expect.objectContaining({
        jobId, campaignId: harness.campaign.id,
        reason: 'legacy_image_dimensions_unavailable', responseStatus: 202,
      }),
    })])
    await expect(harness.controlPlane.completeGeneratedImage({
      jobId, ownerToken, directionId, requestedWidth: 1200, requestedHeight: 628,
      asset: {
        id: randomUUID(), campaignId: harness.campaign.id, objectKey: `campaigns/${harness.campaign.id}/late.png`,
        mimeType: 'image/png', byteSize: 12, width: 1200, height: 628, sha256: 'c'.repeat(64),
        source: 'generation', generationJobId: jobId, versionId: null,
      },
      safety: { verdict: 'safe', categories: [] }, usage: {}, actualCostMicrounits: 10, completedAt: now,
    })).resolves.toMatchObject({ status: 202, body: { job: { status: 'unknown' } } })

    await expect(harness.pool.query(
      `UPDATE generation_jobs SET status = 'pending', input_snapshot = input_snapshot - 'width' - 'height'
       WHERE id = $1`,
      [jobId],
    )).rejects.toMatchObject({ code: '23514' })
    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: [] })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 014 repairs only associated legacy final-image provenance and audits every fence', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(12) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const multiTemplate = structuredClone(pilotTemplateFixture)
    multiTemplate.version = '1.4.0'
    multiTemplate.slots.push({
      ...structuredClone(multiTemplate.slots.find((slot) => slot.id === 'image')),
      id: 'secondaryImage',
    })
    const harness = await immutableVersionHarness({ templateManifest: multiTemplate })
    await insertLegacyFinalImage(harness, {
      jobId: 'secondary-image-job', assetId: 'secondary-image', associatedObjectName: 'secondary', color: '#0ea5e9',
    })
    await insertLegacyFinalImage(harness, {
      jobId: 'unassociated-image-job', assetId: 'unassociated-image', associatedObjectName: 'unassociated', color: '#f97316',
    })
    await insertLegacyFinalImage(harness, {
      jobId: 'mismatched-image-job', assetId: 'mismatched-image', associatedObjectName: 'mismatched', color: '#a855f7',
      fingerprintDimensions: { width: 999, height: 1000 },
    })
    const compositionInput = {
      ...harness.compositionInput,
      slotValues: { ...harness.compositionInput.slotValues, secondaryImage: 'secondary-image' },
    }
    const saved = await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: compositionInput,
    })
    await harness.pool.query(
      `INSERT INTO compositions
         (id, campaign_id, template_id, template_version, ratio_ids, slot_values, validation, stale, created_at)
       VALUES ('mismatched-associated-composition', $1, $2, $3, $4, $5, $6, false, $7)`,
      [harness.campaign.id, multiTemplate.id, multiTemplate.version, JSON.stringify(saved.composition.ratioIds),
        JSON.stringify({ ...saved.composition.slotValues, secondaryImage: 'mismatched-image' }), saved.composition.validation,
        new Date('2026-09-04T10:01:00.000Z')],
    )

    expect((await harness.pool.query("SELECT count(*)::int AS count FROM audit_events WHERE action LIKE 'migration.%'")).rows[0].count).toBe(0)
    expect(await runMigrations({ pool: harness.pool })).toEqual({
      applied: ['013_migrate_legacy_image_provenance.sql', '014_preserve_legacy_multi_source_provenance.sql', '015_human_review_gates.sql', '016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'],
    })
    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: [] })

    expect((await harness.pool.query(
      'SELECT status, input_snapshot, error_code, response_status, response_body FROM generation_jobs WHERE id = $1',
      ['secondary-image-job'],
    )).rows[0]).toMatchObject({
      status: 'succeeded', input_snapshot: { width: 1000, height: 1000 }, error_code: null, response_status: 201,
      response_body: { job: { status: 'succeeded', errorCode: null } },
    })
    expect((await harness.pool.query(
      'SELECT status, input_snapshot, error_code, response_status FROM generation_jobs WHERE id = $1',
      ['unassociated-image-job'],
    )).rows[0]).toMatchObject({
      status: 'failed', input_snapshot: { direction: expect.any(Object) },
      error_code: 'legacy_image_provenance_unresolved', response_status: 201,
    })
    expect((await harness.pool.query(
      'SELECT status, input_snapshot, error_code FROM generation_jobs WHERE id = $1', ['mismatched-image-job'],
    )).rows[0]).toMatchObject({
      status: 'failed', input_snapshot: { direction: expect.any(Object) },
      error_code: 'legacy_image_provenance_unresolved',
    })
    expect((await harness.pool.query('SELECT stale FROM visual_directions WHERE id = $1', [harness.directionId])).rows[0].stale).toBe(true)
    expect((await harness.pool.query('SELECT stale FROM compositions WHERE id = $1', [saved.composition.id])).rows[0].stale).toBe(true)
    const fencedCampaign = (await harness.pool.query(
      'SELECT status, revision, selected_direction_id, composition_id FROM campaigns WHERE id = $1',
      [harness.campaign.id],
    )).rows[0]
    expect(fencedCampaign).toEqual({
      status: 'copy_ready', revision: 4, selected_direction_id: null, composition_id: null,
    })
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM compositions WHERE id LIKE 'migration-014-composition:%'")).rows[0].count).toBe(0)

    const migrationAudits = (await harness.pool.query(
      `SELECT id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, payload
       FROM audit_events WHERE action LIKE 'migration.%' ORDER BY created_at, id`,
    )).rows
    expect(migrationAudits).toHaveLength(4)
    expect(migrationAudits.map((event) => event.action)).toEqual([
      'migration.legacy_image_provenance_fenced',
      'migration.legacy_image_provenance_fenced',
      'migration.legacy_image_provenance_fenced',
      'migration.legacy_image_provenance_restored',
    ])
    expect(migrationAudits.filter((event) => event.action === 'migration.legacy_image_provenance_fenced')
      .every((event) => event.before_status === null && event.after_status === 'copy_ready')).toBe(true)
    expect(migrationAudits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'migration-013-image-fence:secondary-image-job', actor_id: harness.actor.id,
        actor_role: 'marketer', entity_type: 'campaign', entity_id: harness.campaign.id,
        payload: expect.objectContaining({ jobId: 'secondary-image-job', reason: 'legacy_image_provenance_unresolved' }),
      }),
      expect.objectContaining({
        id: 'migration-013-image-fence:unassociated-image-job',
        payload: expect.objectContaining({ jobId: 'unassociated-image-job', reason: 'legacy_image_provenance_unresolved' }),
      }),
      expect.objectContaining({
        id: 'migration-013-image-fence:mismatched-image-job',
        payload: expect.objectContaining({ jobId: 'mismatched-image-job', reason: 'legacy_image_provenance_unresolved' }),
      }),
      expect.objectContaining({
        id: 'migration-014-image-restore:secondary-image-job', before_status: 'copy_ready', after_status: 'copy_ready',
        payload: expect.objectContaining({
          jobId: 'secondary-image-job', assetId: 'secondary-image',
          reason: 'provable_legacy_final_image', campaignRevision: 4,
        }),
      }),
    ]))
    expect(migrationAudits.some((event) => event.payload.jobId === `${harness.campaign.id}:image-job`)).toBe(false)
    await expect(harness.pool.query('UPDATE audit_events SET payload = payload || $2 WHERE id = $1', [
      migrationAudits[0].id, { tampered: true },
    ])).rejects.toMatchObject({ code: '55000' })
    await expect(createGenerationControlPlane({ pool: harness.pool }).preflightGeneration({
      actor: harness.actor, campaignId: harness.campaign.id, step: 'image',
      input: { directionId: harness.directionId, width: 1000, height: 1000 },
      idempotencyKey: 'secondary-image-job-key',
    })).resolves.toMatchObject({
      kind: 'replay', response: { status: 201, body: { job: { id: 'secondary-image-job', status: 'succeeded' } } },
    })

    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 4,
      idempotencyKey: 'migrated-secondary-version', input: {},
    })).rejects.toMatchObject({ code: 'transition_not_allowed' })

    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 014 never resurrects obsolete composition history over a newer copy-ready state', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(12) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const template = structuredClone(pilotTemplateFixture)
    template.version = '1.5.0'
    template.slots.push({
      ...structuredClone(template.slots.find((slot) => slot.id === 'image')),
      id: 'secondaryImage',
    })
    const harness = await immutableVersionHarness({ templateManifest: template })
    await insertLegacyFinalImage(harness, {
      jobId: 'obsolete-secondary-job', assetId: 'obsolete-secondary',
      associatedObjectName: 'obsolete-secondary', color: '#14b8a6',
    })
    const oldComposition = await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2,
      input: {
        ...harness.compositionInput,
        slotValues: { ...harness.compositionInput.slotValues, secondaryImage: 'obsolete-secondary' },
      },
    })
    await harness.pool.query('UPDATE compositions SET stale = true WHERE id = $1', [oldComposition.composition.id])
    await harness.pool.query('UPDATE visual_directions SET stale = true WHERE id = $1', [harness.directionId])
    await harness.pool.query(
      `UPDATE campaigns
       SET status = 'copy_ready', revision = 4, selected_direction_id = NULL,
           composition_id = NULL, updated_at = '2026-09-04T10:02:00Z'
       WHERE id = $1`,
      [harness.campaign.id],
    )
    await createAuditRepository(harness.pool).append({
      id: 'newer-legitimate-copy-ready-audit', actorId: harness.actor.id, actorRole: harness.actor.role,
      action: 'campaign.legitimate_copy_ready_reset', entityType: 'campaign', entityId: harness.campaign.id,
      beforeStatus: 'composed', afterStatus: 'copy_ready',
      payload: { reason: 'brief_changed_after_old_composition', compositionId: oldComposition.composition.id },
      createdAt: new Date('2026-09-04T10:02:00.000Z'),
    })

    expect(await runMigrations({ pool: harness.pool })).toEqual({
      applied: ['013_migrate_legacy_image_provenance.sql', '014_preserve_legacy_multi_source_provenance.sql', '015_human_review_gates.sql', '016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'],
    })
    expect((await harness.pool.query(
      'SELECT status, revision, selected_direction_id, composition_id FROM campaigns WHERE id = $1', [harness.campaign.id],
    )).rows[0]).toEqual({ status: 'copy_ready', revision: 4, selected_direction_id: null, composition_id: null })
    expect((await harness.pool.query('SELECT stale FROM visual_directions WHERE id = $1', [harness.directionId])).rows[0].stale).toBe(true)
    expect((await harness.pool.query('SELECT stale FROM compositions WHERE id = $1', [oldComposition.composition.id])).rows[0].stale).toBe(true)
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM compositions WHERE id LIKE 'migration-014-composition:%'")).rows[0].count).toBe(0)
    expect((await harness.pool.query(
      `SELECT status, input_snapshot, response_body FROM generation_jobs
       WHERE id = 'obsolete-secondary-job'`,
    )).rows[0]).toMatchObject({
      status: 'succeeded', input_snapshot: { width: 1000, height: 1000 },
      response_body: { job: { status: 'succeeded' } },
    })
    const migrationAudits = (await harness.pool.query(
      `SELECT action, before_status, after_status, payload FROM audit_events
       WHERE payload->>'jobId' = 'obsolete-secondary-job' ORDER BY created_at, id`,
    )).rows
    expect(migrationAudits).toEqual([
      expect.objectContaining({
        action: 'migration.legacy_image_provenance_fenced', before_status: null, after_status: 'copy_ready',
      }),
      expect.objectContaining({
        action: 'migration.legacy_image_provenance_restored', before_status: 'copy_ready', after_status: 'copy_ready',
        payload: expect.objectContaining({ compositionId: null, campaignRevision: 4 }),
      }),
    ])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('saves a server-owned valid composition and creates version 1 with exact stored review bytes', async () => {
    const harness = await immutableVersionHarness()
    const saved = await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    expect(saved).toMatchObject({
      composition: { id: expect.any(String), validation: { valid: true, errors: [] }, stale: false },
      campaign: { status: 'composed', revision: 3, compositionId: expect.any(String) },
    })

    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'review-version-one', input: {},
    })

    expect(created.status).toBe(201)
    expect(created.body.campaign).toMatchObject({ status: 'in_review', revision: 4, currentVersionNumber: 1, openVersionId: created.body.version.id })
    expect(campaignVersionSnapshotSchema.parse(created.body.version.snapshot)).toEqual(created.body.version.snapshot)
    expect(created.body.version.contentHash).toBe(hashCanonical(created.body.version.snapshot))
    expect(created.body.version.snapshot.assets.map((asset) => asset.kind).sort())
      .toEqual(['direction', 'manifest', 'review_png'])

    const reviewAsset = created.body.version.snapshot.assets.find((asset) => asset.kind === 'review_png')
    const manifestAsset = created.body.version.snapshot.assets.find((asset) => asset.kind === 'manifest')
    const reviewRow = (await harness.pool.query('SELECT * FROM assets WHERE id = $1', [reviewAsset.id])).rows[0]
    const storedReview = await harness.assetStore.get({ objectKey: reviewRow.object_key })
    expect(createHash('sha256').update(storedReview).digest('hex')).toBe(reviewAsset.sha256)
    const expectedReview = await createInProcessRenderer().renderComposition({
      manifest: pilotTemplateFixture,
      ratio: 'square',
      slots: { ...harness.compositionInput.slotValues, image: { bytes: harness.sourceBytes, mimeType: 'image/png' } },
    })
    expect(storedReview).toEqual(Buffer.from(expectedReview.bytes))
    const manifestRow = (await harness.pool.query('SELECT * FROM assets WHERE id = $1', [manifestAsset.id])).rows[0]
    const storedManifest = JSON.parse((await harness.assetStore.get({ objectKey: manifestRow.object_key })).toString('utf8'))
    expect(storedManifest).toMatchObject({ schemaVersion: 1, versionId: created.body.version.id, renders: [{ ratioId: 'square' }] })
    expect((await harness.pool.query('SELECT event_type FROM review_events WHERE version_id = $1', [created.body.version.id])).rows)
      .toEqual([{ event_type: 'sent' }])
    expect((await harness.pool.query('SELECT action FROM audit_events WHERE version_id = $1', [created.body.version.id])).rows)
      .toEqual([{ action: 'campaign.sent_for_review' }])
    await expect(harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 4, input: harness.compositionInput,
    })).rejects.toMatchObject({ code: 'campaign_locked' })
    await expect(harness.pool.query('UPDATE campaign_versions SET content_hash = $2 WHERE id = $1', [created.body.version.id, 'f'.repeat(64)]))
      .rejects.toMatchObject({ code: '55000' })
    await expect(harness.pool.query('UPDATE assets SET sha256 = $2 WHERE id = $1', [reviewAsset.id, 'f'.repeat(64)]))
      .rejects.toMatchObject({ code: '55000' })
    await expect(harness.pool.query('DELETE FROM assets WHERE id = $1', [manifestAsset.id]))
      .rejects.toMatchObject({ code: '55000' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('persists immutable SQL provenance for every source asset referenced by a version', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'source-provenance', input: {},
    })

    expect((await harness.pool.query(
      `SELECT campaign_id, version_id, asset_id, asset_sha256
       FROM campaign_version_source_assets WHERE version_id = $1`,
      [created.body.version.id],
    )).rows).toEqual([{
      campaign_id: harness.campaign.id,
      version_id: created.body.version.id,
      asset_id: harness.sourceAssetId,
      asset_sha256: harness.sourceHash,
    }])
    await expect(harness.pool.query(
      `INSERT INTO campaign_version_source_assets (campaign_id, version_id, asset_id, asset_sha256)
       VALUES ($1, $2, $3, $4)`,
      [harness.campaign.id, created.body.version.id, harness.sourceAssetId, 'f'.repeat(64)],
    )).rejects.toMatchObject({ code: '23514' })
    await expect(harness.pool.query('UPDATE assets SET sha256 = $2 WHERE id = $1', [harness.sourceAssetId, 'f'.repeat(64)]))
      .rejects.toMatchObject({ code: '55000' })
    await expect(harness.pool.query('DELETE FROM assets WHERE id = $1', [harness.sourceAssetId]))
      .rejects.toMatchObject({ code: '55000' })
    await expect(harness.pool.query(
      'UPDATE campaign_version_source_assets SET asset_sha256 = $2 WHERE version_id = $1',
      [created.body.version.id, 'f'.repeat(64)],
    )).rejects.toMatchObject({ code: '55000' })
    await expect(harness.pool.query(
      'DELETE FROM campaign_version_source_assets WHERE version_id = $1',
      [created.body.version.id],
    )).rejects.toMatchObject({ code: '55000' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects a direct version insert whose snapshot source has no SQL association', async () => {
    const harness = await immutableVersionHarness()
    const snapshot = {
      assets: [{ id: harness.sourceAssetId, kind: 'direction', sha256: harness.sourceHash }],
    }
    await expect(harness.pool.query(
      `INSERT INTO campaign_versions
         (id, campaign_id, version_number, snapshot, content_hash, created_by)
       VALUES ('missing-source-association', $1, 50, $2, $3, $4)`,
      [harness.campaign.id, snapshot, hashCanonical(snapshot), harness.actor.id],
    )).rejects.toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects an empty source set that omits the selected direction preview', async () => {
    const harness = await immutableVersionHarness()
    const snapshot = {
      selectedDirection: { previewAssetId: harness.sourceAssetId },
      assets: [],
    }
    await expect(harness.pool.query(
      `INSERT INTO campaign_versions
         (id, campaign_id, version_number, snapshot, content_hash, created_by)
       VALUES ('missing-preview-provenance', $1, 53, $2, $3, $4)`,
      [harness.campaign.id, snapshot, hashCanonical(snapshot), harness.actor.id],
    )).rejects.toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects an association that is extra relative to an immutable version snapshot', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'extra-source-association-version', input: {},
    })
    await harness.pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source)
       VALUES ('unreferenced-source', $1, 'direction', 'uploads/unreferenced-source.png',
               'image/png', 1, 1, 1, $2, 'upload')`,
      [harness.campaign.id, 'd'.repeat(64)],
    )
    await expect(harness.pool.query(
      `INSERT INTO campaign_version_source_assets
         (campaign_id, version_id, asset_id, asset_sha256)
       VALUES ($1, $2, 'unreferenced-source', $3)`,
      [harness.campaign.id, created.body.version.id, 'd'.repeat(64)],
    )).rejects.toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects a source association whose hash differs from the version snapshot', async () => {
    const harness = await immutableVersionHarness()
    const snapshot = {
      assets: [{ id: harness.sourceAssetId, kind: 'direction', sha256: 'e'.repeat(64) }],
    }
    await expect(withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO campaign_versions
           (id, campaign_id, version_number, snapshot, content_hash, created_by)
         VALUES ('mismatched-source-association', $1, 51, $2, $3, $4)`,
        [harness.campaign.id, snapshot, hashCanonical(snapshot), harness.actor.id],
      )
      await client.query(
        `INSERT INTO campaign_version_source_assets
           (campaign_id, version_id, asset_id, asset_sha256)
         VALUES ($1, 'mismatched-source-association', $2, $3)`,
        [harness.campaign.id, harness.sourceAssetId, harness.sourceHash],
      )
    })).rejects.toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects duplicate source references hidden inside a version snapshot', async () => {
    const harness = await immutableVersionHarness()
    const source = { id: harness.sourceAssetId, kind: 'direction', sha256: harness.sourceHash }
    const snapshot = { assets: [source, source] }
    await expect(withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO campaign_versions
           (id, campaign_id, version_number, snapshot, content_hash, created_by)
         VALUES ('duplicate-snapshot-source', $1, 52, $2, $3, $4)`,
        [harness.campaign.id, snapshot, hashCanonical(snapshot), harness.actor.id],
      )
      await client.query(
        `INSERT INTO campaign_version_source_assets
           (campaign_id, version_id, asset_id, asset_sha256)
         VALUES ($1, 'duplicate-snapshot-source', $2, $3)`,
        [harness.campaign.id, harness.sourceAssetId, harness.sourceHash],
      )
    })).rejects.toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('locks source assets through final provenance commit so a concurrent mutation cannot win', async () => {
    const locked = deferred()
    const release = deferred()
    let sourceReads = 0
    const repositoryFactory = (client) => {
      const repository = createVersionRepository(client)
      const gateFinalRead = async (read) => {
        const assets = await read()
        sourceReads += 1
        if (sourceReads === 2) {
          locked.resolve()
          await release.promise
        }
        return assets
      }
      return {
        ...repository,
        findAssets: (campaignId, assetIds) => gateFinalRead(() => repository.findAssets(campaignId, assetIds)),
        findAssetsForUpdate: (campaignId, assetIds) => gateFinalRead(() => (
          repository.findAssetsForUpdate?.(campaignId, assetIds) ?? repository.findAssets(campaignId, assetIds)
        )),
      }
    }
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const service = createVersionService({
      pool: harness.pool, assetStore: harness.assetStore, repositoryFactory, timeoutMs: 2_000,
    })
    const creating = service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'source-lock-race', input: {},
    })
    await locked.promise
    const mutation = harness.pool.query(
      'UPDATE assets SET sha256 = $2 WHERE id = $1',
      [harness.sourceAssetId, 'e'.repeat(64)],
    )
    const mutationObservation = observeSettlementWithin(mutation, 50)
    const early = await mutationObservation.observed
    release.resolve()
    const created = await creating
    const mutationResult = await mutationObservation.settled

    expect(early).toEqual({ kind: 'deadline_ignored' })
    expect(created.status).toBe(201)
    expect(mutationResult).toMatchObject({ kind: 'rejected', error: { code: '55000' } })
    expect((await harness.pool.query(
      'SELECT asset_sha256 FROM campaign_version_source_assets WHERE version_id = $1 AND asset_id = $2',
      [created.body.version.id, harness.sourceAssetId],
    )).rows[0].asset_sha256).toBe(harness.sourceHash)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects stale revisions, wrong roles, foreign source assets, and invalid copy before persistence', async () => {
    const harness = await immutableVersionHarness()
    const foreignCampaign = await insertCampaign(harness.pool, harness.actor.id)
    await harness.pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source)
       VALUES ('foreign-source-asset', $1, 'direction', $2, 'image/png', 1, 1, 1, $3, 'upload')`,
      [foreignCampaign.id, `campaigns/${foreignCampaign.id}/foreign.png`, 'a'.repeat(64)],
    )
    await expect(harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 1, input: harness.compositionInput,
    })).rejects.toMatchObject({ code: 'revision_conflict' })
    await expect(harness.service.saveComposition({
      actor: harness.designer, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2,
      input: { ...harness.compositionInput, slotValues: { ...harness.compositionInput.slotValues, image: 'foreign-source-asset' } },
    })).rejects.toMatchObject({ code: 'composition_source_mismatch' })
    await expect(harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2,
      input: { ...harness.compositionInput, templateVersion: '9.9.9' },
    })).rejects.toMatchObject({ code: 'template_integrity_failure' })
    await expect(harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2,
      input: { ...harness.compositionInput, slotValues: { ...harness.compositionInput.slotValues, headline: 'X'.repeat(81) } },
    })).rejects.toMatchObject({ code: 'invalid_composition', details: expect.any(Array) })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM compositions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects source-byte tampering while saving a composition', async () => {
    const harness = await immutableVersionHarness()
    const sourceRow = (await harness.pool.query('SELECT object_key FROM assets WHERE id = $1', [harness.sourceAssetId])).rows[0]
    await harness.assetStore.delete({ objectKey: sourceRow.object_key })
    await harness.assetStore.put({ objectKey: sourceRow.object_key, bytes: Buffer.from('tampered'), contentType: 'image/png' })

    await expect(harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })).rejects.toMatchObject({ code: 'asset_integrity_failure' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM compositions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects an unsafe selected direction lineage and keeps composition content immutable', async () => {
    const harness = await immutableVersionHarness()
    await harness.pool.query(
      `UPDATE generation_jobs SET safety = '{"verdict":"blocked","categories":["dangerous"]}'
       WHERE id = $1`,
      [`${harness.campaign.id}:directions-job`],
    )
    await expect(harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })).rejects.toMatchObject({ code: 'direction_selection_invalid' })
    await harness.pool.query(
      `UPDATE generation_jobs SET safety = '{"verdict":"safe","categories":[]}' WHERE id = $1`,
      [`${harness.campaign.id}:directions-job`],
    )
    const saved = await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    await expect(harness.pool.query(
      `UPDATE compositions SET slot_values = jsonb_set(slot_values, '{cta}', '"Changed"') WHERE id = $1`,
      [saved.composition.id],
    )).rejects.toMatchObject({ code: '55000' })
    await expect(harness.pool.query('DELETE FROM compositions WHERE id = $1', [saved.composition.id]))
      .rejects.toMatchObject({ code: '55000' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('serializes concurrent composition saves at the campaign revision', async () => {
    const harness = await immutableVersionHarness()
    const command = { actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput }
    const outcomes = await Promise.allSettled([
      harness.service.saveComposition(command),
      harness.service.saveComposition(command),
    ])
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1)
    expect(outcomes.find((outcome) => outcome.status === 'rejected').reason).toMatchObject({ code: 'revision_conflict' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM compositions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(1)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('replays the same idempotency key, conflicts on changed headers, and creates one open version under concurrency', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const command = {
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3, idempotencyKey: 'same-key', input: {},
    }
    const [first, second] = await Promise.all([
      harness.service.createVersion(command),
      harness.service.createVersion(command),
    ])
    const fresh = [first, second].find((value) => value.replayed !== true)
    const replay = [first, second].find((value) => value.replayed === true)
    expect(replay).toEqual({ ...fresh, replayed: true })
    await expect(harness.service.createVersion({ ...command, expectedRevision: 4 }))
      .rejects.toMatchObject({ code: 'idempotency_conflict' })
    await expect(harness.service.createVersion({ ...command, expectedRevision: 4, idempotencyKey: 'second-open-version' }))
      .rejects.toMatchObject({ code: 'open_version_conflict' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(1)
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM review_events WHERE campaign_id = $1 AND event_type = 'sent'", [harness.campaign.id])).rows[0].count).toBe(1)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('enforces version roles, revisions, and the final generation safety gate before rendering', async () => {
    const renderComposition = vi.fn(createInProcessRenderer().renderComposition)
    const harness = await immutableVersionHarness({ renderer: { renderComposition } })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })

    await expect(harness.service.createVersion({
      actor: harness.designer, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'designer-version', input: {},
    })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2,
      idempotencyKey: 'stale-version', input: {},
    })).rejects.toMatchObject({ code: 'revision_conflict' })
    await harness.pool.query('UPDATE settings SET generation_disabled = true WHERE singleton = true')
    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'disabled-version', input: {},
    })).rejects.toMatchObject({ code: 'generation_safety_unavailable' })

    expect(renderComposition).not.toHaveBeenCalled()
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('renders and stores every ratio declared by the saved composition', async () => {
    const templateManifest = structuredClone(pilotTemplateFixture)
    templateManifest.version = '1.1.0'
    templateManifest.ratios.push({
      id: 'landscape', width: 1200, height: 628,
      safeArea: { top: 40, right: 40, bottom: 40, left: 40 },
    })
    const placements = {
      headline: { x: 40, y: 40, width: 600, height: 160 },
      body: { x: 40, y: 220, width: 600, height: 140 },
      cta: { x: 40, y: 390, width: 300, height: 72 },
      image: { x: 680, y: 0, width: 520, height: 628 },
    }
    for (const slot of templateManifest.slots) slot.placements.landscape = placements[slot.id]
    const realRenderer = createInProcessRenderer()
    const renderComposition = vi.fn((input) => realRenderer.renderComposition(input))
    const harness = await immutableVersionHarness({ templateManifest, renderer: { renderComposition } })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })

    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'all-ratios', input: {},
    })

    expect(renderComposition.mock.calls.map(([input]) => input.ratio)).toEqual(['square', 'landscape'])
    expect(created.body.version.snapshot.assets.filter((asset) => asset.kind === 'review_png')).toHaveLength(2)
    const manifest = created.body.version.snapshot.assets.find((asset) => asset.kind === 'manifest')
    const manifestRow = (await harness.pool.query('SELECT object_key FROM assets WHERE id = $1', [manifest.id])).rows[0]
    const storedManifest = JSON.parse((await harness.assetStore.get({ objectKey: manifestRow.object_key })).toString('utf8'))
    expect(storedManifest.renders.map((render) => render.ratioId)).toEqual(['square', 'landscape'])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('detects source-byte tampering and never creates a version from it', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const sourceRow = (await harness.pool.query('SELECT object_key FROM assets WHERE id = $1', [harness.sourceAssetId])).rows[0]
    await harness.assetStore.delete({ objectKey: sourceRow.object_key })
    await harness.assetStore.put({ objectKey: sourceRow.object_key, bytes: Buffer.from('tampered'), contentType: 'image/png' })

    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'tampered-source', input: {},
    })).rejects.toMatchObject({ code: 'asset_integrity_failure' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('reclaims an expired crashed build with the same deterministic plan and preserves exact completed replay', async () => {
    let observedAt = new Date('2026-09-04T10:00:00.000Z')
    const stalledRenderer = { renderComposition: () => new Promise(() => {}) }
    const harness = await immutableVersionHarness({ renderer: stalledRenderer })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const stalledService = createVersionService({
      pool: harness.pool, assetStore: harness.assetStore, renderer: stalledRenderer,
      clock: () => observedAt, leaseMs: 551, timeoutMs: 500, recoveryTimeoutMs: 50, pollIntervalMs: 1,
    })
    const command = {
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'crash-reclaim', input: {},
    }
    void stalledService.createVersion(command).catch(() => {})
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = (await harness.pool.query(
        'SELECT count(*)::int AS count FROM review_version_builds WHERE campaign_id = $1',
        [harness.campaign.id],
      )).rows[0].count
      if (count === 1) break
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    const originalPlan = (await harness.pool.query(
      'SELECT version_id, version_number, plan FROM review_version_builds WHERE campaign_id = $1',
      [harness.campaign.id],
    )).rows[0]
    expect(originalPlan).toBeTruthy()
    observedAt = new Date('2026-09-04T10:00:00.600Z')
    const recoveredService = createVersionService({
      pool: harness.pool, assetStore: harness.assetStore, renderer: createInProcessRenderer(),
      clock: () => observedAt, leaseMs: 551, timeoutMs: 500, recoveryTimeoutMs: 50, pollIntervalMs: 1,
    })

    const recovered = await recoveredService.createVersion(command)
    expect(recovered.body.version).toMatchObject({ id: originalPlan.version_id, versionNumber: originalPlan.version_number })
    await harness.pool.query('UPDATE campaigns SET title = $2, revision = revision + 1 WHERE id = $1', [harness.campaign.id, 'Changed after completion'])
    const replay = await recoveredService.createVersion(command)
    expect(replay).toEqual({ ...recovered, replayed: true })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('serializes different idempotency keys so only one version can become open', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const outcomes = await Promise.allSettled([
      harness.service.createVersion({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3, idempotencyKey: 'different-a', input: {} }),
      harness.service.createVersion({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3, idempotencyKey: 'different-b', input: {} }),
    ])

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1)
    expect(outcomes.find((outcome) => outcome.status === 'rejected').reason)
      .toMatchObject({ code: expect.stringMatching(/version_build_in_progress|revision_conflict|transition_not_allowed/) })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(1)
    expect((await harness.pool.query('SELECT open_version_id FROM campaigns WHERE id = $1', [harness.campaign.id])).rows[0].open_version_id).toBeTruthy()
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('fences the final commit when persisted source metadata changes during rendering', async () => {
    let releaseRender
    let reportEntered
    const entered = new Promise((resolve) => { reportEntered = resolve })
    const gate = new Promise((resolve) => { releaseRender = resolve })
    const realRenderer = createInProcessRenderer()
    const delayedRenderer = {
      async renderComposition(input) {
        reportEntered()
        await gate
        return realRenderer.renderComposition(input)
      },
    }
    const harness = await immutableVersionHarness({ renderer: delayedRenderer })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const creating = harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'source-fence', input: {},
    })
    await entered
    await harness.pool.query('UPDATE assets SET sha256 = $2 WHERE id = $1', [harness.sourceAssetId, 'd'.repeat(64)])
    releaseRender()

    await expect(creating).rejects.toMatchObject({ code: 'version_source_changed' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('reuses exact deterministic objects after a partial storage failure and clears recovered orphans', async () => {
    const backing = createMemoryAssetStore()
    const attempted = []
    let failed = false
    const flakyStore = {
      get: (input) => backing.get(input),
      async getMetadata(input) {
        const metadata = await backing.getMetadata(input)
        return metadata && { ...metadata, sha256: null }
      },
      delete: (input) => backing.delete(input),
      close: () => backing.close(),
      async put(input) {
        attempted.push(input.objectKey)
        if (input.objectKey.includes('/versions/') && input.contentType === 'application/json' && !failed) {
          failed = true
          const error = new Error('temporary storage failure')
          error.code = 'storage_unavailable'
          throw error
        }
        return backing.put(input)
      },
    }
    const harness = await immutableVersionHarness({ assetStore: flakyStore })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const command = { actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3, idempotencyKey: 'partial-storage', input: {} }

    await expect(harness.service.createVersion(command)).rejects.toMatchObject({ code: 'asset_storage_unavailable' })
    const persistedPlan = (await harness.pool.query('SELECT version_id, plan FROM review_version_builds WHERE campaign_id = $1', [harness.campaign.id])).rows[0]
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM orphaned_uploads WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBeGreaterThan(0)
    const recovered = await harness.service.createVersion(command)
    expect(recovered.body.version.id).toBe(persistedPlan.version_id)
    expect(new Set(attempted.filter((key) => key.includes('/versions/'))).size).toBe(2)
    expect((await harness.pool.query(
      'SELECT count(*)::int AS count FROM orphaned_uploads WHERE campaign_id = $1',
      [harness.campaign.id],
    )).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('keeps an exact reused object eligible for orphan recovery when its readback fails', async () => {
    const backing = createMemoryAssetStore()
    let failManifest = true
    let failReusedReadback = false
    let reusedKey
    const store = {
      delete: (input) => backing.delete(input),
      async getMetadata(input) {
        const metadata = await backing.getMetadata(input)
        return metadata && { ...metadata, sha256: null }
      },
      close: () => backing.close(),
      async put(input) {
        if (failManifest && input.objectKey.includes('/versions/') && input.contentType === 'application/json') {
          failManifest = false
          throw Object.assign(new Error('manifest storage failed'), { code: 'storage_unavailable' })
        }
        try {
          return await backing.put(input)
        } catch (error) {
          if (error?.code === 'object_exists' && input.objectKey.includes('/versions/')) {
            reusedKey = input.objectKey
            failReusedReadback = true
          }
          throw error
        }
      },
      async get(input) {
        if (failReusedReadback && input.objectKey === reusedKey) {
          failReusedReadback = false
          throw Object.assign(new Error('readback unavailable'), { code: 'storage_unavailable' })
        }
        return backing.get(input)
      },
    }
    const harness = await immutableVersionHarness({ assetStore: store })
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const command = {
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'reuse-readback-failure', input: {},
    }

    await expect(harness.service.createVersion(command)).rejects.toMatchObject({ code: 'asset_storage_unavailable' })
    const build = (await harness.pool.query(
      'SELECT plan FROM review_version_builds WHERE campaign_id = $1',
      [harness.campaign.id],
    )).rows[0]
    const reviewKey = build.plan.ratioAssets[0].objectKey
    expect(await backing.get({ objectKey: reviewKey })).not.toBeNull()

    await expect(harness.service.createVersion(command)).rejects.toMatchObject({ code: 'asset_storage_unavailable' })
    expect(reusedKey).toBe(reviewKey)
    expect((await harness.pool.query(
      'SELECT object_key FROM orphaned_uploads WHERE campaign_id = $1 ORDER BY object_key',
      [harness.campaign.id],
    )).rows.map((row) => row.object_key)).toContain(reviewKey)
    expect((await harness.pool.query(
      `SELECT object_generation, object_etag, expected_sha256, expected_byte_size, expected_mime_type
       FROM orphaned_uploads WHERE object_key = $1`,
      [reviewKey],
    )).rows[0]).toMatchObject({
      object_generation: expect.any(String), object_etag: expect.any(String),
      expected_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      expected_byte_size: expect.any(String), expected_mime_type: 'image/png',
    })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('registers every uploaded object as orphaned when the final database transaction rolls back', async () => {
    const identifiers = [
      'composition-id', 'composition-audit-id', 'command-owner', 'version-id', 'collision-review-asset',
      'manifest-asset-id', 'version-build-id', 'sent-event-id', 'version-audit-id',
      'orphan-review-id', 'orphan-manifest-id',
    ]
    const harness = await immutableVersionHarness({ idGenerator: () => identifiers.shift() ?? randomUUID() })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    await harness.pool.query(
      `INSERT INTO assets (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source)
       VALUES ('collision-review-asset', $1, 'direction', $2, 'image/png', 1, 1, 1, $3, 'upload')`,
      [harness.campaign.id, `campaigns/${harness.campaign.id}/collision.png`, 'e'.repeat(64)],
    )
    const preRendered = await createInProcessRenderer().renderComposition({
      manifest: pilotTemplateFixture,
      ratio: 'square',
      slots: {
        ...harness.compositionInput.slotValues,
        image: { bytes: harness.sourceBytes, mimeType: 'image/png' },
      },
    })
    const deterministicReviewKey = `campaigns/${createHash('sha256').update(harness.campaign.id).digest('hex')}/versions/${createHash('sha256').update('version-id').digest('hex')}/review-${createHash('sha256').update('square').digest('hex')}-collision-review-asset.png`
    await harness.assetStore.put({ objectKey: deterministicReviewKey, bytes: preRendered.bytes, contentType: 'image/png' })

    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'database-rollback', input: {},
    })).rejects.toMatchObject({ code: '23505' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    expect((await harness.pool.query('SELECT object_key FROM orphaned_uploads WHERE campaign_id = $1 ORDER BY object_key', [harness.campaign.id])).rows).toHaveLength(2)
    expect((await harness.pool.query('SELECT state FROM review_version_builds WHERE campaign_id = $1', [harness.campaign.id])).rows[0].state).toBe('failed')
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('re-adopts cleaned version objects with fresh identity and finalizes the replacement generation', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const repositoryFactory = (client) => {
      const repository = createVersionRepository(client)
      return {
        ...repository,
        async finalizeBuild(input) {
          await repository.finalizeBuild(input)
          throw new Error('forced version final failure')
        },
      }
    }
    const command = {
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'cleaned-version-retry', input: {},
    }
    await expect(createVersionService({
      pool: harness.pool, assetStore: harness.assetStore, repositoryFactory,
      timeoutMs: 5_000, recoveryTimeoutMs: 500,
    }).createVersion(command)).rejects.toThrow('forced version final failure')
    const beforeCleanup = (await harness.pool.query(
      `SELECT id, object_key, object_generation FROM orphaned_uploads
       WHERE campaign_id = $1 ORDER BY object_key`,
      [harness.campaign.id],
    )).rows
    expect(beforeCleanup).toHaveLength(2)
    const control = createGenerationControlPlane({ pool: harness.pool })
    for (const orphan of beforeCleanup) {
      await expect(control.cleanupOrphanUpload({
        orphanId: orphan.id, deleteObject: (input) => harness.assetStore.delete(input),
      })).resolves.toEqual({ kind: 'cleaned', objectKey: orphan.object_key })
    }

    const beforeUploads = []
    const replacements = []
    const store = {
      ...harness.assetStore,
      async put(input) {
        beforeUploads.push((await harness.pool.query(
          `SELECT status, object_generation, object_etag FROM orphaned_uploads WHERE object_key = $1`,
          [input.objectKey],
        )).rows[0])
        const identity = await harness.assetStore.put(input)
        replacements.push(identity)
        return identity
      },
    }
    const created = await createVersionService({ pool: harness.pool, assetStore: store }).createVersion(command)
    expect(created.status).toBe(201)
    expect(beforeUploads).toEqual([
      { status: 'pending', object_generation: null, object_etag: null },
      { status: 'pending', object_generation: null, object_etag: null },
    ])
    expect(replacements).toHaveLength(2)
    expect(replacements.every((replacement) => beforeCleanup.every(
      (orphan) => replacement.generation !== orphan.object_generation,
    ))).toBe(true)
    expect((await harness.pool.query(
      `SELECT count(*)::int AS count FROM assets WHERE version_id = $1`,
      [created.body.version.id],
    )).rows[0].count).toBe(2)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('returns a bounded recovery error when storage fails and recovery cannot commit', async () => {
    const backing = createMemoryAssetStore()
    const failingStore = {
      get: (input) => backing.get(input),
      getMetadata: (input) => backing.getMetadata(input),
      delete: (input) => backing.delete(input),
      close: () => backing.close(),
      async put(input) {
        if (input.objectKey.includes('/versions/')) {
          const error = new Error('storage unavailable')
          error.code = 'storage_unavailable'
          throw error
        }
        return backing.put(input)
      },
    }
    const recoveryTransaction = async () => { throw new Error('recovery database unavailable') }
    const harness = await immutableVersionHarness({ assetStore: failingStore, serviceOptions: { recoveryTransaction } })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })

    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'recovery-unavailable', input: {},
    })).rejects.toMatchObject({ statusCode: 503, code: 'version_recovery_unavailable' })
    expect((await harness.pool.query('SELECT state FROM review_version_builds WHERE campaign_id = $1', [harness.campaign.id])).rows[0].state).toBe('in_progress')
    expect((await harness.pool.query(
      'SELECT count(*)::int AS count FROM orphaned_uploads WHERE campaign_id = $1 AND claimed_build_id IS NOT NULL',
      [harness.campaign.id],
    )).rows[0].count).toBe(2)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('does not let a stale build owner register the active owner deterministic objects as orphans', async () => {
    const harness = await immutableVersionHarness()
    await harness.pool.query(
      `INSERT INTO review_version_builds
         (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
          version_id, version_number, expected_revision, plan)
       VALUES ('owned-build', $1, $2, 'owned-key', $3, 'new-owner', 'owned-version', 1, 2, '{}')`,
      [harness.campaign.id, harness.actor.id, 'f'.repeat(64)],
    )

    await withTransaction(harness.pool, (client) => createVersionRepository(client).failBuild({
      buildId: 'owned-build', ownerToken: 'stale-owner', campaignId: harness.campaign.id,
      objectKeys: ['campaigns/owned/versions/object.png'], reason: 'stale_recovery',
      orphanIds: ['stale-orphan'], failedAt: new Date(),
    }))

    expect((await harness.pool.query("SELECT count(*)::int AS count FROM orphaned_uploads WHERE id = 'stale-orphan'")).rows[0].count).toBe(0)
    expect((await harness.pool.query("SELECT state, owner_token FROM review_version_builds WHERE id = 'owned-build'")).rows[0])
      .toEqual({ state: 'in_progress', owner_token: 'new-owner' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('keeps durable claimed object intents after adoption and refuses crash cleanup', async () => {
    const harness = await immutableVersionHarness()
    const objectKey = 'campaigns/claimed-build/versions/review.png'
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: harness.campaign.id,
      key: 'crashed-adoption', fingerprint: 'a'.repeat(64), ownerToken: 'crashed-owner',
      now: new Date('2026-09-04T10:00:00Z'), leaseExpiresAt: new Date('2099-09-04T10:00:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO review_version_builds
         (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
          version_id, version_number, expected_revision, plan)
       VALUES ('crashed-adopted-build', $1, $2, 'crashed-adoption', $3, 'crashed-owner',
               'crashed-adopted-version', 1, 2, '{}')`,
      [harness.campaign.id, harness.actor.id, 'a'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createVersionRepository(client).adoptBuildObjects({
      buildId: 'crashed-adopted-build', ownerToken: 'crashed-owner', campaignId: harness.campaign.id,
      objectKeys: [objectKey], orphanIds: ['crashed-adoption-intent'], adoptedAt: new Date(),
    }))
    expect((await harness.pool.query(
      'SELECT id, object_key, status, claimed_build_id FROM orphaned_uploads WHERE object_key = $1',
      [objectKey],
    )).rows[0]).toMatchObject({
      id: 'crashed-adoption-intent', object_key: objectKey, status: 'pending', claimed_build_id: 'crashed-adopted-build',
    })

    const deleteObject = vi.fn()
    await expect(createGenerationControlPlane({ pool: harness.pool }).cleanupOrphanUpload({
      orphanId: 'crashed-adoption-intent', deleteObject, cleanedAt: new Date(),
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(deleteObject).not.toHaveBeenCalled()
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('fences an ancient expired claimed build and makes its object eligible for cleanup', async () => {
    const harness = await immutableVersionHarness()
    const objectKey = 'campaigns/expired-claimed-build/versions/review.png'
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: harness.campaign.id,
      key: 'expired-adoption', fingerprint: 'c'.repeat(64), ownerToken: 'expired-owner',
      now: new Date('2020-09-04T10:00:00Z'), leaseExpiresAt: new Date('2020-09-04T10:01:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO review_version_builds
         (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
          version_id, version_number, expected_revision, plan)
       VALUES ('expired-claimed-build', $1, $2, 'expired-adoption', $3, 'expired-owner',
               'expired-claimed-version', 1, 2, '{}')`,
      [harness.campaign.id, harness.actor.id, 'c'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createVersionRepository(client).adoptBuildObjects({
      buildId: 'expired-claimed-build', ownerToken: 'expired-owner', campaignId: harness.campaign.id,
      objectKeys: [objectKey], orphanIds: ['expired-claimed-intent'], adoptedAt: new Date('2020-09-04T10:00:00Z'),
    }))
    await harness.pool.query(
      `UPDATE orphaned_uploads SET object_generation = 'verified-test-generation'
       WHERE id = 'expired-claimed-intent'`,
    )
    const deleted = []
    const result = await createGenerationControlPlane({ pool: harness.pool }).cleanupOrphanUpload({
      orphanId: 'expired-claimed-intent',
      deleteObject: async ({ objectKey: key }) => { deleted.push(key) },
      cleanedAt: new Date('2026-09-04T10:00:00Z'),
    })

    expect(result).toEqual({ kind: 'cleaned', objectKey })
    expect(deleted).toEqual([objectKey])
    expect((await harness.pool.query(
      "SELECT state FROM idempotency_records WHERE resource_id = $1 AND key = 'expired-adoption'",
      [harness.campaign.id],
    )).rows[0]).toEqual({ state: 'failed' })
    expect((await harness.pool.query(
      "SELECT state FROM review_version_builds WHERE id = 'expired-claimed-build'",
    )).rows[0]).toEqual({ state: 'failed' })
    expect((await harness.pool.query(
      "SELECT status, claimed_build_id FROM orphaned_uploads WHERE id = 'expired-claimed-intent'",
    )).rows[0]).toEqual({ status: 'cleaned', claimed_build_id: null })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('lets an idempotency reclaim fence cleanup before it can unclaim the replacement owner intent', async () => {
    const harness = await immutableVersionHarness()
    const objectKey = 'campaigns/reclaimed-build/versions/review.png'
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: harness.campaign.id,
      key: 'reclaimed-adoption', fingerprint: '9'.repeat(64), ownerToken: 'old-owner',
      now: new Date('2020-09-04T10:00:00Z'), leaseExpiresAt: new Date('2020-09-04T10:01:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO review_version_builds
         (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
          version_id, version_number, expected_revision, plan)
       VALUES ('reclaimed-build', $1, $2, 'reclaimed-adoption', $3, 'old-owner',
               'reclaimed-version', 1, 2, '{}')`,
      [harness.campaign.id, harness.actor.id, '9'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createVersionRepository(client).adoptBuildObjects({
      buildId: 'reclaimed-build', ownerToken: 'old-owner', campaignId: harness.campaign.id,
      objectKeys: [objectKey], orphanIds: ['reclaimed-intent'], adoptedAt: new Date('2020-09-04T10:00:00Z'),
    }))
    const reclaim = await harness.pool.connect()
    await reclaim.query('BEGIN')
    await reclaim.query(
      `SELECT key FROM idempotency_records
       WHERE actor_id = $1 AND method = 'POST' AND resource_id = $2 AND key = 'reclaimed-adoption'
       FOR UPDATE`,
      [harness.actor.id, harness.campaign.id],
    )
    const deleted = []
    const cleanup = createGenerationControlPlane({ pool: harness.pool }).cleanupOrphanUpload({
      orphanId: 'reclaimed-intent',
      deleteObject: async ({ objectKey: key }) => { deleted.push(key) },
      cleanedAt: new Date(),
    })
    await reclaim.query(
      `UPDATE idempotency_records
       SET owner_token = 'replacement-owner', lease_expires_at = '2099-09-04T10:00:00Z'
       WHERE actor_id = $1 AND method = 'POST' AND resource_id = $2 AND key = 'reclaimed-adoption'`,
      [harness.actor.id, harness.campaign.id],
    )
    await reclaim.query("UPDATE review_version_builds SET owner_token = 'replacement-owner' WHERE id = 'reclaimed-build'")
    await reclaim.query('COMMIT')
    reclaim.release()

    await expect(cleanup).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(deleted).toEqual([])
    expect((await harness.pool.query(
      "SELECT claimed_build_id FROM orphaned_uploads WHERE id = 'reclaimed-intent'",
    )).rows[0]).toEqual({ claimed_build_id: 'reclaimed-build' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('restarts after a delivery build identity changes between observation and canonical locks', async () => {
    const harness = await approvedDeliveryHarness()
    const versionId = harness.created.body.version.id
    const objectKey = 'campaigns/delivery-drift/versions/package.zip'
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: versionId,
      key: 'delivery-drift-old', fingerprint: '3'.repeat(64), ownerToken: 'delivery-drift-old-owner',
      now: new Date('2020-09-04T10:00:00Z'), leaseExpiresAt: new Date('2020-09-04T10:01:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO delivery_builds
         (id, campaign_id, version_id, actor_id, idempotency_key, request_fingerprint, owner_token, plan)
       VALUES ('delivery-drift-build', $1, $2, $3, 'delivery-drift-old', $4,
               'delivery-drift-old-owner', '{}')`,
      [harness.campaign.id, versionId, harness.actor.id, '3'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createDeliveryRepository(client).adoptBuildObject({
      buildId: 'delivery-drift-build', ownerToken: 'delivery-drift-old-owner', campaignId: harness.campaign.id,
      objectKey, orphanId: 'delivery-drift-orphan', adoptedAt: new Date('2020-09-04T10:00:00Z'),
    }))
    const observed = deferred()
    const resume = deferred()
    let paused = false
    let observations = 0
    const hookedTransaction = (pool, operation, options) => withDeadlineTransaction(pool, async (client, deadline) => {
      const proxy = {
        query: async (text, values) => {
          const result = await client.query(text, values)
          if (!paused && String(text).includes('FROM orphaned_uploads o')) {
            observations += 1
            paused = true
            observed.resolve()
            await resume.promise
          } else if (String(text).includes('FROM orphaned_uploads o')) {
            observations += 1
          }
          return result
        },
      }
      return operation(proxy, deadline)
    }, options ?? { timeoutMs: 2_000 })
    const deleted = []
    const cleanup = createGenerationControlPlane({
      pool: harness.pool, transaction: hookedTransaction, recoveryTransaction: hookedTransaction,
      recoveryTimeoutMs: 1_000,
    }).cleanupOrphanUpload({
      orphanId: 'delivery-drift-orphan', deleteObject: async ({ objectKey: key }) => deleted.push(key),
      cleanedAt: new Date(),
    })
    await observed.promise
    await withTransaction(harness.pool, async (client) => {
      await createIdempotencyRepository(client).claim({
        actorId: harness.designer.id, method: 'POST', resourceId: versionId,
        key: 'delivery-drift-new', fingerprint: '4'.repeat(64), ownerToken: 'delivery-drift-new-owner',
        now: new Date(), leaseExpiresAt: new Date('2099-09-04T10:00:00Z'),
      })
      await createDeliveryRepository(client).takeOverBuild({
        id: 'delivery-drift-build', actorId: harness.designer.id, key: 'delivery-drift-new',
        fingerprint: '4'.repeat(64), ownerToken: 'delivery-drift-new-owner',
      })
    })
    resume.resolve()

    await expect(cleanup).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(deleted).toEqual([])
    expect(observations).toBeGreaterThan(1)
    expect((await harness.pool.query(
      "SELECT state, actor_id, idempotency_key, request_fingerprint, owner_token FROM delivery_builds WHERE id = 'delivery-drift-build'",
    )).rows[0]).toEqual({
      state: 'in_progress', actor_id: harness.designer.id, idempotency_key: 'delivery-drift-new',
      request_fingerprint: '4'.repeat(64), owner_token: 'delivery-drift-new-owner',
    })
    expect((await harness.pool.query(
      "SELECT status, claimed_delivery_build_id FROM orphaned_uploads WHERE id = 'delivery-drift-orphan'",
    )).rows[0]).toEqual({ status: 'pending', claimed_delivery_build_id: 'delivery-drift-build' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('bounds repeated delivery identity churn and never deletes the newest owner intent', async () => {
    const harness = await approvedDeliveryHarness()
    const versionId = harness.created.body.version.id
    const objectKey = 'campaigns/delivery-churn/versions/package.zip'
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: versionId,
      key: 'delivery-churn-0', fingerprint: '6'.repeat(64), ownerToken: 'delivery-churn-owner-0',
      now: new Date('2020-09-04T10:00:00Z'), leaseExpiresAt: new Date('2020-09-04T10:01:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO delivery_builds
         (id, campaign_id, version_id, actor_id, idempotency_key, request_fingerprint, owner_token, plan)
       VALUES ('delivery-churn-build', $1, $2, $3, 'delivery-churn-0', $4,
               'delivery-churn-owner-0', '{}')`,
      [harness.campaign.id, versionId, harness.actor.id, '6'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createDeliveryRepository(client).adoptBuildObject({
      buildId: 'delivery-churn-build', ownerToken: 'delivery-churn-owner-0', campaignId: harness.campaign.id,
      objectKey, orphanId: 'delivery-churn-orphan', adoptedAt: new Date(),
    }))
    let churns = 0
    const hookedTransaction = (pool, operation, options) => withDeadlineTransaction(pool, async (client, deadline) => {
      const proxy = {
        query: async (text, values) => {
          const result = await client.query(text, values)
          if (String(text).includes('FROM orphaned_uploads o')) {
            churns += 1
            const key = `delivery-churn-${churns}`
            const fingerprint = String(6 + churns).repeat(64)
            const ownerToken = `delivery-churn-owner-${churns}`
            await withTransaction(harness.pool, async (replacement) => {
              await createIdempotencyRepository(replacement).claim({
                actorId: harness.actor.id, method: 'POST', resourceId: versionId,
                key, fingerprint, ownerToken, now: new Date(),
                leaseExpiresAt: new Date('2099-09-04T10:00:00Z'),
              })
              await createDeliveryRepository(replacement).takeOverBuild({
                id: 'delivery-churn-build', actorId: harness.actor.id, key, fingerprint, ownerToken,
              })
            })
          }
          return result
        },
      }
      return operation(proxy, deadline)
    }, options ?? { timeoutMs: 2_000 })
    const deleteObject = vi.fn()
    const control = createGenerationControlPlane({
      pool: harness.pool, transaction: hookedTransaction, recoveryTransaction: hookedTransaction,
      recoveryTimeoutMs: 1_000,
    })
    const observed = await observeSettlementWithin(control.cleanupOrphanUpload({
      orphanId: 'delivery-churn-orphan', deleteObject, cleanedAt: new Date(),
    }), 1_500).observed

    expect(observed).toEqual({ kind: 'fulfilled', value: { kind: 'claimed', objectKey } })
    expect(churns).toBeGreaterThan(1)
    expect(churns).toBeLessThan(10)
    expect(deleteObject).not.toHaveBeenCalled()
    expect((await harness.pool.query(
      "SELECT state, owner_token FROM delivery_builds WHERE id = 'delivery-churn-build'",
    )).rows[0]).toEqual({ state: 'in_progress', owner_token: `delivery-churn-owner-${churns}` })
    expect((await harness.pool.query(
      "SELECT status, claimed_delivery_build_id FROM orphaned_uploads WHERE id = 'delivery-churn-orphan'",
    )).rows[0]).toEqual({ status: 'pending', claimed_delivery_build_id: 'delivery-churn-build' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('never fences a replacement version owner after observing the prior owner identity', async () => {
    const harness = await immutableVersionHarness()
    const objectKey = 'campaigns/version-owner-drift/versions/review.png'
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: harness.campaign.id,
      key: 'version-owner-drift', fingerprint: '5'.repeat(64), ownerToken: 'version-owner-old',
      now: new Date('2020-09-04T10:00:00Z'), leaseExpiresAt: new Date('2020-09-04T10:01:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO review_version_builds
         (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
          version_id, version_number, expected_revision, plan)
       VALUES ('version-owner-drift-build', $1, $2, 'version-owner-drift', $3,
               'version-owner-old', 'version-owner-drift-version', 1, 2, '{}')`,
      [harness.campaign.id, harness.actor.id, '5'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createVersionRepository(client).adoptBuildObjects({
      buildId: 'version-owner-drift-build', ownerToken: 'version-owner-old', campaignId: harness.campaign.id,
      objectKeys: [objectKey], orphanIds: ['version-owner-drift-orphan'], adoptedAt: new Date(),
    }))
    const observed = deferred()
    const resume = deferred()
    let paused = false
    const hookedTransaction = (pool, operation, options) => withDeadlineTransaction(pool, async (client, deadline) => {
      const proxy = {
        query: async (text, values) => {
          const result = await client.query(text, values)
          if (!paused && String(text).includes('FROM orphaned_uploads o')) {
            paused = true
            observed.resolve()
            await resume.promise
          }
          return result
        },
      }
      return operation(proxy, deadline)
    }, options ?? { timeoutMs: 2_000 })
    const deleteObject = vi.fn()
    const cleanup = createGenerationControlPlane({
      pool: harness.pool, transaction: hookedTransaction, recoveryTransaction: hookedTransaction,
      recoveryTimeoutMs: 1_000,
    }).cleanupOrphanUpload({ orphanId: 'version-owner-drift-orphan', deleteObject, cleanedAt: new Date() })
    await observed.promise
    await harness.pool.query(
      "UPDATE review_version_builds SET owner_token = 'version-owner-new' WHERE id = 'version-owner-drift-build'",
    )
    resume.resolve()

    await expect(cleanup).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(deleteObject).not.toHaveBeenCalled()
    expect((await harness.pool.query(
      "SELECT state, owner_token FROM review_version_builds WHERE id = 'version-owner-drift-build'",
    )).rows[0]).toEqual({ state: 'in_progress', owner_token: 'version-owner-new' })
    expect((await harness.pool.query(
      "SELECT status, claimed_build_id FROM orphaned_uploads WHERE id = 'version-owner-drift-orphan'",
    )).rows[0]).toEqual({ status: 'pending', claimed_build_id: 'version-owner-drift-build' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('keeps a completed version intent tracked when its immutable asset reference is unexpectedly absent', async () => {
    const harness = await immutableVersionHarness()
    const objectKey = 'campaigns/completed-build/versions/review.png'
    const idempotency = createIdempotencyRepository(harness.pool)
    await idempotency.claim({
      actorId: harness.actor.id, method: 'POST', resourceId: harness.campaign.id,
      key: 'completed-adoption', fingerprint: '8'.repeat(64), ownerToken: 'completed-owner',
      now: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000),
    })
    await harness.pool.query(
      `INSERT INTO review_version_builds
         (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
          version_id, version_number, expected_revision, plan)
       VALUES ('completed-build', $1, $2, 'completed-adoption', $3, 'completed-owner',
               'completed-version', 1, 2, '{}')`,
      [harness.campaign.id, harness.actor.id, '8'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createVersionRepository(client).adoptBuildObjects({
      buildId: 'completed-build', ownerToken: 'completed-owner', campaignId: harness.campaign.id,
      objectKeys: [objectKey], orphanIds: ['completed-intent'], adoptedAt: new Date(),
    }))
    await harness.pool.query(
      "UPDATE review_version_builds SET state = 'completed', completed_at = now() WHERE id = 'completed-build'",
    )
    await idempotency.complete({
      actorId: harness.actor.id, method: 'POST', resourceId: harness.campaign.id,
      key: 'completed-adoption', ownerToken: 'completed-owner', responseStatus: 201, responseBody: { persisted: true },
    })
    const deleted = []
    await expect(createGenerationControlPlane({ pool: harness.pool }).cleanupOrphanUpload({
      orphanId: 'completed-intent', deleteObject: async ({ objectKey: key }) => deleted.push(key), cleanedAt: new Date(),
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(deleted).toEqual([])
    expect((await harness.pool.query(
      "SELECT status, claimed_build_id FROM orphaned_uploads WHERE id = 'completed-intent'",
    )).rows[0]).toEqual({ status: 'pending', claimed_build_id: 'completed-build' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('refuses cleanup while a delivery build owns an unexpired lease', async () => {
    const harness = await approvedDeliveryHarness()
    const versionId = harness.created.body.version.id
    const objectKey = 'campaigns/delivery-claim/versions/package.zip'
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: versionId,
      key: 'active-delivery-claim', fingerprint: 'd'.repeat(64), ownerToken: 'active-delivery-owner',
      now: new Date(), leaseExpiresAt: new Date('2099-09-04T10:00:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO delivery_builds
         (id, campaign_id, version_id, actor_id, idempotency_key, request_fingerprint, owner_token, plan)
       VALUES ('active-delivery-build', $1, $2, $3, 'active-delivery-claim', $4, 'active-delivery-owner', '{}')`,
      [harness.campaign.id, versionId, harness.actor.id, 'd'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createDeliveryRepository(client).adoptBuildObject({
      buildId: 'active-delivery-build', ownerToken: 'active-delivery-owner', campaignId: harness.campaign.id,
      objectKey, orphanId: 'active-delivery-orphan', adoptedAt: new Date(),
    }))
    const deleteObject = vi.fn()

    await expect(createGenerationControlPlane({ pool: harness.pool }).cleanupOrphanUpload({
      orphanId: 'active-delivery-orphan', deleteObject, cleanedAt: new Date(),
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(deleteObject).not.toHaveBeenCalled()
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('fences an expired delivery owner before cleanup so its late finalize cannot commit', async () => {
    const harness = await approvedDeliveryHarness()
    const versionId = harness.created.body.version.id
    const objectKey = 'campaigns/expired-delivery-claim/versions/package.zip'
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: versionId,
      key: 'expired-delivery-claim', fingerprint: 'e'.repeat(64), ownerToken: 'expired-delivery-owner',
      now: new Date('2020-09-04T10:00:00Z'), leaseExpiresAt: new Date('2020-09-04T10:01:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO delivery_builds
         (id, campaign_id, version_id, actor_id, idempotency_key, request_fingerprint, owner_token, plan)
       VALUES ('expired-delivery-build', $1, $2, $3, 'expired-delivery-claim', $4, 'expired-delivery-owner', '{}')`,
      [harness.campaign.id, versionId, harness.actor.id, 'e'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createDeliveryRepository(client).adoptBuildObject({
      buildId: 'expired-delivery-build', ownerToken: 'expired-delivery-owner', campaignId: harness.campaign.id,
      objectKey, orphanId: 'expired-delivery-orphan', adoptedAt: new Date('2020-09-04T10:00:00Z'),
    }))
    await harness.pool.query(
      `UPDATE orphaned_uploads SET object_generation = 'verified-test-generation'
       WHERE id = 'expired-delivery-orphan'`,
    )
    const deleteObject = vi.fn(async () => ({ deleted: true }))

    await expect(createGenerationControlPlane({ pool: harness.pool }).cleanupOrphanUpload({
      orphanId: 'expired-delivery-orphan', deleteObject, cleanedAt: new Date(),
    })).resolves.toEqual({ kind: 'cleaned', objectKey })
    expect(deleteObject).toHaveBeenCalledOnce()
    expect((await harness.pool.query(
      "SELECT state FROM idempotency_records WHERE resource_id = $1 AND key = 'expired-delivery-claim'", [versionId],
    )).rows[0]).toEqual({ state: 'failed' })
    expect((await harness.pool.query(
      "SELECT state FROM delivery_builds WHERE id = 'expired-delivery-build'",
    )).rows[0]).toEqual({ state: 'failed' })
    expect((await harness.pool.query(
      `UPDATE delivery_builds SET state = 'completed', completed_at = now()
       WHERE id = 'expired-delivery-build' AND state = 'in_progress' AND owner_token = 'expired-delivery-owner'
       RETURNING id`,
    )).rowCount).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('commits a generation-bound cleanup fence before a delayed delete and blocks replacement ownership', async () => {
    const harness = await approvedDeliveryHarness()
    const store = createMemoryAssetStore()
    const versionId = harness.created.body.version.id
    const objectKey = 'campaigns/durable-cleanup/versions/package.zip'
    const stored = await store.put({ objectKey, bytes: Buffer.from('old package'), contentType: 'application/zip' })
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: versionId,
      key: 'durable-cleanup-key', fingerprint: 'a'.repeat(64), ownerToken: 'expired-owner',
      now: new Date('2020-09-04T10:00:00Z'), leaseExpiresAt: new Date('2020-09-04T10:01:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO delivery_builds
         (id, campaign_id, version_id, actor_id, idempotency_key, request_fingerprint, owner_token, plan)
       VALUES ('durable-cleanup-build', $1, $2, $3, 'durable-cleanup-key', $4, 'expired-owner', $5)`,
      [harness.campaign.id, versionId, harness.actor.id, 'a'.repeat(64), { objectKey }],
    )
    await withTransaction(harness.pool, (client) => createDeliveryRepository(client).adoptBuildObject({
      buildId: 'durable-cleanup-build', ownerToken: 'expired-owner', campaignId: harness.campaign.id,
      objectKey, orphanId: 'durable-cleanup-orphan', adoptedAt: new Date('2020-09-04T10:00:00Z'),
    }))
    await harness.pool.query(
      `UPDATE orphaned_uploads SET object_generation = $2, object_etag = $3 WHERE id = $1`,
      ['durable-cleanup-orphan', stored.generation, stored.etag],
    )

    const releaseDelete = deferred()
    const deleteStarted = deferred()
    const cleanup = createGenerationControlPlane({ pool: harness.pool, recoveryTimeoutMs: 100 }).cleanupOrphanUpload({
      orphanId: 'durable-cleanup-orphan',
      deleteObject: async (input) => {
        deleteStarted.resolve(input)
        await releaseDelete.promise
        return store.delete(input)
      },
      cleanedAt: new Date('2026-09-04T10:01:00Z'),
    })
    const deleteInput = await deleteStarted.promise
    expect(deleteInput).toMatchObject({ objectKey, generation: stored.generation })
    expect((await harness.pool.query(
      `SELECT status, cleanup_token IS NOT NULL AS has_token,
              claimed_delivery_build_id, object_generation
       FROM orphaned_uploads WHERE id = 'durable-cleanup-orphan'`,
    )).rows[0]).toEqual({
      status: 'cleaning', has_token: true, claimed_delivery_build_id: null,
      object_generation: stored.generation,
    })
    expect((await harness.pool.query(
      `SELECT state FROM idempotency_records WHERE resource_id = $1 AND key = 'durable-cleanup-key'`, [versionId],
    )).rows[0]).toEqual({ state: 'failed' })
    expect((await harness.pool.query(
      `SELECT state FROM delivery_builds WHERE id = 'durable-cleanup-build'`,
    )).rows[0]).toEqual({ state: 'failed' })

    const replacement = await withTransaction(harness.pool, (client) => createDeliveryRepository(client).takeOverBuild({
      id: 'durable-cleanup-build', actorId: harness.actor.id, key: 'replacement-key',
      fingerprint: 'b'.repeat(64), ownerToken: 'replacement-owner',
    }))
    expect(replacement).toBeFalsy()
    await expect(harness.pool.query(
      `UPDATE delivery_builds
       SET state = 'in_progress', actor_id = $1, idempotency_key = 'direct-replacement',
           request_fingerprint = $2, owner_token = 'direct-replacement-owner'
       WHERE id = 'durable-cleanup-build'`,
      [harness.actor.id, 'c'.repeat(64)],
    )).rejects.toMatchObject({ code: '55000' })
    releaseDelete.resolve()
    await expect(cleanup).resolves.toEqual({ kind: 'cleaned', objectKey })
    expect(await store.get({ objectKey })).toBeNull()
    await harness.pool.end()
    pools.delete(harness.pool)
  }, 10_000)

  test('keeps an unknown delete durably fenced, then reclaims and confirms not-found', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const store = createMemoryAssetStore()
    const objectKey = 'campaigns/unknown-delete/package.zip'
    const stored = await store.put({ objectKey, bytes: Buffer.from('package'), contentType: 'application/zip' })
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, object_generation, object_etag)
       VALUES ('unknown-delete-orphan', $1, $2, 'test_cleanup', $3, $4)`,
      [objectKey, campaign.id, stored.generation, stored.etag],
    )
    const control = createGenerationControlPlane({ pool, cleanupLeaseMs: 20 })
    await expect(control.cleanupOrphanUpload({
      orphanId: 'unknown-delete-orphan',
      deleteObject: async (input) => {
        await store.delete(input)
        throw Object.assign(new Error('delete outcome unknown'), { code: 'storage_timeout' })
      },
    })).rejects.toMatchObject({ code: 'storage_timeout' })
    expect((await pool.query(
      `SELECT status, attempts, cleanup_token IS NOT NULL AS fenced, last_error
       FROM orphaned_uploads WHERE id = 'unknown-delete-orphan'`,
    )).rows[0]).toEqual({ status: 'cleaning', attempts: 1, fenced: true, last_error: 'storage_timeout' })

    const deleteWhileLeased = vi.fn()
    await expect(control.cleanupOrphanUpload({
      orphanId: 'unknown-delete-orphan', deleteObject: deleteWhileLeased,
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(deleteWhileLeased).not.toHaveBeenCalled()
    await pool.query(
      `UPDATE orphaned_uploads SET cleanup_lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = 'unknown-delete-orphan'`,
    )
    await expect(control.cleanupOrphanUpload({
      orphanId: 'unknown-delete-orphan', deleteObject: (input) => store.delete(input),
    })).resolves.toEqual({ kind: 'cleaned', objectKey })
    expect((await pool.query(
      `SELECT status, attempts, cleanup_token, cleanup_lease_expires_at
       FROM orphaned_uploads WHERE id = 'unknown-delete-orphan'`,
    )).rows[0]).toEqual({ status: 'cleaned', attempts: 2, cleanup_token: null, cleanup_lease_expires_at: null })
    const deleteAfterCleaned = vi.fn()
    await expect(control.cleanupOrphanUpload({
      orphanId: 'unknown-delete-orphan', deleteObject: deleteAfterCleaned,
    })).resolves.toEqual({ kind: 'missing' })
    expect(deleteAfterCleaned).not.toHaveBeenCalled()
    await pool.end()
    pools.delete(pool)
  })

  test('bounds a never-settling Phase-B delete and observes a late rejection without mutating its fence', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const objectKey = 'campaigns/bounded-delete/package.zip'
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, object_generation)
       VALUES ('bounded-delete-orphan', $1, $2, 'test_cleanup', 'generation-1')`,
      [objectKey, campaign.id],
    )
    const delayed = deferred()
    const unhandled = []
    const onUnhandled = (error) => unhandled.push(error)
    process.on('unhandledRejection', onUnhandled)
    try {
      const control = createGenerationControlPlane({
        pool, cleanupDeleteTimeoutMs: 20, cleanupLeaseMs: 100,
      })
      const first = await observeSettlementWithin(control.cleanupOrphanUpload({
        orphanId: 'bounded-delete-orphan', deleteObject: () => delayed.promise,
      }), 100).observed
      expect(first).toEqual({ kind: 'fulfilled', value: { kind: 'claimed', objectKey } })
      const fenced = (await pool.query(
        `SELECT status, cleanup_token, cleanup_lease_expires_at FROM orphaned_uploads
         WHERE id = 'bounded-delete-orphan'`,
      )).rows[0]
      expect(fenced.status).toBe('cleaning')
      expect(fenced.cleanup_token).toEqual(expect.any(String))

      delayed.reject(new Error('late provider rejection'))
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(unhandled).toEqual([])
      expect((await pool.query(
        `SELECT status, cleanup_token FROM orphaned_uploads WHERE id = 'bounded-delete-orphan'`,
      )).rows[0]).toEqual({ status: 'cleaning', cleanup_token: fenced.cleanup_token })

      await pool.query(
        `UPDATE orphaned_uploads SET cleanup_lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE id = 'bounded-delete-orphan'`,
      )
      const delayedResolve = deferred()
      const second = await observeSettlementWithin(control.cleanupOrphanUpload({
        orphanId: 'bounded-delete-orphan', deleteObject: () => delayedResolve.promise,
      }), 100).observed
      expect(second).toEqual({ kind: 'fulfilled', value: { kind: 'claimed', objectKey } })
      const reclaimed = (await pool.query(
        `SELECT status, cleanup_token, cleanup_token <> $2 AS replaced FROM orphaned_uploads WHERE id = $1`,
        ['bounded-delete-orphan', fenced.cleanup_token],
      )).rows[0]
      expect(reclaimed).toMatchObject({ status: 'cleaning', replaced: true })
      delayedResolve.resolve({ deleted: true })
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect((await pool.query(
        `SELECT status, cleanup_token FROM orphaned_uploads WHERE id = 'bounded-delete-orphan'`,
      )).rows[0]).toEqual({ status: 'cleaning', cleanup_token: reclaimed.cleanup_token })

      await pool.query(
        `UPDATE orphaned_uploads SET cleanup_lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE id = 'bounded-delete-orphan'`,
      )
      await expect(control.cleanupOrphanUpload({
        orphanId: 'bounded-delete-orphan', deleteObject: async () => ({ deleted: false }),
      })).resolves.toEqual({ kind: 'cleaned', objectKey })
    } finally {
      process.removeListener('unhandledRejection', onUnhandled)
      await pool.end()
      pools.delete(pool)
    }
  })

  test('serializes direct asset inserts with cleanup in both lock orderings', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const insertFirstKey = 'campaigns/insert-first/review.png'
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, object_generation)
       VALUES ('insert-first-orphan', $1, $2, 'test_cleanup', 'generation-1')`,
      [insertFirstKey, campaign.id],
    )
    const inserter = await pool.connect()
    await inserter.query('BEGIN')
    await inserter.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source)
       VALUES ('insert-first-asset', $1, 'direction', $2, 'image/png', 1, 1, 1, $3, 'upload')`,
      [campaign.id, insertFirstKey, 'a'.repeat(64)],
    )
    const insertFirstDelete = vi.fn(async () => ({ deleted: true }))
    const insertFirstCleanup = createGenerationControlPlane({ pool }).cleanupOrphanUpload({
      orphanId: 'insert-first-orphan', deleteObject: insertFirstDelete,
    })
    expect(await observeSettlementWithin(insertFirstCleanup, 50).observed).toEqual({ kind: 'deadline_ignored' })
    await inserter.query('COMMIT')
    inserter.release()
    await expect(insertFirstCleanup).resolves.toEqual({ kind: 'referenced', objectKey: insertFirstKey })
    expect(insertFirstDelete).not.toHaveBeenCalled()

    const cleanupFirstKey = 'campaigns/cleanup-first/review.png'
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, object_generation)
       VALUES ('cleanup-first-orphan', $1, $2, 'test_cleanup', 'generation-2')`,
      [cleanupFirstKey, campaign.id],
    )
    const releaseDelete = deferred()
    const deleteStarted = deferred()
    const cleanupFirst = createGenerationControlPlane({ pool }).cleanupOrphanUpload({
      orphanId: 'cleanup-first-orphan',
      deleteObject: async () => { deleteStarted.resolve(); await releaseDelete.promise; return { deleted: true } },
    })
    await deleteStarted.promise
    await expect(pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source)
       VALUES ('cleanup-first-asset', $1, 'direction', $2, 'image/png', 1, 1, 1, $3, 'upload')`,
      [campaign.id, cleanupFirstKey, 'b'.repeat(64)],
    )).rejects.toMatchObject({ code: '55000' })
    await pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source)
       VALUES ('cleanup-update-asset', $1, 'direction', 'campaigns/cleanup-other/review.png',
               'image/png', 1, 1, 1, $2, 'upload')`,
      [campaign.id, 'c'.repeat(64)],
    )
    await expect(pool.query(
      `UPDATE assets SET object_key = $1 WHERE id = 'cleanup-update-asset'`,
      [cleanupFirstKey],
    )).rejects.toMatchObject({ code: '55000' })
    expect((await pool.query(
      `SELECT object_key FROM assets WHERE id = 'cleanup-update-asset'`,
    )).rows[0].object_key).toBe('campaigns/cleanup-other/review.png')
    releaseDelete.resolve()
    await expect(cleanupFirst).resolves.toEqual({ kind: 'cleaned', objectKey: cleanupFirstKey })
    await pool.end()
    pools.delete(pool)
  })

  test('never deletes a replacement generation and refuses unverifiable legacy orphan cleanup', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const store = createMemoryAssetStore()
    const objectKey = 'campaigns/generation-change/package.zip'
    const original = await store.put({ objectKey, bytes: Buffer.from('old'), contentType: 'application/zip' })
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, object_generation, object_etag)
       VALUES ('generation-change-orphan', $1, $2, 'test_cleanup', $3, $4),
              ('legacy-unverified-orphan', 'campaigns/legacy/package.zip', $2, 'legacy_cleanup', NULL, NULL)`,
      [objectKey, campaign.id, original.generation, original.etag],
    )
    await store.delete({ objectKey, generation: original.generation })
    const replacement = await store.put({ objectKey, bytes: Buffer.from('new'), contentType: 'application/zip' })
    const control = createGenerationControlPlane({ pool })

    await expect(control.cleanupOrphanUpload({
      orphanId: 'generation-change-orphan', deleteObject: (input) => store.delete(input),
    })).rejects.toMatchObject({ code: 'object_generation_mismatch' })
    expect(await store.get({ objectKey })).toEqual(Buffer.from('new'))
    expect(replacement.generation).not.toBe(original.generation)
    const legacyDelete = vi.fn()
    await expect(control.cleanupOrphanUpload({
      orphanId: 'legacy-unverified-orphan', deleteObject: legacyDelete,
    })).resolves.toEqual({ kind: 'claimed', objectKey: 'campaigns/legacy/package.zip' })
    expect(legacyDelete).not.toHaveBeenCalled()
    await pool.end()
    pools.delete(pool)
  })

  test('reconciles an uploaded object from durable intent when identity binding was interrupted', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const store = createMemoryAssetStore()
    const objectKey = 'campaigns/interrupted-bind/package.zip'
    const bytes = Buffer.from('uploaded before the binding transaction outcome was known')
    const identity = await store.put({ objectKey, bytes, contentType: 'application/zip' })
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, expected_sha256, expected_byte_size, expected_mime_type)
       VALUES ('interrupted-bind-orphan', $1, $2, 'delivery_failed', $3, $4, 'application/zip')`,
      [objectKey, campaign.id, identity.sha256, identity.byteSize],
    )
    const control = createGenerationControlPlane({ pool })

    await expect(control.cleanupOrphanUpload({
      orphanId: 'interrupted-bind-orphan',
      getObjectMetadata: (input) => store.getMetadata(input),
      deleteObject: (input) => store.delete(input),
    })).resolves.toEqual({ kind: 'cleaned', objectKey })
    expect(await store.getMetadata({ objectKey })).toBeNull()
    expect((await pool.query(
      `SELECT status, object_generation, object_etag FROM orphaned_uploads
       WHERE id = 'interrupted-bind-orphan'`,
    )).rows[0]).toEqual({ status: 'cleaned', object_generation: identity.generation, object_etag: identity.etag })

    const changedKey = 'campaigns/interrupted-bind/changed.zip'
    const changed = await store.put({ objectKey: changedKey, bytes: Buffer.from('changed'), contentType: 'application/zip' })
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, expected_sha256, expected_byte_size, expected_mime_type)
       VALUES ('interrupted-bind-changed', $1, $2, 'delivery_failed', $3, $4, 'application/zip')`,
      [changedKey, campaign.id, 'f'.repeat(64), changed.byteSize],
    )
    const deleteChanged = vi.fn((input) => store.delete(input))
    await expect(control.cleanupOrphanUpload({
      orphanId: 'interrupted-bind-changed',
      getObjectMetadata: (input) => store.getMetadata(input),
      deleteObject: deleteChanged,
    })).resolves.toEqual({ kind: 'claimed', objectKey: changedKey })
    expect(deleteChanged).not.toHaveBeenCalled()
    expect(await store.getMetadata({ objectKey: changedKey })).toEqual(changed)
    await pool.end()
    pools.delete(pool)
  })

  test('keeps a null-generation upload durably fenced until a late object can be generation-deleted', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const store = createMemoryAssetStore()
    const objectKey = 'campaigns/late-create/package.zip'
    const bytes = Buffer.from('an upload whose provider outcome was initially unknown')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, expected_sha256, expected_byte_size, expected_mime_type)
       VALUES ('late-create-orphan', $1, $2, 'delivery_failed', $3, $4, 'application/zip')`,
      [objectKey, campaign.id, sha256, bytes.length],
    )
    const getObjectMetadata = vi.fn(async (input) => {
      const metadata = await store.getMetadata(input)
      return metadata && { ...metadata, sha256: null }
    })
    const createObjectReadStream = vi.fn((input) => store.createReadStream(input))
    const deleteObject = vi.fn((input) => store.delete(input))
    const control = createGenerationControlPlane({
      pool, cleanupLeaseMs: 100, cleanupDeleteTimeoutMs: 20,
    })

    await expect(control.cleanupOrphanUpload({
      orphanId: 'late-create-orphan', getObjectMetadata, createObjectReadStream, deleteObject,
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    const firstFence = (await pool.query(
      `SELECT status, object_generation, cleanup_token FROM orphaned_uploads
       WHERE id = 'late-create-orphan'`,
    )).rows[0]
    expect(firstFence).toMatchObject({ status: 'cleaning', object_generation: null, cleanup_token: expect.any(String) })
    expect(deleteObject).not.toHaveBeenCalled()

    await expect(control.cleanupOrphanUpload({
      orphanId: 'late-create-orphan', getObjectMetadata, createObjectReadStream, deleteObject,
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(getObjectMetadata).toHaveBeenCalledTimes(1)
    expect(deleteObject).not.toHaveBeenCalled()
    expect((await pool.query(
      `SELECT status, cleanup_token FROM orphaned_uploads WHERE id = 'late-create-orphan'`,
    )).rows[0]).toEqual({ status: 'cleaning', cleanup_token: firstFence.cleanup_token })

    await createVersionRepository(pool).createBuild({
      id: 'late-create-takeover-build', campaignId: campaign.id, actorId,
      key: 'late-create-takeover-key', fingerprint: '9'.repeat(64), ownerToken: 'replacement-owner',
      versionId: 'late-create-version', versionNumber: 1, expectedRevision: 0, plan: {},
    })
    await expect(withTransaction(pool, (client) => createVersionRepository(client).adoptBuildObjects({
      buildId: 'late-create-takeover-build', ownerToken: 'replacement-owner', campaignId: campaign.id,
      objectKeys: [objectKey], orphanIds: ['late-create-takeover-orphan'], adoptedAt: new Date(),
    }))).resolves.toBe(false)

    await pool.query(
      `UPDATE orphaned_uploads SET cleanup_lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = 'late-create-orphan'`,
    )
    await expect(control.cleanupOrphanUpload({
      orphanId: 'late-create-orphan', getObjectMetadata: () => new Promise(() => {}), deleteObject,
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    const timeoutFence = (await pool.query(
      `SELECT status, object_generation, cleanup_token FROM orphaned_uploads
       WHERE id = 'late-create-orphan'`,
    )).rows[0]
    expect(timeoutFence).toMatchObject({ status: 'cleaning', object_generation: null, cleanup_token: expect.any(String) })
    expect(timeoutFence.cleanup_token).not.toBe(firstFence.cleanup_token)
    expect(deleteObject).not.toHaveBeenCalled()

    const lateIdentity = await store.put({ objectKey, bytes, contentType: 'application/zip' })
    await pool.query(
      `UPDATE orphaned_uploads SET cleanup_lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = 'late-create-orphan'`,
    )
    const stalledReadStartedAt = Date.now()
    await expect(control.cleanupOrphanUpload({
      orphanId: 'late-create-orphan', getObjectMetadata,
      createObjectReadStream: () => new PassThrough(), deleteObject,
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(Date.now() - stalledReadStartedAt).toBeLessThan(150)
    expect(deleteObject).not.toHaveBeenCalled()
    expect((await pool.query(
      `SELECT status, object_generation FROM orphaned_uploads WHERE id = 'late-create-orphan'`,
    )).rows[0]).toEqual({ status: 'cleaning', object_generation: null })

    await pool.query(
      `UPDATE orphaned_uploads SET cleanup_lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = 'late-create-orphan'`,
    )
    await expect(control.cleanupOrphanUpload({
      orphanId: 'late-create-orphan', getObjectMetadata,
      createObjectReadStream: () => Readable.from([Buffer.alloc(bytes.length, 0x78)]), deleteObject,
    })).resolves.toEqual({ kind: 'claimed', objectKey })
    expect(deleteObject).not.toHaveBeenCalled()
    expect((await pool.query(
      `SELECT status, object_generation FROM orphaned_uploads WHERE id = 'late-create-orphan'`,
    )).rows[0]).toEqual({ status: 'cleaning', object_generation: null })

    await pool.query(
      `UPDATE orphaned_uploads SET cleanup_lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = 'late-create-orphan'`,
    )
    await expect(control.cleanupOrphanUpload({
      orphanId: 'late-create-orphan', getObjectMetadata, createObjectReadStream, deleteObject,
    })).resolves.toEqual({ kind: 'cleaned', objectKey })
    expect(createObjectReadStream).toHaveBeenCalledWith(expect.objectContaining({
      objectKey, generation: lateIdentity.generation, signal: expect.any(AbortSignal),
    }))
    expect(deleteObject).toHaveBeenCalledWith(expect.objectContaining({
      objectKey, generation: lateIdentity.generation,
    }))
    expect(await store.getMetadata({ objectKey })).toBeNull()
    expect((await pool.query(
      `SELECT status, object_generation FROM orphaned_uploads WHERE id = 'late-create-orphan'`,
    )).rows[0]).toEqual({ status: 'cleaned', object_generation: lateIdentity.generation })
    await pool.end()
    pools.delete(pool)
  })

  test('resets cleaned object identity before version and delivery builds re-adopt the deterministic key', async () => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const version = await insertVersion(pool, campaign.id, actorId, { id: 'cleaned-adoption-version' })
    const versionKey = 'campaigns/cleaned-adoption/review.png'
    const deliveryKey = 'campaigns/cleaned-adoption/package.zip'
    await createVersionRepository(pool).createBuild({
      id: 'cleaned-version-build', campaignId: campaign.id, actorId, key: 'cleaned-version-key',
      fingerprint: 'a'.repeat(64), ownerToken: 'current-version-owner', versionId: 'next-version',
      versionNumber: 2, expectedRevision: 0, plan: {},
    })
    await createDeliveryRepository(pool).createBuild({
      id: 'cleaned-delivery-build', campaignId: campaign.id, versionId: version.id, actorId,
      key: 'cleaned-delivery-key', fingerprint: 'b'.repeat(64), ownerToken: 'current-delivery-owner',
      plan: { objectKey: deliveryKey },
    })
    await pool.query(
      `INSERT INTO orphaned_uploads
         (id, object_key, campaign_id, reason, status, cleaned_at, object_generation, object_etag,
          expected_sha256, expected_byte_size, expected_mime_type)
       VALUES
         ('cleaned-version-orphan', $1, $3, 'old_cleanup', 'cleaned', now(), 'generation-2', 'etag-2',
          $4, 10, 'image/png'),
         ('cleaned-delivery-orphan', $2, $3, 'old_cleanup', 'cleaned', now(), 'generation-2', 'etag-2',
          $5, 20, 'application/zip')`,
      [versionKey, deliveryKey, campaign.id, 'c'.repeat(64), 'd'.repeat(64)],
    )

    await withTransaction(pool, async (client) => {
      expect(await createVersionRepository(client).failBuild({
        buildId: 'cleaned-version-build', ownerToken: 'current-version-owner', campaignId: campaign.id,
        objectKeys: [versionKey], orphanIds: ['failed-version-orphan'], reason: 'review_version_failed',
        failedAt: new Date(),
      })).toEqual({ owned: true })
    })
    await withTransaction(pool, async (client) => {
      expect(await createDeliveryRepository(client).failBuild({
        buildId: 'cleaned-delivery-build', ownerToken: 'current-delivery-owner', campaignId: campaign.id,
        objectKey: deliveryKey, orphanId: 'failed-delivery-orphan', reason: 'delivery_failed',
        failedAt: new Date(),
      })).toEqual({ owned: true })
    })
    expect((await pool.query(
      `SELECT object_key, status, object_generation, object_etag, expected_sha256
       FROM orphaned_uploads ORDER BY object_key`,
    )).rows).toEqual([
      {
        object_key: deliveryKey, status: 'cleaned', object_generation: 'generation-2',
        object_etag: 'etag-2', expected_sha256: 'd'.repeat(64),
      },
      {
        object_key: versionKey, status: 'cleaned', object_generation: 'generation-2',
        object_etag: 'etag-2', expected_sha256: 'c'.repeat(64),
      },
    ])
    expect(await createVersionRepository(pool).reactivateBuild({
      id: 'cleaned-version-build', ownerToken: 'current-version-owner',
    })).toMatchObject({ id: 'cleaned-version-build', state: 'in_progress' })
    expect(await createDeliveryRepository(pool).takeOverBuild({
      id: 'cleaned-delivery-build', actorId, key: 'cleaned-delivery-key',
      fingerprint: 'b'.repeat(64), ownerToken: 'current-delivery-owner',
    })).toMatchObject({ id: 'cleaned-delivery-build', state: 'in_progress' })

    await Promise.all([
      withTransaction(pool, (client) => createVersionRepository(client).adoptBuildObjects({
        buildId: 'cleaned-version-build', ownerToken: 'current-version-owner', campaignId: campaign.id,
        objectKeys: [versionKey], orphanIds: ['replacement-version-orphan'], adoptedAt: new Date(),
      })),
      withTransaction(pool, (client) => createDeliveryRepository(client).adoptBuildObject({
        buildId: 'cleaned-delivery-build', ownerToken: 'current-delivery-owner', campaignId: campaign.id,
        objectKey: deliveryKey, orphanId: 'replacement-delivery-orphan', adoptedAt: new Date(),
      })),
    ]).then((results) => expect(results).toEqual([true, true]))
    expect((await pool.query(
      `SELECT object_key, status, object_generation, object_etag, cleanup_token,
              cleanup_lease_expires_at, expected_sha256, expected_byte_size, expected_mime_type
       FROM orphaned_uploads ORDER BY object_key`,
    )).rows).toEqual([
      {
        object_key: deliveryKey, status: 'pending', object_generation: null, object_etag: null,
        cleanup_token: null, cleanup_lease_expires_at: null,
        expected_sha256: null, expected_byte_size: null, expected_mime_type: null,
      },
      {
        object_key: versionKey, status: 'pending', object_generation: null, object_etag: null,
        cleanup_token: null, cleanup_lease_expires_at: null,
        expected_sha256: null, expected_byte_size: null, expected_mime_type: null,
      },
    ])

    await withTransaction(pool, async (client) => {
      const repository = createVersionRepository(client)
      expect(await repository.recordBuildObjectIntent({
        buildId: 'cleaned-version-build', ownerToken: 'current-version-owner', objectKey: versionKey,
        sha256: 'e'.repeat(64), byteSize: 11, mimeType: 'image/png',
      })).toBe(true)
      expect(await repository.recordBuildObjectIdentity({
        buildId: 'cleaned-version-build', ownerToken: 'stale-version-owner', objectKey: versionKey,
        generation: 'generation-stale', etag: 'etag-stale', sha256: 'e'.repeat(64),
        byteSize: 11, mimeType: 'image/png',
      })).toBe(false)
      expect(await repository.recordBuildObjectIdentity({
        buildId: 'cleaned-version-build', ownerToken: 'current-version-owner', objectKey: versionKey,
        generation: 'generation-3', etag: 'etag-3', sha256: 'e'.repeat(64),
        byteSize: 11, mimeType: 'image/png',
      })).toBe(true)
    })
    await withTransaction(pool, async (client) => {
      const repository = createDeliveryRepository(client)
      expect(await repository.recordBuildObjectIntent({
        buildId: 'cleaned-delivery-build', ownerToken: 'current-delivery-owner', objectKey: deliveryKey,
        sha256: 'f'.repeat(64), byteSize: 21, mimeType: 'application/zip',
      })).toBe(true)
      expect(await repository.recordBuildObjectIdentity({
        buildId: 'cleaned-delivery-build', ownerToken: 'current-delivery-owner', objectKey: deliveryKey,
        generation: 'generation-3', etag: 'etag-3', sha256: 'f'.repeat(64),
        byteSize: 21, mimeType: 'application/zip',
      })).toBe(true)
    })
    expect((await pool.query(
      `SELECT object_key, object_generation, object_etag FROM orphaned_uploads ORDER BY object_key`,
    )).rows).toEqual([
      { object_key: deliveryKey, object_generation: 'generation-3', object_etag: 'etag-3' },
      { object_key: versionKey, object_generation: 'generation-3', object_etag: 'etag-3' },
    ])
    await pool.end()
    pools.delete(pool)
  })

  test('preserves cleaned version objects through failure recovery before fresh re-adoption and finalization', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const oldIdentities = new Map()
    let seeded = false
    const repositoryFactory = (client) => {
      const repository = createVersionRepository(client)
      return {
        ...repository,
        async adoptBuildObjects(input) {
          if (seeded) return repository.adoptBuildObjects(input)
          seeded = true
          for (const [index, objectKey] of input.objectKeys.entries()) {
            const contentType = objectKey.endsWith('.json') ? 'application/json' : 'image/png'
            const oldBytes = Buffer.from(`obsolete-version-object-${index}`)
            let identity
            for (let generation = 0; generation < 2; generation += 1) {
              identity = await harness.assetStore.put({ objectKey, bytes: oldBytes, contentType })
              await harness.assetStore.delete({ objectKey, generation: identity.generation })
            }
            oldIdentities.set(objectKey, identity)
            await harness.pool.query(
              `INSERT INTO orphaned_uploads
                 (id, object_key, campaign_id, reason, status, cleaned_at,
                  object_generation, object_etag, expected_sha256, expected_byte_size, expected_mime_type)
               VALUES ($1, $2, $3, 'obsolete_cleanup', 'cleaned', now(), $4, $5, $6, $7, $8)`,
              [`cleaned-version-recovery-${index}`, objectKey, harness.campaign.id,
                identity.generation, identity.etag, identity.sha256, identity.byteSize, identity.contentType],
            )
          }
          throw new Error('forced pre-adoption version failure')
        },
      }
    }
    const command = {
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'cleaned-version-recovery', input: {},
    }
    await expect(createVersionService({
      pool: harness.pool, assetStore: harness.assetStore, repositoryFactory,
      renderer: createInProcessRenderer(), timeoutMs: 5_000, recoveryTimeoutMs: 500,
    }).createVersion(command)).rejects.toThrow('forced pre-adoption version failure')
    expect((await harness.pool.query(
      `SELECT status, object_generation, expected_sha256 FROM orphaned_uploads
       WHERE campaign_id = $1 ORDER BY object_key`,
      [harness.campaign.id],
    )).rows).toEqual([...oldIdentities.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, identity]) => ({
      status: 'cleaned', object_generation: identity.generation, expected_sha256: identity.sha256,
    })))

    const replacements = new Map()
    const replacementStore = {
      ...harness.assetStore,
      async put(input) {
        const claim = (await harness.pool.query(
          `SELECT status, object_generation, object_etag, expected_sha256
           FROM orphaned_uploads WHERE object_key = $1`,
          [input.objectKey],
        )).rows[0]
        expect(claim).toMatchObject({ status: 'pending', object_generation: null, object_etag: null })
        expect(claim.expected_sha256).toMatch(/^[a-f0-9]{64}$/)
        const identity = await harness.assetStore.put(input)
        replacements.set(input.objectKey, identity)
        return identity
      },
    }
    const finalized = await createVersionService({
      pool: harness.pool, assetStore: replacementStore, renderer: createInProcessRenderer(),
    }).createVersion(command)
    expect(finalized.status).toBe(201)
    expect(replacements.size).toBe(oldIdentities.size)
    for (const [objectKey, replacement] of replacements) {
      expect(replacement.generation).not.toBe(oldIdentities.get(objectKey).generation)
    }
    expect((await harness.pool.query(
      `SELECT count(*)::int AS count FROM assets WHERE version_id = $1`,
      [finalized.body.version.id],
    )).rows[0].count).toBe(2)
    expect((await harness.pool.query(
      `SELECT count(*)::int AS count FROM orphaned_uploads WHERE campaign_id = $1`,
      [harness.campaign.id],
    )).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('concurrent active version and delivery cleanup follows one lock order without deadlock', async () => {
    const harness = await approvedDeliveryHarness()
    const versionId = harness.created.body.version.id
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: harness.campaign.id,
      key: 'concurrent-version-cleanup', fingerprint: '1'.repeat(64), ownerToken: 'version-owner',
      now: new Date(), leaseExpiresAt: new Date('2099-09-04T10:00:00Z'),
    })
    await createIdempotencyRepository(harness.pool).claim({
      actorId: harness.actor.id, method: 'POST', resourceId: versionId,
      key: 'concurrent-delivery-cleanup', fingerprint: '2'.repeat(64), ownerToken: 'delivery-owner',
      now: new Date(), leaseExpiresAt: new Date('2099-09-04T10:00:00Z'),
    })
    await harness.pool.query(
      `INSERT INTO review_version_builds
         (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
          version_id, version_number, expected_revision, plan)
       VALUES ('concurrent-version-build', $1, $2, 'concurrent-version-cleanup', $3,
               'version-owner', 'future-version', 2, 6, '{}')`,
      [harness.campaign.id, harness.actor.id, '1'.repeat(64)],
    )
    await harness.pool.query(
      `INSERT INTO delivery_builds
         (id, campaign_id, version_id, actor_id, idempotency_key, request_fingerprint, owner_token, plan)
       VALUES ('concurrent-delivery-build', $1, $2, $3, 'concurrent-delivery-cleanup', $4,
               'delivery-owner', '{}')`,
      [harness.campaign.id, versionId, harness.actor.id, '2'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createVersionRepository(client).adoptBuildObjects({
      buildId: 'concurrent-version-build', ownerToken: 'version-owner', campaignId: harness.campaign.id,
      objectKeys: ['campaigns/concurrent/version.png'], orphanIds: ['concurrent-version-orphan'], adoptedAt: new Date(),
    }))
    await withTransaction(harness.pool, (client) => createDeliveryRepository(client).adoptBuildObject({
      buildId: 'concurrent-delivery-build', ownerToken: 'delivery-owner', campaignId: harness.campaign.id,
      objectKey: 'campaigns/concurrent/delivery.zip', orphanId: 'concurrent-delivery-orphan', adoptedAt: new Date(),
    }))
    const control = createGenerationControlPlane({ pool: harness.pool })
    const deleteObject = vi.fn()
    const observed = await Promise.race([
      Promise.all([
        control.cleanupOrphanUpload({ orphanId: 'concurrent-version-orphan', deleteObject, cleanedAt: new Date() }),
        control.cleanupOrphanUpload({ orphanId: 'concurrent-delivery-orphan', deleteObject, cleanedAt: new Date() }),
      ]),
      new Promise((resolve) => setTimeout(() => resolve('deadlocked'), 1_000)),
    ])
    expect(observed).toEqual([
      { kind: 'claimed', objectKey: 'campaigns/concurrent/version.png' },
      { kind: 'claimed', objectKey: 'campaigns/concurrent/delivery.zip' },
    ])
    expect(deleteObject).not.toHaveBeenCalled()
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('does not let a late old owner unclaim a replacement build object intent', async () => {
    const harness = await immutableVersionHarness()
    const objectKey = 'campaigns/replacement-build/versions/review.png'
    await harness.pool.query(
      `INSERT INTO review_version_builds
         (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
          version_id, version_number, expected_revision, plan)
       VALUES ('replacement-build', $1, $2, 'replacement-adoption', $3, 'old-owner',
               'replacement-version', 1, 2, '{}')`,
      [harness.campaign.id, harness.actor.id, 'b'.repeat(64)],
    )
    await withTransaction(harness.pool, (client) => createVersionRepository(client).adoptBuildObjects({
      buildId: 'replacement-build', ownerToken: 'old-owner', campaignId: harness.campaign.id,
      objectKeys: [objectKey], orphanIds: ['replacement-intent'], adoptedAt: new Date(),
    }))
    await harness.pool.query("UPDATE review_version_builds SET owner_token = 'new-owner' WHERE id = 'replacement-build'")

    const result = await withTransaction(harness.pool, (client) => createVersionRepository(client).failBuild({
      buildId: 'replacement-build', ownerToken: 'old-owner', campaignId: harness.campaign.id,
      objectKeys: [objectKey], reason: 'late_old_owner', orphanIds: ['late-old-orphan'], failedAt: new Date(),
    }))

    expect(result).toEqual({ owned: false })
    expect((await harness.pool.query(
      'SELECT id, claimed_build_id FROM orphaned_uploads WHERE object_key = $1',
      [objectKey],
    )).rows[0]).toEqual({ id: 'replacement-intent', claimed_build_id: 'replacement-build' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('supports omitted optional image slots and multiple distinct campaign-bound image sources', async () => {
    const optionalTemplate = structuredClone(pilotTemplateFixture)
    optionalTemplate.version = '1.2.0'
    optionalTemplate.slots.find((slot) => slot.id === 'image').required = false
    const optional = await immutableVersionHarness({ templateManifest: optionalTemplate })
    const optionalInput = structuredClone(optional.compositionInput)
    delete optionalInput.slotValues.image
    await optional.service.saveComposition({ actor: optional.actor, campaignId: optional.campaign.id, expectedRevision: 2, input: optionalInput })
    const optionalVersion = await optional.service.createVersion({
      actor: optional.actor, campaignId: optional.campaign.id, expectedRevision: 3,
      idempotencyKey: 'optional-image-omitted', input: {},
    })
    expect(optionalVersion.body.version.snapshot.assets.filter((asset) => ['direction', 'final_image'].includes(asset.kind))).toEqual([
      { id: optional.sourceAssetId, kind: 'direction', sha256: optional.sourceHash },
    ])
    expect((await optional.pool.query(
      'SELECT asset_id, asset_sha256 FROM campaign_version_source_assets WHERE version_id = $1',
      [optionalVersion.body.version.id],
    )).rows).toEqual([{ asset_id: optional.sourceAssetId, asset_sha256: optional.sourceHash }])
    await optional.pool.end()
    pools.delete(optional.pool)

    await resetDatabase()
    const migrationPool = makePool()
    await runMigrations({ pool: migrationPool })
    await migrationPool.end()
    pools.delete(migrationPool)

    const multiTemplate = structuredClone(pilotTemplateFixture)
    multiTemplate.version = '1.3.0'
    multiTemplate.slots.push({
      ...structuredClone(multiTemplate.slots.find((slot) => slot.id === 'image')),
      id: 'secondaryImage',
    })
    const realRenderer = createInProcessRenderer()
    const renderComposition = vi.fn((input) => realRenderer.renderComposition(input))
    const multi = await immutableVersionHarness({ templateManifest: multiTemplate, renderer: { renderComposition } })
    const secondaryBytes = await sharp({ create: { width: 1000, height: 1000, channels: 4, background: '#0ea5e9' } }).png().toBuffer()
    const secondaryHash = createHash('sha256').update(secondaryBytes).digest('hex')
    const secondaryKey = `campaigns/${multi.campaign.id}/uploads/secondary.png`
    await multi.assetStore.put({ objectKey: secondaryKey, bytes: secondaryBytes, contentType: 'image/png' })
    await multi.pool.query(
      `INSERT INTO generation_jobs
         (id, campaign_id, actor_id, method, step, provider, model, region, status, attempts,
          safety, usage, reserved_cost_microunits, actual_cost_microunits, idempotency_key,
          request_fingerprint, owner_token, dispatch_state, dispatched_at, budget_day,
          input_snapshot, result_metadata, timeout_at, completed_at, created_at, updated_at)
       VALUES ('secondary-image-job', $1, $2, 'POST', 'image', 'mock', 'mock-v1', 'europe-west6', 'succeeded', 1,
               '{"verdict":"safe","categories":[]}', '{}', 0, 0, 'secondary-image-key',
               $3, 'secondary-image-owner', 'dispatched', $4, '2026-09-04', $5, $6, $7, $4, $4, $4)`,
      [multi.campaign.id, multi.actor.id, hashCanonical({ id: 'secondary-image-job' }), new Date('2026-09-04T10:00:00.000Z'),
        { direction: {
          id: multi.directionId, title: 'Nordic focus', prompt: 'A calm Norwegian learning scene',
          status: 'pending', previewAssetId: null,
        }, width: 1000, height: 1000 }, {
          image: {
            asset: { id: 'secondary-image', kind: 'final_image', sha256: secondaryHash },
            mimeType: 'image/png', width: 1000, height: 1000, byteSize: secondaryBytes.length,
          },
        }, new Date('2026-09-04T10:05:00.000Z')],
    )
    await multi.pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, generation_job_id)
       VALUES ('secondary-image', $1, 'final_image', $2, 'image/png', $3, 1000, 1000, $4, 'generation', 'secondary-image-job')`,
      [multi.campaign.id, secondaryKey, secondaryBytes.length, secondaryHash],
    )
    const multiInput = {
      ...multi.compositionInput,
      slotValues: { ...multi.compositionInput.slotValues, secondaryImage: 'secondary-image' },
    }
    await multi.service.saveComposition({ actor: multi.actor, campaignId: multi.campaign.id, expectedRevision: 2, input: multiInput })
    const multiVersion = await multi.service.createVersion({
      actor: multi.actor, campaignId: multi.campaign.id, expectedRevision: 3,
      idempotencyKey: 'multi-image', input: {},
    })

    expect(multiVersion.body.version.snapshot.assets.filter((asset) => ['direction', 'final_image'].includes(asset.kind)))
      .toEqual(expect.arrayContaining([
        { id: multi.sourceAssetId, kind: 'direction', sha256: multi.sourceHash },
        { id: 'secondary-image', kind: 'final_image', sha256: secondaryHash },
      ]))
    expect(renderComposition).toHaveBeenCalledWith(expect.objectContaining({
      slots: expect.objectContaining({
        image: expect.objectContaining({ mimeType: 'image/png', bytes: expect.any(Buffer) }),
        secondaryImage: expect.objectContaining({ mimeType: 'image/png', bytes: expect.any(Buffer) }),
      }),
    }))
    await multi.pool.end()
    pools.delete(multi.pool)
  })

  test.each([
    ['copy input brief', async (harness) => harness.pool.query('UPDATE generation_jobs SET input_snapshot = $2 WHERE id = $1', [`${harness.campaign.id}:copy-job`, { brief: { ...harness.campaign.brief, product: 'Wrong product' }, analysis: harness.analysis }]), 'copy_selection_invalid'],
    ['copy input analysis', async (harness) => harness.pool.query('UPDATE generation_jobs SET input_snapshot = $2 WHERE id = $1', [`${harness.campaign.id}:copy-job`, { brief: harness.campaign.brief, analysis: { ...harness.analysis, summary: 'Wrong analysis' } }]), 'copy_selection_invalid'],
    ['copy input missing analysis', async (harness) => harness.pool.query('UPDATE generation_jobs SET input_snapshot = $2 WHERE id = $1', [`${harness.campaign.id}:copy-job`, { brief: harness.campaign.brief }]), 'copy_selection_invalid'],
    ['brief analysis result', async (harness) => harness.pool.query('UPDATE generation_jobs SET result_metadata = $2 WHERE id = $1', [harness.analysisJobId, { analysis: { ...harness.analysis, summary: 'Changed after copy generation' } }]), 'copy_selection_invalid'],
    ['copy job step', async (harness) => harness.pool.query('UPDATE generation_jobs SET step = \'directions\' WHERE id = $1', [`${harness.campaign.id}:copy-job`]), 'copy_selection_invalid'],
    ['copy result', async (harness) => harness.pool.query("UPDATE generation_jobs SET result_metadata = '{\"copySetId\":\"other\",\"copies\":[]}' WHERE id = $1", [`${harness.campaign.id}:copy-job`]), 'copy_selection_invalid'],
    ['direction input copy', async (harness) => harness.pool.query('UPDATE generation_jobs SET input_snapshot = $2 WHERE id = $1', [`${harness.campaign.id}:directions-job`, { brief: harness.campaign.brief, copy: { ...harness.copy, headline: 'Wrong headline' } }]), 'direction_selection_invalid'],
    ['direction input brief', async (harness) => harness.pool.query('UPDATE generation_jobs SET input_snapshot = $2 WHERE id = $1', [`${harness.campaign.id}:directions-job`, { brief: { ...harness.campaign.brief, objective: 'Wrong objective' }, copy: harness.copy }]), 'direction_selection_invalid'],
    ['direction result', async (harness) => harness.pool.query("UPDATE generation_jobs SET result_metadata = '{\"directions\":[]}' WHERE id = $1", [`${harness.campaign.id}:directions-job`]), 'direction_selection_invalid'],
    ['direction result state', async (harness) => harness.pool.query('UPDATE generation_jobs SET result_metadata = $2 WHERE id = $1', [`${harness.campaign.id}:directions-job`, { directions: [{ id: harness.directionId, title: 'Nordic focus', prompt: 'A calm Norwegian learning scene', status: 'ready', previewAssetId: harness.sourceAssetId }] }]), 'direction_selection_invalid'],
    ['image job step', async (harness) => harness.pool.query('UPDATE generation_jobs SET step = \'directions\' WHERE id = $1', [`${harness.campaign.id}:image-job`]), 'composition_source_mismatch'],
    ['image input', async (harness) => {
      await harness.pool.query('ALTER TABLE generation_jobs DROP CONSTRAINT generation_jobs_image_input_dimensions_check')
      return harness.pool.query("UPDATE generation_jobs SET input_snapshot = '{\"direction\":{\"id\":\"wrong\"}}' WHERE id = $1", [`${harness.campaign.id}:image-job`])
    }, 'composition_source_mismatch'],
    ['image direction content', async (harness) => harness.pool.query('UPDATE generation_jobs SET input_snapshot = $2 WHERE id = $1', [`${harness.campaign.id}:image-job`, { direction: { id: harness.directionId, title: 'Altered title', prompt: 'Altered prompt', status: 'pending', previewAssetId: null }, width: 1000, height: 1000 }]), 'composition_source_mismatch'],
    ['image input width', async (harness) => harness.pool.query('UPDATE generation_jobs SET input_snapshot = jsonb_set(input_snapshot, \'{width}\', \'999\'::jsonb) WHERE id = $1', [`${harness.campaign.id}:image-job`]), 'composition_source_mismatch'],
    ['image input height', async (harness) => {
      await harness.pool.query('ALTER TABLE generation_jobs DROP CONSTRAINT generation_jobs_image_input_dimensions_check')
      return harness.pool.query('UPDATE generation_jobs SET input_snapshot = input_snapshot - \'height\' WHERE id = $1', [`${harness.campaign.id}:image-job`])
    }, 'composition_source_mismatch'],
    ['image result', async (harness) => harness.pool.query("UPDATE generation_jobs SET result_metadata = '{\"image\":{\"asset\":{\"id\":\"wrong\",\"kind\":\"direction\",\"sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}}' WHERE id = $1", [`${harness.campaign.id}:image-job`]), 'composition_source_mismatch'],
  ])('rejects mismatched exact %s lineage', async (_case, mutate, code) => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    await mutate(harness)

    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: `lineage-${_case.replaceAll(' ', '-')}`, input: {},
    })).rejects.toMatchObject({ code })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test.each([
    ['returned dimensions', async (valid) => ({ ...valid, width: valid.width - 1 })],
    ['decoded dimensions', async (valid) => {
      const bytes = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#111827' } }).png().toBuffer()
      return { ...valid, bytes, byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    }],
    ['actual MIME', async (valid) => {
      const bytes = await sharp({ create: { width: valid.width, height: valid.height, channels: 3, background: '#111827' } }).jpeg().toBuffer()
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      return {
        ...valid,
        bytes,
        byteSize: bytes.length,
        sha256,
        renderManifest: {
          ...valid.renderManifest,
          output: { ...valid.renderManifest.output, byteSize: bytes.length, sha256 },
        },
      }
    }],
    ['nested render manifest', async (valid) => ({
      ...valid,
      renderManifest: { ...valid.renderManifest, ratio: 'portrait' },
    })],
    ['empty slot provenance', async (valid) => ({
      ...valid,
      renderManifest: { ...valid.renderManifest, slots: [] },
    })],
    ['missing slot provenance', async (valid) => ({
      ...valid,
      renderManifest: { ...valid.renderManifest, slots: valid.renderManifest.slots.slice(1) },
    })],
    ['duplicate slot provenance', async (valid) => ({
      ...valid,
      renderManifest: { ...valid.renderManifest, slots: [...valid.renderManifest.slots, valid.renderManifest.slots[0]] },
    })],
    ['unknown slot provenance', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot, index) => index === 0 ? { ...slot, id: 'unknown-slot' } : slot),
      },
    })],
    ['font provenance', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot) => slot.type === 'text'
          ? { ...slot, font: { ...slot.font, family: 'Other' } }
          : slot),
      },
    })],
    ['placement provenance', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot, index) => index === 0
          ? { ...slot, placement: { ...slot.placement, x: slot.placement.x + 1 } }
          : slot),
      },
    })],
    ['malformed placement provenance', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot, index) => {
          if (index !== 0) return slot
          const { placement: _placement, ...withoutPlacement } = slot
          return withoutPlacement
        }),
      },
    })],
    ['image source provenance', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot) => slot.type === 'image'
          ? { ...slot, source: { ...slot.source, sha256: 'f'.repeat(64) } }
          : slot),
      },
    })],
    ['slot order provenance', async (valid) => ({
      ...valid,
      renderManifest: { ...valid.renderManifest, slots: [...valid.renderManifest.slots].reverse() },
    })],
    ['text line provenance', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot) => slot.type === 'text'
          ? { ...slot, lines: ['Altered content'] }
          : slot),
      },
    })],
    ['changed line wrapping', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot) => slot.id === 'headline'
          ? { ...slot, lines: ['Learn', 'Norwegian with confidence'] }
          : slot),
      },
    })],
    ['overflowing line claim', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot) => slot.id === 'headline'
          ? { ...slot, lines: [slot.lines.join(' ')] }
          : slot),
      },
    })],
    ['image crop provenance', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot) => slot.type === 'image'
          ? { ...slot, crop: { ...slot.crop, x: slot.crop.x + 1 } }
          : slot),
      },
    })],
    ['extra slot field', async (valid) => ({
      ...valid,
      renderManifest: {
        ...valid.renderManifest,
        slots: valid.renderManifest.slots.map((slot, index) => index === 0 ? { ...slot, extra: true } : slot),
      },
    })],
  ])('rejects renderer output that lies about %s', async (_case, lie) => {
    const realRenderer = createInProcessRenderer()
    const renderer = { renderComposition: async (input) => lie(await realRenderer.renderComposition(input)) }
    const harness = await immutableVersionHarness({ renderer })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })

    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: `lying-renderer-${_case.replaceAll(' ', '-')}`, input: {},
    })).rejects.toMatchObject({ code: 'renderer_integrity_failure' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects renderer text lines that erase an explicit paragraph boundary', async () => {
    const realRenderer = createInProcessRenderer()
    const renderer = {
      async renderComposition(input) {
        const valid = await realRenderer.renderComposition(input)
        return {
          ...valid,
          renderManifest: {
            ...valid.renderManifest,
            slots: valid.renderManifest.slots.map((slot) => slot.id === 'body'
              ? { ...slot, lines: [slot.lines.join(' ')] }
              : slot),
          },
        }
      },
    }
    const harness = await immutableVersionHarness({ renderer })
    const input = {
      ...harness.compositionInput,
      slotValues: { ...harness.compositionInput.slotValues, body: 'Short focused\nlessons for adults.' },
    }
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input,
    })

    await expect(harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'paragraph-boundary', input: {},
    })).rejects.toMatchObject({ code: 'renderer_integrity_failure' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('serializes a pre-commit kill-switch change ahead of final version persistence', async () => {
    const entered = deferred()
    const release = deferred()
    const realRenderer = createInProcessRenderer()
    const renderer = {
      async renderComposition(input) {
        entered.resolve()
        await release.promise
        return realRenderer.renderComposition(input)
      },
    }
    const harness = await immutableVersionHarness({ renderer, serviceOptions: { timeoutMs: 500 } })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const creating = harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'kill-switch-race', input: {},
    })
    await entered.promise
    const settingsBlocker = await harness.pool.connect()
    await settingsBlocker.query('BEGIN')
    await settingsBlocker.query('SELECT singleton FROM settings WHERE singleton = true FOR UPDATE')
    await settingsBlocker.query('UPDATE settings SET generation_disabled = true WHERE singleton = true')
    release.resolve()

    const early = await observeSettlementWithin(creating, 300).observed
    expect(early).toEqual({ kind: 'deadline_ignored' })
    await settingsBlocker.query('COMMIT')
    settingsBlocker.release()
    await expect(creating).rejects.toMatchObject({ code: 'generation_safety_unavailable' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('holds the settings lock through final commit so budget reservations serialize behind it', async () => {
    const settingsLocked = deferred()
    const releaseFinal = deferred()
    let safetyChecks = 0
    const repositoryFactory = (client) => {
      const repository = createVersionRepository(client)
      return {
        ...repository,
        async generationSafetyAvailable() {
          const available = await repository.generationSafetyAvailable()
          safetyChecks += 1
          if (safetyChecks === 2) {
            settingsLocked.resolve()
            await releaseFinal.promise
          }
          return available
        },
      }
    }
    const harness = await immutableVersionHarness()
    await harness.pool.query('UPDATE settings SET daily_budget_microunits = 1000000 WHERE singleton = true')
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const service = createVersionService({
      pool: harness.pool, assetStore: harness.assetStore, repositoryFactory, timeoutMs: 1_000,
    })
    const creating = service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'settings-serialization', input: {},
    })
    await settingsLocked.promise
    const secondCampaign = await insertCampaign(harness.pool, harness.actor.id)
    const controlPlane = createGenerationControlPlane({ pool: harness.pool })
    const reserving = controlPlane.prepareGeneration({
      actor: harness.actor, campaignId: secondCampaign.id, step: 'brief_analysis', input: {},
      idempotencyKey: 'reservation-after-version', jobId: 'reservation-after-version-job', ownerToken: 'reservation-owner',
      maxCostMicrounits: 1_000, startedAt: new Date(), timeoutAt: new Date(Date.now() + 1_000),
    })

    expect(await observeSettlementWithin(reserving, 50).observed).toEqual({ kind: 'deadline_ignored' })
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM generation_jobs WHERE id = 'reservation-after-version-job'")).rows[0].count).toBe(0)
    releaseFinal.resolve()
    const [created, reserved] = await Promise.all([creating, reserving])
    expect(created.status).toBe(201)
    expect(reserved.kind).toBe('owner')
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test.each(['source', 'renderer', 'upload', 'readback'])('bounds a non-settling %s phase with one version deadline', async (phase) => {
    const backing = createMemoryAssetStore()
    const gate = deferred()
    let sourceKey
    const store = {
      delete: (input) => backing.delete(input),
      close: () => backing.close(),
      getMetadata: (input) => backing.getMetadata(input),
      async put(input) {
        if (phase === 'upload' && input.objectKey.includes('/versions/')) await gate.promise
        return backing.put(input)
      },
      async get(input) {
        if (phase === 'source' && input.objectKey === sourceKey) await gate.promise
        if (phase === 'readback' && input.objectKey.includes('/versions/')) await gate.promise
        return backing.get(input)
      },
    }
    const realRenderer = createInProcessRenderer()
    const renderer = {
      async renderComposition(input) {
        if (phase === 'renderer') await gate.promise
        return realRenderer.renderComposition(input)
      },
    }
    const harness = await immutableVersionHarness({ assetStore: store })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    sourceKey = (await harness.pool.query('SELECT object_key FROM assets WHERE id = $1', [harness.sourceAssetId])).rows[0].object_key
    const service = createVersionService({
      pool: harness.pool, assetStore: store, renderer, timeoutMs: 30, recoveryTimeoutMs: 60,
    })
    const pending = service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: `deadline-${phase}`, input: {},
    })

    const outcome = await observeSettlementWithin(pending, 250).observed
    gate.resolve()
    await pending.catch(() => {})
    expect(outcome).toMatchObject({ kind: 'rejected', error: { statusCode: 503, code: 'version_operation_timeout' } })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    expect((await harness.pool.query(
      `SELECT status, claimed_build_id FROM orphaned_uploads
       WHERE campaign_id = $1 ORDER BY object_key`,
      [harness.campaign.id],
    )).rows).toEqual([
      { status: 'pending', claimed_build_id: null },
      { status: 'pending', claimed_build_id: null },
    ])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('bounds a non-settling source read while a composition transaction holds the campaign lock', async () => {
    const backing = createMemoryAssetStore()
    const gate = deferred()
    let sourceKey
    const store = {
      put: (input) => backing.put(input),
      delete: (input) => backing.delete(input),
      getMetadata: (input) => backing.getMetadata(input),
      async get(input) {
        if (input.objectKey === sourceKey) await gate.promise
        return backing.get(input)
      },
    }
    const harness = await immutableVersionHarness({ assetStore: store })
    sourceKey = (await harness.pool.query('SELECT object_key FROM assets WHERE id = $1', [harness.sourceAssetId])).rows[0].object_key
    const service = createVersionService({ pool: harness.pool, assetStore: store, timeoutMs: 30, recoveryTimeoutMs: 60 })
    const pending = service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })

    const outcome = await observeSettlementWithin(pending, 250).observed
    gate.resolve()
    await pending.catch(() => {})
    expect(outcome).toMatchObject({ kind: 'rejected', error: { statusCode: 503, code: 'version_operation_timeout' } })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM compositions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('bounds final persistence and uses a separate recovery budget after the main deadline', async () => {
    const entered = deferred()
    const release = deferred()
    const realRenderer = createInProcessRenderer()
    const renderer = {
      async renderComposition(input) {
        entered.resolve()
        await release.promise
        return realRenderer.renderComposition(input)
      },
    }
    const harness = await immutableVersionHarness({ renderer })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const service = createVersionService({
      pool: harness.pool, assetStore: harness.assetStore, renderer, timeoutMs: 80, recoveryTimeoutMs: 250,
    })
    const pending = service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'final-deadline', input: {},
    })
    await entered.promise
    const blocker = await harness.pool.connect()
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM campaigns WHERE id = $1 FOR UPDATE', [harness.campaign.id])
    release.resolve()

    const outcome = await observeSettlementWithin(pending, 500).observed
    await blocker.query('ROLLBACK')
    blocker.release()
    await pending.catch(() => {})
    expect(outcome).toMatchObject({
      kind: 'rejected',
      error: { statusCode: 503, code: expect.stringMatching(/version_operation_timeout|version_recovery_unavailable/) },
    })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM campaign_versions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('bounds pool checkout and a separately blocked recovery transaction', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const service = createVersionService({
      pool: harness.pool, assetStore: harness.assetStore, timeoutMs: 30, recoveryTimeoutMs: 40,
    })
    const checkedOut = await Promise.all(Array.from({ length: 8 }, () => harness.pool.connect()))
    const checkoutPending = service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'pool-deadline', input: {},
    })
    const checkoutOutcome = await observeSettlementWithin(checkoutPending, 200).observed
    for (const client of checkedOut) client.release()
    await checkoutPending.catch(() => {})
    expect(checkoutOutcome).toMatchObject({ kind: 'rejected', error: { statusCode: 503, code: 'version_operation_timeout' } })

    const gate = deferred()
    const releaseFailure = deferred()
    const failingStore = {
      get: (input) => harness.assetStore.get(input),
      getMetadata: (input) => harness.assetStore.getMetadata(input),
      delete: (input) => harness.assetStore.delete(input),
      async put(input) {
        if (input.objectKey.includes('/versions/')) {
          gate.resolve()
          await releaseFailure.promise
          throw Object.assign(new Error('storage unavailable'), { code: 'storage_unavailable' })
        }
        return harness.assetStore.put(input)
      },
    }
    const recoveryService = createVersionService({
      pool: harness.pool, assetStore: failingStore, timeoutMs: 500, recoveryTimeoutMs: 40,
    })
    const recoveryPending = recoveryService.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'recovery-deadline', input: {},
    })
    await gate.promise
    const idempotencyBlocker = await harness.pool.connect()
    await idempotencyBlocker.query('BEGIN')
    await idempotencyBlocker.query(
      `SELECT key FROM idempotency_records
       WHERE actor_id = $1 AND method = 'POST' AND resource_id = $2 AND key = 'recovery-deadline'
       FOR UPDATE`,
      [harness.actor.id, harness.campaign.id],
    )
    releaseFailure.resolve()
    const recoveryOutcome = await observeSettlementWithin(recoveryPending, 250).observed
    await idempotencyBlocker.query('ROLLBACK')
    idempotencyBlocker.release()
    await recoveryPending.catch(() => {})
    expect(recoveryOutcome).toMatchObject({ kind: 'rejected', error: { statusCode: 503, code: 'version_recovery_unavailable' } })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('adopts retry objects before readback so cleanup cannot delete between verification and commit or deadlock', async () => {
    const backing = createMemoryAssetStore()
    let failManifest = true
    const store = {
      get: (input) => backing.get(input),
      getMetadata: (input) => backing.getMetadata(input),
      delete: (input) => backing.delete(input),
      close: () => backing.close(),
      async put(input) {
        if (failManifest && input.objectKey.includes('/versions/') && input.contentType === 'application/json') {
          failManifest = false
          await backing.put(input)
          throw Object.assign(new Error('manifest storage failed'), { code: 'storage_unavailable' })
        }
        return backing.put(input)
      },
    }
    const harness = await immutableVersionHarness({ assetStore: store, serviceOptions: { timeoutMs: 5_000, recoveryTimeoutMs: 500 } })
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const command = {
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'cleanup-adoption-race', input: {},
    }
    await expect(harness.service.createVersion(command)).rejects.toMatchObject({ code: 'asset_storage_unavailable' })
    const build = (await harness.pool.query('SELECT plan FROM review_version_builds WHERE campaign_id = $1', [harness.campaign.id])).rows[0]
    const keys = [...build.plan.ratioAssets.map((asset) => asset.objectKey), build.plan.manifestAsset.objectKey].sort()
    const orphans = (await harness.pool.query(
      'SELECT id, object_key FROM orphaned_uploads WHERE campaign_id = $1 ORDER BY object_key',
      [harness.campaign.id],
    )).rows
    const cleanupTarget = orphans.find((orphan) => orphan.object_key === keys[0])
    expect(cleanupTarget).toBeTruthy()
    expect(await backing.get({ objectKey: cleanupTarget.object_key })).not.toBeNull()

    const blocker = await harness.pool.connect()
    await blocker.query('BEGIN')
    for (const objectKey of keys) {
      await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
    }
    const retry = harness.service.createVersion(command)
    await waitForAdvisoryWait(harness.pool, 1)
    const controlPlane = createGenerationControlPlane({ pool: harness.pool })
    const cleanup = controlPlane.cleanupOrphanUpload({
      orphanId: cleanupTarget.id,
      deleteObject: (input) => store.delete(input),
      cleanedAt: new Date('2026-09-04T10:01:00.000Z'),
    })
    await waitForAdvisoryWait(harness.pool, 2)
    await blocker.query('COMMIT')
    blocker.release()

    const [retried, cleaned] = await Promise.all([retry, cleanup])
    expect(retried.status).toBe(201)
    expect(cleaned).toEqual({ kind: 'claimed', objectKey: cleanupTarget.object_key })
    expect(await backing.get({ objectKey: cleanupTarget.object_key })).not.toBeNull()
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM assets WHERE version_id = $1', [retried.body.version.id])).rows[0].count).toBe(2)
    await harness.pool.end()
    pools.delete(harness.pool)
  }, 10_000)

  test('creates version N+1 after a reopened edit without mutating version N', async () => {
    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput })
    const first = await harness.service.createVersion({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3, idempotencyKey: 'version-one', input: {} })
    const originalSnapshot = structuredClone(first.body.version.snapshot)
    const reviewService = createReviewService({ pool: harness.pool })
    await reviewService.requestChanges({
      actor: harness.designer, versionId: first.body.version.id, expectedRevision: 4,
      idempotencyKey: 'version-one-changes', input: { comment: 'Change the call to action.' },
    })
    await reviewService.reopen({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 5,
      idempotencyKey: 'version-one-reopen', input: {},
    })
    const editedInput = { ...harness.compositionInput, slotValues: { ...harness.compositionInput.slotValues, cta: 'Join today' } }
    await harness.service.saveComposition({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 6, input: editedInput })
    const second = await harness.service.createVersion({ actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 7, idempotencyKey: 'version-two', input: {} })

    expect(second.body.version.versionNumber).toBe(2)
    expect(second.body.version.contentHash).not.toBe(first.body.version.contentHash)
    const persistedFirst = (await harness.pool.query('SELECT snapshot, content_hash FROM campaign_versions WHERE id = $1', [first.body.version.id])).rows[0]
    expect(persistedFirst).toEqual({ snapshot: originalSnapshot, content_hash: first.body.version.contentHash })
    expect((await harness.pool.query(
      'SELECT count(*)::int AS count FROM campaign_version_source_assets WHERE asset_id = $1',
      [harness.sourceAssetId],
    )).rows[0].count).toBe(2)
    await harness.pool.end()
    pools.delete(harness.pool)
  })
})

async function openReviewHarness() {
  const harness = await immutableVersionHarness()
  await harness.service.saveComposition({
    actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
  })
  const created = await harness.service.createVersion({
    actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
    idempotencyKey: `open-review-${randomUUID()}`, input: {},
  })
  return { ...harness, created, reviewService: createReviewService({ pool: harness.pool }) }
}

async function approvedDeliveryHarness({ deliveryOptions = {} } = {}) {
  const harness = await openReviewHarness()
  await harness.reviewService.markReady({
    actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
    idempotencyKey: `delivery-ready-${randomUUID()}`, input: {
      figmaUrl: 'https://figma.com/design/file/delivery-review',
      checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
    },
  })
  const approvalKey = `delivery-approve-${randomUUID()}`
  const approved = await harness.reviewService.approve({
    actor: harness.actor, versionId: harness.created.body.version.id, expectedRevision: 5,
    idempotencyKey: approvalKey, input: {},
  })
  return {
    ...harness,
    approved,
    approvalKey,
    deliveryService: createDeliveryService({ pool: harness.pool, assetStore: harness.assetStore, ...deliveryOptions }),
  }
}

async function directSqlConstraintError(pool, operation) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await operation(client)
    await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    return null
  } catch (error) {
    return error
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }
}

describe('append-only human review gates', () => {
  test('keeps new ready and approval facts readable by the strict pre-016 payload contract', async () => {
    const harness = await openReviewHarness()
    const readyCommand = {
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'rolling-contract-ready', input: {
        figmaUrl: 'https://figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      },
    }
    const marked = await harness.reviewService.markReady(readyCommand)
    expect(marked.body.event.payload.assetHashes).toEqual([...new Set(
      harness.created.body.version.snapshot.assets.map((asset) => asset.sha256),
    )].sort())
    const rawReady = (await harness.pool.query(
      "SELECT payload FROM review_events WHERE version_id = $1 AND event_type = 'ready'",
      [harness.created.body.version.id],
    )).rows[0].payload
    expect(rawReady).toEqual({
      figmaUrl: readyCommand.input.figmaUrl,
      checklistAnswers: readyCommand.input.checklistAnswers,
      readyActorId: harness.designer.id,
      contentHash: harness.created.body.version.contentHash,
    })
    expect(await harness.reviewService.markReady(readyCommand)).toEqual({ ...marked, replayed: true })

    const approvalId = randomUUID()
    let returnedApprovalPayload
    await withTransaction(harness.pool, async (client) => {
      returnedApprovalPayload = (await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'marketer', 'approved', $5)
         RETURNING payload`,
        [approvalId, harness.campaign.id, harness.created.body.version.id, harness.actor.id, {
          contentHash: harness.created.body.version.contentHash,
        }],
      )).rows[0].payload
      await client.query(
        `UPDATE campaigns SET status = 'approved', open_version_id = NULL,
           revision = revision + 1, updated_at = now() WHERE id = $1`,
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'marketer', 'campaign.approve', 'campaign', $3, 'ready', 'approved', $4, $5)`,
        [randomUUID(), harness.actor.id, harness.campaign.id, harness.created.body.version.id, {
          reviewEventId: approvalId, contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    })
    expect(returnedApprovalPayload).toEqual({ contentHash: harness.created.body.version.contentHash })
    const review = await harness.reviewService.getReview({
      actor: harness.actor, versionId: harness.created.body.version.id,
    })
    expect(review.events.find((event) => event.eventType === 'approved').payload.assetHashes)
      .toEqual(marked.body.event.payload.assetHashes)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('keeps a new ready fact readable by an old reject writer', async () => {
    const harness = await openReviewHarness()
    await harness.reviewService.markReady({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'rolling-contract-reject-ready', input: {
        figmaUrl: 'https://figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      },
    })
    const rawReady = (await harness.pool.query(
      "SELECT payload FROM review_events WHERE version_id = $1 AND event_type = 'ready'",
      [harness.created.body.version.id],
    )).rows[0].payload
    expect(rawReady).toEqual({
      figmaUrl: 'https://figma.com/design/file/review',
      checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      readyActorId: harness.designer.id,
      contentHash: harness.created.body.version.contentHash,
    })
    const rejectionId = randomUUID()
    await withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'marketer', 'rejected', $5)`,
        [rejectionId, harness.campaign.id, harness.created.body.version.id, harness.actor.id, {
          comment: 'Correct the campaign offer.',
        }],
      )
      await client.query(
        `UPDATE campaigns SET status = 'changes_requested', open_version_id = NULL,
           revision = revision + 1, updated_at = now() WHERE id = $1`,
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'marketer', 'campaign.reject', 'campaign', $3, 'ready', 'changes_requested', $4, $5)`,
        [randomUUID(), harness.actor.id, harness.campaign.id, harness.created.body.version.id, {
          reviewEventId: rejectionId, contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    })
    expect((await harness.pool.query('SELECT status FROM campaigns WHERE id = $1', [harness.campaign.id])).rows[0].status)
      .toBe('changes_requested')
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('database derives immutable review hash facts and rejects later tampering', async () => {
    const harness = await openReviewHarness()
    const eventId = randomUUID()
    const expectedHashes = [...new Set(
      harness.created.body.version.snapshot.assets.map((asset) => asset.sha256),
    )].sort()
    let stored
    await withTransaction(harness.pool, async (client) => {
      stored = (await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload, immutable_asset_hashes)
         VALUES ($1, $2, $3, $4, 'designer', 'ready', $5, $6)
         RETURNING payload, immutable_asset_hashes`,
        [eventId, harness.campaign.id, harness.created.body.version.id, harness.designer.id, {
          figmaUrl: 'https://figma.com/design/file/review',
          checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
          readyActorId: harness.designer.id,
          contentHash: harness.created.body.version.contentHash,
        }, ['f'.repeat(64)]],
      )).rows[0]
      await client.query(
        "UPDATE campaigns SET status = 'ready', revision = revision + 1, updated_at = now() WHERE id = $1",
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'designer', 'campaign.mark_ready', 'campaign', $3, 'in_review', 'ready', $4, $5)`,
        [randomUUID(), harness.designer.id, harness.campaign.id, harness.created.body.version.id, {
          reviewEventId: eventId, contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    })
    expect(stored.payload).not.toHaveProperty('assetHashes')
    expect(stored.immutable_asset_hashes).toEqual(expectedHashes)
    await expect(harness.pool.query(
      'UPDATE review_events SET immutable_asset_hashes = $2 WHERE id = $1',
      [eventId, []],
    )).rejects.toMatchObject({ code: '55000' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('accepts current-transaction audit evidence written inside a released savepoint', async () => {
    const harness = await openReviewHarness()
    const eventId = randomUUID()
    await withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'designer', 'ready', $5)`,
        [eventId, harness.campaign.id, harness.created.body.version.id, harness.designer.id, {
          figmaUrl: 'https://figma.com/design/file/review',
          checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
          readyActorId: harness.designer.id,
          contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query(
        "UPDATE campaigns SET status = 'ready', revision = revision + 1, updated_at = now() WHERE id = $1",
        [harness.campaign.id],
      )
      await client.query('SAVEPOINT review_audit')
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'designer', 'campaign.mark_ready', 'campaign', $3, 'in_review', 'ready', $4, $5)`,
        [randomUUID(), harness.designer.id, harness.campaign.id, harness.created.body.version.id, {
          reviewEventId: eventId, contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query('RELEASE SAVEPOINT review_audit')
      await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    })
    expect((await harness.pool.query(
      'SELECT status FROM campaigns WHERE id = $1', [harness.campaign.id],
    )).rows[0].status).toBe('ready')
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 017 extracts 016 JSON hashes into immutable database-owned facts', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(16) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'extract-016-version', input: {},
    })
    await createReviewService({ pool: harness.pool }).markReady({
      actor: harness.designer, versionId: created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'extract-016-ready', input: {
        figmaUrl: 'https://figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      },
    })
    await createReviewService({ pool: harness.pool }).approve({
      actor: harness.actor, versionId: created.body.version.id, expectedRevision: 5,
      idempotencyKey: 'extract-016-approve', input: {},
    })
    expect((await harness.pool.query(
      "SELECT bool_and(payload ? 'assetHashes') AS has_hashes FROM review_events WHERE event_type IN ('ready', 'approved')",
    )).rows[0].has_hashes).toBe(true)

    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: ['017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'] })
    const facts = (await harness.pool.query(
      `SELECT event_type, payload, immutable_asset_hashes
       FROM review_events WHERE event_type IN ('ready', 'approved') ORDER BY event_type`,
    )).rows
    expect(facts).toHaveLength(2)
    expect(facts.every((event) => !Object.hasOwn(event.payload, 'assetHashes'))).toBe(true)
    expect(facts[0].immutable_asset_hashes).toEqual(facts[1].immutable_asset_hashes)
    expect((await harness.pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE action = 'migration.review_asset_hash_fact_extracted'",
    )).rows[0].count).toBe(2)
    const review = await createReviewService({ pool: harness.pool }).getReview({
      actor: harness.actor, versionId: created.body.version.id,
    })
    expect(review.events.find((event) => event.eventType === 'approved').payload.assetHashes)
      .toEqual(facts[0].immutable_asset_hashes)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 016 preserves exact legacy review facts while enforcing new writes', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(15) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'legacy-review-version', input: {},
    })
    const readyId = randomUUID()
    await withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, 'designer', 'ready', $5, now() + interval '1 second')`,
        [readyId, harness.campaign.id, created.body.version.id, harness.designer.id, {
          figmaUrl: 'https://figma.com/design/file/review',
          checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
          readyActorId: harness.designer.id,
          contentHash: created.body.version.contentHash,
        }],
      )
      await client.query(
        `UPDATE campaigns SET status = 'ready', revision = revision + 1, updated_at = now()
         WHERE id = $1`,
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'designer', 'campaign.mark_ready', 'campaign', $3, 'in_review', 'ready', $4, $5)`,
        [randomUUID(), harness.designer.id, harness.campaign.id, created.body.version.id, {
          reviewEventId: readyId, contentHash: created.body.version.contentHash,
        }],
      )
    })
    const approvalId = randomUUID()
    await withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, 'marketer', 'approved', $5, now() + interval '2 seconds')`,
        [approvalId, harness.campaign.id, created.body.version.id, harness.actor.id, {
          contentHash: created.body.version.contentHash,
        }],
      )
      await client.query(
        `UPDATE campaigns SET status = 'approved', open_version_id = NULL,
           revision = revision + 1, updated_at = now() WHERE id = $1`,
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'marketer', 'campaign.approve', 'campaign', $3, 'ready', 'approved', $4, $5)`,
        [randomUUID(), harness.actor.id, harness.campaign.id, created.body.version.id, {
          reviewEventId: approvalId, contentHash: created.body.version.contentHash,
        }],
      )
    })

    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: ['016_review_integrity_hardening.sql', '017_review_fact_compatibility.sql', '018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'] })
    const review = await createReviewService({ pool: harness.pool }).getReview({
      actor: harness.actor, versionId: created.body.version.id,
    })
    expect(review).toMatchObject({ status: 'approved', events: [
      { eventType: 'sent' }, { eventType: 'ready' }, { eventType: 'approved' },
    ] })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 016 fails closed on a historical invalid Figma hostname admitted by migration 015', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(15) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await immutableVersionHarness()
    await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 2, input: harness.compositionInput,
    })
    const created = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 3,
      idempotencyKey: 'invalid-legacy-figma-version', input: {},
    })
    const readyId = randomUUID()
    await withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'designer', 'ready', $5)`,
        [readyId, harness.campaign.id, created.body.version.id, harness.designer.id, {
          figmaUrl: 'https://-bad.figma.com/design/file/review',
          checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
          readyActorId: harness.designer.id,
          contentHash: created.body.version.contentHash,
        }],
      )
      await client.query(
        "UPDATE campaigns SET status = 'ready', revision = revision + 1 WHERE id = $1",
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'designer', 'campaign.mark_ready', 'campaign', $3, 'in_review', 'ready', $4, $5)`,
        [randomUUID(), harness.designer.id, harness.campaign.id, created.body.version.id, {
          reviewEventId: readyId, contentHash: created.body.version.contentHash,
        }],
      )
    })

    await expect(runMigrations({ pool: harness.pool })).rejects.toMatchObject({ code: '23514' })
    expect((await harness.pool.query(
      "SELECT count(*)::int AS count FROM schema_migrations WHERE name = '016_review_integrity_hardening.sql'",
    )).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('persists ready and approval as exact idempotent event/audit/campaign transactions', async () => {
    const harness = await openReviewHarness()
    const readyCommand = {
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'ready-once', input: {
        figmaUrl: 'https://www.figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      },
    }
    const marked = await harness.reviewService.markReady(readyCommand)
    const replay = await harness.reviewService.markReady(readyCommand)

    expect(marked.body).toMatchObject({ campaign: { status: 'ready', revision: 5, openVersionId: harness.created.body.version.id }, reviewStatus: 'ready' })
    expect(replay).toEqual({ ...marked, replayed: true })
    await expect(harness.reviewService.requestChanges({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 5,
      idempotencyKey: 'ready-once', input: { comment: 'Different command.' },
    })).rejects.toMatchObject({ code: 'idempotency_conflict' })

    const approveCommand = {
      actor: harness.actor, versionId: harness.created.body.version.id, expectedRevision: 5,
      idempotencyKey: 'approve-once', input: {},
    }
    const approved = await harness.reviewService.approve(approveCommand)
    expect(approved.body).toMatchObject({ campaign: { status: 'approved', revision: 6, openVersionId: null }, reviewStatus: 'approved' })
    expect(await harness.reviewService.approve(approveCommand)).toEqual({ ...approved, replayed: true })
    const immutableAssetHashes = [...new Set(
      harness.created.body.version.snapshot.assets.map((asset) => asset.sha256),
    )].sort()
    expect((await harness.pool.query(
      `SELECT event_type, payload, immutable_asset_hashes
       FROM review_events WHERE version_id = $1 ORDER BY created_at, id`,
      [harness.created.body.version.id],
    )).rows).toEqual([
      expect.objectContaining({ event_type: 'sent' }),
      { event_type: 'ready', payload: {
        figmaUrl: readyCommand.input.figmaUrl,
        checklistAnswers: readyCommand.input.checklistAnswers,
        readyActorId: harness.designer.id,
        contentHash: harness.created.body.version.contentHash,
      }, immutable_asset_hashes: immutableAssetHashes },
      { event_type: 'approved', payload: {
        contentHash: harness.created.body.version.contentHash,
      }, immutable_asset_hashes: immutableAssetHashes },
    ])
    expect((await harness.pool.query(
      `SELECT count(*)::int AS count FROM audit_events
       WHERE version_id = $1 AND action IN ('campaign.mark_ready', 'campaign.approve')`,
      [harness.created.body.version.id],
    )).rows[0].count).toBe(2)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('uses persisted ready identity to prohibit approval after a role change', async () => {
    const harness = await openReviewHarness()
    await harness.reviewService.markReady({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'role-change-ready', input: {
        figmaUrl: 'https://figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      },
    })
    await harness.pool.query("UPDATE users SET role = 'marketer' WHERE id = $1", [harness.designer.id])
    await expect(harness.reviewService.approve({
      actor: { ...harness.designer, role: 'marketer' }, versionId: harness.created.body.version.id,
      expectedRevision: 5, idempotencyKey: 'role-change-approve', input: {},
    })).rejects.toMatchObject({ code: 'self_approval_forbidden', statusCode: 403 })
    expect((await harness.pool.query(
      "SELECT count(*)::int AS count FROM review_events WHERE version_id = $1 AND event_type = 'approved'",
      [harness.created.body.version.id],
    )).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('request changes, reopen, and brief edit preserve version history while staling every retained artifact', async () => {
    const harness = await openReviewHarness()
    await harness.reviewService.requestChanges({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'changes-round-one', input: { comment: 'Increase the headline contrast.' },
    })
    const reopened = await harness.reviewService.reopen({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 5,
      idempotencyKey: 'reopen-round-one', input: {},
    })
    expect(reopened.body.campaign).toMatchObject({ status: 'composed', revision: 6, openVersionId: null, currentVersionNumber: 1 })

    const workflow = createWorkflowService({ pool: harness.pool })
    const editedBrief = { ...harness.campaign.brief, objective: 'Purchase the course' }
    const edited = await workflow.patchCampaign({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 6, patch: { brief: editedBrief },
    })
    expect(edited).toMatchObject({
      status: 'draft', revision: 7, selectedCopyId: null, selectedDirectionId: null,
      compositionId: null, currentVersionNumber: 1, openVersionId: null,
    })
    expect((await harness.pool.query('SELECT bool_and(stale) AS stale FROM copy_sets WHERE campaign_id = $1', [harness.campaign.id])).rows[0].stale).toBe(true)
    expect((await harness.pool.query('SELECT bool_and(stale) AS stale FROM visual_directions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].stale).toBe(true)
    expect((await harness.pool.query('SELECT bool_and(stale) AS stale FROM compositions WHERE campaign_id = $1', [harness.campaign.id])).rows[0].stale).toBe(true)
    expect((await harness.pool.query('SELECT snapshot, content_hash FROM campaign_versions WHERE id = $1', [harness.created.body.version.id])).rows[0])
      .toEqual({ snapshot: harness.created.body.version.snapshot, content_hash: harness.created.body.version.contentHash })
    expect((await harness.pool.query('SELECT event_type FROM review_events WHERE version_id = $1 ORDER BY created_at, id', [harness.created.body.version.id])).rows)
      .toEqual([{ event_type: 'sent' }, { event_type: 'changes_requested' }])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('reopened composition edits create N+1 while version N remains immutable', async () => {
    const harness = await openReviewHarness()
    const firstVersion = structuredClone(harness.created.body.version)
    await harness.reviewService.requestChanges({
      actor: harness.designer, versionId: firstVersion.id, expectedRevision: 4,
      idempotencyKey: 'changes-before-v2', input: { comment: 'Change the call to action.' },
    })
    await harness.reviewService.reopen({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 5,
      idempotencyKey: 'reopen-before-v2', input: {},
    })
    const replacement = await harness.service.saveComposition({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 6,
      input: {
        ...harness.compositionInput,
        slotValues: { ...harness.compositionInput.slotValues, cta: 'Join today' },
      },
    })
    expect(replacement.campaign).toMatchObject({ status: 'composed', revision: 7 })
    const second = await harness.service.createVersion({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 7,
      idempotencyKey: 'version-two-after-review', input: {},
    })
    expect(second.body.version).toMatchObject({ versionNumber: 2 })
    expect(second.body.version.contentHash).not.toBe(firstVersion.contentHash)
    expect((await harness.pool.query('SELECT snapshot, content_hash FROM campaign_versions WHERE id = $1', [firstVersion.id])).rows[0])
      .toEqual({ snapshot: firstVersion.snapshot, content_hash: firstVersion.contentHash })
    expect((await harness.pool.query('SELECT stale FROM compositions WHERE id = $1', [firstVersion.snapshot.composition.id])).rows[0].stale).toBe(true)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('serializes racing approve and reject commands so exactly one review fact wins', async () => {
    const harness = await openReviewHarness()
    await harness.reviewService.markReady({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'race-ready', input: {
        figmaUrl: 'https://figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      },
    })
    const [approve, reject] = await Promise.allSettled([
      harness.reviewService.approve({
        actor: harness.actor, versionId: harness.created.body.version.id, expectedRevision: 5,
        idempotencyKey: 'race-approve', input: {},
      }),
      harness.reviewService.reject({
        actor: harness.actor, versionId: harness.created.body.version.id, expectedRevision: 5,
        idempotencyKey: 'race-reject', input: { comment: 'Not yet.' },
      }),
    ])
    expect([approve, reject].filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect([approve, reject].filter((outcome) => outcome.status === 'rejected')).toHaveLength(1)
    expect((await harness.pool.query(
      "SELECT count(*)::int AS count FROM review_events WHERE version_id = $1 AND event_type IN ('approved', 'rejected')",
      [harness.created.body.version.id],
    )).rows[0].count).toBe(1)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rolls back the event and campaign transition when the audit append fails', async () => {
    const harness = await openReviewHarness()
    const repositoryFactory = (client) => ({
      ...createReviewRepository(client),
      appendAudit: async () => { throw new Error('audit unavailable') },
    })
    const service = createReviewService({ pool: harness.pool, repositoryFactory })
    await expect(service.requestChanges({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'rollback-review', input: { comment: 'Increase contrast.' },
    })).rejects.toThrow('audit unavailable')

    expect((await harness.pool.query(
      'SELECT status, revision, open_version_id FROM campaigns WHERE id = $1', [harness.campaign.id],
    )).rows[0]).toEqual({ status: 'in_review', revision: 4, open_version_id: harness.created.body.version.id })
    expect((await harness.pool.query(
      'SELECT event_type FROM review_events WHERE version_id = $1 ORDER BY created_at, id',
      [harness.created.body.version.id],
    )).rows).toEqual([{ event_type: 'sent' }])
    expect((await harness.pool.query(
      "SELECT state FROM idempotency_records WHERE actor_id = $1 AND resource_id = $2 AND key = 'rollback-review'",
      [harness.designer.id, harness.created.body.version.id],
    )).rows).toEqual([{ state: 'failed' }])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('database requires append-only audit evidence for a review transition', async () => {
    const harness = await openReviewHarness()
    const error = await directSqlConstraintError(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'designer', 'changes_requested', $5)`,
        [randomUUID(), harness.campaign.id, harness.created.body.version.id, harness.designer.id, {
          comment: 'This event has no audit evidence.',
        }],
      )
      await client.query(
        `UPDATE campaigns
         SET status = 'changes_requested', open_version_id = NULL,
             revision = revision + 1, updated_at = now()
         WHERE id = $1`,
        [harness.campaign.id],
      )
    })
    expect(error).toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('a matching reopen audit from a prior transaction cannot authorize a bare reopen', async () => {
    const harness = await openReviewHarness()
    await harness.reviewService.requestChanges({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'prior-reopen-changes', input: { comment: 'Adjust the layout.' },
    })
    await createAuditRepository(harness.pool).append({
      id: randomUUID(), actorId: harness.actor.id, actorRole: harness.actor.role,
      action: 'campaign.reopened', entityType: 'campaign', entityId: harness.campaign.id,
      beforeStatus: 'changes_requested', afterStatus: 'composed',
      versionId: harness.created.body.version.id,
      payload: { versionNumber: harness.created.body.version.versionNumber },
    })
    const error = await directSqlConstraintError(harness.pool, async (client) => {
      await client.query(
        `UPDATE campaigns SET status = 'composed', revision = revision + 1, updated_at = now()
         WHERE id = $1`,
        [harness.campaign.id],
      )
    })
    expect(error).toMatchObject({ code: '23514' })
    const reopened = await harness.reviewService.reopen({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 5,
      idempotencyKey: 'current-reopen', input: {},
    })
    expect(reopened.body.campaign).toMatchObject({ status: 'composed', revision: 6 })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('a matching command audit from a prior transaction cannot authorize a later event and transition', async () => {
    const harness = await openReviewHarness()
    const eventId = randomUUID()
    await createAuditRepository(harness.pool).append({
      id: randomUUID(), actorId: harness.designer.id, actorRole: harness.designer.role,
      action: 'campaign.mark_ready', entityType: 'campaign', entityId: harness.campaign.id,
      beforeStatus: 'in_review', afterStatus: 'ready', versionId: harness.created.body.version.id,
      payload: { reviewEventId: eventId, contentHash: harness.created.body.version.contentHash },
    })
    const error = await directSqlConstraintError(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'designer', 'ready', $5)`,
        [eventId, harness.campaign.id, harness.created.body.version.id, harness.designer.id, {
          figmaUrl: 'https://figma.com/design/file/review',
          checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
          readyActorId: harness.designer.id,
          contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query(
        "UPDATE campaigns SET status = 'ready', revision = revision + 1, updated_at = now() WHERE id = $1",
        [harness.campaign.id],
      )
    })
    expect(error).toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('supports the complete ready, reject, and reopen path with one fact and audit per command', async () => {
    const harness = await openReviewHarness()
    await harness.reviewService.markReady({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'reject-path-ready', input: {
        figmaUrl: 'https://figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      },
    })
    const rejected = await harness.reviewService.reject({
      actor: harness.actor, versionId: harness.created.body.version.id, expectedRevision: 5,
      idempotencyKey: 'reject-path-reject', input: { comment: 'Correct the campaign offer.' },
    })
    expect(rejected.body.campaign).toMatchObject({ status: 'changes_requested', revision: 6, openVersionId: null })
    const reopened = await harness.reviewService.reopen({
      actor: harness.actor, campaignId: harness.campaign.id, expectedRevision: 6,
      idempotencyKey: 'reject-path-reopen', input: {},
    })
    expect(reopened.body.campaign).toMatchObject({ status: 'composed', revision: 7, openVersionId: null })
    expect((await harness.pool.query(
      'SELECT event_type FROM review_events WHERE version_id = $1 ORDER BY created_at, id',
      [harness.created.body.version.id],
    )).rows).toEqual([{ event_type: 'sent' }, { event_type: 'ready' }, { event_type: 'rejected' }])
    expect((await harness.pool.query(
      `SELECT action FROM audit_events WHERE version_id = $1
       AND action IN ('campaign.mark_ready', 'campaign.reject', 'campaign.reopened') ORDER BY action`,
      [harness.created.body.version.id],
    )).rows.map((row) => row.action)).toEqual([
      'campaign.mark_ready', 'campaign.reject', 'campaign.reopened',
    ])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('canonicalizes rolling old-app ready and approval writes to trusted immutable asset hashes', async () => {
    const harness = await openReviewHarness()
    const eventId = randomUUID()
    await withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'designer', 'ready', $5)`,
        [eventId, harness.campaign.id, harness.created.body.version.id, harness.designer.id, {
          figmaUrl: 'https://figma.com/design/file/review',
          checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
          readyActorId: harness.designer.id,
          contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query(
        `UPDATE campaigns SET status = 'ready', revision = revision + 1, updated_at = now()
         WHERE id = $1`,
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'designer', 'campaign.mark_ready', 'campaign', $3, 'in_review', 'ready', $4, $5)`,
        [randomUUID(), harness.designer.id, harness.campaign.id, harness.created.body.version.id, {
          reviewEventId: eventId, contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    })
    const expectedHashes = [...new Set(
      harness.created.body.version.snapshot.assets.map((asset) => asset.sha256),
    )].sort()
    expect((await harness.pool.query(
      'SELECT payload, immutable_asset_hashes FROM review_events WHERE id = $1', [eventId],
    )).rows[0]).toEqual({
      payload: {
        figmaUrl: 'https://figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
        readyActorId: harness.designer.id,
        contentHash: harness.created.body.version.contentHash,
      },
      immutable_asset_hashes: expectedHashes,
    })
    const approvalId = randomUUID()
    await withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'marketer', 'approved', $5)`,
        [approvalId, harness.campaign.id, harness.created.body.version.id, harness.actor.id, {
          contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query(
        `UPDATE campaigns SET status = 'approved', open_version_id = NULL,
           revision = revision + 1, updated_at = now() WHERE id = $1`,
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'marketer', 'campaign.approve', 'campaign', $3, 'ready', 'approved', $4, $5)`,
        [randomUUID(), harness.actor.id, harness.campaign.id, harness.created.body.version.id, {
          reviewEventId: approvalId, contentHash: harness.created.body.version.contentHash,
        }],
      )
      await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    })
    expect((await harness.pool.query(
      'SELECT payload, immutable_asset_hashes FROM review_events WHERE id = $1', [approvalId],
    )).rows[0]).toEqual({
      payload: { contentHash: harness.created.body.version.contentHash },
      immutable_asset_hashes: expectedHashes,
    })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('database rejects malformed review payloads, impossible sequences, and event mutation', async () => {
    const harness = await openReviewHarness()
    const versionId = harness.created.body.version.id
    await expect(harness.pool.query(
      `INSERT INTO review_events (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
       VALUES ('bad-ready-payload', $1, $2, $3, 'designer', 'ready', $4)`,
      [harness.campaign.id, versionId, harness.designer.id, { figmaUrl: 'https://evil.test', checklistAnswers: {} }],
    )).rejects.toMatchObject({ code: '23514' })
    await expect(harness.pool.query(
      `INSERT INTO review_events (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
       VALUES ('bad-approval-sequence', $1, $2, $3, 'marketer', 'approved', $4)`,
      [harness.campaign.id, versionId, harness.actor.id, { contentHash: harness.created.body.version.contentHash }],
    )).rejects.toMatchObject({ code: '23514' })
    await expect(harness.pool.query("UPDATE review_events SET payload = '{}' WHERE version_id = $1", [versionId]))
      .rejects.toMatchObject({ code: '55000' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('database perimeter locks the brief, selections, and composition while review is active', async () => {
    const harness = await openReviewHarness()
    const campaignId = harness.campaign.id
    const versionId = harness.created.body.version.id
    const attempts = [
      (client) => client.query(
        `UPDATE campaigns SET brief = jsonb_set(brief, '{objective}', '"bypassed"') WHERE id = $1`,
        [campaignId],
      ),
      (client) => client.query(
        'UPDATE campaigns SET selected_copy_id = NULL, selected_direction_id = NULL, composition_id = NULL WHERE id = $1',
        [campaignId],
      ),
      (client) => client.query(
        'UPDATE compositions SET stale = true WHERE id = (SELECT composition_id FROM campaigns WHERE id = $1)',
        [campaignId],
      ),
    ]
    for (const attempt of attempts) {
      expect(await directSqlConstraintError(harness.pool, attempt)).toMatchObject({ code: '23514' })
    }
    expect((await harness.pool.query(
      'SELECT brief, selected_copy_id, selected_direction_id, composition_id, open_version_id FROM campaigns WHERE id = $1',
      [campaignId],
    )).rows[0]).toMatchObject({
      brief: harness.campaign.brief,
      selected_copy_id: harness.created.body.campaign.selectedCopyId,
      selected_direction_id: harness.created.body.campaign.selectedDirectionId,
      composition_id: harness.created.body.campaign.compositionId,
      open_version_id: versionId,
    })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('database perimeter rejects a generic status escape without review event and audit evidence', async () => {
    const harness = await openReviewHarness()
    const error = await directSqlConstraintError(harness.pool, async (client) => {
      await client.query(
        `UPDATE campaigns
         SET status = 'composed', open_version_id = NULL, revision = revision + 1, updated_at = now()
         WHERE id = $1`,
        [harness.campaign.id],
      )
    })
    expect(error).toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('database rejects Unicode-whitespace-only review comments', async () => {
    const harness = await openReviewHarness()
    const eventId = `whitespace-${randomUUID()}`
    const error = await directSqlConstraintError(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'designer', 'changes_requested', $5)`,
        [eventId, harness.campaign.id, harness.created.body.version.id, harness.designer.id, { comment: '\u00a0\u2003' }],
      )
      await client.query(
        `UPDATE campaigns
         SET status = 'changes_requested', open_version_id = NULL, revision = revision + 1, updated_at = now()
         WHERE id = $1`,
        [harness.campaign.id],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'designer', 'campaign.request_changes', 'campaign', $3, 'in_review',
                 'changes_requested', $4, $5)`,
        [`audit-${eventId}`, harness.designer.id, harness.campaign.id, harness.created.body.version.id, {
          reviewEventId: eventId, contentHash: harness.created.body.version.contentHash,
        }],
      )
    })
    expect(error).toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test.each([
    'https://-bad.figma.com/design/file/review',
    'https://bad-.figma.com/design/file/review',
    `https://${'a'.repeat(64)}.figma.com/design/file/review`,
    'https://tést.figma.com/design/file/review',
  ])('database and request contract reject the same invalid Figma hostname: %s', async (figmaUrl) => {
    const harness = await openReviewHarness()
    const immutableAssetHashes = [...new Set(
      harness.created.body.version.snapshot.assets.map((asset) => asset.sha256),
    )].sort()
    const error = await directSqlConstraintError(harness.pool, (client) => client.query(
      `INSERT INTO review_events
         (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
       VALUES ($1, $2, $3, $4, 'designer', 'ready', $5)`,
      [randomUUID(), harness.campaign.id, harness.created.body.version.id, harness.designer.id, {
        figmaUrl,
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
        readyActorId: harness.designer.id,
        contentHash: harness.created.body.version.contentHash,
        assetHashes: immutableAssetHashes,
      }],
    ))
    expect(error).toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('database refuses sent for a new version while the current version is already approved', async () => {
    const harness = await openReviewHarness()
    await harness.reviewService.markReady({
      actor: harness.designer, versionId: harness.created.body.version.id, expectedRevision: 4,
      idempotencyKey: 'approved-current-ready', input: {
        figmaUrl: 'https://figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
      },
    })
    await harness.reviewService.approve({
      actor: harness.actor, versionId: harness.created.body.version.id, expectedRevision: 5,
      idempotencyKey: 'approved-current-approve', input: {},
    })
    const versionId = randomUUID()
    const pngId = randomUUID()
    const manifestId = randomUUID()
    const pngHash = 'd'.repeat(64)
    const manifestHash = 'e'.repeat(64)
    const sourceRefs = harness.created.body.version.snapshot.assets
      .filter((asset) => ['direction', 'final_image'].includes(asset.kind))
    const snapshot = {
      ...harness.created.body.version.snapshot,
      assets: [
        ...sourceRefs,
        { id: pngId, kind: 'review_png', sha256: pngHash },
        { id: manifestId, kind: 'manifest', sha256: manifestHash },
      ],
    }
    const contentHash = hashCanonical(snapshot)
    const error = await directSqlConstraintError(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO campaign_versions (id, campaign_id, version_number, snapshot, content_hash, created_by)
         VALUES ($1, $2, 2, $3, $4, $5)`,
        [versionId, harness.campaign.id, snapshot, contentHash, harness.actor.id],
      )
      for (const source of sourceRefs) {
        await client.query(
          `INSERT INTO campaign_version_source_assets
             (campaign_id, version_id, asset_id, asset_sha256)
           VALUES ($1, $2, $3, $4)`,
          [harness.campaign.id, versionId, source.id, source.sha256],
        )
      }
      await client.query(
        `INSERT INTO assets
           (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, version_id)
         VALUES
           ($1, $3, 'review_png', $4, 'image/png', 1, 1, 1, $5, 'render', $2),
           ($6, $3, 'manifest', $7, 'application/json', 1, NULL, NULL, $8, 'render', $2)`,
        [pngId, versionId, harness.campaign.id, `campaigns/${harness.campaign.id}/${pngId}.png`, pngHash,
          manifestId, `campaigns/${harness.campaign.id}/${manifestId}.json`, manifestHash],
      )
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'marketer', 'sent', $5)`,
        [randomUUID(), harness.campaign.id, versionId, harness.actor.id, {
          contentHash, assetHashes: [pngHash, manifestHash].sort(),
        }],
      )
    })
    expect(error).toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test.each([
    ['rolling old-app order', ['c'.repeat(64), 'b'.repeat(64)], false],
    ['missing', ['b'.repeat(64)], true],
    ['extra', ['b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)], true],
    ['arbitrary', ['d'.repeat(64), 'e'.repeat(64)], true],
  ])('database binds sent to the exact immutable review asset hash set: %s', async (_label, payloadHashes, shouldReject) => {
    const pool = makePool()
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    await pool.query("UPDATE campaigns SET status = 'composed', revision = 1 WHERE id = $1", [campaign.id])
    const versionId = randomUUID()
    const pngId = randomUUID()
    const manifestId = randomUUID()
    const hashes = ['b'.repeat(64), 'c'.repeat(64)]
    const snapshot = { assets: [
      { id: pngId, kind: 'review_png', sha256: hashes[0] },
      { id: manifestId, kind: 'manifest', sha256: hashes[1] },
    ] }
    const contentHash = hashCanonical(snapshot)
    const error = await directSqlConstraintError(pool, async (client) => {
      await client.query(
        `INSERT INTO campaign_versions (id, campaign_id, version_number, snapshot, content_hash, created_by)
         VALUES ($1, $2, 1, $3, $4, $5)`,
        [versionId, campaign.id, snapshot, contentHash, actorId],
      )
      await client.query(
        `INSERT INTO assets
           (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, version_id)
         VALUES
           ($1, $3, 'review_png', $4, 'image/png', 1, 1, 1, $5, 'render', $2),
           ($6, $3, 'manifest', $7, 'application/json', 1, NULL, NULL, $8, 'render', $2)`,
        [pngId, versionId, campaign.id, `campaigns/${campaign.id}/${pngId}.png`, hashes[0],
          manifestId, `campaigns/${campaign.id}/${manifestId}.json`, hashes[1]],
      )
      const eventId = randomUUID()
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $4, 'marketer', 'sent', $5)`,
        [eventId, campaign.id, versionId, actorId, { contentHash, assetHashes: payloadHashes }],
      )
      if (!shouldReject) {
        expect((await client.query('SELECT payload FROM review_events WHERE id = $1', [eventId])).rows[0]
          .payload.assetHashes).toEqual(hashes)
      }
      await client.query(
        `UPDATE campaigns SET status = 'in_review', current_version_number = 1,
           open_version_id = $2, revision = revision + 1, updated_at = now() WHERE id = $1`,
        [campaign.id, versionId],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload)
         VALUES ($1, $2, 'marketer', 'campaign.sent_for_review', 'campaign', $3, 'composed',
                 'in_review', $4, $5)`,
        [randomUUID(), actorId, campaign.id, versionId, { reviewEventId: eventId, versionNumber: 1, contentHash }],
      )
    })
    if (shouldReject) expect(error).toMatchObject({ code: '23514' })
    else expect(error).toBeNull()
    await pool.end()
    pools.delete(pool)
  })
})

describe('hash-verified approved deliveries', () => {
  test('runs the new service safely on migration 020 during a rolling upgrade', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(20) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await approvedDeliveryHarness()
    const delivered = await harness.deliveryService.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'rolling-pre-021', input: {},
    })
    expect(delivered.status).toBe(201)
    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: ['021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'] })
    expect((await harness.pool.query(
      `SELECT expected_sha256, expected_byte_size, expected_mime_type
       FROM orphaned_uploads`,
    )).rows).toEqual([])
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 019 fails closed on a preexisting duplicate legacy delivery audit', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(18) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await approvedDeliveryHarness()
    await harness.deliveryService.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'pre-019-delivery', input: {},
    })
    const audit = (await harness.pool.query(
      "SELECT * FROM audit_events WHERE version_id = $1 AND action = 'campaign.delivered'",
      [harness.created.body.version.id],
    )).rows[0]
    await harness.pool.query(
      `INSERT INTO audit_events
         (id, actor_id, actor_role, action, entity_type, entity_id, before_status,
          after_status, version_id, payload, created_at)
       VALUES ($1, $2, $3, 'campaign.deliver', 'campaign', $4, 'approved', 'delivered', $5, $6, $7)`,
      [randomUUID(), audit.actor_id, audit.actor_role, audit.entity_id,
        audit.version_id, audit.payload, audit.created_at],
    )

    await expect(createDeliveryService({ pool: harness.pool, assetStore: harness.assetStore }).getDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
    })).rejects.toMatchObject({ code: 'delivery_integrity_failure' })
    await expect(runMigrations({ pool: harness.pool })).rejects.toMatchObject({ code: '23514' })
    expect((await harness.pool.query(
      "SELECT count(*)::int AS count FROM schema_migrations WHERE name = '019_delivery_recovery_and_audit_integrity.sql'",
    )).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('migration 018 upgrades an exact legacy delivery and preserves rolling reads', async () => {
    await resetDatabase()
    const stagedPool = makePool()
    await runMigrations({ pool: stagedPool, directory: await migrationDirectoryThrough(17) })
    await stagedPool.end()
    pools.delete(stagedPool)

    const harness = await approvedDeliveryHarness()
    const version = harness.created.body.version
    const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex')
    const zipId = `legacy-zip-${randomUUID()}`
    const deliveryId = `legacy-delivery-${randomUUID()}`
    const eventId = `legacy-event-${randomUUID()}`
    const objectKey = `deliveries/${zipId}.zip`
    const approvedAt = Date.parse(harness.approved.body.event.createdAt)
    const createdAt = new Date(approvedAt + 1_000)
    await harness.assetStore.put({ objectKey, bytes: zipBytes, contentType: 'application/zip' })
    await withTransaction(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO assets
           (id, campaign_id, kind, object_key, mime_type, byte_size, sha256, source, created_at)
         VALUES ($1, $2, 'delivery_zip', $3, 'application/zip', $4, $5, 'delivery', $6)`,
        [zipId, harness.campaign.id, objectKey, zipBytes.length, zipSha256, createdAt],
      )
      await client.query(
        `INSERT INTO deliveries (id, campaign_id, version_id, asset_id, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deliveryId, harness.campaign.id, version.id, zipId, harness.actor.id, createdAt],
      )
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, 'marketer', 'delivered', $5, $6)`,
        [eventId, harness.campaign.id, version.id, harness.actor.id, {
          deliveryId, contentHash: version.contentHash, assetHashes: [zipSha256],
        }, createdAt],
      )
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status,
            version_id, payload, created_at)
         VALUES ($1, $2, 'marketer', 'campaign.deliver', 'campaign', $3, 'approved', 'delivered', $4, $5, $6)`,
        [randomUUID(), harness.actor.id, harness.campaign.id, version.id, { reviewEventId: eventId }, createdAt],
      )
      await client.query(
        `UPDATE campaigns SET status = 'delivered', revision = revision + 1, updated_at = $2 WHERE id = $1`,
        [harness.campaign.id, createdAt],
      )
      await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    })

    expect(await runMigrations({ pool: harness.pool })).toEqual({ applied: ['018_hash_verified_deliveries.sql', '019_delivery_recovery_and_audit_integrity.sql', '020_durable_generation_fenced_cleanup.sql', '021_cleanup_lock_and_upload_intent.sql', '022_unknown_upload_fence.sql', '023_copy_option_deletion.sql', '024_copy_approvals.sql', '025_visual_assets.sql', '026_visual_upload_provenance.sql', '027_banner_batches.sql', '028_banner_batch_source_provenance.sql'] })
    expect((await harness.pool.query(
      `SELECT delivery.content_hash, delivery.zip_sha256, delivery.byte_size::int AS byte_size,
              asset.version_id, event.payload, event.immutable_asset_hashes, audit.action, audit.payload AS audit_payload,
              delivery_state_is_valid(delivery.version_id, false) AS valid
       FROM deliveries delivery
       JOIN assets asset ON asset.id = delivery.asset_id
       JOIN review_events event ON event.version_id = delivery.version_id AND event.event_type = 'delivered'
       JOIN audit_events audit ON audit.version_id = delivery.version_id AND audit.action = 'campaign.delivered'
       WHERE delivery.id = $1`,
      [deliveryId],
    )).rows[0]).toEqual({
      content_hash: version.contentHash,
      zip_sha256: zipSha256,
      byte_size: zipBytes.length,
      version_id: version.id,
      payload: { deliveryId, contentHash: version.contentHash, assetHashes: [zipSha256] },
      immutable_asset_hashes: [zipSha256],
      action: 'campaign.delivered',
      audit_payload: {
        reviewEventId: eventId, deliveryId, contentHash: version.contentHash,
        zipAssetId: zipId, zipSha256, byteSize: zipBytes.length,
      },
      valid: true,
    })
    expect((await harness.pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE action = 'migration.delivery_fact_upgraded' AND version_id = $1",
      [version.id],
    )).rows[0].count).toBe(1)
    const reused = await createDeliveryService({ pool: harness.pool, assetStore: harness.assetStore }).createDelivery({
      actor: harness.actor, versionId: version.id, idempotencyKey: 'rolling-legacy-delivery', input: {},
    })
    expect(reused).toMatchObject({ status: 200, body: { delivery: { id: deliveryId } } })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM deliveries WHERE version_id = $1', [version.id])).rows[0].count).toBe(1)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('exports exact approved review bytes once and persists one delivery/event/audit/transition', async () => {
    const harness = await approvedDeliveryHarness()
    const command = {
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'approved-delivery-one', input: {},
    }
    const created = await harness.deliveryService.createDelivery(command)
    expect(created).toMatchObject({
      status: 201, replayed: false,
      body: { campaign: { status: 'delivered', revision: 7 }, reviewStatus: 'delivered' },
    })
    const assetRow = (await harness.pool.query('SELECT * FROM assets WHERE id = $1', [created.body.delivery.asset.id])).rows[0]
    const zipBytes = await harness.assetStore.get({ objectKey: assetRow.object_key })
    expect(zipBytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    expect(createHash('sha256').update(zipBytes).digest('hex')).toBe(created.body.delivery.asset.sha256)
    expect(zipBytes.length).toBe(created.body.delivery.byteSize)
    const approvedRows = (await harness.pool.query(
      `SELECT id, kind, object_key FROM assets
       WHERE version_id = $1 AND kind IN ('review_png', 'manifest') ORDER BY id`,
      [harness.created.body.version.id],
    )).rows
    const expectedPngBytes = await Promise.all(approvedRows.filter((row) => row.kind === 'review_png')
      .map((row) => harness.assetStore.get({ objectKey: row.object_key })))
    const expectedManifestBytes = await harness.assetStore.get({
      objectKey: approvedRows.find((row) => row.kind === 'manifest').object_key,
    })
    const entries = storedZipEntries(zipBytes)
    expect(entries.map((entry) => entry.filename)).toEqual([
      'banners/banner-001.png', 'delivery-manifest.json', 'render-manifest.json',
    ])
    expect(entries[0].bytes).toEqual(expectedPngBytes[0])
    expect(entries[2].bytes).toEqual(expectedManifestBytes)
    const packageManifestText = entries[1].bytes.toString('utf8')
    expect(JSON.stringify(JSON.parse(packageManifestText))).toBe(packageManifestText)
    expect(JSON.parse(packageManifestText)).toMatchObject({
      schemaVersion: 1,
      campaignId: harness.campaign.id,
      versionId: harness.created.body.version.id,
      contentHash: harness.created.body.version.contentHash,
      approval: { actorId: harness.actor.id },
      files: [
        { filename: 'banners/banner-001.png', assetId: approvedRows.find((row) => row.kind === 'review_png').id },
        { filename: 'render-manifest.json', assetId: approvedRows.find((row) => row.kind === 'manifest').id },
      ],
    })
    expect(packageManifestText).not.toContain('object_key')
    expect(packageManifestText).not.toContain('figma.com')
    expect(packageManifestText).not.toContain(String(harness.campaign.brief.objective))
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM deliveries WHERE version_id = $1', [harness.created.body.version.id])).rows[0].count).toBe(1)
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM review_events WHERE version_id = $1 AND event_type = 'delivered'", [harness.created.body.version.id])).rows[0].count).toBe(1)
    expect((await harness.pool.query("SELECT count(*)::int AS count FROM audit_events WHERE version_id = $1 AND action = 'campaign.delivered'", [harness.created.body.version.id])).rows[0].count).toBe(1)

    const replay = await harness.deliveryService.createDelivery(command)
    expect(replay).toEqual({ ...created, replayed: true })
    const secondKey = await harness.deliveryService.createDelivery({ ...command, idempotencyKey: 'approved-delivery-second-key' })
    expect(secondKey).toMatchObject({ status: 200, replayed: false, body: { delivery: { id: created.body.delivery.id } } })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM assets WHERE version_id = $1 AND kind = $2', [harness.created.body.version.id, 'delivery_zip'])).rows[0].count).toBe(1)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('racing idempotency keys converge on one immutable delivery', async () => {
    const harness = await approvedDeliveryHarness()
    const common = { actor: harness.actor, versionId: harness.created.body.version.id, input: {} }
    const results = await Promise.all([
      harness.deliveryService.createDelivery({ ...common, idempotencyKey: 'delivery-race-a' }),
      harness.deliveryService.createDelivery({ ...common, idempotencyKey: 'delivery-race-b' }),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([200, 201])
    expect(new Set(results.map((result) => result.body.delivery.id)).size).toBe(1)
    const facts = await harness.pool.query(
      `SELECT
         (SELECT count(*)::int FROM deliveries WHERE version_id = $1) AS deliveries,
         (SELECT count(*)::int FROM assets WHERE version_id = $1 AND kind = 'delivery_zip') AS zips,
         (SELECT count(*)::int FROM review_events WHERE version_id = $1 AND event_type = 'delivered') AS events,
         (SELECT count(*)::int FROM audit_events WHERE version_id = $1 AND action = 'campaign.delivered') AS audits`,
      [harness.created.body.version.id],
    )
    expect(facts.rows[0]).toEqual({ deliveries: 1, zips: 1, events: 1, audits: 1 })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('does not deadlock a second delivery key behind active-build orphan adoption', async () => {
    const harness = await approvedDeliveryHarness()
    const adoptionLocked = deferred()
    const releaseAdoption = deferred()
    let gateAdoption = true
    const repositoryFactory = (client) => {
      const repository = createDeliveryRepository(client)
      return {
        ...repository,
        async adoptBuildObject(input) {
          if (gateAdoption) {
            gateAdoption = false
            await client.query('SELECT id FROM delivery_builds WHERE id = $1 FOR UPDATE', [input.buildId])
            adoptionLocked.resolve()
            await releaseAdoption.promise
          }
          return repository.adoptBuildObject(input)
        },
      }
    }
    const firstService = createDeliveryService({
      pool: harness.pool, assetStore: harness.assetStore, repositoryFactory,
      timeoutMs: 5_000, recoveryTimeoutMs: 500,
    })
    const common = { actor: harness.actor, versionId: harness.created.body.version.id, input: {} }
    const first = firstService.createDelivery({ ...common, idempotencyKey: 'delivery-lock-cycle-a' })
    await adoptionLocked.promise
    const second = harness.deliveryService.createDelivery({ ...common, idempotencyKey: 'delivery-lock-cycle-b' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    releaseAdoption.resolve()

    const outcomes = await Promise.allSettled([first, second])
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([])
    const results = outcomes.map((outcome) => outcome.value)
    expect(results.map((result) => result.status).sort()).toEqual([200, 201])
    expect(new Set(results.map((result) => result.body.delivery.id)).size).toBe(1)
    expect((await harness.pool.query(
      `SELECT count(*)::int AS count FROM orphaned_uploads WHERE campaign_id = $1`,
      [harness.campaign.id],
    )).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test.each([
    ['exact duplicate', 'campaign.delivered', false],
    ['legacy alias duplicate', 'campaign.deliver', false],
    ['foreign delivery audit', 'campaign.delivered', true],
  ])('database rejects a second %s audit for one delivered version', async (_label, action, foreign) => {
    const harness = await approvedDeliveryHarness()
    const created = await harness.deliveryService.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: `audit-guard-${action}-${foreign}`, input: {},
    })
    const canonical = (await harness.pool.query(
      "SELECT * FROM audit_events WHERE version_id = $1 AND action = 'campaign.delivered'",
      [harness.created.body.version.id],
    )).rows[0]
    const error = await directSqlConstraintError(harness.pool, async (client) => {
      await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status,
            after_status, version_id, payload, created_at)
         VALUES ($1, $2, $3, $4, 'campaign', $5, 'approved', 'delivered', $6, $7, $8)`,
        [randomUUID(), canonical.actor_id, canonical.actor_role, action,
          foreign ? 'foreign-campaign' : canonical.entity_id,
          canonical.version_id, canonical.payload, canonical.created_at],
      )
    })
    expect(error).toMatchObject({ code: expect.stringMatching(/^23/) })
    expect((await harness.pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE version_id = $1 AND action IN ('campaign.delivered', 'campaign.deliver')",
      [created.body.delivery.versionId],
    )).rows[0].count).toBe(1)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects reuse of an approval idempotency key for the delivery command', async () => {
    const harness = await approvedDeliveryHarness()
    await expect(harness.deliveryService.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: harness.approvalKey, input: {},
    })).rejects.toMatchObject({ code: 'idempotency_conflict' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('serves the verified ZIP only to an authenticated exporter and rejects tampered download bytes', async () => {
    const harness = await approvedDeliveryHarness()
    const created = await harness.deliveryService.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'delivery-download', input: {},
    })
    const asset = (await harness.pool.query('SELECT object_key, byte_size FROM assets WHERE id = $1', [created.body.delivery.asset.id])).rows[0]
    const app = buildApp({
      resolveActor: async () => harness.actor,
      workflowService: {},
      assetService: createAssetService({ pool: harness.pool, assetStore: harness.assetStore }),
    })
    const downloaded = await app.inject({ method: 'GET', url: `/api/v1/assets/${created.body.delivery.asset.id}` })
    expect(downloaded.statusCode).toBe(200)
    expect(downloaded.headers['content-type']).toBe('application/zip')
    expect(downloaded.headers['content-disposition']).toMatch(/^attachment; filename="delivery-[a-f0-9]{16}[.]zip"$/)
    expect(createHash('sha256').update(downloaded.rawPayload).digest('hex')).toBe(created.body.delivery.asset.sha256)

    await harness.assetStore.delete({ objectKey: asset.object_key })
    await harness.assetStore.put({
      objectKey: asset.object_key, bytes: Buffer.alloc(Number(asset.byte_size), 0x78), contentType: 'application/zip',
    })
    const tampered = await app.inject({ method: 'GET', url: `/api/v1/assets/${created.body.delivery.asset.id}` })
    expect(tampered).toMatchObject({ statusCode: 502 })
    expect(tampered.json()).toMatchObject({ code: 'asset_integrity_failure' })
    await app.close()
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects an unapproved version without creating delivery facts', async () => {
    const unapproved = await openReviewHarness()
    const service = createDeliveryService({ pool: unapproved.pool, assetStore: unapproved.assetStore })
    await expect(service.createDelivery({
      actor: unapproved.actor, versionId: unapproved.created.body.version.id,
      idempotencyKey: 'unapproved-delivery', input: {},
    })).rejects.toMatchObject({ code: 'version_not_current' })
    expect((await unapproved.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await unapproved.pool.end()
    pools.delete(unapproved.pool)
  })

  test('rejects tampered approved bytes without creating delivery facts', async () => {
    const tampered = await approvedDeliveryHarness()
    const reviewAsset = (await tampered.pool.query(
      "SELECT object_key FROM assets WHERE version_id = $1 AND kind = 'review_png'",
      [tampered.created.body.version.id],
    )).rows[0]
    await tampered.assetStore.delete({ objectKey: reviewAsset.object_key })
    await tampered.assetStore.put({ objectKey: reviewAsset.object_key, bytes: Buffer.from('tampered'), contentType: 'image/png' })
    await expect(tampered.deliveryService.createDelivery({
      actor: tampered.actor, versionId: tampered.created.body.version.id,
      idempotencyKey: 'tampered-delivery', input: {},
    })).rejects.toMatchObject({ code: 'asset_integrity_failure' })
    expect((await tampered.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await tampered.pool.end()
    pools.delete(tampered.pool)
  })

  test('rejects a missing approved asset without creating delivery facts', async () => {
    const missing = await approvedDeliveryHarness()
    const reviewAsset = (await missing.pool.query(
      "SELECT object_key FROM assets WHERE version_id = $1 AND kind = 'review_png'",
      [missing.created.body.version.id],
    )).rows[0]
    await missing.assetStore.delete({ objectKey: reviewAsset.object_key })
    await expect(missing.deliveryService.createDelivery({
      actor: missing.actor, versionId: missing.created.body.version.id,
      idempotencyKey: 'missing-approved-asset', input: {},
    })).rejects.toMatchObject({ code: 'asset_bytes_missing' })
    expect((await missing.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await missing.pool.end()
    pools.delete(missing.pool)
  })

  test.each([
    ['foreign campaign', (asset) => ({ ...asset, campaignId: 'foreign-campaign' })],
    ['MIME', (asset) => asset.kind === 'review_png' ? { ...asset, mimeType: 'image/jpeg' } : asset],
    ['dimensions', (asset) => asset.kind === 'review_png' ? { ...asset, width: asset.width + 1 } : asset],
    ['hash metadata', (asset) => asset.kind === 'review_png' ? { ...asset, sha256: 'f'.repeat(64) } : asset],
  ])('rejects %s mismatch before reading or exporting approved assets', async (_label, mutate) => {
    const harness = await approvedDeliveryHarness()
    const createReadStream = vi.fn((input) => harness.assetStore.createReadStream(input))
    const observedStore = { ...harness.assetStore, createReadStream }
    const repositoryFactory = (client) => {
      const repository = createDeliveryRepository(client)
      return {
        ...repository,
        listReviewAssets: async (...args) => (await repository.listReviewAssets(...args)).map(mutate),
      }
    }
    const service = createDeliveryService({ pool: harness.pool, assetStore: observedStore, repositoryFactory })
    await expect(service.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: `metadata-mismatch-${_label.replaceAll(' ', '-')}`, input: {},
    })).rejects.toMatchObject({ code: _label === 'dimensions' ? 'asset_integrity_failure' : 'version_asset_mismatch' })
    if (_label === 'dimensions') expect(createReadStream).toHaveBeenCalled()
    else expect(createReadStream).not.toHaveBeenCalled()
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects a version that is no longer the campaign current version', async () => {
    const harness = await approvedDeliveryHarness()
    const repositoryFactory = (client) => {
      const repository = createDeliveryRepository(client)
      return {
        ...repository,
        lockCampaign: async (...args) => {
          const campaign = await repository.lockCampaign(...args)
          return { ...campaign, currentVersionNumber: campaign.currentVersionNumber + 1 }
        },
      }
    }
    const service = createDeliveryService({ pool: harness.pool, assetStore: harness.assetStore, repositoryFactory })
    await expect(service.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'historical-version', input: {},
    })).rejects.toMatchObject({ code: 'version_not_current' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('tracks a deterministic ZIP orphan and rolls back all facts when final persistence fails', async () => {
    const base = await approvedDeliveryHarness()
    const repositoryFactory = (client) => {
      const repository = createDeliveryRepository(client)
      return { ...repository, finalizeBuild: async (input) => { await repository.finalizeBuild(input); throw new Error('forced final failure') } }
    }
    const service = createDeliveryService({
      pool: base.pool, assetStore: base.assetStore, repositoryFactory,
      timeoutMs: 5_000, recoveryTimeoutMs: 500,
    })
    await expect(service.createDelivery({
      actor: base.actor, versionId: base.created.body.version.id,
      idempotencyKey: 'delivery-final-rollback', input: {},
    })).rejects.toThrow('forced final failure')
    expect((await base.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    expect((await base.pool.query("SELECT count(*)::int AS count FROM review_events WHERE event_type = 'delivered'")).rows[0].count).toBe(0)
    expect((await base.pool.query("SELECT count(*)::int AS count FROM audit_events WHERE action = 'campaign.delivered'")).rows[0].count).toBe(0)
    expect((await base.pool.query("SELECT status FROM campaigns WHERE id = $1", [base.campaign.id])).rows[0].status).toBe('approved')
    expect((await base.pool.query("SELECT count(*)::int AS count FROM orphaned_uploads WHERE reason = 'delivery_failed'")).rows[0].count).toBe(1)
    const objectKey = (await base.pool.query("SELECT plan->>'objectKey' AS object_key FROM delivery_builds")).rows[0].object_key
    const firstBytes = await base.assetStore.get({ objectKey })
    const legacyMetadataStore = {
      ...base.assetStore,
      async getMetadata(input) {
        const metadata = await base.assetStore.getMetadata(input)
        return metadata && { ...metadata, sha256: null }
      },
    }
    const recovered = await createDeliveryService({ pool: base.pool, assetStore: legacyMetadataStore }).createDelivery({
      actor: base.actor, versionId: base.created.body.version.id,
      idempotencyKey: 'delivery-final-rollback', input: {},
    })
    expect(recovered.status).toBe(201)
    expect(await base.assetStore.get({ objectKey })).toEqual(firstBytes)
    expect(recovered.body.delivery.asset.sha256).toBe(createHash('sha256').update(firstBytes).digest('hex'))
    expect((await base.pool.query('SELECT count(*)::int AS count FROM orphaned_uploads')).rows[0].count).toBe(0)
    await base.pool.end()
    pools.delete(base.pool)
  })

  test('re-adopts a cleaned delivery object with fresh identity and finalizes the replacement generation', async () => {
    const base = await approvedDeliveryHarness()
    const repositoryFactory = (client) => {
      const repository = createDeliveryRepository(client)
      return {
        ...repository,
        async finalizeBuild(input) {
          await repository.finalizeBuild(input)
          throw new Error('forced delivery final failure')
        },
      }
    }
    const command = {
      actor: base.actor, versionId: base.created.body.version.id,
      idempotencyKey: 'cleaned-delivery-retry', input: {},
    }
    await expect(createDeliveryService({
      pool: base.pool, assetStore: base.assetStore, repositoryFactory,
      timeoutMs: 5_000, recoveryTimeoutMs: 500,
    }).createDelivery(command)).rejects.toThrow('forced delivery final failure')
    const orphan = (await base.pool.query(
      `SELECT id, object_key, object_generation FROM orphaned_uploads
       WHERE campaign_id = $1`,
      [base.campaign.id],
    )).rows[0]
    expect(orphan.object_generation).toEqual(expect.any(String))
    await expect(createGenerationControlPlane({ pool: base.pool }).cleanupOrphanUpload({
      orphanId: orphan.id, deleteObject: (input) => base.assetStore.delete(input),
    })).resolves.toEqual({ kind: 'cleaned', objectKey: orphan.object_key })

    let beforeUpload
    let replacement
    const store = {
      ...base.assetStore,
      async putStream(input) {
        beforeUpload = (await base.pool.query(
          `SELECT status, object_generation, object_etag FROM orphaned_uploads WHERE object_key = $1`,
          [input.objectKey],
        )).rows[0]
        replacement = await base.assetStore.putStream(input)
        return replacement
      },
    }
    const delivered = await createDeliveryService({ pool: base.pool, assetStore: store }).createDelivery(command)
    expect(delivered.status).toBe(201)
    expect(beforeUpload).toEqual({ status: 'pending', object_generation: null, object_etag: null })
    expect(replacement.generation).not.toBe(orphan.object_generation)
    expect((await base.pool.query(
      `SELECT count(*)::int AS count FROM deliveries WHERE version_id = $1`,
      [base.created.body.version.id],
    )).rows[0].count).toBe(1)
    await base.pool.end()
    pools.delete(base.pool)
  })

  test('preserves a cleaned delivery object through failure recovery before fresh re-adoption and finalization', async () => {
    const base = await approvedDeliveryHarness()
    let oldIdentity
    let seeded = false
    const repositoryFactory = (client) => {
      const repository = createDeliveryRepository(client)
      return {
        ...repository,
        async adoptBuildObject(input) {
          if (seeded) return repository.adoptBuildObject(input)
          seeded = true
          const oldBytes = Buffer.from('obsolete delivery package')
          for (let generation = 0; generation < 2; generation += 1) {
            oldIdentity = await base.assetStore.put({
              objectKey: input.objectKey, bytes: oldBytes, contentType: 'application/zip',
            })
            await base.assetStore.delete({ objectKey: input.objectKey, generation: oldIdentity.generation })
          }
          await base.pool.query(
            `INSERT INTO orphaned_uploads
               (id, object_key, campaign_id, reason, status, cleaned_at,
                object_generation, object_etag, expected_sha256, expected_byte_size, expected_mime_type)
             VALUES ('cleaned-delivery-recovery-orphan', $1, $2, 'obsolete_cleanup', 'cleaned', now(),
                     $3, $4, $5, $6, 'application/zip')`,
            [input.objectKey, base.campaign.id, oldIdentity.generation, oldIdentity.etag,
              oldIdentity.sha256, oldIdentity.byteSize],
          )
          throw new Error('forced pre-adoption delivery failure')
        },
      }
    }
    const command = {
      actor: base.actor, versionId: base.created.body.version.id,
      idempotencyKey: 'cleaned-delivery-recovery', input: {},
    }
    await expect(createDeliveryService({
      pool: base.pool, assetStore: base.assetStore, repositoryFactory,
      timeoutMs: 5_000, recoveryTimeoutMs: 500,
    }).createDelivery(command)).rejects.toThrow('forced pre-adoption delivery failure')
    expect((await base.pool.query(
      `SELECT status, object_generation, object_etag, expected_sha256
       FROM orphaned_uploads WHERE id = 'cleaned-delivery-recovery-orphan'`,
    )).rows[0]).toEqual({
      status: 'cleaned', object_generation: oldIdentity.generation,
      object_etag: oldIdentity.etag, expected_sha256: oldIdentity.sha256,
    })

    let replacement
    const replacementStore = {
      ...base.assetStore,
      async putStream(input) {
        const claim = (await base.pool.query(
          `SELECT status, object_generation, object_etag, expected_sha256
           FROM orphaned_uploads WHERE object_key = $1`,
          [input.objectKey],
        )).rows[0]
        expect(claim).toMatchObject({ status: 'pending', object_generation: null, object_etag: null })
        expect(claim.expected_sha256).toMatch(/^[a-f0-9]{64}$/)
        replacement = await base.assetStore.putStream(input)
        return replacement
      },
    }
    const delivered = await createDeliveryService({ pool: base.pool, assetStore: replacementStore }).createDelivery(command)
    expect(delivered.status).toBe(201)
    expect(replacement.generation).not.toBe(oldIdentity.generation)
    expect((await base.pool.query(
      `SELECT count(*)::int AS count FROM deliveries WHERE version_id = $1`,
      [base.created.body.version.id],
    )).rows[0].count).toBe(1)
    expect((await base.pool.query(
      `SELECT count(*)::int AS count FROM orphaned_uploads WHERE campaign_id = $1`,
      [base.campaign.id],
    )).rows[0].count).toBe(0)
    await base.pool.end()
    pools.delete(base.pool)
  })

  test('binds a successful ZIP upload identity before a failing readback', async () => {
    const base = await approvedDeliveryHarness()
    let uploadedKey
    const store = {
      ...base.assetStore,
      async putStream(input) {
        const result = await base.assetStore.putStream(input)
        uploadedKey = input.objectKey
        return result
      },
      async createReadStream(input) {
        if (input.objectKey === uploadedKey) throw new Error('forced ZIP readback failure')
        return base.assetStore.createReadStream(input)
      },
    }
    const service = createDeliveryService({
      pool: base.pool, assetStore: store, timeoutMs: 5_000, recoveryTimeoutMs: 500,
    })
    await expect(service.createDelivery({
      actor: base.actor, versionId: base.created.body.version.id,
      idempotencyKey: 'identity-before-readback', input: {},
    })).rejects.toMatchObject({ code: 'asset_storage_unavailable' })
    expect((await base.pool.query(
      `SELECT object_generation, object_etag, expected_sha256, expected_byte_size, expected_mime_type
       FROM orphaned_uploads WHERE object_key = $1`,
      [uploadedKey],
    )).rows[0]).toMatchObject({
      object_generation: expect.any(String), object_etag: expect.any(String),
      expected_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      expected_byte_size: expect.any(String), expected_mime_type: 'application/zip',
    })
    await base.pool.end()
    pools.delete(base.pool)
  })

  test('fails closed when a deterministic recovery key contains changed bytes', async () => {
    const base = await approvedDeliveryHarness()
    const repositoryFactory = (client) => {
      const repository = createDeliveryRepository(client)
      return { ...repository, finalizeBuild: async (input) => { await repository.finalizeBuild(input); throw new Error('forced final failure') } }
    }
    const failedService = createDeliveryService({
      pool: base.pool, assetStore: base.assetStore, repositoryFactory,
      timeoutMs: 5_000, recoveryTimeoutMs: 500,
    })
    const command = {
      actor: base.actor, versionId: base.created.body.version.id,
      idempotencyKey: 'delivery-changed-orphan', input: {},
    }
    await expect(failedService.createDelivery(command)).rejects.toThrow('forced final failure')
    const objectKey = (await base.pool.query("SELECT plan->>'objectKey' AS object_key FROM delivery_builds")).rows[0].object_key
    const original = await base.assetStore.get({ objectKey })
    await base.assetStore.delete({ objectKey })
    await base.assetStore.put({ objectKey, bytes: Buffer.alloc(original.length, 0x78), contentType: 'application/zip' })
    await expect(createDeliveryService({ pool: base.pool, assetStore: base.assetStore }).createDelivery(command))
      .rejects.toMatchObject({ code: 'immutable_asset_conflict' })
    expect((await base.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    expect((await base.pool.query("SELECT status FROM campaigns WHERE id = $1", [base.campaign.id])).rows[0].status).toBe('approved')
    await base.pool.end()
    pools.delete(base.pool)
  })

  test('bounds a non-settling storage read and records recovery state', async () => {
    const harness = await approvedDeliveryHarness()
    const stalledStore = {
      ...harness.assetStore,
      createReadStream: vi.fn(async () => new PassThrough()),
    }
    const service = createDeliveryService({
      pool: harness.pool, assetStore: stalledStore,
      timeoutMs: 60, recoveryTimeoutMs: 250, leaseMs: 1_000,
    })
    const operation = service.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'delivery-stalled-storage', input: {},
    })
    const observed = await observeSettlementWithin(operation, 1_000).observed
    expect(observed).toMatchObject({ kind: 'rejected', error: { code: 'delivery_operation_timeout' } })
    expect((await harness.pool.query("SELECT state FROM delivery_builds WHERE version_id = $1", [harness.created.body.version.id])).rows[0].state).toBe('failed')
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('maps ZIP framing overhead beyond the configured ceiling to a bounded client error', async () => {
    const harness = await approvedDeliveryHarness()
    const sourceBytes = Number((await harness.pool.query(
      "SELECT sum(byte_size)::bigint AS total FROM assets WHERE version_id = $1 AND kind IN ('review_png', 'manifest')",
      [harness.created.body.version.id],
    )).rows[0].total)
    const service = createDeliveryService({
      pool: harness.pool, assetStore: harness.assetStore, maxArchiveBytes: sourceBytes + 1,
    })
    await expect(service.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'delivery-archive-overhead', input: {},
    })).rejects.toMatchObject({ statusCode: 413, code: 'delivery_too_large' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('rejects declared source bytes above the package ceiling before spool capacity admission', async () => {
    const harness = await approvedDeliveryHarness()
    const sourceBytes = Number((await harness.pool.query(
      "SELECT sum(byte_size)::bigint AS total FROM assets WHERE version_id = $1 AND kind IN ('review_png', 'manifest')",
      [harness.created.body.version.id],
    )).rows[0].total)
    const maxArchiveBytes = sourceBytes - 1
    const service = createDeliveryService({
      pool: harness.pool, assetStore: harness.assetStore,
      maxArchiveBytes, maxSpoolBytes: sourceBytes + maxArchiveBytes - 1,
    })
    await expect(service.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'delivery-source-declared-overflow', input: {},
    })).rejects.toMatchObject({ statusCode: 413, code: 'delivery_too_large' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('keeps valid package admission contention distinct from an oversized package', async () => {
    const harness = await approvedDeliveryHarness()
    const sourceBytes = Number((await harness.pool.query(
      "SELECT sum(byte_size)::bigint AS total FROM assets WHERE version_id = $1 AND kind IN ('review_png', 'manifest')",
      [harness.created.body.version.id],
    )).rows[0].total)
    const maxArchiveBytes = sourceBytes + 1024
    const service = createDeliveryService({
      pool: harness.pool, assetStore: harness.assetStore,
      maxArchiveBytes, maxSpoolBytes: sourceBytes + maxArchiveBytes - 1,
    })
    await expect(service.createDelivery({
      actor: harness.actor, versionId: harness.created.body.version.id,
      idempotencyKey: 'delivery-valid-capacity-contention', input: {},
    })).rejects.toMatchObject({ statusCode: 503, code: 'delivery_capacity_unavailable' })
    expect((await harness.pool.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count).toBe(0)
    await harness.pool.end()
    pools.delete(harness.pool)
  })

  test('database rejects null immutable hashes and bare delivery facts outside the exact transaction chain', async () => {
    const harness = await approvedDeliveryHarness()
    expect((await harness.pool.query(
      'SELECT immutable_review_hash_array_is_valid(ARRAY[NULL]::text[]) AS valid',
    )).rows[0].valid).toBe(false)
    const campaignKey = createHash('sha256').update(harness.campaign.id).digest('hex')
    const versionKey = createHash('sha256').update(harness.created.body.version.id).digest('hex')
    const objectKey = `campaigns/${campaignKey}/versions/${versionKey}/delivery/package.zip`
    await expect(harness.pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, sha256, source)
       VALUES ('bare-unbound-delivery-asset', $1, 'delivery_zip', $2, 'application/zip', 4, $3, 'delivery')`,
      [harness.campaign.id, objectKey, 'd'.repeat(64)],
    )).rejects.toMatchObject({ code: '23514' })
    await expect(harness.pool.query(
      `INSERT INTO assets
         (id, campaign_id, kind, object_key, mime_type, byte_size, sha256, source, version_id)
       VALUES ('bare-delivery-asset', $1, 'delivery_zip', $2, 'application/zip', 4, $3, 'delivery', $4)`,
      [harness.campaign.id, objectKey, 'd'.repeat(64), harness.created.body.version.id],
    )).rejects.toMatchObject({ code: '23514' })
    await harness.pool.end()
    pools.delete(harness.pool)
  })
})
