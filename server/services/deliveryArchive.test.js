import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { buildDeterministicDeliveryArchive } from './deliveryArchive.js'

function storedEntries(bytes) {
  const entries = []
  let offset = 0
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6)
    const method = bytes.readUInt16LE(offset + 8)
    const compressedSize = bytes.readUInt32LE(offset + 18)
    const filenameLength = bytes.readUInt16LE(offset + 26)
    const extraLength = bytes.readUInt16LE(offset + 28)
    expect(flags & 0x08).toBe(0)
    expect(method).toBe(0)
    const filenameStart = offset + 30
    const dataStart = filenameStart + filenameLength + extraLength
    entries.push({
      filename: bytes.subarray(filenameStart, filenameStart + filenameLength).toString('utf8'),
      bytes: bytes.subarray(dataStart, dataStart + compressedSize),
    })
    offset = dataStart + compressedSize
  }
  return entries
}

describe('deterministic delivery archive', () => {
  test('sorts safe server-owned paths and emits byte-identical stored ZIPs', async () => {
    const input = {
      entries: [
        { filename: 'render-manifest.json', bytes: Buffer.from('{"schemaVersion":1}') },
        { filename: 'banners/banner-002.png', bytes: Buffer.from('png-two') },
        { filename: 'banners/banner-001.png', bytes: Buffer.from('png-one') },
      ],
      deliveryManifestBytes: Buffer.from('{"schemaVersion":1,"versionId":"version-1"}'),
      timestamp: new Date('2026-09-04T10:00:00.000Z'),
      maxBytes: 1_000_000,
    }

    const first = await buildDeterministicDeliveryArchive(input)
    const second = await buildDeterministicDeliveryArchive({ ...input, entries: [...input.entries].reverse() })

    expect(first.bytes).toEqual(second.bytes)
    expect(first.sha256).toBe(createHash('sha256').update(first.bytes).digest('hex'))
    expect(first.byteSize).toBe(first.bytes.length)
    expect(storedEntries(first.bytes)).toEqual([
      { filename: 'banners/banner-001.png', bytes: Buffer.from('png-one') },
      { filename: 'banners/banner-002.png', bytes: Buffer.from('png-two') },
      { filename: 'delivery-manifest.json', bytes: input.deliveryManifestBytes },
      { filename: 'render-manifest.json', bytes: Buffer.from('{"schemaVersion":1}') },
    ])
  })

  test.each([
    ['/absolute.png'],
    ['../escape.png'],
    ['banners/../escape.png'],
    ['banners\\escape.png'],
    ['banners/café.png'],
    ['banners/café.png'],
    ['banners//duplicate.png'],
  ])('rejects an unsafe or ambiguous archive path: %s', async (filename) => {
    await expect(buildDeterministicDeliveryArchive({
      entries: [{ filename, bytes: Buffer.from('x') }],
      deliveryManifestBytes: Buffer.from('{}'),
      timestamp: new Date('2026-09-04T10:00:00.000Z'),
      maxBytes: 1_000_000,
    })).rejects.toMatchObject({ code: 'unsafe_archive_path' })
  })

  test('rejects duplicate filenames and enforces an archive byte ceiling', async () => {
    const common = {
      deliveryManifestBytes: Buffer.from('{}'),
      timestamp: new Date('2026-09-04T10:00:00.000Z'),
      maxBytes: 100,
    }
    await expect(buildDeterministicDeliveryArchive({
      ...common,
      entries: [
        { filename: 'banners/banner-001.png', bytes: Buffer.from('one') },
        { filename: 'banners/banner-001.png', bytes: Buffer.from('two') },
      ],
    })).rejects.toMatchObject({ code: 'duplicate_archive_path' })
    await expect(buildDeterministicDeliveryArchive({
      ...common,
      entries: [{ filename: 'banners/banner-001.png', bytes: Buffer.alloc(200) }],
    })).rejects.toMatchObject({ code: 'archive_too_large' })
  })

  test('pipes a large stored entry with a bounded final size and stable hash', async () => {
    const source = Buffer.alloc(1024 * 1024, 0x5a)
    const input = {
      entries: [{ filename: 'banners/banner-001.png', bytes: source }],
      deliveryManifestBytes: Buffer.from('{"schemaVersion":1}'),
      timestamp: new Date('2026-09-04T10:00:00.000Z'),
      maxBytes: 2 * 1024 * 1024,
    }
    const first = await buildDeterministicDeliveryArchive(input)
    const second = await buildDeterministicDeliveryArchive(input)
    expect(first.bytes).toEqual(second.bytes)
    expect(first.byteSize).toBeLessThan(input.maxBytes)
    expect(first.sha256).toBe(createHash('sha256').update(first.bytes).digest('hex'))
    expect(storedEntries(first.bytes)[0]).toEqual({ filename: 'banners/banner-001.png', bytes: source })
  })
})
