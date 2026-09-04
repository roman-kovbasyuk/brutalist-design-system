import { Storage } from '@google-cloud/storage'
import { assertAssetBytes, assertContentType, assertSafeObjectKey, AssetStoreError } from './assetStore.js'

function statusCode(error) {
  const value = Number(error?.code ?? error?.response?.status)
  return Number.isInteger(value) ? value : null
}

function storageFailure(code, message) {
  return new AssetStoreError(code, message)
}

export function createGcsAssetStore({ bucketName, projectId, storage } = {}) {
  if (typeof bucketName !== 'string' || bucketName.trim().length === 0) throw new TypeError('A GCS asset bucket is required')
  const client = storage ?? new Storage({ projectId })
  if (!client || typeof client.bucket !== 'function') throw new TypeError('A Google Cloud Storage client is required')
  const bucket = client.bucket(bucketName)

  return Object.freeze({
    async put({ objectKey, bytes, contentType, timeoutMs }) {
      assertSafeObjectKey(objectKey)
      assertContentType(contentType)
      const source = assertAssetBytes(bytes)
      try {
        await bucket.file(objectKey).save(Buffer.from(source), {
          resumable: false,
          validation: 'crc32c',
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: { contentType, cacheControl: 'private, max-age=31536000, immutable' },
          ...(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? { timeout: timeoutMs } : {}),
        })
      } catch (error) {
        if ([409, 412].includes(statusCode(error))) throw storageFailure('object_exists', 'Asset object already exists')
        throw storageFailure('storage_unavailable', 'Private asset storage is unavailable')
      }
      return { objectKey, byteSize: source.length }
    },
    async get({ objectKey }) {
      assertSafeObjectKey(objectKey)
      try {
        const [bytes] = await bucket.file(objectKey).download({ validation: 'crc32c' })
        return Buffer.from(bytes)
      } catch (error) {
        if (statusCode(error) === 404) return null
        throw storageFailure('storage_unavailable', 'Private asset storage is unavailable')
      }
    },
    async delete({ objectKey }) {
      assertSafeObjectKey(objectKey)
      try {
        await bucket.file(objectKey).delete()
        return { deleted: true }
      } catch (error) {
        if (statusCode(error) === 404) return { deleted: false }
        throw storageFailure('storage_unavailable', 'Private asset storage is unavailable')
      }
    },
    async close() {},
  })
}
