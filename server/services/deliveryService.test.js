import { describe, expect, test, vi } from 'vitest'
import { createDeliveryService } from './deliveryService.js'

function dependencies() {
  return {
    pool: { query: vi.fn(), connect: vi.fn() },
    assetStore: { put: vi.fn(), get: vi.fn(), delete: vi.fn(), getMetadata: vi.fn(), createReadStream: vi.fn(), putStream: vi.fn() },
    transaction: vi.fn(),
    recoveryTransaction: vi.fn(),
  }
}

describe('approved delivery service boundary', () => {
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
