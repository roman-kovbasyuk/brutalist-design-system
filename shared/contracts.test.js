import { describe, expect, test } from 'vitest'
import {
  assetHashSchema,
  campaignSchema,
  campaignStatusSchema,
  campaignVersionSnapshotSchema,
  generationJobSchema,
  visualDirectionSchema,
} from './contracts.js'
import { pilotCampaignFixture } from './fixtures/pilotCampaign.js'
import { pilotTemplateFixture } from './fixtures/pilotTemplate.js'
import { hashCanonical } from './canonicalJson.js'

const validVersionSnapshot = () => ({
  selectedCopy: pilotCampaignFixture.selectedCopy,
  selectedDirection: pilotCampaignFixture.selectedDirection,
  composition: pilotCampaignFixture.composition,
  assets: [],
  templateManifest: pilotTemplateFixture,
  templateManifestHash: hashCanonical(pilotTemplateFixture),
})

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
      templateManifest: pilotTemplateFixture,
      templateManifestHash: hashCanonical(pilotTemplateFixture),
    }

    expect(campaignVersionSnapshotSchema.safeParse(snapshot).success).toBe(false)
  })

  test('accepts an immutable snapshot bound to its canonical manifest', () => {
    expect(campaignVersionSnapshotSchema.parse(validVersionSnapshot())).toMatchObject({
      templateManifest: pilotTemplateFixture,
      templateManifestHash: hashCanonical(pilotTemplateFixture),
    })
  })

  test('rejects a snapshot with a manifest hash that does not match its canonical manifest', () => {
    expect(campaignVersionSnapshotSchema.safeParse({
      ...validVersionSnapshot(),
      templateManifestHash: 'a'.repeat(64),
    }).success).toBe(false)
  })

  test('rejects a snapshot whose composition template id differs from its manifest', () => {
    expect(campaignVersionSnapshotSchema.safeParse({
      ...validVersionSnapshot(),
      composition: { ...pilotCampaignFixture.composition, templateId: 'other-template' },
    }).success).toBe(false)
  })

  test('rejects a snapshot whose composition template version differs from its manifest', () => {
    expect(campaignVersionSnapshotSchema.safeParse({
      ...validVersionSnapshot(),
      composition: { ...pilotCampaignFixture.composition, templateVersion: '1.0.1' },
    }).success).toBe(false)
  })

  test('accepts only lowercase SHA-256 asset hashes', () => {
    expect(assetHashSchema.safeParse('a'.repeat(64)).success).toBe(true)
    expect(assetHashSchema.safeParse('not-a-hash').success).toBe(false)
    expect(assetHashSchema.safeParse('A'.repeat(64)).success).toBe(false)
  })

  test('requires an integer revision for optimistic concurrency', () => {
    const { revision: _revision, ...withoutRevision } = pilotCampaignFixture

    expect(campaignSchema.safeParse({ ...pilotCampaignFixture, revision: 0 }).success).toBe(true)
    expect(campaignSchema.safeParse(withoutRevision).success).toBe(false)
    expect(campaignSchema.safeParse({ ...pilotCampaignFixture, revision: 0.5 }).success).toBe(false)
  })

  test('supports an unknown generation job without floating-point cost', () => {
    const job = {
      id: 'job-1',
      campaignId: pilotCampaignFixture.id,
      step: 'image',
      provider: 'gemini',
      model: 'approved-model',
      region: 'approved-region',
      status: 'unknown',
      attempts: 1,
      safety: {},
      usage: {},
      reservedCostMicrounits: 250_000,
      actualCostMicrounits: null,
      timeoutAt: '2026-09-04T12:05:00.000Z',
    }

    expect(generationJobSchema.safeParse(job).success).toBe(true)
    expect(generationJobSchema.safeParse({ ...job, reservedCostMicrounits: 2.5 }).success).toBe(false)
  })
})
