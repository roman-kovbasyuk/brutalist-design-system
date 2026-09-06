import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { expect, test } from 'vitest'
import { runMigrations } from '../db/migrate.js'
import { createCampaignRepository } from '../repositories/campaignRepository.js'
import { createGenerationControlPlane } from '../repositories/generationJobRepository.js'
import { createGenerationService } from './generationService.js'
import { createWorkflowService } from './workflowService.js'
import { createWorkspaceService } from './workspaceService.js'
import { createMockProvider } from '../providers/mockProvider.js'
import { createMemoryAssetStore } from '../storage/memoryAssetStore.js'

test('structured brief persists, supports overrides and refinement, and prepares prompts without copy or images', async () => {
  const schema = `brief_test_${randomUUID().replaceAll('-', '')}`
  const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
  const maintenance = new Pool({ connectionString })
  await maintenance.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
  try {
    await runMigrations({ pool })
    await pool.query('UPDATE settings SET per_step_regeneration_limit = 100, daily_budget_microunits = 10000000')
    const actor = { id: 'brief-editor', role: 'marketer' }
    await pool.query("INSERT INTO users (id,email,role,display_name) VALUES ($1,'brief@example.test','marketer','Brief test')", [actor.id])
    const campaigns = createCampaignRepository(pool)
    await campaigns.create({ id: 'campaign', title: 'Pasted notes', createdBy: actor.id,
      brief: { product: 'Headphones', audience: 'Commuters', objective: 'Shop', offer: '', locale: 'en', notes: 'Launch headphones on Instagram.' } })
    const provider = createMockProvider()
    const instructions = []
    let analysisGate = null, analysisStarted = () => {}
    const service = createGenerationService({ pool, controlPlane: createGenerationControlPlane({ pool }), assetStore: createMemoryAssetStore(), providers: { mock: {
      ...provider, analyseBrief: async (input, signal) => { instructions.push(input); analysisStarted(); if (analysisGate) await analysisGate; return provider.analyseBrief(input, signal) },
    } } })
    const request = { actor, campaignId: 'campaign' }
    await service.analyseBrief({ ...request, idempotencyKey: 'initial', input: {} })
    let campaign = await campaigns.findById('campaign')
    expect(campaign.brief.analysis).toMatchObject({ title: 'Headphones', audience: 'Commuters', objective: 'Shop', channels: ['Instagram'] })
    expect(campaign.title).toBe('Headphones')
    expect(campaign.revision).toBe(1)
    // Hydrate old records only when their historical analysis matches the source.
    await pool.query("UPDATE campaigns SET brief = brief - 'analysis' WHERE id = 'campaign'")
    const read = () => createWorkspaceService({ pool }).getWorkspace(request)
    expect((await read()).campaign.brief.analysis.title).toBe('Headphones')
    await pool.query("UPDATE campaigns SET brief = jsonb_set(brief, '{notes}', '\"Changed legacy source\"') WHERE id = 'campaign'")
    expect((await read()).campaign.brief.analysis).toBeNull()
    await pool.query("UPDATE campaigns SET brief = $1 WHERE id = 'campaign'", [campaign.brief])
    await service.generateDirections({ ...request, idempotencyKey: 'prompts', input: { mode: 'campaign' } })
    expect((await pool.query('SELECT status, preview_asset_id FROM visual_directions')).rows).toEqual(Array.from({ length: 3 }, () => ({ status: 'pending', preview_asset_id: null })))
    const workflow = createWorkflowService({ pool })
    await workflow.patchCampaign({ ...request, expectedRevision: campaign.revision,
      patch: { title: 'My campaign', brief: { ...campaign.brief, analysis: { ...campaign.brief.analysis, audience: 'Designers', summary: 'A launch for designers.' } } } })
    await Promise.all([1, 2].map(() => service.generateCopy({ ...request, idempotencyKey: 'copy', input: {} })))
    expect((await pool.query("SELECT count(*)::int AS n FROM generation_jobs WHERE step='copy'")).rows[0].n).toBe(1)
    const snapshot = (await pool.query("SELECT input_snapshot FROM generation_jobs WHERE idempotency_key='copy'")).rows[0].input_snapshot
    expect(snapshot.analysis).toMatchObject({ audience: 'Designers', summary: 'A launch for designers.' })
    await service.analyseBrief({ ...request, idempotencyKey: 'refine', input: { instruction: 'Emphasize the quiet design.' } })
    expect(instructions[1]).toMatchObject({ instruction: 'Emphasize the quiet design.', brief: { analysis: { audience: 'Designers' } } })
    campaign = await campaigns.findById('campaign')
    expect(campaign.title).toBe('My campaign')
    expect((await pool.query('SELECT stale FROM copy_sets')).rows).toEqual([{ stale: true }])
    expect((await pool.query('SELECT count(*)::int AS n FROM assets')).rows[0].n).toBe(0)
    expect((await pool.query("SELECT count(*)::int AS n FROM generation_jobs WHERE step='image'")).rows[0].n).toBe(0)
    // Replaying analysis cannot overwrite a later manual name or repeat writes.
    await service.analyseBrief({ ...request, idempotencyKey: 'initial', input: {} })
    expect((await campaigns.findById('campaign')).revision).toBe(campaign.revision)
    await expect(service.analyseBrief({ ...request, idempotencyKey: 'old-editor', input: { expectedRevision: 0, instruction: 'Old editor input' } })).rejects.toMatchObject({ code: 'revision_conflict' })
    // A newer inline edit wins over a slow AI response; the paid job still settles.
    let release
    analysisGate = new Promise(resolve => { release = resolve })
    const started = new Promise(resolve => { analysisStarted = resolve })
    const pending = service.analyseBrief({ ...request, idempotencyKey: 'slow', input: { instruction: 'A late refinement' } })
    await started
    await workflow.patchCampaign({ ...request, expectedRevision: campaign.revision,
      patch: { brief: { ...campaign.brief, analysis: { ...campaign.brief.analysis, summary: 'The newer human edit.' } } } })
    release()
    expect((await pending).body.job).toMatchObject({ status: 'failed', errorCode: 'brief_source_changed' })
    campaign = await campaigns.findById('campaign')
    expect(campaign.brief.analysis.summary).toBe('The newer human edit.')
    await workflow.patchCampaign({ ...request, expectedRevision: campaign.revision,
      patch: { brief: { ...campaign.brief, notes: 'A different product launch.' } } })
    expect((await campaigns.findById('campaign')).brief.analysis).toBeNull()
    await expect(service.generateCopy({ ...request, idempotencyKey: 'stale-source', input: {} })).rejects.toMatchObject({ code: 'brief_analysis_stale' })
  } finally {
    await pool.end()
    await maintenance.query(`DROP SCHEMA ${schema} CASCADE`)
    await maintenance.end()
  }
}, 30000)
