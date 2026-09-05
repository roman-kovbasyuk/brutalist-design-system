import { Storage } from '@google-cloud/storage'
import { createHash } from 'node:crypto'
import { addAbortSignal, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { assertAssetBytes, assertContentType, assertSafeObjectKey, AssetStoreError } from './assetStore.js'

function statusCode(error) {
  const value = Number(error?.code ?? error?.response?.status)
  return Number.isInteger(value) ? value : null
}

function storageFailure(code, message) {
  return new AssetStoreError(code, message)
}

function objectIdentity(objectKey, metadata) {
  const byteSize = Number(metadata?.size)
  const generation = metadata?.generation
  const sha256 = metadata?.metadata?.sha256 ?? null
  if (!Number.isSafeInteger(byteSize) || byteSize < 0
    || typeof generation !== 'string' || !/^\d+$/.test(generation)
    || sha256 != null && (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256))) {
    throw storageFailure('storage_unavailable', 'Private asset storage returned invalid object metadata')
  }
  return {
    objectKey,
    byteSize,
    contentType: metadata.contentType ?? null,
    sha256,
    generation,
    etag: typeof metadata.etag === 'string' && metadata.etag.length > 0 ? metadata.etag : null,
  }
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
      const sha256 = createHash('sha256').update(source).digest('hex')
      try {
        const file = bucket.file(objectKey)
        await file.save(Buffer.from(source), {
          resumable: false,
          validation: 'crc32c',
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType,
            cacheControl: 'private, max-age=31536000, immutable',
            metadata: { sha256 },
          },
          ...(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? { timeout: timeoutMs } : {}),
        })
        return objectIdentity(objectKey, file.metadata)
      } catch (error) {
        if ([409, 412].includes(statusCode(error))) throw storageFailure('object_exists', 'Asset object already exists')
        throw storageFailure('storage_unavailable', 'Private asset storage is unavailable')
      }
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
    async getMetadata({ objectKey }) {
      assertSafeObjectKey(objectKey)
      try {
        const [metadata] = await bucket.file(objectKey).getMetadata()
        return objectIdentity(objectKey, metadata)
      } catch (error) {
        if (statusCode(error) === 404) return null
        if (error instanceof AssetStoreError) throw error
        throw storageFailure('storage_unavailable', 'Private asset storage is unavailable')
      }
    },
    async createReadStream({ objectKey, generation, signal } = {}) {
      assertSafeObjectKey(objectKey)
      if (signal?.aborted) throw storageFailure('storage_aborted', 'Private asset storage operation was aborted')
      const stream = bucket.file(objectKey, generation == null ? undefined : { generation })
        .createReadStream({ validation: 'crc32c' })
      if (signal) addAbortSignal(signal, stream)
      return stream
    },
    async putStream({ objectKey, stream, contentType, maxBytes, sha256, signal } = {}) {
      assertSafeObjectKey(objectKey)
      assertContentType(contentType)
      if (!stream || typeof stream.pipe !== 'function') throw storageFailure('invalid_asset_stream', 'Asset stream is required')
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw storageFailure('invalid_asset_limit', 'Asset stream byte ceiling is required')
      if (sha256 != null && (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256))) {
        throw storageFailure('invalid_asset_hash', 'Asset stream hash is invalid')
      }
      let byteSize = 0
      const hash = createHash('sha256')
      const limiter = new Transform({
        transform(chunk, _encoding, done) {
          byteSize += chunk.length
          if (byteSize > maxBytes) return done(storageFailure('asset_too_large', 'Stored asset exceeds the allowed byte length'))
          hash.update(chunk)
          done(null, chunk)
        },
      })
      const file = bucket.file(objectKey)
      const target = file.createWriteStream({
        resumable: false,
        validation: 'crc32c',
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType,
          cacheControl: 'private, max-age=31536000, immutable',
          ...(sha256 == null ? {} : { metadata: { sha256 } }),
        },
      })
      try {
        await pipeline(stream, limiter, target, { signal })
      } catch (error) {
        if (error instanceof AssetStoreError) throw error
        if (signal?.aborted || error?.name === 'AbortError') throw storageFailure('storage_aborted', 'Private asset storage operation was aborted')
        if ([409, 412].includes(statusCode(error))) throw storageFailure('object_exists', 'Asset object already exists')
        throw storageFailure('storage_unavailable', 'Private asset storage is unavailable')
      }
      if (byteSize < 1) throw storageFailure('invalid_asset_bytes', 'Asset bytes are required')
      if (sha256 != null && hash.digest('hex') !== sha256) {
        throw storageFailure('asset_hash_mismatch', 'Stored asset hash does not match its declared identity')
      }
      return objectIdentity(objectKey, file.metadata)
    },
    async delete({ objectKey, generation } = {}) {
      assertSafeObjectKey(objectKey)
      try {
        await bucket.file(objectKey).delete(generation == null ? {} : { ifGenerationMatch: generation })
        return { deleted: true }
      } catch (error) {
        if (statusCode(error) === 404) return { deleted: false }
        if (statusCode(error) === 412) throw storageFailure('object_generation_mismatch', 'Asset object generation changed')
        throw storageFailure('storage_unavailable', 'Private asset storage is unavailable')
      }
    },
    async close() {},
  })
}
