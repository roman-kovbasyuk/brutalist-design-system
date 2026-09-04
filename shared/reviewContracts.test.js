import { describe, expect, test } from 'vitest'
import {
  approveVersionRequestSchema,
  markVersionReadyRequestSchema,
  reopenCampaignRequestSchema,
  requestVersionChangesRequestSchema,
  reviewEventRecordSchema,
} from './contracts.js'

const checklistAnswers = { copyAccuracy: true, layoutQuality: true, exportReadiness: true }

describe('review command contracts', () => {
  test('accepts only exact command payloads', () => {
    expect(requestVersionChangesRequestSchema.parse({ comment: ' Increase contrast. ' })).toEqual({ comment: 'Increase contrast.' })
    expect(markVersionReadyRequestSchema.parse({
      figmaUrl: 'https://www.figma.com/design/file/review',
      checklistAnswers,
    })).toEqual({ figmaUrl: 'https://www.figma.com/design/file/review', checklistAnswers })
    expect(approveVersionRequestSchema.parse({})).toEqual({})
    expect(reopenCampaignRequestSchema.parse({})).toEqual({})
    expect(() => approveVersionRequestSchema.parse({ contentHash: 'a'.repeat(64) })).toThrow()
  })

  test.each([
    [{ comment: '' }],
    [{ comment: 'x'.repeat(2_001) }],
    [{ comment: 'Valid', status: 'approved' }],
  ])('rejects an invalid change comment %#', (input) => {
    expect(requestVersionChangesRequestSchema.safeParse(input).success).toBe(false)
  })

  test.each([
    ['http://www.figma.com/design/file/review', checklistAnswers],
    ['https://figma.com.evil.test/design/file/review', checklistAnswers],
    ['https://user@figma.com/design/file/review', checklistAnswers],
    ['https://figma.com:0443/design/file/review', checklistAnswers],
    ['https://-bad.figma.com/design/file/review', checklistAnswers],
    ['https://bad-.figma.com/design/file/review', checklistAnswers],
    [`https://${'a'.repeat(64)}.figma.com/design/file/review`, checklistAnswers],
    [`https://${`${'a'.repeat(63)}.`.repeat(4)}figma.com/design/file/review`, checklistAnswers],
    ['https://tést.figma.com/design/file/review', checklistAnswers],
    ['https://www.figma.com/design/file/review', { ...checklistAnswers, layoutQuality: false }],
    ['https://www.figma.com/design/file/review', { copyAccuracy: true, layoutQuality: true }],
    ['https://www.figma.com/design/file/review', { ...checklistAnswers, extra: true }],
  ])('rejects malformed ready input %#', (figmaUrl, answers) => {
    expect(markVersionReadyRequestSchema.safeParse({ figmaUrl, checklistAnswers: answers }).success).toBe(false)
  })

  test('rejects event payload drift', () => {
    const event = {
      id: 'event-1', campaignId: 'campaign-1', versionId: 'version-1', actorId: 'designer-1', actorRole: 'designer',
      eventType: 'ready', createdAt: '2026-09-04T10:00:00.000Z',
      payload: {
        figmaUrl: 'https://figma.com/design/file/review', checklistAnswers,
        readyActorId: 'designer-1', contentHash: 'a'.repeat(64), assetHashes: ['b'.repeat(64)],
      },
    }
    expect(reviewEventRecordSchema.safeParse(event).success).toBe(true)
    expect(reviewEventRecordSchema.safeParse({ ...event, payload: { ...event.payload, secret: true } }).success).toBe(false)
  })

  test('persists the exact immutable asset hash set in ready and approved facts', () => {
    const base = {
      id: 'event-1', campaignId: 'campaign-1', versionId: 'version-1', actorId: 'marketer-1',
      actorRole: 'marketer', createdAt: '2026-09-04T10:00:00.000Z',
    }
    const approved = {
      ...base, eventType: 'approved',
      payload: { contentHash: 'a'.repeat(64), assetHashes: ['b'.repeat(64), 'c'.repeat(64)] },
    }
    expect(reviewEventRecordSchema.safeParse(approved).success).toBe(true)
    expect(reviewEventRecordSchema.safeParse({
      ...approved, payload: { ...approved.payload, assetHashes: [...approved.payload.assetHashes, 'not-a-hash'] },
    }).success).toBe(false)
  })
})
