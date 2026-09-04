import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { Pool } from 'pg'
import { runMigrations } from '../db/migrate.js'
import { createCampaignRepository, RevisionConflictError } from './campaignRepository.js'
import { createSettingsRepository } from './settingsRepository.js'
import { createTemplateRepository } from './templateRepository.js'
import { createUserRepository } from './userRepository.js'
import { createAuditRepository } from './auditRepository.js'
import { createIdempotencyRepository } from './idempotencyRepository.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
const pools = new Set()

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
    expect(tracked.rows).toHaveLength(1)
    expect(tracked.rows[0].name).toBe('001_core.sql')
    expect(tracked.rows[0].checksum).toMatch(/^[a-f0-9]{64}$/)
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

    await createCampaignRepository(pool).setOpenVersion({ campaignId: campaign.id, versionId: version.id })
    expect((await createCampaignRepository(pool).findById(campaign.id)).openVersionId).toBe(version.id)
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
})

describe('idempotency coordination', () => {
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
})
