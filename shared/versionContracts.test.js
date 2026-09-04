import { describe, expect, test } from 'vitest'
import {
  campaignVersionCommandResponseSchema,
  campaignVersionListResponseSchema,
  campaignVersionResponseSchema,
  compositionCommandResponseSchema,
  createCampaignVersionRequestSchema,
  saveCompositionRequestSchema,
} from './contracts.js'
import { hashCanonical } from './canonicalJson.js'
import { pilotCampaignFixture } from './fixtures/pilotCampaign.js'
import { pilotTemplateFixture } from './fixtures/pilotTemplate.js'

const now = '2026-09-04T10:00:00.000Z'
const campaign = {
  id: 'campaign-1', title: 'Launch', brief: pilotCampaignFixture.brief, status: 'in_review', revision: 4,
  selectedCopyId: 'copy-set-1', selectedDirectionId: 'direction-1', compositionId: 'composition-1',
  currentVersionNumber: 1, openVersionId: 'version-1', createdBy: 'marketer-1',
  createdAt: now, updatedAt: now, archivedAt: null,
}
const composition = {
  id: 'composition-1', templateId: pilotTemplateFixture.id, templateVersion: pilotTemplateFixture.version,
  ratioIds: ['square'], slotValues: { headline: 'Learn faster', body: 'Short lessons', cta: 'Start', image: 'asset-source' },
  validation: { valid: true, errors: [] }, stale: false,
}
const snapshot = {
  selectedCopy: pilotCampaignFixture.selectedCopy,
  selectedDirection: { ...pilotCampaignFixture.selectedDirection, id: 'direction-1', previewAssetId: 'asset-source' },
  composition,
  assets: [
    { id: 'asset-source', kind: 'direction', sha256: 'a'.repeat(64) },
    { id: 'asset-review', kind: 'review_png', sha256: 'b'.repeat(64) },
    { id: 'asset-manifest', kind: 'manifest', sha256: 'c'.repeat(64) },
  ],
  templateManifest: pilotTemplateFixture,
  templateManifestHash: hashCanonical(pilotTemplateFixture),
}
const version = {
  id: 'version-1', campaignId: 'campaign-1', versionNumber: 1, snapshot,
  contentHash: hashCanonical(snapshot), createdBy: 'marketer-1', createdAt: now,
}

describe('composition and immutable version API contracts', () => {
  test('accepts only client-owned composition fields', () => {
    const input = {
      templateId: 'split-focus', templateVersion: '1.0.0', ratioIds: ['square'],
      slotValues: { headline: 'Learn faster', body: 'Short lessons', cta: 'Start', image: 'asset-source' },
    }
    expect(saveCompositionRequestSchema.parse(input)).toEqual(input)
    expect(saveCompositionRequestSchema.safeParse({ ...input, id: 'client-id' }).success).toBe(false)
    expect(saveCompositionRequestSchema.safeParse({ ...input, validation: { valid: true, errors: [] } }).success).toBe(false)
    expect(saveCompositionRequestSchema.safeParse({ ...input, stale: false }).success).toBe(false)
    expect(saveCompositionRequestSchema.safeParse({ ...input, ratioIds: ['square', 'square'] }).success).toBe(false)
  })

  test('uses an empty strict body for version creation', () => {
    expect(createCampaignVersionRequestSchema.parse({})).toEqual({})
    expect(createCampaignVersionRequestSchema.safeParse({ versionNumber: 1 }).success).toBe(false)
  })

  test('parses strict persisted composition and version responses', () => {
    expect(compositionCommandResponseSchema.parse({ composition, campaign, requestId: 'request-1' }))
      .toMatchObject({ composition: { id: 'composition-1' }, campaign: { revision: 4 } })
    expect(campaignVersionCommandResponseSchema.parse({ version, campaign, requestId: 'request-1' }))
      .toMatchObject({ version: { id: 'version-1', contentHash: hashCanonical(snapshot) }, campaign: { status: 'in_review' } })
    expect(campaignVersionResponseSchema.parse({ ...version, requestId: 'request-1' })).toMatchObject(version)
    expect(campaignVersionListResponseSchema.parse({ versions: [version], requestId: 'request-1' }).versions).toHaveLength(1)
  })

  test('rejects response snapshots whose content hash or shape drifted', () => {
    expect(campaignVersionResponseSchema.safeParse({ ...version, contentHash: '0'.repeat(64), requestId: 'request-1' }).success).toBe(false)
    expect(campaignVersionResponseSchema.safeParse({ ...version, snapshot: { ...snapshot, databaseSecret: 'nope' }, requestId: 'request-1' }).success).toBe(false)
  })
})
