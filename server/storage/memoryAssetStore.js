import { createHash } from 'node:crypto'
import { addAbortSignal, Readable } from 'node:stream'
import { assertAssetBytes, assertContentType, assertSafeObjectKey, AssetStoreError } from './assetStore.js'

export function createMemoryAssetStore({ maxStreamBytes = 16 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxStreamBytes) || maxStreamBytes <= 0) throw new TypeError('Memory stream byte ceiling is required')
  const objects = new Map()
  const pending = new Set()
  let nextGeneration = 1n

  const identity = (objectKey, stored) => stored && ({
    objectKey,
    byteSize: stored.bytes.length,
    contentType: stored.contentType,
    sha256: stored.sha256,
    generation: stored.generation,
    etag: stored.etag,
  })

  const createStoredObject = (bytes, contentType) => {
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    return {
      bytes,
      contentType,
      sha256,
      generation: String(nextGeneration++),
      etag: sha256,
    }
  }
  return Object.freeze({
    async put({ objectKey, bytes, contentType }) {
      assertSafeObjectKey(objectKey)
      assertContentType(contentType)
      const source = assertAssetBytes(bytes)
      if (objects.has(objectKey)) throw new AssetStoreError('object_exists', 'Asset object already exists')
      const stored = createStoredObject(Buffer.from(source), contentType)
      objects.set(objectKey, stored)
      return identity(objectKey, stored)
    },
    async get({ objectKey }) {
      assertSafeObjectKey(objectKey)
      const stored = objects.get(objectKey)
      return stored ? Buffer.from(stored.bytes) : null
    },
    async getMetadata({ objectKey }) {
      assertSafeObjectKey(objectKey)
      return identity(objectKey, objects.get(objectKey)) ?? null
    },
    async createReadStream({ objectKey, generation, signal } = {}) {
      assertSafeObjectKey(objectKey)
      if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
      const stored = objects.get(objectKey)
      if (!stored) return null
      if (generation != null && generation !== stored.generation) {
        throw new AssetStoreError('object_generation_mismatch', 'Asset object generation changed')
      }
      return Readable.from((function* boundedChunks() {
        for (let offset = 0; offset < stored.bytes.length; offset += 64 * 1024) {
          yield Buffer.from(stored.bytes.subarray(offset, offset + 64 * 1024))
        }
      }()), { signal })
    },
    async putStream({ objectKey, stream, contentType, maxBytes, sha256, signal } = {}) {
      assertSafeObjectKey(objectKey)
      assertContentType(contentType)
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw new AssetStoreError('invalid_asset_stream', 'Asset stream is required')
      const ceiling = Math.min(maxStreamBytes, maxBytes)
      if (!Number.isSafeInteger(ceiling) || ceiling <= 0) throw new AssetStoreError('invalid_asset_limit', 'Asset stream byte ceiling is required')
      if (objects.has(objectKey) || pending.has(objectKey)) throw new AssetStoreError('object_exists', 'Asset object already exists')
      pending.add(objectKey)
      if (signal) addAbortSignal(signal, stream)
      const chunks = []
      let byteSize = 0
      const hash = createHash('sha256')
      try {
        for await (const chunk of stream) {
          if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
          const part = Buffer.from(chunk)
          byteSize += part.length
          if (byteSize > ceiling) throw new AssetStoreError('asset_too_large', 'Stored asset exceeds the allowed byte length')
          hash.update(part)
          chunks.push(part)
        }
        if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
        if (byteSize < 1) throw new AssetStoreError('invalid_asset_bytes', 'Asset bytes are required')
        const digest = hash.digest('hex')
        if (sha256 != null && digest !== sha256) {
          throw new AssetStoreError('asset_hash_mismatch', 'Stored asset hash does not match its declared identity')
        }
        const stored = createStoredObject(Buffer.concat(chunks, byteSize), contentType)
        objects.set(objectKey, stored)
        return identity(objectKey, stored)
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') {
          throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
        }
        throw error
      } finally {
        pending.delete(objectKey)
      }
    },
    async delete({ objectKey, generation } = {}) {
      assertSafeObjectKey(objectKey)
      const stored = objects.get(objectKey)
      if (stored && generation != null && generation !== stored.generation) {
        throw new AssetStoreError('object_generation_mismatch', 'Asset object generation changed')
      }
      return { deleted: objects.delete(objectKey) }
    },
    async close() {},
  })
}
