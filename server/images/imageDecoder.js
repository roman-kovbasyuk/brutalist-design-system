import sharp from 'sharp'

export const MAX_GENERATED_IMAGE_BYTES = 32 * 1024 * 1024
export const MAX_GENERATED_IMAGE_DIMENSION = 4_096

const formatsByMimeType = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpeg'],
  ['image/webp', 'webp'],
])
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function exactPngContainer(buffer) {
  if (buffer.length < 20 || !buffer.subarray(0, 8).equals(pngSignature)) return false
  let offset = 8
  let chunks = 0
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const end = offset + 12 + length
    if (!Number.isSafeInteger(end) || end > buffer.length) return false
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    chunks += 1
    if (chunks === 1 && type !== 'IHDR') return false
    if (type === 'IEND') return length === 0 && end === buffer.length
    offset = end
  }
  return false
}

function exactJpegContainer(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return false
  let offset = 2
  let entropy = false
  while (offset < buffer.length) {
    if (!entropy) {
      if (buffer[offset] !== 0xff) return false
      while (buffer[offset] === 0xff) offset += 1
      if (offset >= buffer.length) return false
      const marker = buffer[offset]
      offset += 1
      if (marker === 0xd9) return offset === buffer.length
      if (marker === 0xd8 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) return false
      if (offset + 2 > buffer.length) return false
      const length = buffer.readUInt16BE(offset)
      if (length < 2 || offset + length > buffer.length) return false
      entropy = marker === 0xda
      offset += length
      continue
    }

    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const markerOffset = offset
    while (buffer[offset] === 0xff) offset += 1
    if (offset >= buffer.length) return false
    const marker = buffer[offset]
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1
      continue
    }
    if (marker === 0xd9) return offset + 1 === buffer.length
    offset = markerOffset
    entropy = false
  }
  return false
}

function exactWebpContainer(buffer) {
  return buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
    && buffer.readUInt32LE(4) + 8 === buffer.length
}

function hasExactContainer(buffer, format) {
  if (format === 'png') return exactPngContainer(buffer)
  if (format === 'jpeg') return exactJpegContainer(buffer)
  return exactWebpContainer(buffer)
}

export async function decodeGeneratedImage(value, mimeType) {
  const expectedFormat = formatsByMimeType.get(mimeType)
  const isByteArray = Buffer.isBuffer(value)
    || ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT === 1
  if (!expectedFormat || !isByteArray || value.byteLength < 1 || value.byteLength > MAX_GENERATED_IMAGE_BYTES) return null
  const buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (!hasExactContainer(buffer, expectedFormat)) return null

  try {
    const options = {
      animated: true,
      failOn: 'warning',
      limitInputPixels: MAX_GENERATED_IMAGE_DIMENSION * MAX_GENERATED_IMAGE_DIMENSION,
      pages: -1,
      sequentialRead: true,
      unlimited: false,
    }
    const metadata = await sharp(buffer, options).metadata()
    if (metadata.format !== expectedFormat || metadata.pages !== undefined && metadata.pages !== 1
      || !Number.isInteger(metadata.width) || metadata.width < 1 || metadata.width > MAX_GENERATED_IMAGE_DIMENSION
      || !Number.isInteger(metadata.height) || metadata.height < 1 || metadata.height > MAX_GENERATED_IMAGE_DIMENSION) return null

    const { info } = await sharp(buffer, options).raw().toBuffer({ resolveWithObject: true })
    if (info.width !== metadata.width || info.height !== metadata.height) return null
    return { bytes: new Uint8Array(buffer), mimeType, width: metadata.width, height: metadata.height }
  } catch {
    return null
  }
}
