import { describe, expect, test } from 'vitest'
import { campaignVersionSnapshotSchema, generationJobDetailsSchema } from './contracts.js'
import { workspaceResponseSchema } from './studioContracts.js'
import { hashCanonical } from './canonicalJson.js'
import { pilotCampaignFixture } from './fixtures/pilotCampaign.js'
import { pilotTemplateFixture } from './fixtures/pilotTemplate.js'

const oldCopy = {
  id: 'legacy-copy', headline: 'H'.repeat(120), body: 'B'.repeat(420), offer: 'O'.repeat(150),
  cta: 'C'.repeat(60), visualPrompt: 'Legacy source image direction.',
}
const now = '2026-09-04T10:00:00.000Z'
const snapshot = {
  selectedCopy: oldCopy,
  selectedDirection: pilotCampaignFixture.selectedDirection,
  composition: pilotCampaignFixture.composition,
  assets: [], templateManifest: pilotTemplateFixture,
  templateManifestHash: hashCanonical(pilotTemplateFixture),
}
const version = {
  id: 'version-1', campaignId: 'campaign-1', versionNumber: 1, snapshot,
  contentHash: hashCanonical(snapshot), createdBy: 'marketer-1', createdAt: now,
}
const job = {
  id: 'job-1', campaignId: 'campaign-1', step: 'copy', provider: 'mock', model: 'mock-v1', region: 'local',
  status: 'succeeded', attempts: 1, safety: {}, usage: {}, reservedCostMicrounits: 100,
  actualCostMicrounits: 80, timeoutAt: now, result: { copySetId: 'set-1', copies: [oldCopy] },
  errorCode: null, createdAt: now, updatedAt: now,
}

describe('historical copy compatibility', () => {
  test('parses an immutable snapshot containing pre-refinement copy lengths', () => {
    expect(campaignVersionSnapshotSchema.safeParse(snapshot).success).toBe(true)
  })

  test('parses a historical generation job with one pre-refinement copy', () => {
    expect(generationJobDetailsSchema.safeParse(job).success).toBe(true)
  })

  test('parses a workspace containing historical copy sets, jobs, and versions', () => {
    const campaign = {
      id: 'campaign-1', title: 'Legacy', brief: pilotCampaignFixture.brief, status: 'composed', revision: 3,
      selectedCopyId: 'legacy-copy', selectedDirectionId: 'direction-1', compositionId: 'composition-1',
      currentVersionNumber: 1, openVersionId: null, createdBy: 'marketer-1', createdAt: now, updatedAt: now, archivedAt: null,
    }
    expect(workspaceResponseSchema.safeParse({
      campaign, copies: [{ id: 'set-1', candidates: [oldCopy], selectedCandidateId: 'legacy-copy', stale: false }],
      directions: [], composition: null, versions: [version], jobs: [job], delivery: null, requestId: 'request-1',
    }).success).toBe(true)
  })
})
