import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { expect, test } from 'vitest'
import { runMigrations } from '../db/migrate.js'
import { createCampaignRepository } from './campaignRepository.js'
import { createGenerationControlPlane } from './generationJobRepository.js'
import { createWorkspaceService } from '../services/workspaceService.js'
import { createGenerationService } from '../services/generationService.js'
import { createMockProvider } from '../providers/mockProvider.js'
import { createMemoryAssetStore } from '../storage/memoryAssetStore.js'

test('visual methods preserve copy linkage, append batches and fence duplicate images', async () => {
  const schema = `visuals_test_${randomUUID().replaceAll('-', '')}`
  const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
  const maintenance = new Pool({ connectionString })
  await maintenance.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
  try {
    await runMigrations({ pool })
    await pool.query('UPDATE settings SET per_step_regeneration_limit = 100, daily_budget_microunits = 10000000')
    const actor = { id: 'visual-marketer', role: 'marketer' }
    await pool.query("INSERT INTO users (id,email,role,display_name) VALUES ($1,'visuals@example.test','marketer','Visual test')", [actor.id])
    await createCampaignRepository(pool).create({ id: 'campaign', title: 'Autumn launch', createdBy: actor.id,
      brief: { product: 'Headphones', audience: 'Commuters', objective: 'Shop', offer: '', locale: 'en', notes: '' } })
    const control = createGenerationControlPlane({ pool })
    const service = createGenerationService({ pool, controlPlane: control, assetStore: createMemoryAssetStore(), providers: { mock: createMockProvider() } })
    const read = () => createWorkspaceService({ pool }).getWorkspace({ actor, campaignId: 'campaign' })
    const directions = (input, key) => service.generateDirections({ actor, campaignId: 'campaign', idempotencyKey: key, input })
    await expect(directions({ mode: 'campaign' }, 'too-early')).rejects.toMatchObject({ code: 'visual_input_required' })
    await service.analyseBrief({ actor, campaignId: 'campaign', idempotencyKey: 'analysis', input: {} })
    await service.generateCopy({ actor, campaignId: 'campaign', idempotencyKey: 'copy', input: {} })
    let workspace = await read()
    const [first, second] = workspace.copies[0].candidates
    await directions({ mode: 'campaign' }, 'campaign-1')
    workspace = await read()
    expect(workspace.directions).toHaveLength(3)
    expect(workspace.directions.every(item => item.scope === 'campaign' && item.copy === null && item.previewAssetId === null)).toBe(true)
    const snapshot = (await pool.query("SELECT input_snapshot FROM generation_jobs WHERE idempotency_key='campaign-1'")).rows[0].input_snapshot
    expect(snapshot.copies).toHaveLength(5)
    await expect(directions({ mode: 'selected_copy', copyIds: [first.id] }, 'not-approved')).rejects.toMatchObject({ code: 'copy_not_approved' })
    await service.approveCopy({ actor, campaignId: 'campaign', input: { copyId: first.id }, expectedRevision: (await read()).campaign.revision })
    await service.approveCopy({ actor, campaignId: 'campaign', input: { copyId: second.id }, expectedRevision: (await read()).campaign.revision })
    await directions({ mode: 'selected_copy', copyIds: [second.id, first.id] }, 'selected-1')
    await directions({ mode: 'selected_copy', copyIds: [second.id, first.id] }, 'selected-1')
    workspace = await read()
    expect(workspace.directions).toHaveLength(5)
    const linked = workspace.directions.filter(item => item.scope === 'selected_copy')
    expect(linked.map(item => item.copy.id)).toEqual([second.id, first.id])
    expect(linked[0].prompt).toContain(second.headline)
    const imageInput = { directionId: linked[0].id, width: 64, height: 64 }
    const now = new Date()
    await control.prepareGeneration({ actor, campaignId: 'campaign', step: 'image', input: imageInput,
      idempotencyKey: 'image-1', jobId: 'image-job', ownerToken: 'owner', maxCostMicrounits: 250000,
      startedAt: now, timeoutAt: new Date(now.getTime() + 30000) })
    await expect(service.generateImage({ actor, campaignId: 'campaign', input: imageInput, idempotencyKey: 'duplicate-image' })).rejects.toMatchObject({ code: 'visual_generation_pending' })
    await service.generateImage({ actor, campaignId: 'campaign', input: imageInput, idempotencyKey: 'image-1' })
    workspace = await read()
    expect(workspace.directions.find(item => item.id === linked[0].id)).toMatchObject({ status: 'ready', generation: { status: 'succeeded' } })
    await service.selectDirection({ actor, campaignId: 'campaign', expectedRevision: (await read()).campaign.revision, input: { directionId: linked[0].id } })
    workspace = await read()
    expect(workspace.copies.find(set => set.id === workspace.campaign.selectedCopyId).selectedCandidateId).toBe(second.id)
    expect(workspace.directions.every(item => !item.stale)).toBe(true)
    await expect(service.generateImage({ actor, campaignId: 'campaign', input: imageInput, idempotencyKey: 'overwrite' })).rejects.toMatchObject({ code: 'visual_already_ready' })
    await directions({ mode: 'campaign' }, 'campaign-2')
    expect((await read()).directions).toHaveLength(8)
  } finally {
    await pool.end()
    await maintenance.query(`DROP SCHEMA ${schema} CASCADE`)
    await maintenance.end()
  }
}, 30000)
