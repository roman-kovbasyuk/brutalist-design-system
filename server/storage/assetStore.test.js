import { describe, expect, test, vi } from 'vitest'
import { PassThrough, Readable } from 'node:stream'
import { AssetStoreError, assertSafeObjectKey } from './assetStore.js'
import { createMemoryAssetStore } from './memoryAssetStore.js'
import { createGcsAssetStore } from './gcsAssetStore.js'

const objectKey = 'campaigns/abc/generation-jobs/def/generated/asset-1.png'

describe('private immutable asset stores', () => {
  test('memory storage creates once, copies bytes, reads privately, and deletes idempotently', async () => {
    const store = createMemoryAssetStore()
    const source = Buffer.from('private bytes')

    await expect(store.put({ objectKey, bytes: source, contentType: 'image/png' }))
      .resolves.toEqual({ objectKey, byteSize: 13 })
    source[0] = 0
    const firstRead = await store.get({ objectKey })
    expect(Buffer.from(firstRead)).toEqual(Buffer.from('private bytes'))
    firstRead[0] = 0
    expect(Buffer.from(await store.get({ objectKey }))).toEqual(Buffer.from('private bytes'))
    await expect(store.put({ objectKey, bytes: Buffer.from('different'), contentType: 'image/png' }))
      .rejects.toMatchObject({ code: 'object_exists' })
    await expect(store.delete({ objectKey })).resolves.toEqual({ deleted: true })
    await expect(store.delete({ objectKey })).resolves.toEqual({ deleted: false })
    await expect(store.get({ objectKey })).resolves.toBeNull()
  })

  test.each(['', '/absolute.png', '../escape.png', 'safe/../escape.png', 'safe\\escape.png', 'safe//empty.png', 'https://public.example/a.png'])
  ('rejects unsafe object key %j before touching storage', async (key) => {
    expect(() => assertSafeObjectKey(key)).toThrow(AssetStoreError)
    const store = createMemoryAssetStore()
    await expect(store.put({ objectKey: key, bytes: Buffer.from('x'), contentType: 'image/png' }))
      .rejects.toMatchObject({ code: 'unsafe_object_key' })
  })

  test('GCS uses a private create-only write and has memory-equivalent read/delete semantics', async () => {
    const save = vi.fn(async () => {})
    const download = vi.fn(async () => [Buffer.from('stored')])
    const createReadStream = vi.fn(() => Readable.from([Buffer.from('stored')]))
    const remove = vi.fn(async () => [{}])
    const file = vi.fn(() => ({ save, download, createReadStream, delete: remove }))
    const bucket = vi.fn(() => ({ file }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket } })

    await expect(store.put({ objectKey, bytes: Buffer.from('stored'), contentType: 'image/png' }))
      .resolves.toEqual({ objectKey, byteSize: 6 })
    expect(bucket).toHaveBeenCalledWith('private-assets')
    expect(save).toHaveBeenCalledWith(expect.any(Buffer), {
      resumable: false,
      validation: 'crc32c',
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: 'image/png', cacheControl: 'private, max-age=31536000, immutable' },
    })
    expect(save.mock.calls[0][1]).not.toHaveProperty('predefinedAcl')
    await expect(store.get({ objectKey })).resolves.toEqual(Buffer.from('stored'))
    expect(createReadStream).toHaveBeenCalledWith({ validation: 'crc32c' })
    expect(download).not.toHaveBeenCalled()
    await expect(store.delete({ objectKey })).resolves.toEqual({ deleted: true })
  })

  test('destroys a stalled GCS read stream at its request deadline and cleans listeners', async () => {
    const stream = new PassThrough()
    const destroy = vi.spyOn(stream, 'destroy')
    const file = vi.fn(() => ({
      createReadStream: vi.fn(() => stream),
      download: vi.fn(() => new Promise(() => {})),
    }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket: () => ({ file }) } })

    const outcome = await Promise.race([
      store.get({ objectKey, timeoutMs: 10 }).catch((error) => error),
      new Promise((resolve) => setTimeout(() => resolve({ code: 'deadline_ignored' }), 50)),
    ])
    expect(outcome).toMatchObject({ code: 'storage_timeout' })
    expect(destroy).toHaveBeenCalledOnce()
    expect(stream.listenerCount('data')).toBe(0)
    expect(stream.listenerCount('end')).toBe(0)
    expect(stream.listenerCount('error')).toBe(0)
  })

  test('destroys GCS reads that exceed the caller byte limit', async () => {
    const stream = Readable.from([Buffer.from('abc'), Buffer.from('def')])
    const destroy = vi.spyOn(stream, 'destroy')
    const file = vi.fn(() => ({
      createReadStream: vi.fn(() => stream),
      download: vi.fn(async () => [Buffer.from('abcdef')]),
    }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket: () => ({ file }) } })

    await expect(store.get({ objectKey, maxBytes: 4 }))
      .rejects.toMatchObject({ code: 'asset_too_large' })
    expect(destroy).toHaveBeenCalled()
  })

  test('GCS maps precondition and missing-object responses without exposing provider details', async () => {
    const providerFailure = Object.assign(new Error('bucket secret'), { code: 412 })
    const missing = Object.assign(new Error('not found'), { code: 404 })
    const file = vi.fn(() => ({
      save: vi.fn(async () => { throw providerFailure }),
      download: vi.fn(async () => { throw missing }),
      createReadStream: vi.fn(() => {
        const stream = new PassThrough()
        queueMicrotask(() => stream.destroy(missing))
        return stream
      }),
      delete: vi.fn(async () => { throw missing }),
    }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket: () => ({ file }) } })

    await expect(store.put({ objectKey, bytes: Buffer.from('x'), contentType: 'image/png' }))
      .rejects.toMatchObject({ code: 'object_exists', message: expect.not.stringContaining('secret') })
    await expect(store.get({ objectKey })).resolves.toBeNull()
    await expect(store.delete({ objectKey })).resolves.toEqual({ deleted: false })
  })
})
