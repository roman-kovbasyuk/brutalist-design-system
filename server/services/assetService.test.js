import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, test, vi } from 'vitest'
import { createAssetService } from './assetService.js'
import { createDeliverySpool } from './deliverySpool.js'

const bytes = Buffer.from('private immutable asset')
const record = {
  id: 'asset-1', campaignId: 'campaign-1', kind: 'direction',
  objectKey: 'campaigns/abc/generation-jobs/def/generated/asset-1.png',
  mimeType: 'image/png', byteSize: bytes.length,
  width: 1200, height: 628,
  sha256: createHash('sha256').update(bytes).digest('hex'), source: 'generation',
}

function harness({ row = record, stored = bytes } = {}) {
  const repository = { findReadableById: vi.fn(async () => row) }
  const assetStore = {
    get: vi.fn(async () => stored), put: vi.fn(), delete: vi.fn(),
    createReadStream: vi.fn(async () => stored == null ? null : Readable.from([stored])),
  }
  return {
    repository, assetStore,
    service: createAssetService({
      pool: { query: vi.fn() }, assetStore,
      repositoryFactory: vi.fn(() => repository),
    }),
  }
}

describe('authorized asset reads', () => {
  test.each(['marketer', 'designer', 'admin'])('reads a campaign-bound asset for an active %s and verifies integrity', async (role) => {
    const { service, repository } = harness()
    const result = await service.readAsset({ actor: { id: `${role}-1`, role, disabled: false }, assetId: 'asset-1' })

    expect(result).toMatchObject({ ...record, bytes: expect.any(Buffer) })
    expect(repository.findReadableById).toHaveBeenCalledWith({ assetId: 'asset-1', actorId: `${role}-1` })
  })

  test('uses the current database actor and returns no record for an unknown or inaccessible campaign asset', async () => {
    const { service, assetStore } = harness({ row: null })
    await expect(service.readAsset({ actor: { id: 'designer-1', role: 'designer' }, assetId: 'other-campaign-asset' }))
      .resolves.toBeNull()
    expect(assetStore.get).not.toHaveBeenCalled()
  })

  test.each([
    [{ ...record, byteSize: record.byteSize + 1 }, bytes, 'asset_integrity_failure'],
    [{ ...record, sha256: '0'.repeat(64) }, bytes, 'asset_integrity_failure'],
    [{ ...record, objectKey: '../unsafe.png' }, bytes, 'unsafe_object_key'],
    [record, null, 'asset_bytes_missing'],
  ])('fails closed for corrupt metadata or bytes', async (row, stored, code) => {
    const { service } = harness({ row, stored })
    await expect(service.readAsset({ actor: { id: 'marketer-1', role: 'marketer' }, assetId: 'asset-1' }))
      .rejects.toMatchObject({ code })
  })

  test.each([
    ['direction', 'text/html'],
    ['final_image', 'application/json'],
    ['review_png', 'image/jpeg'],
    ['manifest', 'text/html'],
    ['delivery_zip', 'text/html'],
  ])('rejects %s assets with unsafe or inconsistent MIME %s before storage access', async (kind, mimeType) => {
    const { service, assetStore } = harness({ row: { ...record, kind, mimeType } })

    await expect(service.readAsset({ actor: { id: 'marketer-1', role: 'marketer' }, assetId: 'asset-1' }))
      .rejects.toMatchObject({ code: 'invalid_asset_content_type' })
    expect(assetStore.get).not.toHaveBeenCalled()
  })

  test('rejects a disabled actor before repository or storage access', async () => {
    const { service, repository, assetStore } = harness()
    await expect(service.readAsset({ actor: { id: 'marketer-1', role: 'marketer', disabledAt: new Date() }, assetId: 'asset-1' }))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(repository.findReadableById).not.toHaveBeenCalled()
    expect(assetStore.get).not.toHaveBeenCalled()
  })

  test('hides delivery ZIP bytes from designers while allowing marketer and admin downloads', async () => {
    const zipBytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('verified')])
    const zip = {
      ...record, kind: 'delivery_zip', mimeType: 'application/zip', width: null, height: null,
      byteSize: zipBytes.length, sha256: createHash('sha256').update(zipBytes).digest('hex'),
    }
    const designer = harness({ row: zip })
    await expect(designer.service.readAsset({ actor: { id: 'designer-1', role: 'designer' }, assetId: zip.id }))
      .resolves.toBeNull()
    expect(designer.assetStore.get).not.toHaveBeenCalled()

    for (const role of ['marketer', 'admin']) {
      const allowed = harness({ row: zip, stored: zipBytes })
      const asset = await allowed.service.readAsset({ actor: { id: `${role}-1`, role }, assetId: zip.id })
      expect(asset).toMatchObject({ kind: 'delivery_zip', stream: expect.anything() })
      const parts = []
      for await (const chunk of asset.stream) parts.push(Buffer.from(chunk))
      expect(Buffer.concat(parts)).toEqual(zipBytes)
      expect(allowed.assetStore.get).not.toHaveBeenCalled()
    }
  })

  test('removes the verified delivery download spool after the response stream closes', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'delivery-download-test-'))
    try {
      const zipBytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(256 * 1024, 0x61)])
      const zip = {
        ...record, kind: 'delivery_zip', mimeType: 'application/zip', width: null, height: null,
        byteSize: zipBytes.length, sha256: createHash('sha256').update(zipBytes).digest('hex'),
      }
      const input = harness({ row: zip, stored: zipBytes })
      const service = createAssetService({
        pool: { query: vi.fn() }, assetStore: input.assetStore,
        repositoryFactory: vi.fn(() => input.repository),
        deliverySpool: createDeliverySpool({ tempRoot, maxAggregateBytes: zipBytes.length }),
      })
      const asset = await service.readAsset({ actor: { id: 'marketer-1', role: 'marketer' }, assetId: zip.id })
      for await (const _chunk of asset.stream) { /* consume with stream backpressure */ }
      for (let attempt = 0; attempt < 100 && (await readdir(tempRoot)).length > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2))
      }
      expect(await readdir(tempRoot)).toEqual([])
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
