import { describe, expect, test } from 'vitest'
import { makeScenario } from './testing/workspaceFixtures.js'
import { deriveWorkflowState } from './workflowState.js'

function state(name, change = () => {}) {
  const scenario = makeScenario(name)
  change(scenario)
  return deriveWorkflowState(scenario.workspace, scenario.actor, scenario.reviewHistory)
}

describe('six-module progress and permissions', () => {
  test.each([['draft', 'brief'], ['copy-ready', 'copy'], ['visuals-ready', 'banners'],
    ['composed', 'review'], ['in-review', 'review'], ['changes-requested', 'review'],
    ['ready', 'review'], ['approved', 'distribute'], ['delivered', 'distribute']])(
    '%s resolves from domain state to %s', (scenario, expected) => {
      expect(state(scenario).currentModule).toBe(expected)
    },
  )
  test('copy selection enables Visuals before an image exists', () => {
    const result = state('copy-ready', ({ workspace }) => {
      workspace.campaign.selectedCopyId = 'copy-set-1'
      workspace.copies[0].selectedCandidateId = 'copy-1'
    })
    expect(result.currentModule).toBe('visuals')
    expect(result.modules.visuals.canEdit).toBe(true)
    expect(result.modules.banners.canVisit).toBe(false)
  })
  test('stale composition never unlocks creating a review version', () => {
    const result = state('composed', ({ workspace }) => { workspace.composition.stale = true })
    expect(result.currentModule).toBe('banners')
    expect(result.modules.review.canEdit).toBe(false)
  })
  test('a deleted candidate is not considered a selected copy', () => {
    const result = state('visuals-ready', ({ workspace }) => {
      workspace.copies[0].candidates = []
    })
    expect(result.modules.visuals.canEdit).toBe(true) // Campaign prompts need the brief, not a selected copy.
    expect(result.modules.banners.canEdit).toBe(false)
  })
  test('designer can inspect but not edit creation modules', () => {
    const result = state('in-review', scenario => { scenario.actor = { id: 'designer-1', role: 'designer' } })
    expect(result.modules.brief.canVisit).toBe(true)
    expect(result.modules.brief.canEdit).toBe(false)
    expect(result.modules.review.canEdit).toBe(true)
    expect(result.reviewPhase).toBe('in_review')
  })
  test('marketer cannot perform the designer review', () => {
    expect(state('in-review').modules.review.canEdit).toBe(false)
    expect(state('ready').modules.review.canEdit).toBe(true)
  })
  test('an editor can reopen the closed version after changes are requested', () => {
    const result = state('changes-requested')
    expect(result.modules.review.canEdit).toBe(true)
    expect(result.reviewPhase).toBe('changes_requested')
  })
  test('same actor cannot mark ready and approve even after a role change', () => {
    const result = state('ready', scenario => { scenario.actor.id = 'designer-1' })
    expect(result.modules.review.canEdit).toBe(false)
    expect(result.modules.review.reason).toMatch(/different/i)
  })
  test('missing or wrong-version review history prevents approval', () => {
    expect(state('ready', scenario => { scenario.reviewHistory = null }).modules.review.canEdit).toBe(false)
    expect(state('ready', scenario => { scenario.reviewHistory.version = { ...scenario.reviewHistory.version, id: 'other' } }).modules.review.canEdit).toBe(false)
  })
  test.each(['pending', 'unknown'])('%s jobs block writes, not reading prior modules', status => {
    const result = state('composed', ({ workspace }) => { workspace.jobs[0].status = status })
    expect(result.modules.brief.canVisit).toBe(true)
    expect(result.modules.banners.canEdit).toBe(false)
    expect(result.modules.review.canEdit).toBe(false)
  })
  test('approval completes Review but not distribution', () => {
    const result = state('approved')
    expect(result.modules.review.complete).toBe(true)
    expect(result.modules.distribute.complete).toBe(false)
    expect(result.modules.distribute.canEdit).toBe(true)
    expect(state('delivered').modules.distribute.complete).toBe(true)
  })
  test('a delivery for another version cannot complete Distribute', () => {
    const result = state('delivered', ({ workspace }) => { workspace.delivery.versionId = 'other' })
    expect(result.modules.distribute.complete).toBe(false)
  })
})
