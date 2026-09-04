import { describe, expect, test } from 'vitest'
import {
  campaignPatchRequestSchema,
  campaignResponseSchema,
  createCampaignRequestSchema,
  createInvitationRequestSchema,
  createTemplateVersionRequestSchema,
  settingsPatchRequestSchema,
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
  test('accepts only title and brief in campaign edit payloads', () => {
    expect(campaignPatchRequestSchema.parse({ title: 'Winter launch' })).toEqual({ title: 'Winter launch' })
    expect(campaignPatchRequestSchema.safeParse({}).success).toBe(false)
    for (const protectedField of [
      'status', 'selectedCopyId', 'selectedDirectionId', 'compositionId',
      'currentVersionNumber', 'openVersionId', 'version', 'review', 'delivery',
      'composition', 'slotValues', 'templateId', 'templateVersion', 'ratioIds',
    ]) {
      expect(campaignPatchRequestSchema.safeParse({ title: 'Winter launch', [protectedField]: 'client-value' }).success)
        .toBe(false)
    }
  })

  test('defines strict create and response payloads for the HTTP interface', () => {
    const brief = pilotCampaignFixture.brief
    expect(createCampaignRequestSchema.parse({ title: 'Launch', brief })).toEqual({ title: 'Launch', brief })
    expect(createCampaignRequestSchema.safeParse({ title: 'Launch', brief, status: 'approved' }).success).toBe(false)
    expect(campaignResponseSchema.safeParse({
      id: 'campaign-1', title: 'Launch', brief, status: 'draft', revision: 0,
      selectedCopyId: null, selectedDirectionId: null, compositionId: null,
      currentVersionNumber: 0, openVersionId: null, createdBy: 'user-1',
      archivedAt: null,
      createdAt: '2026-09-04T10:00:00.000Z', updatedAt: '2026-09-04T10:00:00.000Z',
      requestId: 'request-1',
    }).success).toBe(true)
  })

  test('keeps invitations, templates, and settings commands strict', () => {
    expect(createInvitationRequestSchema.parse({ email: ' Person@Example.com ', role: 'designer' }))
      .toEqual({ email: 'person@example.com', role: 'designer' })
    expect(createInvitationRequestSchema.safeParse({ email: 'a@example.com', role: 'designer', expiresAt: '2099-01-01' }).success).toBe(false)
    expect(settingsPatchRequestSchema.safeParse({ generationDisabled: true }).success).toBe(true)
    expect(settingsPatchRequestSchema.safeParse({}).success).toBe(false)
    expect(settingsPatchRequestSchema.safeParse({ generationDisabled: true, revision: 1 }).success).toBe(false)
    expect(createTemplateVersionRequestSchema.safeParse({
      id: pilotTemplateFixture.id,
      version: pilotTemplateFixture.version,
      name: 'Pilot template',
      manifest: pilotTemplateFixture,
    }).success).toBe(true)
    expect(createTemplateVersionRequestSchema.safeParse({
      id: pilotTemplateFixture.id,
      version: pilotTemplateFixture.version,
      name: 'Pilot template',
      manifest: pilotTemplateFixture,
      manifestHash: 'a'.repeat(64),
    }).success).toBe(false)
  })

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
