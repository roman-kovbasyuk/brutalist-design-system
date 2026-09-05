import { describe, expect, test } from 'vitest'
import { currentStage, canVisitStage, selectedCopy, routeFromLocation } from './workflow.js'

describe('persisted studio workflow', () => {
  test('keeps review and approval as separate steps and allows prior steps to be inspected', () => {
    expect(currentStage({ campaign: { status: 'in_review' } })).toBe(5)
    expect(currentStage({ campaign: { status: 'ready' } })).toBe(6)
    expect(currentStage({ campaign: { status: 'approved' } })).toBe(7)
    expect(canVisitStage(7, { campaign: { status: 'draft' } })).toBe(false)
    expect(canVisitStage(0, { campaign: { status: 'delivered' } })).toBe(true)
  })
  test('reconstructs selected copy from persisted set and candidate ids', () => {
    const workspace = { campaign: { selectedCopyId: 'set' }, copies: [{ id: 'set', selectedCandidateId: 'b', candidates: [{id:'a'}, {id:'b', headline:'Selected'}] }] }
    expect(selectedCopy(workspace).headline).toBe('Selected')
  })
  test('restores campaign and stage from a shareable route', () => {
    expect(routeFromLocation('/mvp/campaign/campaign-1', '?step=3')).toEqual({view:'campaign', id:'campaign-1', step:3})
    expect(routeFromLocation('/templates','')).toEqual({view:'templates'})
  })
})
