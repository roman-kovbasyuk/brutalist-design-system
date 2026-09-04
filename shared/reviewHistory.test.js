import { describe, expect, test } from 'vitest'
import { deriveReviewStatus } from './reviewHistory.js'

const base = {
  campaignId: 'campaign-1',
  versionId: 'version-1',
  actorId: 'actor-1',
  actorRole: 'marketer',
  payload: {},
}

function event(id, eventType, createdAt, overrides = {}) {
  return { ...base, id, eventType, createdAt, ...overrides }
}

describe('deriveReviewStatus', () => {
  test.each([
    [['sent'], 'in_review'],
    [['sent', 'changes_requested'], 'changes_requested'],
    [['sent', 'ready'], 'ready'],
    [['sent', 'ready', 'rejected'], 'changes_requested'],
    [['sent', 'ready', 'approved'], 'approved'],
    [['sent', 'ready', 'approved', 'delivered'], 'delivered'],
  ])('derives %s as %s from append-only history', (types, expected) => {
    const events = types.map((type, index) => event(
      `event-${index}`,
      type,
      new Date(`2026-09-04T10:00:0${index}.000Z`),
      type === 'ready' ? { actorId: 'designer-1', actorRole: 'designer', payload: {
        figmaUrl: 'https://www.figma.com/design/file/review',
        checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
        readyActorId: 'designer-1',
        contentHash: 'a'.repeat(64),
      } } : {},
    ))

    expect(deriveReviewStatus(events)).toBe(expected)
  })

  test('uses createdAt then id for deterministic ordering', () => {
    const createdAt = new Date('2026-09-04T10:00:00.000Z')
    const events = [
      event('b-ready', 'ready', createdAt, { actorId: 'designer-1', actorRole: 'designer' }),
      event('a-sent', 'sent', createdAt),
    ]

    expect(deriveReviewStatus(events)).toBe('ready')
    expect(events.map(({ id }) => id)).toEqual(['b-ready', 'a-sent'])
  })

  test.each([
    [],
    [event('event-1', 'ready', new Date())],
    [event('event-1', 'sent', new Date()), event('event-2', 'approved', new Date(Date.now() + 1))],
    [event('event-1', 'sent', new Date()), event('event-2', 'ready', new Date(Date.now() + 1)), event('event-3', 'changes_requested', new Date(Date.now() + 2))],
  ])('fails closed for an impossible event sequence', (events) => {
    expect(() => deriveReviewStatus(events)).toThrowError(expect.objectContaining({ code: 'invalid_review_history' }))
  })
})
