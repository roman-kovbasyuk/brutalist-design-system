import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { runMigrations } from '../db/migrate.js'
import { createCampaignRepository } from '../repositories/campaignRepository.js'
import { createGenerationControlPlane } from '../repositories/generationJobRepository.js'
import { createGenerationService } from './generationService.js'
import { createVisualUploadService } from './visualUploadService.js'
import { createWorkspaceService } from './workspaceService.js'
import { createAssetService } from './assetService.js'
import { createMockProvider } from '../providers/mockProvider.js'
import { createMemoryAssetStore } from '../storage/memoryAssetStore.js'

test.each([`${'x'.repeat(180)}.png`, `${'x'.repeat(159)} trailing.png`, `${'x'.repeat(159)}🎨.png`])('uploads persist private images and replay safely with filename case %#', async name => {
  const schema = `visual_upload_test_${randomUUID().replaceAll('-', '')}`
  const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
  const maintenance = new Pool({ connectionString })
  await maintenance.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
  try {
    await runMigrations({ pool })
    await pool.query('UPDATE settings SET daily_budget_microunits = 10000000, per_step_regeneration_limit = 20')
    const actor = { id: 'uploader', role: 'marketer' }
    await pool.query("INSERT INTO users (id,email,role,display_name) VALUES ($1,'upload@example.test','marketer','Uploader')", [actor.id])
    await createCampaignRepository(pool).create({ id: 'campaign', title: 'Campaign', createdBy: actor.id,
      brief: { product: 'Headphones', audience: 'Commuters', objective: 'Shop', offer: '', locale: 'en', notes: '' } })
    const assetStore = createMemoryAssetStore()
    const generation = createGenerationService({ pool, assetStore, controlPlane: createGenerationControlPlane({ pool }), providers: { mock: createMockProvider() } })
    const service = createVisualUploadService({ pool, assetStore })
    const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#79d9ff' } }).png().toBuffer()
    const input = { target: { mode: 'campaign' }, name, mimeType: 'image/png', data: bytes.toString('base64') }
    let initialRevision = 0
    const upload = (patch = {}) => service.uploadVisual({ actor, campaignId: 'campaign', expectedRevision: initialRevision, idempotencyKey: 'upload-1', input, ...patch })
    await expect(upload()).rejects.toMatchObject({ code: 'visual_input_required' })
    await generation.analyseBrief({ actor, campaignId: 'campaign', input: {}, idempotencyKey: 'brief' })
    initialRevision = 1
    await generation.generateCopy({ actor, campaignId: 'campaign', input: {}, idempotencyKey: 'copy' })
    await expect(upload({ actor: { ...actor, role: 'designer' } })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(upload({ input: { ...input, data: Buffer.from('<svg/>').toString('base64') } })).rejects.toMatchObject({ code: 'invalid_image' })
    await expect(upload({ expectedRevision: 9 })).rejects.toMatchObject({ code: 'revision_conflict' })
    const saved = await upload()
    expect(await upload()).toEqual(saved)
    await expect(upload({ input: { ...input, name: 'changed.png' } })).rejects.toMatchObject({ code: 'idempotency_conflict' })
    const workspace = await createWorkspaceService({ pool }).getWorkspace({ actor, campaignId: 'campaign' })
    expect(workspace.campaign.revision).toBe(2)
    expect(workspace.directions).toHaveLength(1)
    expect(workspace.directions[0].title.length).toBeLessThanOrEqual(160)
    expect(workspace.directions[0].prompt).toBe('')
    const storedDirection = (await pool.query('SELECT title, upload_provenance FROM visual_directions WHERE id=$1', [saved.directionId])).rows[0]
    expect(storedDirection.title).toBe(workspace.directions[0].title)
    expect(storedDirection.upload_provenance.direction.title).toBe(workspace.directions[0].title)
    expect(workspace.directions[0]).toMatchObject({ id: saved.directionId, previewAssetId: saved.assetId, source: 'upload', scope: 'campaign', status: 'ready' })
    const asset = await createAssetService({ pool, assetStore }).readAsset({ actor, assetId: saved.assetId })
    expect(asset.bytes).toEqual(bytes)
    expect(asset).toMatchObject({ width: 64, height: 48, mimeType: 'image/png' })
    const replacement = await upload({ expectedRevision: 2, idempotencyKey: 'replace', input: { ...input, target: { directionId: saved.directionId } } })
    expect(replacement.directionId).toBe(saved.directionId)
    expect(replacement.assetId).not.toBe(saved.assetId)
    expect((await createAssetService({ pool, assetStore }).readAsset({ actor, assetId: saved.assetId })).bytes).toEqual(bytes)
    const copy = workspace.copies[0].candidates[0]
    await generation.approveCopy({ actor, campaignId: 'campaign', expectedRevision: 3, input: { copyId: copy.id } })
    const linked = await upload({ expectedRevision: 4, idempotencyKey: 'linked', input: { ...input, target: { mode: 'selected_copy', copyId: copy.id } } })
    const final = await createWorkspaceService({ pool }).getWorkspace({ actor, campaignId: 'campaign' })
    expect(final.directions.find(item => item.id === linked.directionId).copy.id).toBe(copy.id)
    expect(final.directions.every(item => !item.stale)).toBe(true)
    expect(final.jobs.filter(job => ['directions', 'image'].includes(job.step))).toHaveLength(0)
  } finally {
    await pool.end()
    await maintenance.query(`DROP SCHEMA ${schema} CASCADE`)
    await maintenance.end()
  }
}, 30000)
