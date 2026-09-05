import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ZipArchive } from 'archiver'

const safeArchivePath = /^(?:banners\/banner-[0-9]{3}\.png|delivery-manifest\.json|render-manifest\.json)$/

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

export class DeliveryArchiveError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'DeliveryArchiveError'
    this.code = code
  }
}

function bytes(value) {
  if (!Buffer.isBuffer(value) && !(ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT === 1)) {
    throw new DeliveryArchiveError('invalid_archive_bytes', 'Archive entries require bytes')
  }
  const result = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (result.length < 1) throw new DeliveryArchiveError('invalid_archive_bytes', 'Archive entries cannot be empty')
  return result
}

function source(entry) {
  if (typeof entry?.path !== 'string' || entry.path.length < 1) {
    throw new DeliveryArchiveError('invalid_archive_source', 'Archive entry source is required')
  }
  if (!Number.isSafeInteger(entry.byteSize) || entry.byteSize < 1) {
    throw new DeliveryArchiveError('invalid_archive_bytes', 'Archive entry byte size is invalid')
  }
  return { filename: filename(entry.filename), path: entry.path, byteSize: entry.byteSize }
}

function filename(value) {
  if (typeof value !== 'string' || !safeArchivePath.test(value) || !/^[\x20-\x7e]+$/.test(value)) {
    throw new DeliveryArchiveError('unsafe_archive_path', 'Archive filename is unsafe or ambiguous')
  }
  return value
}

function archiveTimestamp(value) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new TypeError('An immutable archive timestamp is required')
  const minimum = Date.UTC(1980, 0, 1)
  if (parsed.getTime() < minimum) return new Date(minimum)
  parsed.setUTCMilliseconds(0)
  return parsed
}

export async function buildDeterministicDeliveryArchiveFile({
  entries, deliveryManifestBytes, timestamp, maxBytes, outputPath, signal,
}) {
  if (!Array.isArray(entries) || entries.length < 1) throw new TypeError('Delivery archive entries are required')
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('A positive archive byte ceiling is required')
  if (typeof outputPath !== 'string' || outputPath.length < 1) throw new TypeError('A server-owned archive output path is required')

  const prepared = [
    ...entries.map(source),
    { filename: 'delivery-manifest.json', bytes: bytes(deliveryManifestBytes), byteSize: deliveryManifestBytes.byteLength },
  ].sort((left, right) => compareText(left.filename, right.filename))
  if (new Set(prepared.map((entry) => entry.filename)).size !== prepared.length) {
    throw new DeliveryArchiveError('duplicate_archive_path', 'Archive filenames must be unique')
  }
  if (prepared.reduce((total, entry) => total + entry.byteSize, 0) > maxBytes) {
    throw new DeliveryArchiveError('archive_too_large', 'Delivery archive exceeds its byte ceiling')
  }

  const zip = new ZipArchive({
    store: true,
    forceLocalTime: false,
    forceZip64: false,
    statConcurrency: 1,
  })
  const hash = createHash('sha256')
  let byteSize = 0
  let overflow
  const meter = new Transform({
    highWaterMark: 64 * 1024,
    transform(chunk, _encoding, callback) {
      byteSize += chunk.length
      if (byteSize > maxBytes) {
        overflow = new DeliveryArchiveError('archive_too_large', 'Delivery archive exceeds its byte ceiling')
        callback(overflow)
        return
      }
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  const sink = createWriteStream(outputPath, { flags: 'wx', mode: 0o600, highWaterMark: 64 * 1024 })
  const date = archiveTimestamp(timestamp)
  for (const entry of prepared) {
    const options = {
      name: entry.filename,
      date,
      mode: 0o100644,
      store: true,
    }
    if (entry.bytes) zip.append(entry.bytes, options)
    else zip.append(createReadStream(entry.path, { highWaterMark: 64 * 1024, signal }), options)
  }
  const completed = pipeline(zip, meter, sink, { signal })
  try {
    await zip.finalize()
    await completed
  } catch (error) {
    zip.abort()
    await completed.catch(() => {})
    throw overflow ?? error
  }
  return { path: outputPath, byteSize, sha256: hash.digest('hex') }
}
