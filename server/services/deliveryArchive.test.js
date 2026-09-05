import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildDeterministicDeliveryArchiveFile } from './deliveryArchive.js'

function storedEntries(bytes) {
  const entries = []
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  expect(eocd).toBeGreaterThanOrEqual(0)
  const count = bytes.readUInt16LE(eocd + 10)
  let offset = bytes.readUInt32LE(eocd + 16)
  for (let index = 0; index < count; index += 1) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50)
    const method = bytes.readUInt16LE(offset + 10)
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const filenameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const localOffset = bytes.readUInt32LE(offset + 42)
    const localFilenameLength = bytes.readUInt16LE(localOffset + 26)
    const localExtraLength = bytes.readUInt16LE(localOffset + 28)
    expect(method).toBe(0)
    const filenameStart = offset + 46
    const dataStart = localOffset + 30 + localFilenameLength + localExtraLength
    entries.push({
      filename: bytes.subarray(filenameStart, filenameStart + filenameLength).toString('utf8'),
      bytes: bytes.subarray(dataStart, dataStart + compressedSize),
    })
    offset = filenameStart + filenameLength + extraLength + commentLength
  }
  return entries
}

describe('deterministic delivery archive', () => {
  test('sorts safe server-owned paths and emits byte-identical stored ZIPs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'delivery-archive-test-'))
    try {
      const sources = [
        ['render-manifest.json', Buffer.from('{"schemaVersion":1}')],
        ['banner-002.png', Buffer.from('png-two')],
        ['banner-001.png', Buffer.from('png-one')],
      ]
      await Promise.all(sources.map(([name, value]) => writeFile(join(directory, name), value)))
      const entries = [
        { filename: 'render-manifest.json', path: join(directory, 'render-manifest.json'), byteSize: sources[0][1].length },
        { filename: 'banners/banner-002.png', path: join(directory, 'banner-002.png'), byteSize: sources[1][1].length },
        { filename: 'banners/banner-001.png', path: join(directory, 'banner-001.png'), byteSize: sources[2][1].length },
      ]
      const deliveryManifestBytes = Buffer.from('{"schemaVersion":1,"versionId":"version-1"}')
      const common = { deliveryManifestBytes, timestamp: new Date('2026-09-04T10:00:00.000Z'), maxBytes: 1_000_000 }
      const first = await buildDeterministicDeliveryArchiveFile({ ...common, entries, outputPath: join(directory, 'first.zip') })
      const second = await buildDeterministicDeliveryArchiveFile({
        ...common, entries: [...entries].reverse(), outputPath: join(directory, 'second.zip'),
      })
      const firstBytes = await readFile(first.path)
      const secondBytes = await readFile(second.path)

      expect(firstBytes).toEqual(secondBytes)
      expect(first.sha256).toBe(createHash('sha256').update(firstBytes).digest('hex'))
      expect(first.byteSize).toBe(firstBytes.length)
      expect(storedEntries(firstBytes)).toEqual([
        { filename: 'banners/banner-001.png', bytes: Buffer.from('png-one') },
        { filename: 'banners/banner-002.png', bytes: Buffer.from('png-two') },
        { filename: 'delivery-manifest.json', bytes: deliveryManifestBytes },
        { filename: 'render-manifest.json', bytes: Buffer.from('{"schemaVersion":1}') },
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
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
    await expect(buildDeterministicDeliveryArchiveFile({
      entries: [{ filename, path: '/server-owned/source', byteSize: 1 }],
      deliveryManifestBytes: Buffer.from('{}'),
      timestamp: new Date('2026-09-04T10:00:00.000Z'),
      maxBytes: 1_000_000,
      outputPath: '/server-owned/output',
    })).rejects.toMatchObject({ code: 'unsafe_archive_path' })
  })

  test('rejects duplicate filenames and enforces an archive byte ceiling', async () => {
    const common = {
      deliveryManifestBytes: Buffer.from('{}'),
      timestamp: new Date('2026-09-04T10:00:00.000Z'),
      maxBytes: 100,
    }
    await expect(buildDeterministicDeliveryArchiveFile({
      ...common,
      entries: [
        { filename: 'banners/banner-001.png', path: '/tmp/one', byteSize: 3 },
        { filename: 'banners/banner-001.png', path: '/tmp/two', byteSize: 3 },
      ],
      outputPath: '/tmp/output.zip',
    })).rejects.toMatchObject({ code: 'duplicate_archive_path' })
    await expect(buildDeterministicDeliveryArchiveFile({
      ...common,
      entries: [{ filename: 'banners/banner-001.png', path: '/tmp/large', byteSize: 200 }],
      outputPath: '/tmp/output.zip',
    })).rejects.toMatchObject({ code: 'archive_too_large' })
  })

  test('pipes a large stored entry with a bounded final size and stable hash', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'delivery-archive-large-'))
    try {
      const source = Buffer.alloc(1024 * 1024, 0x5a)
      const sourcePath = join(directory, 'source.png')
      await writeFile(sourcePath, source)
      const input = {
        entries: [{ filename: 'banners/banner-001.png', path: sourcePath, byteSize: source.length }],
        deliveryManifestBytes: Buffer.from('{"schemaVersion":1}'),
        timestamp: new Date('2026-09-04T10:00:00.000Z'),
        maxBytes: 2 * 1024 * 1024,
      }
      const first = await buildDeterministicDeliveryArchiveFile({ ...input, outputPath: join(directory, 'first.zip') })
      const second = await buildDeterministicDeliveryArchiveFile({ ...input, outputPath: join(directory, 'second.zip') })
      const firstBytes = await readFile(first.path)
      expect(firstBytes).toEqual(await readFile(second.path))
      expect(first.byteSize).toBeLessThan(input.maxBytes)
      expect(first.sha256).toBe(createHash('sha256').update(firstBytes).digest('hex'))
      expect(storedEntries(firstBytes)[0]).toEqual({ filename: 'banners/banner-001.png', bytes: source })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('streams several near-limit source files without accepting in-memory entry buffers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'delivery-archive-multi-'))
    try {
      const values = [0x31, 0x32, 0x33]
      const entries = []
      for (const [index, value] of values.entries()) {
        const path = join(directory, `banner-${index}.png`)
        await writeFile(path, Buffer.alloc(256 * 1024, value))
        entries.push({
          filename: `banners/banner-${String(index + 1).padStart(3, '0')}.png`,
          path, byteSize: 256 * 1024,
        })
      }
      const result = await buildDeterministicDeliveryArchiveFile({
        entries,
        deliveryManifestBytes: Buffer.from('{"schemaVersion":1}'),
        timestamp: new Date('2026-09-04T10:00:00.000Z'),
        maxBytes: 790 * 1024,
        outputPath: join(directory, 'package.zip'),
      })
      const output = await readFile(result.path)
      expect(result.byteSize).toBe(output.length)
      expect(result.sha256).toBe(createHash('sha256').update(output).digest('hex'))
      expect(storedEntries(output).map((entry) => entry.filename)).toEqual([
        'banners/banner-001.png', 'banners/banner-002.png', 'banners/banner-003.png', 'delivery-manifest.json',
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
