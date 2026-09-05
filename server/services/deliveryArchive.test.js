import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { buildDeterministicDeliveryArchiveFile } from './deliveryArchive.js'

const deliveryArchiveModuleUrl = pathToFileURL(resolve('server/services/deliveryArchive.js')).href

function runArchiveChild(source, timeoutMs = 2_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr, killed })
    })
  })
}

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

  test('a pre-aborted archive rejects in an isolated process without an unhandled stream error', async () => {
    const result = await runArchiveChild(`
      import { mkdtemp, rm, writeFile } from 'node:fs/promises'
      import { tmpdir } from 'node:os'
      import { join } from 'node:path'
      import { buildDeterministicDeliveryArchiveFile } from ${JSON.stringify(deliveryArchiveModuleUrl)}
      const directory = await mkdtemp(join(tmpdir(), 'delivery-pre-abort-'))
      try {
        const input = join(directory, 'source.png')
        await writeFile(input, Buffer.alloc(1024, 7))
        const controller = new AbortController()
        controller.abort(new Error('reviewer pre-abort'))
        try {
          await buildDeterministicDeliveryArchiveFile({
            entries: [{ filename: 'banners/banner-001.png', path: input, byteSize: 1024 }],
            deliveryManifestBytes: Buffer.from('{}'), timestamp: new Date('2026-09-04T10:00:00Z'),
            maxBytes: 4096, outputPath: join(directory, 'package.zip'), signal: controller.signal,
          })
          process.exitCode = 2
        } catch {
          console.log('caught-pre-abort')
        }
        await new Promise((resolve) => setImmediate(resolve))
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    `)
    expect(result, JSON.stringify(result)).toMatchObject({ code: 0, killed: false })
    expect(result.stdout).toContain('caught-pre-abort')
    expect(result.stderr).toBe('')
  })

  test('a stalled source abort settles every archive stream without crashing its process', async () => {
    const result = await runArchiveChild(`
      import { spawn, spawnSync } from 'node:child_process'
      import { mkdtemp, rm } from 'node:fs/promises'
      import { tmpdir } from 'node:os'
      import { join } from 'node:path'
      import { buildDeterministicDeliveryArchiveFile } from ${JSON.stringify(deliveryArchiveModuleUrl)}
      const directory = await mkdtemp(join(tmpdir(), 'delivery-stalled-abort-'))
      let writer
      try {
        const input = join(directory, 'source.pipe')
        const made = spawnSync('mkfifo', [input])
        if (made.status !== 0) throw new Error('mkfifo failed')
        writer = spawn('sh', ['-c', 'exec 3>"$1"; sleep 10', 'writer', input], { stdio: 'ignore' })
        const controller = new AbortController()
        setTimeout(() => controller.abort(new Error('reviewer stalled abort')), 30)
        const outcome = await Promise.race([
          buildDeterministicDeliveryArchiveFile({
            entries: [{ filename: 'banners/banner-001.png', path: input, byteSize: 1024 }],
            deliveryManifestBytes: Buffer.from('{}'), timestamp: new Date('2026-09-04T10:00:00Z'),
            maxBytes: 4096, outputPath: join(directory, 'package.zip'), signal: controller.signal,
          }).then(() => 'resolved', () => 'rejected'),
          new Promise((resolve) => setTimeout(() => resolve('stalled'), 800)),
        ])
        console.log('outcome-' + outcome)
        if (outcome !== 'rejected') process.exitCode = 3
        await new Promise((resolve) => setImmediate(resolve))
      } finally {
        writer?.kill('SIGKILL')
        await rm(directory, { recursive: true, force: true })
      }
    `, 3_000)
    expect(result, JSON.stringify(result)).toMatchObject({ code: 0, killed: false })
    expect(result.stdout).toContain('outcome-rejected')
    expect(result.stderr).toBe('')
  })

  test('repeated abort and output-error races remain caught with no background rejection', async () => {
    const result = await runArchiveChild(`
      import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
      import { tmpdir } from 'node:os'
      import { join } from 'node:path'
      import { buildDeterministicDeliveryArchiveFile } from ${JSON.stringify(deliveryArchiveModuleUrl)}
      const directory = await mkdtemp(join(tmpdir(), 'delivery-abort-races-'))
      try {
        const input = join(directory, 'source.png')
        await writeFile(input, Buffer.alloc(4 * 1024 * 1024, 9))
        let caught = 0
        for (let index = 0; index < 8; index += 1) {
          const output = join(directory, 'package-' + index + '.zip')
          if (index % 2 === 1) await writeFile(output, Buffer.from('occupied'))
          const controller = new AbortController()
          setTimeout(() => controller.abort(new Error('race-' + index)), index % 2)
          try {
            await buildDeterministicDeliveryArchiveFile({
              entries: [{ filename: 'banners/banner-001.png', path: input, byteSize: 4 * 1024 * 1024 }],
              deliveryManifestBytes: Buffer.from('{}'), timestamp: new Date('2026-09-04T10:00:00Z'),
              maxBytes: 5 * 1024 * 1024, outputPath: output, signal: controller.signal,
            })
          } catch {
            caught += 1
          }
          await unlink(output).catch(() => {})
        }
        await new Promise((resolve) => setImmediate(resolve))
        console.log('caught-' + caught)
        if (caught !== 8) process.exitCode = 4
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    `, 5_000)
    expect(result, JSON.stringify(result)).toMatchObject({ code: 0, killed: false })
    expect(result.stdout).toContain('caught-8')
    expect(result.stderr).toBe('')
  })

  test('an archive failure does not return before the finalize promise settles', async () => {
    const result = await runArchiveChild(`
      import { ZipArchive } from 'archiver'
      import { mkdtemp, rm, writeFile } from 'node:fs/promises'
      import { tmpdir } from 'node:os'
      import { join } from 'node:path'
      const prototype = ZipArchive.prototype
      const originalFinalize = prototype.finalize
      let finalized = false
      prototype.finalize = function () {
        return new Promise((_resolve, reject) => setTimeout(() => {
          finalized = true
          reject(new Error('late finalize rejection'))
        }, 60))
      }
      const { buildDeterministicDeliveryArchiveFile } = await import(${JSON.stringify(deliveryArchiveModuleUrl)})
      const directory = await mkdtemp(join(tmpdir(), 'delivery-finalize-settlement-'))
      try {
        const input = join(directory, 'source.png')
        const output = join(directory, 'occupied.zip')
        await writeFile(input, Buffer.alloc(1024, 1))
        await writeFile(output, Buffer.from('occupied'))
        try {
          await buildDeterministicDeliveryArchiveFile({
            entries: [{ filename: 'banners/banner-001.png', path: input, byteSize: 1024 }],
            deliveryManifestBytes: Buffer.from('{}'), timestamp: new Date('2026-09-04T10:00:00Z'),
            maxBytes: 4096, outputPath: output,
          })
        } catch {}
        console.log(finalized ? 'finalize-settled' : 'finalize-pending')
        if (!finalized) process.exitCode = 5
      } finally {
        prototype.finalize = originalFinalize
        await rm(directory, { recursive: true, force: true })
      }
    `)
    expect(result, JSON.stringify(result)).toMatchObject({ code: 0, killed: false })
    expect(result.stdout).toContain('finalize-settled')
    expect(result.stderr).toBe('')
  })
})
