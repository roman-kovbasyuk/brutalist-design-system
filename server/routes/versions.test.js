import { describe, expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { pilotCampaignFixture } from '../../shared/fixtures/pilotCampaign.js'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'

const now = '2026-09-04T10:00:00.000Z'
const baseCampaign = {
  id: 'campaign-1', title: 'Launch', brief: pilotCampaignFixture.brief, status: 'direction_selected', revision: 2,
  selectedCopyId: 'copy-set-1', selectedDirectionId: 'direction-1', compositionId: null,
  currentVersionNumber: 0, openVersionId: null, createdBy: 'marketer-1',
  createdAt: now, updatedAt: now, archivedAt: null,
}
const compositionInput = {
  templateId: pilotTemplateFixture.id, templateVersion: pilotTemplateFixture.version, ratioIds: ['square'],
  slotValues: { headline: 'Learn faster', body: 'Short lessons', cta: 'Start now', image: 'source-asset' },
}
const composition = {
  id: 'composition-1', ...compositionInput, validation: { valid: true, errors: [] }, stale: false,
}
const reviewedCampaign = {
  ...baseCampaign, status: 'in_review', revision: 4, compositionId: composition.id,
  currentVersionNumber: 1, openVersionId: 'version-1',
}
const snapshot = {
  selectedCopy: pilotCampaignFixture.selectedCopy,
  selectedDirection: { ...pilotCampaignFixture.selectedDirection, id: 'direction-1', previewAssetId: 'source-asset' },
  composition,
  assets: [
    { id: 'source-asset', kind: 'direction', sha256: 'a'.repeat(64) },
    { id: 'review-square', kind: 'review_png', sha256: 'b'.repeat(64) },
    { id: 'render-manifest', kind: 'manifest', sha256: 'c'.repeat(64) },
  ],
  templateManifest: pilotTemplateFixture,
  templateManifestHash: hashCanonical(pilotTemplateFixture),
}
const version = {
  id: 'version-1', campaignId: 'campaign-1', versionNumber: 1, snapshot,
  contentHash: hashCanonical(snapshot), createdBy: 'marketer-1', createdAt: now,
}

function makeServices() {
  return {
    workflowService: {
      listCampaigns: vi.fn(async () => []), getCampaign: vi.fn(async () => null),
      createCampaign: vi.fn(), patchCampaign: vi.fn(), archiveCampaign: vi.fn(),
      listTemplates: vi.fn(async () => []), listTemplateVersions: vi.fn(async () => []),
      getTemplateVersion: vi.fn(async () => null), createTemplateVersion: vi.fn(),
      getSettings: vi.fn(async () => ({})), updateSettings: vi.fn(), createInvitation: vi.fn(), disableUser: vi.fn(),
    },
    versionService: {
      saveComposition: vi.fn(async () => ({ composition, campaign: { ...baseCampaign, status: 'composed', revision: 3, compositionId: composition.id } })),
      createVersion: vi.fn(async () => ({ status: 201, body: { version, campaign: reviewedCampaign } })),
      getVersion: vi.fn(async () => version),
      listVersions: vi.fn(async () => [version]),
    },
  }
}

function makeApp({ role = 'marketer' } = {}) {
  const services = makeServices()
  const app = buildApp({
    resolveActor: async () => ({ id: `${role}-1`, role, disabled: false }),
    ...services,
  })
  return { app, ...services }
}

describe('composition and immutable version routes', () => {
  test('saves a strict composition with quoted If-Match and returns the new revision', async () => {
    const { app, versionService } = makeApp()
    const missing = await app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/composition', payload: compositionInput })
    const malformed = await app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/composition', headers: { 'if-match': '2' }, payload: compositionInput })
    const protectedField = await app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/composition', headers: { 'if-match': '"2"' }, payload: { ...compositionInput, id: 'client-id' } })
    const saved = await app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/composition', headers: { 'if-match': '"2"' }, payload: compositionInput })

    expect(missing.statusCode).toBe(428)
    expect(malformed.statusCode).toBe(400)
    expect(protectedField.statusCode).toBe(400)
    expect(saved.statusCode).toBe(200)
    expect(saved.headers.etag).toBe('"3"')
    expect(saved.json()).toMatchObject({ composition: { id: 'composition-1' }, campaign: { status: 'composed', revision: 3 } })
    expect(versionService.saveComposition).toHaveBeenCalledWith({
      actor: expect.objectContaining({ id: 'marketer-1' }), campaignId: 'campaign-1', expectedRevision: 2, input: compositionInput,
    })
    await app.close()
  })

  test('creates a version only with both command headers and returns the stored response', async () => {
    const { app, versionService } = makeApp()
    const missingKey = await app.inject({ method: 'POST', url: '/api/v1/campaigns/campaign-1/versions', headers: { 'if-match': '"3"' }, payload: {} })
    const missingRevision = await app.inject({ method: 'POST', url: '/api/v1/campaigns/campaign-1/versions', headers: { 'idempotency-key': 'review-1' }, payload: {} })
    const created = await app.inject({
      method: 'POST', url: '/api/v1/campaigns/campaign-1/versions',
      headers: { 'idempotency-key': 'review-1', 'if-match': '"3"' }, payload: {},
    })

    expect(missingKey.statusCode).toBe(428)
    expect(missingRevision.statusCode).toBe(428)
    expect(created.statusCode).toBe(201)
    expect(created.headers.etag).toBe('"4"')
    expect(created.json()).toMatchObject({ version: { id: 'version-1', versionNumber: 1 }, campaign: { status: 'in_review' } })
    expect(versionService.createVersion).toHaveBeenCalledWith({
      actor: expect.objectContaining({ id: 'marketer-1' }), campaignId: 'campaign-1',
      expectedRevision: 3, idempotencyKey: 'review-1', input: {},
    })
    await app.close()
  })

  test('allows designers to read immutable history but not create or compose it', async () => {
    const { app, versionService } = makeApp({ role: 'designer' })
    const listed = await app.inject({ method: 'GET', url: '/api/v1/campaigns/campaign-1/versions' })
    const loaded = await app.inject({ method: 'GET', url: '/api/v1/campaigns/campaign-1/versions/1' })
    const save = await app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/composition', headers: { 'if-match': '"2"' }, payload: compositionInput })
    const create = await app.inject({ method: 'POST', url: '/api/v1/campaigns/campaign-1/versions', headers: { 'if-match': '"3"', 'idempotency-key': 'nope' }, payload: {} })

    expect(listed.statusCode).toBe(200)
    expect(listed.json().versions).toHaveLength(1)
    expect(loaded.statusCode).toBe(200)
    expect(loaded.json()).toMatchObject({ id: 'version-1', snapshot: { assets: expect.any(Array) } })
    expect(save.statusCode).toBe(403)
    expect(create.statusCode).toBe(403)
    expect(versionService.saveComposition).not.toHaveBeenCalled()
    expect(versionService.createVersion).not.toHaveBeenCalled()
    await app.close()
  })

  test('returns 404 for an unknown version and rejects non-integer history paths', async () => {
    const { app, versionService } = makeApp()
    versionService.getVersion.mockResolvedValueOnce(null)
    const missing = await app.inject({ method: 'GET', url: '/api/v1/campaigns/campaign-1/versions/9' })
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/campaigns/campaign-1/versions/latest' })

    expect(missing.statusCode).toBe(404)
    expect(invalid.statusCode).toBe(400)
    await app.close()
  })
})
