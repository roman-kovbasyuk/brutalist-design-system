import { describe, expect, test, vi } from 'vitest'
import { createCampaignRuntime } from '../../campaignRuntime.js'
import { makeScenario } from '../../testing/workspaceFixtures.js'
import { createReviewCommands } from './reviewCommands.js'

function setup(name = 'in-review') {
  const scenario = makeScenario(name)
  const api = {
    getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)),
    getReview: vi.fn(async () => structuredClone(scenario.reviewHistory)),
    createVersion: vi.fn(async () => ({})), review: vi.fn(async () => ({})), reopen: vi.fn(async () => ({})),
  }
  const runtime = createCampaignRuntime({ ...scenario, api })
  return { ...scenario, api, runtime, actions: createReviewCommands(runtime) }
}

describe('Review commands', () => {
  test('creates a version from the composed campaign revision with an idempotency key', async () => {
    const { actions, api, runtime, workspace } = setup('composed')
    expect(await actions.createVersion()).toEqual({ ok: true })
    expect(api.createVersion).toHaveBeenCalledWith('campaign-1', {}, workspace.campaign.revision, expect.any(String))
    runtime.dispose()
  })

  test('creates a new version after requested changes were reopened without reusing the old version', async () => {
    const scenario = makeScenario('changes-requested')
    scenario.workspace.campaign.status = 'composed'
    scenario.workspace.campaign.revision += 1
    const api = { getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)), getReview: vi.fn(), createVersion: vi.fn(async () => ({})) }
    const runtime = createCampaignRuntime({ ...scenario, reviewHistory: null, api })
    const actions = createReviewCommands(runtime)
    expect(await actions.createVersion()).toEqual({ ok: true })
    expect(api.createVersion).toHaveBeenCalledWith('campaign-1', {}, scenario.workspace.campaign.revision, expect.any(String))
    runtime.dispose()
  })

  test('uses the exact current version and revision for each phase-specific review action', async () => {
    const designer = setup()
    designer.actor.role = 'designer'
    designer.actor.id = 'designer-2'
    designer.runtime.dispose()
    const scenario = makeScenario('in-review')
    scenario.actor = { ...scenario.actor, id: 'designer-2', role: 'designer' }
    const api = { getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)), getReview: vi.fn(async () => structuredClone(scenario.reviewHistory)), review: vi.fn(async () => ({})) }
    const runtime = createCampaignRuntime({ ...scenario, api })
    const actions = createReviewCommands(runtime)
    const answers = { copyAccuracy: true, layoutQuality: true, exportReadiness: true }
    expect(await actions.markReady({ figmaUrl: 'https://www.figma.com/design/exact/review', checklistAnswers: answers })).toEqual({ ok: true })
    expect(api.review).toHaveBeenCalledWith('version-1', 'mark-ready', { figmaUrl: 'https://www.figma.com/design/exact/review', checklistAnswers: answers }, scenario.workspace.campaign.revision, expect.any(String))
    runtime.dispose()
  })

  test('rejects a command whose requested action does not match the current phase', async () => {
    const { actions, api, runtime } = setup('ready')
    expect(await actions.markReady({ figmaUrl: 'https://www.figma.com/design/x/y', checklistAnswers: {} })).toMatchObject({ ok: false, code: 'review_phase_changed' })
    expect(api.review).not.toHaveBeenCalled()
    runtime.dispose()
  })

  test('does not send incomplete ready evidence or blank feedback', async () => {
    const scenario = makeScenario('in-review')
    scenario.actor = { ...scenario.actor, id: 'designer-2', role: 'designer' }
    const api = { getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)), getReview: vi.fn(async () => structuredClone(scenario.reviewHistory)), review: vi.fn(async () => ({})) }
    const runtime = createCampaignRuntime({ ...scenario, api })
    const actions = createReviewCommands(runtime)
    expect(await actions.markReady({ figmaUrl: '', checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: false } })).toMatchObject({ ok: false, code: 'invalid_review_evidence' })
    expect(await actions.requestChanges('   ')).toMatchObject({ ok: false, code: 'feedback_required' })
    expect(api.review).not.toHaveBeenCalled()
    runtime.dispose()
  })

  test('rejects missing or mismatched current version history rather than guessing an ID', async () => {
    const scenario = makeScenario('ready')
    scenario.reviewHistory.version.id = 'another-version'
    const api = { getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)), getReview: vi.fn(async () => structuredClone(scenario.reviewHistory)), review: vi.fn(async () => ({})) }
    const runtime = createCampaignRuntime({ ...scenario, api })
    const actions = createReviewCommands(runtime)
    expect(await actions.approve()).toMatchObject({ ok: false })
    expect(api.review).not.toHaveBeenCalled()
    runtime.dispose()
  })

  test('reopens only a closed changes-requested version with the fresh campaign revision', async () => {
    const { actions, api, runtime, workspace } = setup('changes-requested')
    expect(await actions.reopen()).toEqual({ ok: true })
    expect(api.reopen).toHaveBeenCalledWith('campaign-1', workspace.campaign.revision, expect.any(String))
    runtime.dispose()
  })
})
