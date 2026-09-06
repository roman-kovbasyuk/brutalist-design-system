import { describe, expect, test, vi } from 'vitest'
import { createDeliveryService } from './deliveryService.js'
import * as deliveryVerification from './deliveryService.js'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'
import { hashCanonical } from '../../shared/canonicalJson.js'

function dependencies() {
  return {
    pool: { query: vi.fn(), connect: vi.fn() },
    assetStore: { put: vi.fn(), get: vi.fn(), delete: vi.fn(), getMetadata: vi.fn(), createReadStream: vi.fn(), putStream: vi.fn() },
    transaction: vi.fn(),
    recoveryTransaction: vi.fn(),
  }
}

describe('approved delivery service boundary', () => {
  test('render manifest binds the non-first design image to its own immutable source hash', () => {
    const template = pilotTemplateFixture
    const templateHash = hashCanonical(template)
    const pngAssets = [1, 2].map(index => ({ id: `png-${index}`, sha256: String(index + 2).repeat(64), width: 1080, height: 1080, byteSize: 100 }))
    const sources = [1, 2].map(index => ({ id: `source-${index}`, kind: 'direction', sha256: String(index).repeat(64) }))
    const version = { id: 'version', campaignId: 'campaign', versionNumber: 1, snapshot: { assets: sources,
      templateManifest: template, templateManifestHash: templateHash,
      composition: { id: 'composition', ratioIds: ['square'], designs: [1, 2].map(index => ({ id: `design-${index}`, slotValues: { image: `source-${index}` } })) },
      designs: [1, 2].map(index => ({ id: `design-${index}`, templateManifest: template, templateManifestHash: templateHash })) } }
    const manifest = { schemaVersion: 1, campaignId: 'campaign', versionId: 'version', versionNumber: 1,
      template: { id: template.id, version: template.version, sha256: templateHash }, compositionId: 'composition', sourceAssets: sources,
      renders: pngAssets.map((asset, index) => ({ designId: `design-${index + 1}`, ratioId: 'square', asset: { id: asset.id, kind: 'review_png', sha256: asset.sha256 },
        manifest: { ratio: 'square', template: { id: template.id, version: template.version, sha256: templateHash },
          output: { mimeType: 'image/png', width: asset.width, height: asset.height, byteSize: asset.byteSize, sha256: asset.sha256 },
          slots: [{ id: 'image', type: 'image', source: { sha256: sources[index].sha256 } }] } })) }
    expect(() => deliveryVerification.verifyRenderManifest(manifest, version, pngAssets)).not.toThrow()
    manifest.renders[1].manifest.slots[0].source.sha256 = sources[0].sha256
    expect(() => deliveryVerification.verifyRenderManifest(manifest, version, pngAssets)).toThrow(expect.objectContaining({ code: 'manifest_integrity_failure' }))
  })
  test('requires a streaming asset store so approved packages cannot be buffered', () => {
    const input = dependencies()
    delete input.assetStore.createReadStream
    expect(() => createDeliveryService(input)).toThrow(/createReadStream/)
  })

  test('rejects designers before persistence or storage access', async () => {
    const input = dependencies()
    const service = createDeliveryService(input)
    await expect(service.createDelivery({
      actor: { id: 'designer-1', role: 'designer' }, versionId: 'version-1',
      idempotencyKey: 'delivery-1', input: {},
    })).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    expect(input.transaction).not.toHaveBeenCalled()
    expect(input.assetStore.get).not.toHaveBeenCalled()
    expect(input.assetStore.put).not.toHaveBeenCalled()
  })

  test.each(['', 'contains space', '\u00e9'])('rejects a non-visible-ASCII idempotency key: %j', async (idempotencyKey) => {
    const service = createDeliveryService(dependencies())
    await expect(service.createDelivery({
      actor: { id: 'marketer-1', role: 'marketer' }, versionId: 'version-1',
      idempotencyKey, input: {},
    })).rejects.toMatchObject({ statusCode: 400, code: 'invalid_idempotency_key' })
  })

  test('requires an operation lease longer than all write and recovery work', () => {
    expect(() => createDeliveryService({ ...dependencies(), leaseMs: 1_000, timeoutMs: 900, recoveryTimeoutMs: 100 }))
      .toThrow(/lease/i)
  })
})
