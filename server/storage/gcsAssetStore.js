import { Storage } from '@google-cloud/storage'
import { assertAssetBytes, assertContentType, assertSafeObjectKey, AssetStoreError } from './assetStore.js'

function statusCode(error) {
  const value = Number(error?.code ?? error?.response?.status)
  return Number.isInteger(value) ? value : null
}

function storageFailure(code, message) {
  return new AssetStoreError(code, message)
}

function readObjectStream(file, { timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const stream = file.createReadStream({ validation: 'crc32c' })
    const chunks = []
    let byteSize = 0
    let timer
    let settled = false

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      stream.removeListener('data', onData)
      stream.removeListener('end', onEnd)
      stream.removeListener('error', onError)
    }
    const finish = (error, bytes, destroy = false) => {
      if (settled) return
      settled = true
      cleanup()
      if (destroy && !stream.destroyed) stream.destroy()
      if (error) reject(error)
      else resolve(bytes)
    }
    const onData = (chunk) => {
      const bytes = Buffer.from(chunk)
      byteSize += bytes.length
      if (Number.isSafeInteger(maxBytes) && maxBytes >= 0 && byteSize > maxBytes) {
        finish(storageFailure('asset_too_large', 'Stored asset exceeds the allowed byte length'), undefined, true)
        return
      }
      chunks.push(bytes)
    }
    const onEnd = () => finish(undefined, Buffer.concat(chunks, byteSize))
    const onError = (error) => finish(error)

    stream.on('data', onData)
    stream.once('end', onEnd)
    stream.once('error', onError)
    if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        finish(storageFailure('storage_timeout', 'Private asset storage read timed out'), undefined, true)
      }, timeoutMs)
    }
  })
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
    async get({ objectKey, timeoutMs, maxBytes }) {
      assertSafeObjectKey(objectKey)
      try {
        return await readObjectStream(bucket.file(objectKey), { timeoutMs, maxBytes })
      } catch (error) {
        if (statusCode(error) === 404) return null
        if (error instanceof AssetStoreError) throw error
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
