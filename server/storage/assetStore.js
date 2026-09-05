const safeObjectKey = /^(?!\/)(?!.*(?:^|\/)\.\.?\/?)(?!.*\/\/)[A-Za-z0-9._/-]{1,1024}$/
const safeContentType = /^[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+$/

export class AssetStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AssetStoreError'
    this.code = code
  }
}

export function assertSafeObjectKey(value) {
  if (typeof value !== 'string' || !safeObjectKey.test(value) || value.includes('\\')) {
    throw new AssetStoreError('unsafe_object_key', 'Asset object key is unsafe')
  }
  return value
}

export function assertAssetBytes(value) {
  const byteArray = Buffer.isBuffer(value) || ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT === 1
  if (!byteArray || value.byteLength < 1) throw new AssetStoreError('invalid_asset_bytes', 'Asset bytes are required')
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
}

export function assertContentType(value) {
  if (typeof value !== 'string' || !safeContentType.test(value)) {
    throw new AssetStoreError('invalid_content_type', 'Asset content type is invalid')
  }
  return value
}

export function validateAssetStore(store) {
  if (!store || typeof store !== 'object') throw new TypeError('An asset store is required')
  for (const method of ['put', 'get', 'delete']) {
    if (typeof store[method] !== 'function') throw new TypeError(`Asset store must implement ${method}`)
  }
  return store
}

export function validateStreamingAssetStore(store) {
  validateAssetStore(store)
  for (const method of ['createReadStream', 'putStream']) {
    if (typeof store[method] !== 'function') throw new TypeError(`Asset store must implement ${method}`)
  }
  return store
}
