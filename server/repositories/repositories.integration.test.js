import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Pool } from 'pg'
import { runMigrations } from '../db/migrate.js'
import { withTransaction } from '../db/pool.js'
import { createCampaignRepository, RevisionConflictError } from './campaignRepository.js'
import { createSettingsRepository } from './settingsRepository.js'
import { createTemplateRepository } from './templateRepository.js'
import { createUserRepository } from './userRepository.js'
import { createAuditRepository } from './auditRepository.js'
import { createIdempotencyRepository } from './idempotencyRepository.js'
import { createWorkflowService } from '../services/workflowService.js'
import { buildApp } from '../app.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
const pools = new Set()
const temporaryDirectories = new Set()

function makePool() {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 })
  pools.add(pool)
  return pool
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
    expect(tracked.rows).toHaveLength(3)
    expect(tracked.rows.map((row) => row.name)).toEqual(['001_core.sql', '002_harden_persistence.sql', '003_retryable_idempotency.sql'])
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

    expect(await runMigrations({ pool })).toEqual({ applied: ['002_harden_persistence.sql', '003_retryable_idempotency.sql'] })
    expect(await runMigrations({ pool })).toEqual({ applied: [] })

    const tracked = await pool.query('SELECT name, checksum FROM schema_migrations ORDER BY name')
    expect(tracked.rows.map((row) => row.name)).toEqual(['001_core.sql', '002_harden_persistence.sql', '003_retryable_idempotency.sql'])
    expect(tracked.rows[0].checksum).toBe('ec612d4f294390b992f06f4b75d93f21e95a1e2333bb243417bc5ea0fe0fdb3d')
    expect((await createSettingsRepository(pool).get()).dailyBudgetMicrounits).toBe(5_000_000)
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
    const actorId = await insertUser(pool)
    const campaign = await insertCampaign(pool, actorId)
    const version = await insertVersion(pool, campaign.id, actorId)
    await pool.query(
      `INSERT INTO assets (id, campaign_id, kind, object_key, mime_type, byte_size, sha256, source)
       VALUES ($1, $2, 'delivery_zip', $3, 'application/zip', 42, $4, 'delivery')`,
      ['zip-asset-1', campaign.id, 'deliveries/one.zip', 'b'.repeat(64)],
    )
    await pool.query(
      `INSERT INTO assets (id, campaign_id, kind, object_key, mime_type, byte_size, sha256, source)
       VALUES ($1, $2, 'delivery_zip', $3, 'application/zip', 43, $4, 'delivery')`,
      ['zip-asset-2', campaign.id, 'deliveries/two.zip', 'c'.repeat(64)],
    )
    await pool.query(
      'INSERT INTO deliveries (id, campaign_id, version_id, asset_id, created_by) VALUES ($1, $2, $3, $4, $5)',
      ['delivery-1', campaign.id, version.id, 'zip-asset-1', actorId],
    )

    await expect(pool.query(
      'INSERT INTO deliveries (id, campaign_id, version_id, asset_id, created_by) VALUES ($1, $2, $3, $4, $5)',
      ['delivery-2', campaign.id, version.id, 'zip-asset-2', actorId],
    )).rejects.toMatchObject({ code: '23505' })
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
      const version = await insertVersion(pool, campaignId, actorId)
      await pool.query(
        `INSERT INTO review_events (id, campaign_id, version_id, actor_id, actor_role, event_type, payload)
         VALUES ('immutable-review', $1, $2, $3, 'marketer', 'sent', '{}')`,
        [campaignId, version.id, actorId],
      )
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
    const values = [actorId, 'POST', 'campaign-1', 'retry-key', 'f'.repeat(64), 'owner-1']
    await pool.query(
      `INSERT INTO idempotency_records (actor_id, method, resource_id, key, fingerprint, owner_token)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      values,
    )
    await expect(pool.query(
      `INSERT INTO idempotency_records (actor_id, method, resource_id, key, fingerprint, owner_token)
       VALUES ($1, $2, $3, $4, $5, $6)`,
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
