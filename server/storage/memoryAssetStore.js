import { assertAssetBytes, assertContentType, assertSafeObjectKey, AssetStoreError } from './assetStore.js'

export function createMemoryAssetStore() {
  const objects = new Map()
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
    async delete({ objectKey }) {
      assertSafeObjectKey(objectKey)
      return { deleted: objects.delete(objectKey) }
    },
    async close() {},
  })
}
