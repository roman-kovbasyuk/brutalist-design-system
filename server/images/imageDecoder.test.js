import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { decodeGeneratedImage, MAX_GENERATED_IMAGE_BYTES } from './imageDecoder.js'

const formats = [
  ['png', 'image/png'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
]

async function encoded(format, width = 16, height = 12) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 24, g: 72, b: 128, alpha: 1 } },
  })[format]().toBuffer()
}

describe('generated image decoder', () => {
  test.each(formats)('fully decodes a valid single-frame %s', async (format, mimeType) => {
    const bytes = await encoded(format)

    await expect(decodeGeneratedImage(bytes, mimeType)).resolves.toEqual({
      bytes: new Uint8Array(bytes), mimeType, width: 16, height: 12,
    })
  })

  test.each(formats)('rejects truncated or corrupt %s data', async (format, mimeType) => {
    const bytes = await encoded(format)
    const truncated = bytes.subarray(0, bytes.length - 4)
    const corrupt = Buffer.from(bytes)
    const corruptAt = format === 'jpeg' ? corrupt.length - 7 : Math.floor(corrupt.length / 2)
    corrupt.fill(0xff, corruptAt, corruptAt + 5)

    await expect(decodeGeneratedImage(truncated, mimeType)).resolves.toBeNull()
    await expect(decodeGeneratedImage(corrupt, mimeType)).resolves.toBeNull()
  })

  test('rejects a decoded format that does not match the declared MIME type', async () => {
    await expect(decodeGeneratedImage(await encoded('png'), 'image/jpeg')).resolves.toBeNull()
  })

  test.each(formats)('rejects trailing bytes after the complete %s container', async (format, mimeType) => {
    const bytes = await encoded(format)
    await expect(decodeGeneratedImage(Buffer.concat([bytes, Buffer.from('trailing')]), mimeType)).resolves.toBeNull()
  })

  test('rejects a WebP container whose declared RIFF length is not exact', async () => {
    const bytes = Buffer.from(await encoded('webp'))
    bytes.writeUInt32LE(bytes.readUInt32LE(4) - 2, 4)

    await expect(decodeGeneratedImage(bytes, 'image/webp')).resolves.toBeNull()
  })

  test('rejects images beyond the encoded-byte and dimension limits', async () => {
    await expect(decodeGeneratedImage(new Uint8Array(MAX_GENERATED_IMAGE_BYTES + 1), 'image/png')).resolves.toBeNull()
    await expect(decodeGeneratedImage(await encoded('png', 4_097, 1), 'image/png')).resolves.toBeNull()
    await expect(decodeGeneratedImage(await encoded('png', 1, 4_097), 'image/png')).resolves.toBeNull()
  })

  test('rejects a real valid animated WebP', async () => {
    const animated = Buffer.from(
      'UklGRg4BAABXRUJQVlA4WAoAAAACAAAADwAACwAAQU5JTQYAAAD/////AABBTk1GaAAAAAAAAAAAAA8AAAsAAGQAAAJWUDggUAAAAFACAJ0BKhAADAAFQHwloAJ0fwAZlnBjqmErAAD+7eGTbrkTmCBPSGqfgKQdkvCNRajKrhwI89ndY4MoQzYM/ZXkArajvYRUEA8wzWlcYAAAQU5NRnIAAAABAAAAAAALAAALAABkAAAAVlA4IFoAAAA0AgCdASoMAAwAAAB8JbACdAECpvAYodMmAAD+yn9Zwp9mDN6+r4NfE/HlzNCjRn6b34Skf8u1Xv+4VQwcbRKuVbK/2WuUTlX9/HXjmUNHSIuEV84s1aD4AAA=',
      'base64',
    )

    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2)
    await expect(decodeGeneratedImage(animated, 'image/webp')).resolves.toBeNull()
  })
})
