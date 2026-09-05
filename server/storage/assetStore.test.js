import { describe, expect, test, vi } from 'vitest'
import { PassThrough, Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { AssetStoreError, assertSafeObjectKey } from './assetStore.js'
import { createMemoryAssetStore } from './memoryAssetStore.js'
import { createGcsAssetStore } from './gcsAssetStore.js'

const objectKey = 'campaigns/abc/generation-jobs/def/generated/asset-1.png'

describe('private immutable asset stores', () => {
  test('memory storage creates once, copies bytes, reads privately, and deletes idempotently', async () => {
    const store = createMemoryAssetStore()
    const source = Buffer.from('private bytes')

    await expect(store.put({ objectKey, bytes: source, contentType: 'image/png' }))
      .resolves.toMatchObject({ objectKey, byteSize: 13, generation: '1', etag: expect.any(String) })
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

  test('memory storage exposes immutable object identity and generation-fenced deletion', async () => {
    const store = createMemoryAssetStore()
    const created = await store.put({ objectKey, bytes: Buffer.from('first'), contentType: 'image/png' })
    const sha256 = 'a7937b64b8caa58f03721bb6bacf5c78cb235febe0e70b1b84cd99541461a08e'
    expect(created).toMatchObject({ objectKey, byteSize: 5, sha256, generation: expect.any(String), etag: expect.any(String) })
    await expect(store.getMetadata({ objectKey })).resolves.toEqual({
      objectKey, byteSize: 5, contentType: 'image/png', sha256,
      generation: created.generation, etag: created.etag,
    })
    await expect(store.delete({ objectKey, generation: 'replacement-generation' }))
      .rejects.toMatchObject({ code: 'object_generation_mismatch' })
    expect(await store.get({ objectKey })).toEqual(Buffer.from('first'))
    await expect(store.delete({ objectKey, generation: created.generation })).resolves.toEqual({ deleted: true })

    const replacement = await store.put({ objectKey, bytes: Buffer.from('second'), contentType: 'image/png' })
    expect(replacement.generation).not.toBe(created.generation)
    await expect(store.createReadStream({ objectKey, generation: created.generation }))
      .rejects.toMatchObject({ code: 'object_generation_mismatch' })
    const pinned = await store.createReadStream({ objectKey, generation: replacement.generation })
    const pinnedBytes = []
    for await (const chunk of pinned) pinnedBytes.push(Buffer.from(chunk))
    expect(Buffer.concat(pinnedBytes)).toEqual(Buffer.from('second'))
    await expect(store.delete({ objectKey, generation: created.generation }))
      .rejects.toMatchObject({ code: 'object_generation_mismatch' })
    expect(await store.get({ objectKey })).toEqual(Buffer.from('second'))
  })

  test('memory storage exposes bounded create-only streams for delivery tests', async () => {
    const store = createMemoryAssetStore({ maxStreamBytes: 32 })
    await expect(store.putStream({
      objectKey,
      stream: Readable.from([Buffer.from('private '), Buffer.from('bytes')]),
      contentType: 'application/zip',
      maxBytes: 32,
    })).resolves.toMatchObject({ objectKey, byteSize: 13, generation: '1', etag: expect.any(String) })

    const parts = []
    const readable = await store.createReadStream({ objectKey })
    await pipeline(readable, new Writable({ write(chunk, _encoding, done) { parts.push(Buffer.from(chunk)); done() } }))
    expect(Buffer.concat(parts)).toEqual(Buffer.from('private bytes'))
    await expect(store.putStream({
      objectKey: `${objectKey}.other`, stream: Readable.from([Buffer.alloc(33)]),
      contentType: 'application/zip', maxBytes: 32,
    })).rejects.toMatchObject({ code: 'asset_too_large' })
  })

  test('memory streaming upload aborts a stalled source without retaining a reservation', async () => {
    const store = createMemoryAssetStore({ maxStreamBytes: 32 })
    const source = new PassThrough()
    const controller = new AbortController()
    const upload = store.putStream({
      objectKey, stream: source, contentType: 'application/zip', maxBytes: 32, signal: controller.signal,
    })
    controller.abort()
    const outcome = await Promise.race([
      upload.catch((error) => error),
      new Promise((resolve) => setTimeout(() => resolve({ code: 'abort_ignored' }), 50)),
    ])
    expect(outcome).toMatchObject({ code: 'storage_aborted' })
    await expect(store.putStream({
      objectKey, stream: Readable.from([Buffer.from('retry')]), contentType: 'application/zip', maxBytes: 32,
    })).resolves.toMatchObject({ objectKey, byteSize: 5, generation: '1', etag: expect.any(String) })
  })

  test('memory streaming reads expose bounded views instead of copying one large buffer', async () => {
    const store = createMemoryAssetStore()
    await store.put({ objectKey, bytes: Buffer.alloc(256 * 1024, 0x61), contentType: 'application/zip' })
    const stream = await store.createReadStream({ objectKey })
    let largest = 0
    let total = 0
    for await (const chunk of stream) {
      largest = Math.max(largest, chunk.length)
      total += chunk.length
    }
    expect(total).toBe(256 * 1024)
    expect(largest).toBeLessThanOrEqual(64 * 1024)
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
    const file = vi.fn(() => ({
      metadata: { size: '6', contentType: 'image/png', generation: '101', etag: 'etag-101', metadata: {
        sha256: '87b04e58961f9a99d853d4046a0b5b793e7c3e4bbd21f5aca8fb17c20cdb1d8b',
      } },
      save, download, createReadStream, delete: remove,
    }))
    const bucket = vi.fn(() => ({ file }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket } })

    await expect(store.put({ objectKey, bytes: Buffer.from('stored'), contentType: 'image/png' }))
      .resolves.toMatchObject({ objectKey, byteSize: 6, generation: '101', etag: 'etag-101' })
    expect(bucket).toHaveBeenCalledWith('private-assets')
    expect(save).toHaveBeenCalledWith(expect.any(Buffer), {
      resumable: false,
      validation: 'crc32c',
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: 'image/png', cacheControl: 'private, max-age=31536000, immutable',
        metadata: { sha256: '87b04e58961f9a99d853d4046a0b5b793e7c3e4bbd21f5aca8fb17c20cdb1d8b' },
      },
    })
    expect(save.mock.calls[0][1]).not.toHaveProperty('predefinedAcl')
    await expect(store.get({ objectKey })).resolves.toEqual(Buffer.from('stored'))
    expect(createReadStream).toHaveBeenCalledWith({ validation: 'crc32c' })
    expect(download).not.toHaveBeenCalled()
    await expect(store.delete({ objectKey })).resolves.toEqual({ deleted: true })
  })

  test('GCS reads object identity and deletes only the exact stored generation', async () => {
    const remove = vi.fn(async () => [{}])
    const getMetadata = vi.fn(async () => [{
      size: '17', contentType: 'application/zip', generation: '1234', etag: 'etag-1234',
      metadata: { sha256: 'b'.repeat(64) },
    }])
    const file = vi.fn(() => ({ getMetadata, delete: remove }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket: () => ({ file }) } })

    await expect(store.getMetadata({ objectKey })).resolves.toEqual({
      objectKey, byteSize: 17, contentType: 'application/zip', sha256: 'b'.repeat(64),
      generation: '1234', etag: 'etag-1234',
    })
    await expect(store.delete({ objectKey, generation: '1234' })).resolves.toEqual({ deleted: true })
    expect(remove).toHaveBeenCalledWith({ ifGenerationMatch: '1234' })
  })

  test('GCS maps a generation precondition failure without deleting a replacement', async () => {
    const mismatch = Object.assign(new Error('provider details'), { code: 412 })
    const remove = vi.fn(async () => { throw mismatch })
    const store = createGcsAssetStore({
      bucketName: 'private-assets', storage: { bucket: () => ({ file: () => ({ delete: remove }) }) },
    })
    await expect(store.delete({ objectKey, generation: 'old-generation' }))
      .rejects.toMatchObject({ code: 'object_generation_mismatch', message: expect.not.stringContaining('details') })
  })

  test('GCS streaming writes use create-only CRC32C upload and preserve backpressure', async () => {
    const received = []
    const createWriteStream = vi.fn(() => new Writable({
      highWaterMark: 2,
      write(chunk, _encoding, done) { received.push(Buffer.from(chunk)); setImmediate(done) },
    }))
    const file = vi.fn(() => ({
      metadata: {
        size: '6', contentType: 'application/zip', generation: '102', etag: 'etag-102',
        metadata: { sha256: 'bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721' },
      },
      createWriteStream,
    }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket: () => ({ file }) } })

    await expect(store.putStream({
      objectKey, stream: Readable.from([Buffer.from('abc'), Buffer.from('def')]),
      contentType: 'application/zip', maxBytes: 6,
      sha256: 'bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721',
    })).resolves.toMatchObject({
      objectKey, byteSize: 6, sha256: 'bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721',
      generation: '102', etag: 'etag-102',
    })
    expect(Buffer.concat(received)).toEqual(Buffer.from('abcdef'))
    expect(createWriteStream).toHaveBeenCalledWith({
      resumable: false,
      validation: 'crc32c',
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: 'application/zip', cacheControl: 'private, max-age=31536000, immutable',
        metadata: { sha256: 'bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721' },
      },
    })
  })

  test('GCS streaming reads and writes honor one AbortSignal', async () => {
    const read = new PassThrough()
    const write = new PassThrough()
    const file = vi.fn(() => ({ createReadStream: () => read, createWriteStream: () => write }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket: () => ({ file }) } })
    const controller = new AbortController()
    const source = await store.createReadStream({ objectKey, signal: controller.signal })
    const upload = store.putStream({
      objectKey: `${objectKey}.zip`, stream: new PassThrough(), contentType: 'application/zip',
      maxBytes: 10, signal: controller.signal,
    })
    controller.abort()
    await expect(upload).rejects.toMatchObject({ code: 'storage_aborted' })
    expect(source.destroyed).toBe(true)
    expect(write.destroyed).toBe(true)
  })

  test('GCS can pin a streaming read to one immutable object generation', async () => {
    const createReadStream = vi.fn(() => Readable.from([Buffer.from('generation bytes')]))
    const file = vi.fn(() => ({ createReadStream }))
    const store = createGcsAssetStore({ bucketName: 'private-assets', storage: { bucket: () => ({ file }) } })

    const source = await store.createReadStream({ objectKey, generation: '1234' })
    const chunks = []
    for await (const chunk of source) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(Buffer.from('generation bytes'))
    expect(file).toHaveBeenCalledWith(objectKey, { generation: '1234' })
    expect(createReadStream).toHaveBeenCalledWith({ validation: 'crc32c' })
  })

  test('GCS streaming upload destroys its source and maps an erroring sink safely', async () => {
    const providerError = Object.assign(new Error('provider secret'), { code: 500 })
    const source = Readable.from([Buffer.alloc(128 * 1024, 0x61)])
    const target = new Writable({ write(_chunk, _encoding, done) { done(providerError) } })
    const store = createGcsAssetStore({
      bucketName: 'private-assets',
      storage: { bucket: () => ({ file: () => ({ createWriteStream: () => target }) }) },
    })
    await expect(store.putStream({
      objectKey, stream: source, contentType: 'application/zip', maxBytes: 128 * 1024,
    })).rejects.toMatchObject({ code: 'storage_unavailable', message: expect.not.stringContaining('secret') })
    expect(source.destroyed).toBe(true)
    expect(target.destroyed).toBe(true)
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
