import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { createAssetService } from './assetService.js'

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
  const assetStore = { get: vi.fn(async () => stored), put: vi.fn(), delete: vi.fn() }
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

  test('rejects a disabled actor before repository or storage access', async () => {
    const { service, repository, assetStore } = harness()
    await expect(service.readAsset({ actor: { id: 'marketer-1', role: 'marketer', disabledAt: new Date() }, assetId: 'asset-1' }))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(repository.findReadableById).not.toHaveBeenCalled()
    expect(assetStore.get).not.toHaveBeenCalled()
  })
})
