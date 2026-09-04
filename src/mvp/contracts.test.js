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
      text: 'Launch a fast-track course for people moving to Oslo.',
      product: 'Fast-track course',
      audience: 'People moving to Oslo',
      goal: 'Course registrations',
      offer: '15% off',
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

  test('accepts a draft with one free-form brief field', () => {
    const campaign = createDraftCampaign()
    campaign.brief = {
      text: 'Launch an Oslo course for new arrivals.',
      product: '',
      audience: '',
      goal: '',
      offer: '',
    }

    const parsed = campaignSchema.parse(campaign)

    expect(parsed.brief.text).toBe('Launch an Oslo course for new arrivals.')
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
