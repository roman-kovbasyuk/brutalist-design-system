import { addAbortSignal, Readable } from 'node:stream'
import { assertAssetBytes, assertContentType, assertSafeObjectKey, AssetStoreError } from './assetStore.js'

export function createMemoryAssetStore({ maxStreamBytes = 16 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxStreamBytes) || maxStreamBytes <= 0) throw new TypeError('Memory stream byte ceiling is required')
  const objects = new Map()
  const pending = new Set()
  return Object.freeze({
    async put({ objectKey, bytes, contentType }) {
      assertSafeObjectKey(objectKey)
      assertContentType(contentType)
      const source = assertAssetBytes(bytes)
      if (objects.has(objectKey)) throw new AssetStoreError('object_exists', 'Asset object already exists')
      objects.set(objectKey, { bytes: Buffer.from(source), contentType })
      return { objectKey, byteSize: source.length }
    },
    async get({ objectKey }) {
      assertSafeObjectKey(objectKey)
      const stored = objects.get(objectKey)
      return stored ? Buffer.from(stored.bytes) : null
    },
    async createReadStream({ objectKey, signal } = {}) {
      assertSafeObjectKey(objectKey)
      if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
      const stored = objects.get(objectKey)
      if (!stored) return null
      return Readable.from((function* boundedChunks() {
        for (let offset = 0; offset < stored.bytes.length; offset += 64 * 1024) {
          yield Buffer.from(stored.bytes.subarray(offset, offset + 64 * 1024))
        }
      }()), { signal })
    },
    async putStream({ objectKey, stream, contentType, maxBytes, signal } = {}) {
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
      try {
        for await (const chunk of stream) {
          if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
          const part = Buffer.from(chunk)
          byteSize += part.length
          if (byteSize > ceiling) throw new AssetStoreError('asset_too_large', 'Stored asset exceeds the allowed byte length')
          chunks.push(part)
        }
        if (signal?.aborted) throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
        if (byteSize < 1) throw new AssetStoreError('invalid_asset_bytes', 'Asset bytes are required')
        objects.set(objectKey, { bytes: Buffer.concat(chunks, byteSize), contentType })
        return { objectKey, byteSize }
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') {
          throw new AssetStoreError('storage_aborted', 'Private asset storage operation was aborted')
        }
        throw error
      } finally {
        pending.delete(objectKey)
      }
    },
    async delete({ objectKey }) {
      assertSafeObjectKey(objectKey)
      return { deleted: objects.delete(objectKey) }
    },
    async close() {},
  })
}
