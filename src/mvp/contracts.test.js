import { describe, expect, test } from 'vitest'
import {
  campaignSchema,
  campaignVersionSchema,
  canonicalStatuses,
  reviewEventSchema,
} from './contracts.js'

function createDraftCampaign() {
  return {
    id: 'campaign-autumn-launch',
    name: 'Autumn launch',
    status: 'draft',
    brief: {
      product: 'Fast-track course',
      audience: 'People moving to Oslo',
      goal: 'Course registrations',
      offer: '15% off',
      notes: '',
    },
    copySets: [],
    selectedCopyId: null,
    directions: [],
    selectedDirectionId: null,
    composition: null,
    versions: [],
    reviewEvents: [],
    delivery: null,
    providerMode: 'mock',
    updatedAt: '2026-09-04T08:00:00.000Z',
  }
}

describe('MVP contracts', () => {
  test('accepts the minimum draft campaign', () => {
    expect(campaignSchema.parse(createDraftCampaign())).toMatchObject({
      status: 'draft',
      versions: [],
      providerMode: 'mock',
    })
  })

  test('rejects an unknown campaign status', () => {
    expect(() => campaignSchema.parse({ ...createDraftCampaign(), status: 'waiting' })).toThrow()
  })

  test('defines the complete ordered workflow status set', () => {
    expect(canonicalStatuses).toEqual([
      'draft',
      'copy_ready',
      'direction_selected',
      'composed',
      'in_review',
      'changes_requested',
      'ready',
      'approved',
      'delivered',
    ])
  })

  test('requires immutable review identity fields on a campaign version', () => {
    expect(() => campaignVersionSchema.parse({
      id: 'version-1',
      number: 1,
      status: 'in_review',
    })).toThrow()
  })

  test('requires an actor and timestamp on every review event', () => {
    expect(() => reviewEventSchema.parse({ type: 'ready', versionId: 'version-1' })).toThrow()
  })
})
