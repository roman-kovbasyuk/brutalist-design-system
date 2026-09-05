import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { roleSchema } from '../../shared/contracts.js'
import { assertSafeObjectKey, validateAssetStore } from '../storage/assetStore.js'
import { createAssetRepository } from '../repositories/assetRepository.js'
import { sharedDeliverySpool, streamToVerifiedFile } from './deliverySpool.js'

export class AssetServiceError extends Error {
  constructor(statusCode, code, message) {
    super(message)
    this.name = 'AssetServiceError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.expose = true
  }
}

function forbidden() {
  throw new AssetServiceError(403, 'forbidden', 'This actor cannot read the requested asset')
}

const mimeTypesByKind = Object.freeze({
  direction: new Set(['image/png', 'image/jpeg', 'image/webp']),
  final_image: new Set(['image/png', 'image/jpeg', 'image/webp']),
  review_png: new Set(['image/png']),
  manifest: new Set(['application/json']),
  delivery_zip: new Set(['application/zip']),
})

export function createAssetService({
  pool, assetStore, repositoryFactory = createAssetRepository,
  deliverySpool = sharedDeliverySpool, downloadTimeoutMs = 30_000,
  maxDeliveryDownloadBytes = 256 * 1024 * 1024,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  validateAssetStore(assetStore)
  if (typeof repositoryFactory !== 'function') throw new TypeError('An asset repository factory is required')
  if (!deliverySpool || typeof deliverySpool.acquire !== 'function') throw new TypeError('A delivery spool is required')
  if (![downloadTimeoutMs, maxDeliveryDownloadBytes].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new TypeError('Asset download limits must be positive safe integers')
  }

  async function readDelivery(record) {
    if (record.byteSize > maxDeliveryDownloadBytes) {
      throw new AssetServiceError(502, 'asset_integrity_failure', 'Stored delivery ZIP exceeds its byte limit')
    }
    if (typeof assetStore.createReadStream !== 'function') {
      throw new AssetServiceError(503, 'asset_storage_unavailable', 'Private asset storage does not support streaming')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), downloadTimeoutMs)
    let lease
    try {
      lease = await deliverySpool.acquire({ reservationBytes: record.byteSize, signal: controller.signal })
      const source = await assetStore.createReadStream({ objectKey: record.objectKey, signal: controller.signal })
      if (!source) throw new AssetServiceError(502, 'asset_bytes_missing', 'Stored asset bytes are unavailable')
      const outputPath = lease.workspace.file(0)
      await streamToVerifiedFile({
        readable: source, outputPath, expectedByteSize: record.byteSize, expectedSha256: record.sha256,
        maxBytes: maxDeliveryDownloadBytes, signal: controller.signal,
      })
      const handle = await open(outputPath, 'r')
      const signature = Buffer.alloc(4)
      try { await handle.read(signature, 0, signature.length, 0) } finally { await handle.close() }
      if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        throw new AssetServiceError(502, 'asset_integrity_failure', 'Stored delivery ZIP is invalid')
      }
      clearTimeout(timer)
      const stream = createReadStream(outputPath, { highWaterMark: 64 * 1024 })
      let released = false
      const release = () => {
        if (released) return
        released = true
        void lease.release().catch(() => {})
      }
      stream.once('close', release)
      return { ...record, stream }
    } catch (error) {
      clearTimeout(timer)
      if (lease) await lease.release()
      if (error instanceof AssetServiceError) throw error
      if (controller.signal.aborted) throw new AssetServiceError(503, 'asset_storage_timeout', 'Private asset storage read timed out')
      if (error?.code === 'delivery_capacity_exceeded') {
        throw new AssetServiceError(503, 'asset_capacity_unavailable', 'Private asset download capacity is temporarily unavailable')
      }
      if (['asset_integrity_failure', 'asset_too_large'].includes(error?.code)) {
        throw new AssetServiceError(502, 'asset_integrity_failure', 'Stored asset integrity verification failed')
      }
      throw new AssetServiceError(502, 'asset_bytes_missing', 'Stored asset bytes are unavailable')
    }
  }

  return Object.freeze({
    async readAsset({ actor, assetId }) {
      if (!actor?.id || !roleSchema.safeParse(actor.role).success || actor.disabled === true || actor.disabledAt != null) forbidden()
      if (typeof assetId !== 'string' || assetId.trim().length === 0) {
        throw new AssetServiceError(400, 'invalid_asset_id', 'Asset id is required')
      }
      const record = await repositoryFactory(pool).findReadableById({ assetId, actorId: actor.id })
      if (!record) return null
      if (record.kind === 'delivery_zip' && !['marketer', 'admin'].includes(actor.role)) return null
      if (!mimeTypesByKind[record.kind]?.has(record.mimeType)) {
        throw new AssetServiceError(502, 'invalid_asset_content_type', 'Stored asset content type is invalid')
      }
      try {
        assertSafeObjectKey(record.objectKey)
      } catch {
        throw new AssetServiceError(502, 'unsafe_object_key', 'Stored asset metadata is invalid')
      }
      if (record.kind === 'delivery_zip') return readDelivery(record)
      const stored = await assetStore.get({ objectKey: record.objectKey, maxBytes: record.byteSize })
      if (stored == null) throw new AssetServiceError(502, 'asset_bytes_missing', 'Stored asset bytes are unavailable')
      const bytes = Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (bytes.length !== record.byteSize || sha256 !== record.sha256) {
        throw new AssetServiceError(502, 'asset_integrity_failure', 'Stored asset integrity verification failed')
      }
      return { ...record, bytes: Buffer.from(bytes) }
    },
  })
}
