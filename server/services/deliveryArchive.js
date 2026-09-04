import { createHash } from 'node:crypto'
import { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
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

export async function buildDeterministicDeliveryArchive({ entries, deliveryManifestBytes, timestamp, maxBytes }) {
  if (!Array.isArray(entries) || entries.length < 1) throw new TypeError('Delivery archive entries are required')
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('A positive archive byte ceiling is required')

  const prepared = [
    ...entries.map((entry) => ({ filename: filename(entry?.filename), bytes: bytes(entry?.bytes) })),
    { filename: 'delivery-manifest.json', bytes: bytes(deliveryManifestBytes) },
  ].sort((left, right) => compareText(left.filename, right.filename))
  if (new Set(prepared.map((entry) => entry.filename)).size !== prepared.length) {
    throw new DeliveryArchiveError('duplicate_archive_path', 'Archive filenames must be unique')
  }
  if (prepared.reduce((total, entry) => total + entry.bytes.length, 0) > maxBytes) {
    throw new DeliveryArchiveError('archive_too_large', 'Delivery archive exceeds its byte ceiling')
  }

  const zip = new ZipArchive({
    store: true,
    forceLocalTime: false,
    forceZip64: false,
    statConcurrency: 1,
  })
  const chunks = []
  const hash = createHash('sha256')
  let byteSize = 0
  let overflow
  const sink = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk, _encoding, callback) {
      const part = Buffer.from(chunk)
      byteSize += part.length
      if (byteSize > maxBytes) {
        overflow = new DeliveryArchiveError('archive_too_large', 'Delivery archive exceeds its byte ceiling')
        callback(overflow)
        return
      }
      hash.update(part)
      chunks.push(part)
      callback()
    },
  })
  zip.on('warning', (error) => sink.destroy(error))
  zip.on('error', (error) => sink.destroy(error))
  zip.pipe(sink)
  const date = archiveTimestamp(timestamp)
  for (const entry of prepared) {
    zip.append(entry.bytes, {
      name: entry.filename,
      date,
      mode: 0o100644,
      store: true,
    })
  }
  const completed = finished(sink)
  await zip.finalize()
  try {
    await completed
  } catch (error) {
    zip.abort()
    throw overflow ?? error
  }
  const output = Buffer.concat(chunks, byteSize)
  return { bytes: output, byteSize, sha256: hash.digest('hex') }
}
