import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { expect, test } from 'vitest'
import { runMigrations } from '../db/migrate.js'
import { createCampaignRepository } from './campaignRepository.js'
import { createGenerationControlPlane } from './generationJobRepository.js'
import { createWorkspaceService } from '../services/workspaceService.js'
import { createGenerationService } from '../services/generationService.js'
import { createMockProvider } from '../providers/mockProvider.js'

test('copy batches append, retain independent approvals, and reserve at most 30 visible slots', async () => {
  const schema = `copy_options_test_${randomUUID().replaceAll('-', '')}`
  const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
  const maintenance = new Pool({ connectionString })
  await maintenance.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
  try {
    await runMigrations({ pool })
    await pool.query('UPDATE settings SET per_step_regeneration_limit = 100, daily_budget_microunits = 1000000')
    const actor = { id: 'copy-marketer', role: 'marketer' }
    await pool.query("INSERT INTO users (id,email,role,display_name) VALUES ($1,'copy-options@example.test','marketer','Copy test')", [actor.id])
    await createCampaignRepository(pool).create({ id: 'campaign', title: 'Copy test', createdBy: actor.id,
      brief: { product: 'Studio', audience: 'Designers', objective: 'Trial', offer: '', locale: 'en', notes: '' } })
    const control = createGenerationControlPlane({ pool })
    const service = createGenerationService({ pool, controlPlane: control, providers: { mock: createMockProvider() } })
    const reader = createWorkspaceService({ pool })
    const read = () => reader.getWorkspace({ actor, campaignId: 'campaign' })
    const options = workspace => workspace.copies.flatMap(set => set.candidates)
    const generate = key => service.generateCopy({ actor, campaignId: 'campaign', idempotencyKey: key, input: {} })
    await service.analyseBrief({ actor, campaignId: 'campaign', idempotencyKey: 'analysis', input: {} })
    await generate('batch-1')
    let workspace = await read()
    const first = options(workspace)
    expect(first).toHaveLength(5)
    await service.approveCopy({ actor, campaignId: 'campaign', expectedRevision: (await read()).campaign.revision, input: { copyId: first[0].id } })
    await service.approveCopy({ actor, campaignId: 'campaign', expectedRevision: (await read()).campaign.revision, input: { copyId: first[1].id } })
    workspace = await read()
    expect(workspace.copies[0].approvedCandidateIds).toEqual([first[0].id, first[1].id])
    expect(workspace.copies[0].selectedCandidateId).toBe(first[0].id)
    await expect(service.approveCopy({ actor: { ...actor, role: 'designer' }, campaignId: 'campaign', expectedRevision: 2, input: { copyId: first[2].id } })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(service.approveCopy({ actor, campaignId: 'campaign', expectedRevision: 0, input: { copyId: first[2].id } })).rejects.toMatchObject({ code: 'revision_conflict' })
    for (let batch = 2; batch <= 6; batch++) await generate(`batch-${batch}`)
    workspace = await read()
    expect(options(workspace)).toHaveLength(30)
    expect(options(workspace).slice(0, 5)).toEqual(first)
    expect(new Set(options(workspace).map(copy => copy.headline)).size).toBe(30)
    expect(workspace.copies[0].approvedCandidateIds).toEqual([first[0].id, first[1].id])
    await expect(generate('over-limit')).rejects.toMatchObject({ code: 'copy_limit_reached' })
    await generate('batch-6')
    expect(options(await read())).toHaveLength(30)
    expect((await pool.query("SELECT count(*)::int AS count FROM generation_jobs WHERE step = 'copy'")).rows[0].count).toBe(6)
    await service.deleteCopy({ actor, campaignId: 'campaign', expectedRevision: (await read()).campaign.revision, input: { copyId: first[1].id } })
    workspace = await read()
    expect(options(workspace)).toHaveLength(29)
    expect(workspace.copies[0].approvedCandidateIds).toEqual([first[0].id])
    await expect(service.approveCopy({ actor, campaignId: 'campaign', expectedRevision: (await read()).campaign.revision, input: { copyId: first[1].id } })).rejects.toMatchObject({ code: 'copy_not_found' })
    const startedAt = new Date()
    const reserved = await control.prepareGeneration({ actor, campaignId: 'campaign', step: 'copy', input: {},
      idempotencyKey: 'last-slot', jobId: 'reserved-job', ownerToken: 'owner', maxCostMicrounits: 3000,
      startedAt, timeoutAt: new Date(startedAt.getTime() + 30000) })
    expect(reserved.context.copySlots).toBe(1)
    await expect(generate('concurrent-over-limit')).rejects.toMatchObject({ code: 'copy_limit_reached' })
    await generate('last-slot')
    workspace = await read()
    expect(options(workspace)).toHaveLength(30)
    expect(options(workspace).some(copy => copy.id === first[1].id)).toBe(false)
    expect(workspace.copies.at(-1).candidates).toHaveLength(1)
    expect(workspace.copies[0].selectedCandidateId).toBe(first[0].id)
    // Removing the selected copy must not silently choose a replacement.
    const replacement = options(workspace)[1].id
    await service.approveCopy({ actor, campaignId: 'campaign', expectedRevision: (await read()).campaign.revision, input: { copyId: replacement } })
    await service.deleteCopy({ actor, campaignId: 'campaign', expectedRevision: (await read()).campaign.revision, input: { copyId: first[0].id } })
    expect((await read()).campaign.selectedCopyId).toBeNull()
    await service.approveCopy({ actor, campaignId: 'campaign', expectedRevision: (await read()).campaign.revision, input: { copyId: replacement } })
    workspace = await read()
    expect(workspace.campaign.selectedCopyId).toBe(workspace.copies[0].id)
    expect(workspace.copies[0].selectedCandidateId).toBe(replacement)
    expect(workspace.copies[0].approvedCandidateIds).toEqual([replacement])
    const uncertain = createGenerationService({ pool, controlPlane: control, providers: { mock: {
      ...createMockProvider(), generateCopy: async () => { throw new Error('Transport response lost') },
    } } })
    const unknown = await uncertain.generateCopy({ actor, campaignId: 'campaign', idempotencyKey: 'unknown-last-slot', input: {} })
    expect(unknown.body.job.status).toBe('unknown')
    await expect(generate('after-unknown')).rejects.toMatchObject({ code: 'copy_limit_reached' })
    expect(options(await read())).toHaveLength(29)
  } finally {
    await pool.end()
    await maintenance.query(`DROP SCHEMA ${schema} CASCADE`)
    await maintenance.end()
  }
}, 30000)
