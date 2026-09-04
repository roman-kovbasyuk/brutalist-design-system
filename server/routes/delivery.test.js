import { describe, expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { pilotCampaignFixture } from '../../shared/fixtures/pilotCampaign.js'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'

const now = '2026-09-04T10:00:00.000Z'
const snapshot = {
  selectedCopy: pilotCampaignFixture.selectedCopy,
  selectedDirection: { ...pilotCampaignFixture.selectedDirection, previewAssetId: 'source-1' },
  composition: { ...pilotCampaignFixture.composition, slotValues: { ...pilotCampaignFixture.composition.slotValues, image: 'source-1' } },
  assets: [
    { id: 'source-1', kind: 'direction', sha256: 'a'.repeat(64) },
    { id: 'review-1', kind: 'review_png', sha256: 'b'.repeat(64) },
    { id: 'manifest-1', kind: 'manifest', sha256: 'c'.repeat(64) },
  ],
  templateManifest: pilotTemplateFixture,
  templateManifestHash: hashCanonical(pilotTemplateFixture),
}
const version = { id: 'version-1', campaignId: 'campaign-1', versionNumber: 1, snapshot, contentHash: hashCanonical(snapshot), createdBy: 'marketer-1', createdAt: now }
const campaign = {
  id: 'campaign-1', title: 'Launch', brief: pilotCampaignFixture.brief, status: 'delivered', revision: 7,
  selectedCopyId: 'copy-set-1', selectedDirectionId: 'direction-1', compositionId: 'composition-1',
  currentVersionNumber: 1, openVersionId: null, createdBy: 'marketer-1', createdAt: now, updatedAt: now, archivedAt: null,
}
const delivery = {
  id: 'delivery-1', campaignId: campaign.id, versionId: version.id, contentHash: version.contentHash,
  asset: { id: 'zip-1', kind: 'delivery_zip', sha256: 'd'.repeat(64) }, byteSize: 512,
  createdBy: 'marketer-1', createdAt: now,
}
const event = {
  id: 'event-delivered', campaignId: campaign.id, versionId: version.id, actorId: 'marketer-1', actorRole: 'marketer',
  eventType: 'delivered', payload: { deliveryId: delivery.id, contentHash: version.contentHash, assetHashes: [delivery.asset.sha256] }, createdAt: now,
}

function workflowService() {
  return {
    listCampaigns: vi.fn(async () => []), getCampaign: vi.fn(async () => null), createCampaign: vi.fn(), patchCampaign: vi.fn(), archiveCampaign: vi.fn(),
    listTemplates: vi.fn(async () => []), listTemplateVersions: vi.fn(async () => []), getTemplateVersion: vi.fn(async () => null), createTemplateVersion: vi.fn(),
    getSettings: vi.fn(async () => ({})), updateSettings: vi.fn(), createInvitation: vi.fn(), disableUser: vi.fn(),
  }
}

function makeApp(role = 'marketer') {
  const deliveryService = {
    createDelivery: vi.fn(async () => ({ status: 201, body: { delivery, campaign, reviewStatus: 'delivered', event } })),
    getDelivery: vi.fn(async () => delivery),
  }
  const app = buildApp({
    resolveActor: async () => ({ id: `${role}-1`, role, disabled: false }),
    workflowService: workflowService(), deliveryService,
  })
  return { app, deliveryService }
}

describe('approved delivery routes', () => {
  test.each(['marketer', 'admin'])('lets an active %s create and read a delivery without If-Match', async (role) => {
    const { app, deliveryService } = makeApp(role)
    const created = await app.inject({
      method: 'POST', url: `/api/v1/versions/${version.id}/delivery`,
      headers: { 'idempotency-key': 'delivery-1' }, payload: {},
    })
    const read = await app.inject({ method: 'GET', url: `/api/v1/versions/${version.id}/delivery` })

    expect(created.statusCode).toBe(201)
    expect(created.headers.etag).toBe('"7"')
    expect(created.json()).toMatchObject({ delivery: { id: delivery.id }, campaign: { status: 'delivered' }, reviewStatus: 'delivered' })
    expect(read.statusCode).toBe(200)
    expect(read.json()).toMatchObject({ id: delivery.id, asset: { id: delivery.asset.id } })
    expect(deliveryService.createDelivery).toHaveBeenCalledWith({
      actor: expect.objectContaining({ role }), versionId: version.id, idempotencyKey: 'delivery-1', input: {},
    })
    await app.close()
  })

  test('rejects designers and malformed command headers/bodies before the service', async () => {
    const designer = makeApp('designer')
    const marketer = makeApp('marketer')
    expect((await designer.app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/delivery`, headers: { 'idempotency-key': 'delivery-1' }, payload: {} })).statusCode).toBe(403)
    expect((await designer.app.inject({ method: 'GET', url: `/api/v1/versions/${version.id}/delivery` })).statusCode).toBe(403)
    expect((await marketer.app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/delivery`, payload: {} })).statusCode).toBe(428)
    expect((await marketer.app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/delivery`, headers: { 'idempotency-key': 'contains space' }, payload: {} })).statusCode).toBe(400)
    expect((await marketer.app.inject({ method: 'POST', url: `/api/v1/versions/${version.id}/delivery`, headers: { 'idempotency-key': 'delivery-1' }, payload: { versionId: 'other' } })).statusCode).toBe(400)
    expect(designer.deliveryService.createDelivery).not.toHaveBeenCalled()
    expect(marketer.deliveryService.createDelivery).not.toHaveBeenCalled()
    await Promise.all([designer.app.close(), marketer.app.close()])
  })
})
