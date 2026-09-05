import { constants } from 'node:fs'
import { mkdir, open, link, unlink, lstat, realpath } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { assertAssetBytes, assertContentType, assertSafeObjectKey, AssetStoreError } from './assetStore.js'

// Explicit local-demo storage only. Production startup does not import or select this adapter.
export async function createLocalDemoAssetStore({ directory, maxStreamBytes = 16 * 1024 * 1024 } = {}) {
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) throw new Error('Local demo asset storage cannot run in production')
  if (!directory || !Number.isSafeInteger(maxStreamBytes) || maxStreamBytes < 1) throw new TypeError('A local directory and positive asset limit are required')
  const requestedRoot = resolve(directory)
  await mkdir(requestedRoot, { recursive: true, mode: 0o700 })
  if ((await lstat(requestedRoot)).isSymbolicLink()) throw new Error('Local demo storage must be a real directory')
  const root = await realpath(requestedRoot)
  const locks = new Map()
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const filename = (objectKey) => join(root, `${hash(assertSafeObjectKey(objectKey))}.json`)
  const metadata = (stored) => ({ objectKey: stored.objectKey, byteSize: stored.byteSize, contentType: stored.contentType, sha256: stored.sha256, generation: stored.generation, etag: stored.sha256 })
  async function serialized(key, operation) {
    const previous = locks.get(key) ?? Promise.resolve()
    const current = previous.catch(() => {}).then(operation)
    locks.set(key, current)
    try { return await current } finally { if (locks.get(key) === current) locks.delete(key) }
  }
  async function read(objectKey) {
    let handle
    try {
      handle = await open(filename(objectKey), constants.O_RDONLY | constants.O_NOFOLLOW)
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > maxStreamBytes * 2 + 4096) throw new AssetStoreError('asset_integrity_failure', 'Stored asset is invalid')
      const stored = JSON.parse(await handle.readFile('utf8'))
      const bytes = Buffer.from(stored.bytes, 'base64')
      if (stored.objectKey !== objectKey || bytes.length !== stored.byteSize || hash(bytes) !== stored.sha256
        || !/^[1-9][0-9]*$/.test(stored.generation) || stored.byteSize < 1 || stored.byteSize > maxStreamBytes) {
        throw new AssetStoreError('asset_integrity_failure', 'Stored asset is invalid')
      }
      assertContentType(stored.contentType)
      return { ...stored, bytes }
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    } finally { await handle?.close() }
  }
  async function publish({ objectKey, bytes, contentType }) {
    const destination = filename(objectKey)
    assertContentType(contentType)
    const source = assertAssetBytes(bytes)
    if (source.length > maxStreamBytes) throw new AssetStoreError('asset_too_large', 'Stored asset exceeds the allowed byte length')
    const stored = { objectKey, contentType, byteSize: source.length, sha256: hash(source), generation: BigInt(`0x${randomBytes(16).toString('hex')}`).toString(), bytes: source.toString('base64') }
    const temporary = join(root, `${randomUUID()}.tmp`)
    let handle
    try {
      handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      await handle.writeFile(JSON.stringify(stored))
      await handle.sync()
      await handle.close()
      handle = null
      // Atomic create-only publication: readers never see a partial file; existing assets cannot be overwritten.
      await link(temporary, destination)
      return metadata(stored)
    } catch (error) {
      if (error.code === 'EEXIST') throw new AssetStoreError('object_exists', 'Asset object already exists')
      throw error
    } finally {
      await handle?.close()
      await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error })
    }
  }
  const store = {
    put: (input) => serialized(assertSafeObjectKey(input.objectKey), () => publish(input)),
    async get({ objectKey }) { return (await read(objectKey))?.bytes ?? null },
    async getMetadata({ objectKey }) { const stored = await read(objectKey); return stored ? metadata(stored) : null },
    async createReadStream({ objectKey, generation, signal } = {}) {
      if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
      const stored = await read(objectKey)
      if (!stored) return null
      if (generation != null && generation !== stored.generation) throw new AssetStoreError('object_generation_mismatch', 'Asset object generation changed')
      return Readable.from((function* () { for (let offset = 0; offset < stored.bytes.length; offset += 65536) yield stored.bytes.subarray(offset, offset + 65536) })(), { signal })
    },
    putStream({ objectKey, stream, contentType, maxBytes, sha256, signal } = {}) {
      return serialized(assertSafeObjectKey(objectKey), async () => {
        assertContentType(contentType)
        if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw new AssetStoreError('invalid_asset_stream', 'Asset stream is required')
        const limit = Math.min(maxStreamBytes, maxBytes)
        if (!Number.isSafeInteger(limit) || limit < 1) throw new AssetStoreError('invalid_asset_limit', 'Asset stream byte ceiling is required')
        const parts = []
        let size = 0
        for await (const part of stream) {
          if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
          const bytes = Buffer.from(part)
          size += bytes.length
          if (size > limit) throw new AssetStoreError('asset_too_large', 'Stored asset exceeds the allowed byte length')
          parts.push(bytes)
        }
        if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
        const bytes = Buffer.concat(parts)
        if (sha256 != null && hash(bytes) !== sha256) throw new AssetStoreError('asset_hash_mismatch', 'Stored asset hash does not match its declared identity')
        return publish({ objectKey, bytes, contentType })
      })
    },
    delete({ objectKey, generation } = {}) {
      return serialized(assertSafeObjectKey(objectKey), async () => {
        const stored = await read(objectKey)
        if (!stored) return { deleted: false }
        if (generation != null && generation !== stored.generation) throw new AssetStoreError('object_generation_mismatch', 'Asset object generation changed')
        await unlink(filename(objectKey))
        return { deleted: true }
      })
    },
    async close() { await Promise.allSettled([...locks.values()]) },
  }
  return Object.freeze(store)
}
