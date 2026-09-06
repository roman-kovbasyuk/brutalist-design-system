import { describe, expect, test } from 'vitest'
import { workspaceRecordSchema } from '../../../../shared/studioContracts.js'
import { reviewHistoryResponseSchema } from '../../../../shared/contracts.js'
import { makeScenario } from './workspaceFixtures.js'

describe('campaign module fixtures', () => {
  test.each(['draft', 'copy-ready', 'visuals-ready', 'composed', 'in-review',
    'changes-requested', 'ready', 'approved', 'delivered'])('%s obeys the real API contracts', name => {
    const { workspace, reviewHistory } = makeScenario(name)
    expect(workspaceRecordSchema.safeParse(workspace)).toMatchObject({ success: true })
    if (reviewHistory) {
      expect(reviewHistoryResponseSchema.safeParse(reviewHistory)).toMatchObject({ success: true })
      expect(reviewHistory.version.id).toBe(workspace.versions[0].id)
    }
  })

  test('delivery and review refer to the same immutable version', () => {
    const { workspace, reviewHistory } = makeScenario('delivered')
    expect(workspace.delivery.versionId).toBe('version-1')
    expect(workspace.delivery.contentHash).toBe(workspace.versions[0].contentHash)
    expect(reviewHistory.events.map(event => event.eventType)).toEqual(['sent', 'ready', 'approved', 'delivered'])
    expect(reviewHistory.events[1].actorId).not.toBe(reviewHistory.events[2].actorId)
    expect(workspace.versions[0].snapshot.assets.filter(asset => asset.kind === 'manifest')).toHaveLength(1)
    expect(reviewHistory.events[0].payload.assetHashes).toEqual(['b'.repeat(64), 'd'.repeat(64)])
    expect(reviewHistory.events.at(-1).payload.assetHashes).toEqual(['c'.repeat(64)])
  })

  test('changing a fixture does not leak into another module test', () => {
    const first = makeScenario('composed')
    first.workspace.composition.slotValues.headline = 'Unsaved edit'
    const second = makeScenario('composed')
    expect(second.workspace.composition.slotValues.headline).toBe('Find your quiet')
    expect(() => makeScenario('unrecognised')).toThrow(/scenario/i)
  })
})
