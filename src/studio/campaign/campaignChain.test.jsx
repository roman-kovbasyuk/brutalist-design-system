import { expect, it, vi } from 'vitest'
import { createCampaignRuntime } from './campaignRuntime.js'
import { createWorkflowCoordinator } from './workflowCoordinator.js'
import { makeScenario } from './testing/workspaceFixtures.js'

// In-memory API boundary: exercises the actual coordinator/runtime/factories.
// Backend permission/hash enforcement has its own service tests; this writes no DB.
it('connects all six modules, a feedback round, and exact-version delivery', async () => {
  let state = makeScenario('draft')
  let round = 1
  const transition = name => {
    const revision = state.workspace.campaign.revision + 1
    state = makeScenario(name)
    state.workspace.campaign.revision = revision
    const version = state.workspace.versions[0]
    if (version && round === 2) {
      version.id = 'version-2'; version.versionNumber = 2
      state.workspace.campaign.currentVersionNumber = 2
      if (state.workspace.campaign.openVersionId) state.workspace.campaign.openVersionId = version.id
      state.reviewHistory.events.forEach(event => { event.versionId = version.id })
      if (state.workspace.delivery) state.workspace.delivery.versionId = version.id
    }
  }
  const mutation = (revision, name) => {
    expect(revision).toBe(state.workspace.campaign.revision)
    transition(name)
  }
  const api = {
    getWorkspace: vi.fn(async () => state.workspace), getReview: vi.fn(async () => state.reviewHistory),
    generate: vi.fn(async (id, step, input) => {
      if (step === 'brief' || step === 'copy') transition('copy-ready')
      if (step === 'directions') {
        expect(input).toEqual({ mode: 'campaign' })
        const directions = Array.from({ length: 3 }, (_, index) => ({
          id: `generated-${index}`, title: `Campaign idea ${index + 1}`, prompt: 'Quiet daylight',
          status: 'pending', previewAssetId: null, stale: false, scope: 'campaign', batchId: 'job-directions',
        }))
        state.workspace.directions.push(...directions)
        return { job: { id: 'job-directions', status: 'succeeded', result: { directions } } }
      }
      if (step === 'image') {
        const direction = state.workspace.directions.find(item => item.id === input.directionId)
        direction.status = 'ready'; direction.previewAssetId = `asset-${direction.id}`
      }
      return { job: { id: `job-${step}`, status: 'succeeded' } }
    }),
    selectCopy: vi.fn(async (id, input, revision) => mutation(revision, 'visuals-ready')),
    selectDirection: vi.fn(async (id, input, revision) => mutation(revision, 'visuals-ready')),
    saveComposition: vi.fn(async (id, input, revision) => mutation(revision, 'composed')),
    createVersion: vi.fn(async (id, input, revision) => mutation(revision, 'in-review')),
    review: vi.fn(async (versionId, action, input, revision) => {
      expect(versionId).toBe(state.workspace.versions[0].id)
      mutation(revision, { 'request-changes': 'changes-requested', 'mark-ready': 'ready', approve: 'approved' }[action])
    }),
    reopen: vi.fn(async (id, revision) => { round++; mutation(revision, 'visuals-ready') }),
    deliver: vi.fn(async versionId => { expect(versionId).toBe('version-2'); transition('delivered') }),
    getDelivery: vi.fn(async () => state.workspace.delivery),
    getAssetBlob: vi.fn(async () => new Blob(['zip'])),
  }
  const runtimes = []
  const connect = role => {
    const runtime = createCampaignRuntime({ ...state, actor: { ...state.actor, id: `${role}-1`, role }, api })
    runtimes.push(runtime)
    return createWorkflowCoordinator({ runtime }).actions
  }
  const editor = connect('marketer')
  expect((await editor.brief.submit()).ok).toBe(true)
  expect((await editor.copy.select('copy-1')).ok).toBe(true)
  expect((await editor.visuals.generate('campaign')).ok).toBe(true)
  expect(api.generate.mock.calls.filter(call => call[1] === 'image')).toHaveLength(3)
  expect((await editor.visuals.select('generated-0')).ok).toBe(true)
  expect((await editor.banners.save(makeScenario('composed').workspace.composition)).ok).toBe(true)
  expect((await editor.distribute.build()).ok).toBe(false)
  expect(api.deliver).not.toHaveBeenCalled()
  expect((await editor.review.createVersion()).ok).toBe(true)
  expect((await editor.review.approve()).ok).toBe(false)
  const designer = connect('designer')
  expect((await designer.review.requestChanges('Update the headline')).ok).toBe(true)
  const nextEditor = connect('marketer')
  expect((await nextEditor.review.reopen()).ok).toBe(true)
  expect((await nextEditor.banners.save(makeScenario('composed').workspace.composition)).ok).toBe(true)
  expect((await nextEditor.review.createVersion()).ok).toBe(true)
  const nextDesigner = connect('designer')
  expect((await nextDesigner.review.markReady({ figmaUrl: 'https://www.figma.com/design/fixture/review',
    checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true } })).ok).toBe(true)
  expect((await nextDesigner.review.approve()).ok).toBe(false)
  const approver = connect('marketer')
  expect((await approver.review.approve()).ok).toBe(true)
  expect((await approver.distribute.build()).ok).toBe(true)
  expect(await approver.distribute.download()).toBeInstanceOf(Blob)
  expect(api.getDelivery).toHaveBeenCalledWith('version-2', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  runtimes.forEach(runtime => runtime.dispose())
})
