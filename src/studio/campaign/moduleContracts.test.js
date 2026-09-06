import { describe, expect, test } from 'vitest'
import { makeScenario } from './testing/workspaceFixtures.js'
import { moduleInputKey, projectModuleInput } from './moduleContracts.js'

describe('narrow campaign module inputs', () => {
  test('Banners exposes approved copy and the legacy selected candidate, not unapproved drafts', () => {
    const scenario = makeScenario('visuals-ready')
    expect(projectModuleInput('banners', scenario.workspace, scenario).copies.map(copy => copy.id)).toEqual(['copy-1'])
    scenario.workspace.copies[0].approvedCandidateIds = ['copy-2']
    expect(projectModuleInput('banners', scenario.workspace, scenario).copies.map(copy => copy.id)).toEqual(['copy-1', 'copy-2'])
  })
  test('Banners gets selected artifacts, not the surrounding workspace', () => {
    const scenario = makeScenario('composed')
    const input = projectModuleInput('banners', scenario.workspace, scenario)
    expect(Object.keys(input)).toEqual(['selectedCopy', 'selectedDirection', 'copies', 'directions', 'templates', 'composition'])
    expect(input.copies[0]).toMatchObject({ id: 'copy-1', copySetId: 'copy-set-1' })
    expect(input.selectedCopy.id).toBe('copy-1')
    expect(input.selectedDirection.previewAssetId).toBe('image-1')
    expect(input).not.toHaveProperty('campaign')
    expect(input).not.toHaveProperty('jobs')
  })
  test('stale selections are not usable by downstream modules', () => {
    const scenario = makeScenario('composed')
    scenario.workspace.copies[0].stale = true
    scenario.workspace.directions[0].stale = true
    const input = projectModuleInput('banners', scenario.workspace, scenario)
    expect(input.selectedCopy).toBeNull()
    expect(input.selectedDirection).toBeNull()
  })
  test('draft changes do not replace the approved review snapshot', () => {
    const scenario = makeScenario('approved')
    scenario.workspace.composition.slotValues.headline = 'An unreviewed draft'
    const input = projectModuleInput('review', scenario.workspace, scenario)
    expect(input.version.snapshot.composition.slotValues.headline).toBe('Find your quiet')
    expect(projectModuleInput('distribute', scenario.workspace, scenario).version.id).toBe('version-1')
  })
  test('missing current version and mismatched history/delivery fail closed', () => {
    const scenario = makeScenario('delivered')
    scenario.workspace.campaign.currentVersionNumber = 2
    const review = projectModuleInput('review', scenario.workspace, scenario)
    const distribute = projectModuleInput('distribute', scenario.workspace, scenario)
    expect(review.version).toBeNull()
    expect(review.history).toBeNull()
    expect(distribute.delivery).toBeNull()
  })
  test('copy preview image changes do not change the copy source key', () => {
    const scenario = makeScenario('composed')
    const before = projectModuleInput('copy', scenario.workspace, scenario)
    scenario.workspace.directions[0].previewAssetId = 'another-image'
    const after = projectModuleInput('copy', scenario.workspace, scenario)
    expect(after.previewAssetId).toBe('another-image')
    expect(moduleInputKey('copy', after)).toBe(moduleInputKey('copy', before))
  })
  test('analysis feedback is not a new brief draft source', () => {
    const scenario = makeScenario('copy-ready')
    const before = projectModuleInput('brief', scenario.workspace, scenario)
    scenario.workspace.jobs[0].result.analysis.summary = 'A refined summary'
    const after = projectModuleInput('brief', scenario.workspace, scenario)
    expect(after.analysis.summary).toBe('A refined summary')
    expect(moduleInputKey('brief', after)).toBe(moduleInputKey('brief', before))
  })
  test('a changed actual source changes its key; property ordering does not', () => {
    const first = { brief: { notes: 'A launch', locale: 'en' }, analysis: null }
    const reordered = { brief: { locale: 'en', notes: 'A launch' }, analysis: null }
    expect(moduleInputKey('brief', first)).toBe(moduleInputKey('brief', reordered))
    expect(moduleInputKey('brief', first)).not.toBe(moduleInputKey('brief', { brief: { notes: 'Another launch' } }))
  })
  test('only approved/delivered campaigns expose a distributable version', () => {
    const scenario = makeScenario('ready')
    expect(projectModuleInput('distribute', scenario.workspace, scenario).version).toBeNull()
    expect(() => projectModuleInput('__proto__', scenario.workspace)).toThrow(/module/i)
  })
  test('new successful analysis remains visible while old copy sets are stale', () => {
    const scenario = makeScenario('copy-ready')
    scenario.workspace.copies[0].stale = true
    scenario.workspace.jobs.push({ ...scenario.workspace.jobs[0], id: 'analysis-job-2',
      createdAt: '2026-09-06T10:05:00Z', result: { analysis: { summary: 'The new brief analysis', themes: [], warnings: [] } } })
    expect(projectModuleInput('brief', scenario.workspace).analysis.summary).toBe('The new brief analysis')
  })
  test('preparing a new version keys the live composition, not a past version', () => {
    const scenario = makeScenario('changes-requested')
    scenario.workspace.campaign.status = 'composed'
    const before = projectModuleInput('review', scenario.workspace, scenario)
    const changed = structuredClone(scenario)
    changed.workspace.composition.slotValues.headline = 'The revised creative'
    const after = projectModuleInput('review', changed.workspace, changed)
    expect(moduleInputKey('review', before)).not.toBe(moduleInputKey('review', after))
  })
})
