import { describe, expect, test } from 'vitest'
import {
  createDeliveryRequestSchema,
  deliveryManifestSchema,
  deliveryRecordSchema,
} from './contracts.js'

const hash = 'a'.repeat(64)

describe('delivery contracts', () => {
  test('accepts an empty command and an exact immutable delivery record', () => {
    expect(createDeliveryRequestSchema.parse({})).toEqual({})
    expect(() => createDeliveryRequestSchema.parse({ versionId: 'spoofed' })).toThrow()
    expect(deliveryRecordSchema.parse({
      id: 'delivery-1', campaignId: 'campaign-1', versionId: 'version-1', contentHash: hash,
      asset: { id: 'zip-1', kind: 'delivery_zip', sha256: hash }, byteSize: 42,
      createdBy: 'marketer-1', createdAt: '2026-09-04T10:00:00.000Z',
    })).toMatchObject({ id: 'delivery-1', asset: { kind: 'delivery_zip' } })
  })

  test('requires a sorted unique safe file index with exact metadata', () => {
    const manifest = {
      schemaVersion: 1, campaignId: 'campaign-1', versionId: 'version-1', versionNumber: 1,
      contentHash: hash,
      approval: { actorId: 'marketer-1', at: '2026-09-04T10:00:00.000Z' },
      files: [
        { filename: 'banners/banner-001.png', assetId: 'png-1', mimeType: 'image/png', byteSize: 10, width: 1200, height: 628, sha256: 'b'.repeat(64) },
        { filename: 'render-manifest.json', assetId: 'manifest-1', mimeType: 'application/json', byteSize: 20, width: null, height: null, sha256: 'c'.repeat(64) },
      ],
    }
    expect(deliveryManifestSchema.parse(manifest)).toEqual(manifest)
    expect(deliveryManifestSchema.safeParse({ ...manifest, files: [...manifest.files].reverse() }).success).toBe(false)
    expect(deliveryManifestSchema.safeParse({ ...manifest, files: [{ ...manifest.files[0], filename: '../escape.png' }] }).success).toBe(false)
  })
})
