import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, open, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const maxImageDimension = 4_096

export class DeliverySpoolError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'DeliverySpoolError'
    this.code = code
  }
}

export function createDeliverySpool({ tempRoot = tmpdir(), maxAggregateBytes = 512 * 1024 * 1024 } = {}) {
  if (typeof tempRoot !== 'string' || tempRoot.length < 1) throw new TypeError('A delivery spool root is required')
  if (!Number.isSafeInteger(maxAggregateBytes) || maxAggregateBytes <= 0) {
    throw new TypeError('A positive aggregate delivery spool limit is required')
  }
  let reservedBytes = 0
  const api = {
    async acquire({ reservationBytes, signal } = {}) {
      if (!Number.isSafeInteger(reservationBytes) || reservationBytes <= 0) {
        throw new TypeError('A positive delivery spool reservation is required')
      }
      if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
      if (reservationBytes > maxAggregateBytes - reservedBytes) {
        throw new DeliverySpoolError('delivery_capacity_exceeded', 'Delivery spool capacity is exhausted')
      }
      reservedBytes += reservationBytes
      let directory
      try {
        directory = await mkdtemp(join(tempRoot, 'banner-delivery-'))
        const workspace = Object.freeze({
          directory,
          file(index) {
            if (!Number.isSafeInteger(index) || index < 0 || index > 9999) throw new TypeError('Invalid spool file index')
            return join(directory, `source-${String(index).padStart(4, '0')}.bin`)
          },
          archivePath: join(directory, 'package.zip'),
        })
        let released = false
        return Object.freeze({
          workspace,
          async release() {
            if (released) return
            released = true
            try {
              await rm(directory, { recursive: true, force: true })
            } finally {
              reservedBytes -= reservationBytes
            }
          },
        })
      } catch (error) {
        if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {})
        reservedBytes -= reservationBytes
        throw error
      }
    },
    async run(options, operation) {
      if (typeof operation !== 'function') throw new TypeError('A delivery spool operation is required')
      const lease = await api.acquire(options)
      try {
        return await operation(lease.workspace)
      } finally {
        await lease.release()
      }
    },
  }
  return Object.freeze(api)
}

export const sharedDeliverySpool = createDeliverySpool()

export async function streamToVerifiedFile({
  readable, outputPath, expectedByteSize, expectedSha256, maxBytes, signal,
}) {
  if (!readable || typeof readable.pipe !== 'function') throw new TypeError('A readable source is required')
  if (typeof outputPath !== 'string' || outputPath.length < 1) throw new TypeError('A spool output path is required')
  if (!Number.isSafeInteger(expectedByteSize) || expectedByteSize <= 0
    || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || expectedByteSize > maxBytes
    || typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new DeliverySpoolError('asset_integrity_failure', 'Stored asset metadata is invalid')
  }
  const hash = createHash('sha256')
  let byteSize = 0
  const meter = new Transform({
    highWaterMark: 64 * 1024,
    transform(chunk, _encoding, done) {
      byteSize += chunk.length
      if (byteSize > maxBytes || byteSize > expectedByteSize) {
        done(new DeliverySpoolError('asset_too_large', 'Stored asset exceeds the allowed byte length'))
        return
      }
      hash.update(chunk)
      done(null, chunk)
    },
  })
  try {
    await pipeline(readable, meter, createWriteStream(outputPath, { flags: 'wx', mode: 0o600, highWaterMark: 64 * 1024 }), { signal })
  } catch (error) {
    await unlink(outputPath).catch(() => {})
    throw error
  }
  if (byteSize !== expectedByteSize || hash.digest('hex') !== expectedSha256) {
    await unlink(outputPath).catch(() => {})
    throw new DeliverySpoolError('asset_integrity_failure', 'Stored asset integrity verification failed')
  }
  return { path: outputPath, byteSize, sha256: expectedSha256 }
}

export async function verifyReadable({ readable, expectedByteSize, expectedSha256, maxBytes, signature, signal }) {
  if (!readable || typeof readable.pipe !== 'function') throw new TypeError('A readable source is required')
  if (!Number.isSafeInteger(expectedByteSize) || expectedByteSize <= 0
    || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || expectedByteSize > maxBytes
    || typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)
    || !Buffer.isBuffer(signature) || signature.length < 1) {
    throw new DeliverySpoolError('asset_integrity_failure', 'Stored asset metadata is invalid')
  }
  const hash = createHash('sha256')
  const prefix = Buffer.alloc(signature.length)
  let prefixBytes = 0
  let byteSize = 0
  const sink = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk, _encoding, done) {
      byteSize += chunk.length
      if (byteSize > maxBytes || byteSize > expectedByteSize) {
        done(new DeliverySpoolError('asset_too_large', 'Stored asset exceeds the allowed byte length'))
        return
      }
      if (prefixBytes < prefix.length) {
        const take = Math.min(prefix.length - prefixBytes, chunk.length)
        chunk.copy(prefix, prefixBytes, 0, take)
        prefixBytes += take
      }
      hash.update(chunk)
      done()
    },
  })
  await pipeline(readable, sink, { signal })
  if (byteSize !== expectedByteSize || prefixBytes !== prefix.length || !prefix.equals(signature)
    || hash.digest('hex') !== expectedSha256) {
    throw new DeliverySpoolError('asset_integrity_failure', 'Stored asset integrity verification failed')
  }
  return { byteSize }
}

async function exactPngContainer(path, signal) {
  const handle = await open(path, 'r')
  try {
    const stats = await handle.stat()
    if (!stats.isFile() || stats.size < 20) return false
    const signature = Buffer.alloc(8)
    if ((await handle.read(signature, 0, 8, 0)).bytesRead !== 8 || !signature.equals(pngSignature)) return false
    let offset = 8
    let chunks = 0
    const header = Buffer.alloc(8)
    while (offset + 12 <= stats.size) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
      if ((await handle.read(header, 0, 8, offset)).bytesRead !== 8) return false
      const length = header.readUInt32BE(0)
      const end = offset + 12 + length
      if (!Number.isSafeInteger(end) || end > stats.size) return false
      const type = header.toString('ascii', 4, 8)
      chunks += 1
      if (chunks === 1 && type !== 'IHDR') return false
      if (type === 'IEND') return length === 0 && end === stats.size
      offset = end
    }
    return false
  } finally {
    await handle.close()
  }
}

export async function verifyPngFile({ path, width, height, signal }) {
  if (!Number.isSafeInteger(width) || width < 1 || width > maxImageDimension
    || !Number.isSafeInteger(height) || height < 1 || height > maxImageDimension) return null
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
  try {
    if (!await exactPngContainer(path, signal)) return null
    const options = {
      animated: true,
      failOn: 'warning',
      limitInputPixels: maxImageDimension * maxImageDimension,
      pages: -1,
      sequentialRead: true,
      unlimited: false,
    }
    const metadata = await sharp(path, options).metadata()
    if (metadata.format !== 'png' || metadata.pages !== undefined && metadata.pages !== 1
      || metadata.width !== width || metadata.height !== height) return null
    let decoded
    const decoder = sharp(path, options).raw().once('info', (info) => { decoded = info })
    await pipeline(decoder, new Writable({ write(_chunk, _encoding, done) { done() } }), { signal })
    return decoded?.width === width && decoded?.height === height ? { width, height } : null
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error
    return null
  }
}
