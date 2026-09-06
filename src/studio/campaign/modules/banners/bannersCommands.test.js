import { expect, it, vi } from 'vitest'
import { createCampaignRuntime } from '../../campaignRuntime.js'
import { createWorkflowCoordinator } from '../../workflowCoordinator.js'
import { makeScenario } from '../../testing/workspaceFixtures.js'
import { createBannersCommands } from './bannersCommands.js'

const batchFor = template => ({ designs: [{ templateId: template.id, templateVersion: template.version, copySetId: 'copy-set-1', copyId: 'copy-1', directionId: 'direction-1' }], ratioIds: ['square'] })
it('returns actionable server layout details without making an invalid save uncertain', async () => {
  const scenario = makeScenario('visuals-ready')
  const details = [{ designIndex: 0, templateId: 'editorial-split', ratioId: 'square', slotId: 'headline', message: 'Headline does not fit.' }]
  const api = { saveBannerBatch: vi.fn().mockRejectedValue(Object.assign(new Error('Choose shorter copy or another design.'), { status: 400, code: 'invalid_composition', details })) }
  const runtime = createCampaignRuntime({ ...scenario, api })
  const result = await createBannersCommands(runtime).saveBatch(batchFor(scenario.templates[0]))
  expect(result).toMatchObject({ ok: false, code: 'invalid_composition', details })
  expect(runtime.getSnapshot('banners').operation.kind).toBe('failed')
  runtime.dispose()
})
it('protects batch saves with the captured Banners input key', async () => {
  const scenario = makeScenario('visuals-ready')
  const api = { saveBannerBatch: vi.fn() }
  const runtime = createCampaignRuntime({ ...scenario, api })
  const result = await createBannersCommands(runtime).saveBatch(batchFor(scenario.templates[0]), { expectedInputKey: 'stale' })
  expect(result.code).toBe('source_changed')
  expect(api.saveBannerBatch).not.toHaveBeenCalled()
  runtime.dispose()
})
it('uses the newly saved revision when the coordinator prepares the batch for review', async () => {
  const scenario = makeScenario('visuals-ready')
  const batch = batchFor(scenario.templates[0])
  const saved = makeScenario('composed').workspace
  saved.composition.designs = batch.designs.map(design => ({ ...design, id: 'batch-design-1', slotValues: saved.composition.slotValues }))
  const api = { saveBannerBatch: vi.fn().mockResolvedValue({ composition: saved.composition, campaign: saved.campaign }),
    getWorkspace: vi.fn().mockResolvedValue(saved), createVersion: vi.fn().mockResolvedValue({}) }
  const runtime = createCampaignRuntime({ ...scenario, api })
  const { actions } = createWorkflowCoordinator({ runtime })
  const receipt = await actions.banners.saveBatch(batch)
  expect(receipt.ok).toBe(true)
  expect(receipt.reviewInputKey).toBe(runtime.getSnapshot('review').inputKey)
  expect((await actions.banners.prepareReview({ expectedInputKey: receipt.reviewInputKey })).ok).toBe(true)
  expect(api.createVersion).toHaveBeenCalledWith('campaign-1', {}, saved.campaign.revision, expect.any(String))
  runtime.dispose()
})
it('rejects review preparation when the confirmed saved batch was replaced before retry', async () => {
  const scenario = makeScenario('visuals-ready')
  const saved = makeScenario('composed').workspace
  const api = { saveBannerBatch: vi.fn().mockResolvedValue({ composition: saved.composition, campaign: saved.campaign }),
    getWorkspace: vi.fn().mockResolvedValue(saved), createVersion: vi.fn() }
  const runtime = createCampaignRuntime({ ...scenario, api })
  const { actions } = createWorkflowCoordinator({ runtime })
  const receipt = await actions.banners.saveBatch(batchFor(scenario.templates[0]))
  api.getWorkspace.mockResolvedValue({ ...saved, campaign: { ...saved.campaign, revision: saved.campaign.revision + 1 },
    composition: { ...saved.composition, ratioIds: ['story'] } })
  await runtime.refresh()
  const result = await actions.banners.prepareReview({ expectedInputKey: receipt.reviewInputKey })
  expect(result.code).toBe('source_changed')
  expect(api.createVersion).not.toHaveBeenCalled()
  runtime.dispose()
})
