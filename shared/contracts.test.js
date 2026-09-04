import { describe, expect, test } from 'vitest'
import {
  assetHashSchema,
  campaignSchema,
  campaignStatusSchema,
  campaignVersionSnapshotSchema,
  visualDirectionSchema,
} from './contracts.js'
import { pilotCampaignFixture } from './fixtures/pilotCampaign.js'

describe('MVP contracts', () => {
  test('accepts the pilot campaign fixture', () => {
    expect(campaignSchema.parse(pilotCampaignFixture)).toEqual(pilotCampaignFixture)
  })

  test('rejects an empty campaign title', () => {
    expect(campaignSchema.safeParse({ ...pilotCampaignFixture, title: '' }).success).toBe(false)
  })

  test('rejects an unknown campaign status', () => {
    expect(campaignStatusSchema.safeParse('waiting-for-magic').success).toBe(false)
  })

  test('requires a status on every visual direction', () => {
    const { status: _status, ...withoutStatus } = pilotCampaignFixture.selectedDirection

    expect(visualDirectionSchema.safeParse(withoutStatus).success).toBe(false)
  })

  test('requires the template version in an immutable snapshot', () => {
    const snapshot = {
      selectedCopy: pilotCampaignFixture.selectedCopy,
      selectedDirection: pilotCampaignFixture.selectedDirection,
      composition: {
        ...pilotCampaignFixture.composition,
        templateVersion: undefined,
      },
      assets: [],
    }

    expect(campaignVersionSnapshotSchema.safeParse(snapshot).success).toBe(false)
  })

  test('accepts only lowercase SHA-256 asset hashes', () => {
    expect(assetHashSchema.safeParse('a'.repeat(64)).success).toBe(true)
    expect(assetHashSchema.safeParse('not-a-hash').success).toBe(false)
    expect(assetHashSchema.safeParse('A'.repeat(64)).success).toBe(false)
  })
})
