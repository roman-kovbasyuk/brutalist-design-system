import { createHash } from 'node:crypto'
import { roleSchema } from '../../shared/contracts.js'
import { assertSafeObjectKey, validateAssetStore } from '../storage/assetStore.js'
import { createAssetRepository } from '../repositories/assetRepository.js'

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

export function createAssetService({ pool, assetStore, repositoryFactory = createAssetRepository } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  validateAssetStore(assetStore)
  if (typeof repositoryFactory !== 'function') throw new TypeError('An asset repository factory is required')

  return Object.freeze({
    async readAsset({ actor, assetId }) {
      if (!actor?.id || !roleSchema.safeParse(actor.role).success || actor.disabled === true || actor.disabledAt != null) forbidden()
      if (typeof assetId !== 'string' || assetId.trim().length === 0) {
        throw new AssetServiceError(400, 'invalid_asset_id', 'Asset id is required')
      }
      const record = await repositoryFactory(pool).findReadableById({ assetId, actorId: actor.id })
      if (!record) return null
      try {
        assertSafeObjectKey(record.objectKey)
      } catch {
        throw new AssetServiceError(502, 'unsafe_object_key', 'Stored asset metadata is invalid')
      }
      const stored = await assetStore.get({ objectKey: record.objectKey })
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
