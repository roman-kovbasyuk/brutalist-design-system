import { describe, expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { pilotCampaignFixture } from '../../shared/fixtures/pilotCampaign.js'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'

const now = '2026-09-04T10:00:00.000Z'
const checklistAnswers = { copyAccuracy: true, layoutQuality: true, exportReadiness: true }
const snapshot = {
  selectedCopy: pilotCampaignFixture.selectedCopy,
  selectedDirection: { ...pilotCampaignFixture.selectedDirection, previewAssetId: 'asset-source' },
  composition: { ...pilotCampaignFixture.composition, slotValues: { ...pilotCampaignFixture.composition.slotValues, image: 'asset-source' } },
  assets: [
    { id: 'asset-source', kind: 'direction', sha256: 'a'.repeat(64) },
    { id: 'review-square', kind: 'review_png', sha256: 'b'.repeat(64) },
    { id: 'render-manifest', kind: 'manifest', sha256: 'c'.repeat(64) },
  ],
  templateManifest: pilotTemplateFixture,
  templateManifestHash: hashCanonical(pilotTemplateFixture),
}
const version = { id: 'version-1', campaignId: 'campaign-1', versionNumber: 1, snapshot, contentHash: hashCanonical(snapshot), createdBy: 'marketer-1', createdAt: now }
const campaign = {
  id: 'campaign-1', title: 'Launch', brief: pilotCampaignFixture.brief, status: 'ready', revision: 5,
  selectedCopyId: 'copy-set-1', selectedDirectionId: 'direction-1', compositionId: 'composition-1',
  currentVersionNumber: 1, openVersionId: version.id, createdBy: 'marketer-1', createdAt: now, updatedAt: now, archivedAt: null,
}
const readyEvent = {
  id: 'event-ready', campaignId: campaign.id, versionId: version.id, actorId: 'designer-1', actorRole: 'designer', eventType: 'ready',
  payload: { figmaUrl: 'https://figma.com/design/file/review', checklistAnswers, readyActorId: 'designer-1', contentHash: version.contentHash }, createdAt: now,
}

function workflowService() {
  return {
    listCampaigns: vi.fn(async () => []), getCampaign: vi.fn(async () => null), createCampaign: vi.fn(), patchCampaign: vi.fn(), archiveCampaign: vi.fn(),
    listTemplates: vi.fn(async () => []), listTemplateVersions: vi.fn(async () => []), getTemplateVersion: vi.fn(async () => null), createTemplateVersion: vi.fn(),
    getSettings: vi.fn(async () => ({})), updateSettings: vi.fn(), createInvitation: vi.fn(), disableUser: vi.fn(),
  }
}

function makeApp(role) {
  const reviewService = {
    requestChanges: vi.fn(async () => ({ status: 200, body: { version, campaign: { ...campaign, status: 'changes_requested', revision: 6, openVersionId: null }, reviewStatus: 'changes_requested', event: { ...readyEvent, id: 'event-change', eventType: 'changes_requested', payload: { comment: 'Fix it.' } } } })),
    markReady: vi.fn(async () => ({ status: 200, body: { version, campaign, reviewStatus: 'ready', event: readyEvent } })),
    reject: vi.fn(async () => ({ status: 200, body: { version, campaign: { ...campaign, status: 'changes_requested', revision: 6, openVersionId: null }, reviewStatus: 'changes_requested', event: { ...readyEvent, id: 'event-reject', actorId: 'marketer-1', actorRole: 'marketer', eventType: 'rejected', payload: { comment: 'Fix it.' } } } })),
    approve: vi.fn(async () => ({ status: 200, body: { version, campaign: { ...campaign, status: 'approved', revision: 6, openVersionId: null }, reviewStatus: 'approved', event: { ...readyEvent, id: 'event-approve', actorId: 'marketer-1', actorRole: 'marketer', eventType: 'approved', payload: { contentHash: version.contentHash } } } })),
    reopen: vi.fn(async () => ({ status: 200, body: { campaign: { ...campaign, status: 'composed', revision: 6, openVersionId: null } } })),
    getReview: vi.fn(async () => ({ version, status: 'ready', events: [readyEvent] })),
  }
  const app = buildApp({
    resolveActor: async () => ({ id: `${role}-1`, role, disabled: false }),
    workflowService: workflowService(), reviewService,
  })
  return { app, reviewService }
}

describe('human review routes', () => {
  test('designer commands require both headers and forward strict payloads', async () => {
    const { app, reviewService } = makeApp('designer')
    const missingKey = await app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/request-changes`, headers: { 'if-match': '"4"' }, payload: { comment: 'Fix it.' } })
    const missingRevision = await app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/mark-ready`, headers: { 'idempotency-key': 'ready-1' }, payload: { figmaUrl: 'https://figma.com/design/file/review', checklistAnswers } })
    const invalid = await app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/mark-ready`, headers: { 'if-match': '"4"', 'idempotency-key': 'ready-1' }, payload: { figmaUrl: 'http://figma.com/review', checklistAnswers } })
    const requested = await app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/request-changes`, headers: { 'if-match': '"4"', 'idempotency-key': 'changes-1' }, payload: { comment: ' Fix it. ' } })
    const marked = await app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/mark-ready`, headers: { 'if-match': '"4"', 'idempotency-key': 'ready-1' }, payload: { figmaUrl: 'https://figma.com/design/file/review', checklistAnswers } })

    expect(missingKey.statusCode).toBe(428)
    expect(missingRevision.statusCode).toBe(428)
    expect(invalid.statusCode).toBe(400)
    expect(requested.statusCode).toBe(200)
    expect(requested.headers.etag).toBe('"6"')
    expect(marked.statusCode).toBe(200)
    expect(reviewService.requestChanges).toHaveBeenCalledWith(expect.objectContaining({ versionId: version.id, expectedRevision: 4, idempotencyKey: 'changes-1', input: { comment: 'Fix it.' } }))
    await app.close()
  })

  test('enforces exact designer and marketer/admin role boundaries before the service', async () => {
    const designer = makeApp('designer')
    const marketer = makeApp('marketer')
    const headers = { 'if-match': '"5"', 'idempotency-key': 'command-1' }

    expect((await designer.app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/approve`, headers, payload: {} })).statusCode).toBe(403)
    expect((await marketer.app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/mark-ready`, headers, payload: { figmaUrl: 'https://figma.com/design/file/review', checklistAnswers } })).statusCode).toBe(403)
    expect((await marketer.app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/approve`, headers, payload: {} })).statusCode).toBe(200)
    expect((await marketer.app.inject({ method: 'POST', url: `/api/v1/campaigns/${campaign.id}/reopen`, headers, payload: {} })).statusCode).toBe(200)
    expect(designer.reviewService.approve).not.toHaveBeenCalled()
    expect(marketer.reviewService.markReady).not.toHaveBeenCalled()
    await Promise.all([designer.app.close(), marketer.app.close()])
  })

  test('returns strict append-only review history to every invited role', async () => {
    for (const role of ['marketer', 'designer', 'admin']) {
      const { app, reviewService } = makeApp(role)
      const response = await app.inject({ method: 'GET', url: `/api/v1/versions/${version.id}/review` })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ version: { id: version.id }, status: 'ready', events: [{ id: readyEvent.id }] })
      expect(reviewService.getReview).toHaveBeenCalledWith({ actor: expect.objectContaining({ role }), versionId: version.id })
      await app.close()
    }
  })
})
