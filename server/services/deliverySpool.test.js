import { createHash } from 'node:crypto'
import { readdir, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import {
  createDeliverySpool, streamToVerifiedFile, verifyPngFile, verifyReadable,
} from './deliverySpool.js'

describe('bounded delivery spool', () => {
  test('admits aggregate disk use atomically and releases it after cleanup', async () => {
    const spool = createDeliverySpool({ maxAggregateBytes: 10 })
    let release
    let started
    const entered = new Promise((resolve) => { started = resolve })
    const held = spool.run({ reservationBytes: 7 }, async () => new Promise((resolve) => { release = resolve; started() }))
    await entered
    await expect(spool.run({ reservationBytes: 4 }, async () => {}))
      .rejects.toMatchObject({ code: 'delivery_capacity_exceeded' })
    release()
    await held
    await expect(spool.run({ reservationBytes: 10 }, async () => 'ok')).resolves.toBe('ok')
  })

  test('holds an acquired workspace until an idempotent explicit release', async () => {
    const spool = createDeliverySpool({ maxAggregateBytes: 10 })
    const lease = await spool.acquire({ reservationBytes: 10 })
    await expect(spool.run({ reservationBytes: 1 }, async () => {}))
      .rejects.toMatchObject({ code: 'delivery_capacity_exceeded' })
    await lease.release()
    await lease.release()
    await expect(readdir(lease.workspace.directory)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(spool.run({ reservationBytes: 10 }, async () => 'released')).resolves.toBe('released')
  })

  test('streams with bounded chunks, verifies exact bytes, and removes every temporary file on failure', async () => {
    const spool = createDeliverySpool({ maxAggregateBytes: 1024 })
    let directory
    await expect(spool.run({ reservationBytes: 64 }, async (workspace) => {
      directory = workspace.directory
      const bytes = Buffer.from('verified private bytes')
      await streamToVerifiedFile({
        readable: Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]),
        outputPath: workspace.file(0), expectedByteSize: bytes.length,
        expectedSha256: createHash('sha256').update(bytes).digest('hex'), maxBytes: 64,
      })
      throw Object.assign(new Error('after spool'), { code: 'forced_failure' })
    })).rejects.toMatchObject({ code: 'forced_failure' })
    await expect(readdir(directory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('aborts a slow source and removes the incomplete file without background work', async () => {
    const spool = createDeliverySpool({ maxAggregateBytes: 1024 })
    const controller = new AbortController()
    let destroyed = false
    const source = new Readable({
      read() { this.push(Buffer.from('part')); controller.abort() },
      destroy(error, done) { destroyed = true; done(error) },
    })
    await expect(spool.run({ reservationBytes: 64, signal: controller.signal }, async (workspace) => {
      await streamToVerifiedFile({
        readable: source, outputPath: workspace.file(0), expectedByteSize: 8,
        expectedSha256: '0'.repeat(64), maxBytes: 64, signal: controller.signal,
      })
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(destroyed).toBe(true)
  })

  test('fully decodes an exact PNG from disk and rejects trailing bytes', async () => {
    const png = await sharp({ create: { width: 2, height: 3, channels: 4, background: '#ff0000' } }).png().toBuffer()
    const spool = createDeliverySpool({ maxAggregateBytes: 1024 * 1024 })
    await spool.run({ reservationBytes: 1024 }, async (workspace) => {
      await writeFile(workspace.file(0), png)
      await expect(verifyPngFile({ path: workspace.file(0), width: 2, height: 3 }))
        .resolves.toEqual({ width: 2, height: 3 })
      await writeFile(workspace.file(1), Buffer.concat([png, Buffer.from('trailing')]))
      await expect(verifyPngFile({ path: workspace.file(1), width: 2, height: 3 }))
        .resolves.toBeNull()
    })
  })

  test('verifies a large readable incrementally without retaining chunks', async () => {
    const chunk = Buffer.alloc(64 * 1024, 0x61)
    const expected = createHash('sha256')
    for (let index = 0; index < 64; index += 1) expected.update(chunk)
    let emitted = 0
    const readable = new Readable({
      read() {
        if (emitted === 64) return this.push(null)
        emitted += 1
        this.push(chunk)
      },
    })
    await expect(verifyReadable({
      readable, expectedByteSize: 4 * 1024 * 1024, expectedSha256: expected.digest('hex'),
      maxBytes: 4 * 1024 * 1024, signature: Buffer.from('aaaa'),
    })).resolves.toEqual({ byteSize: 4 * 1024 * 1024 })
    expect(emitted).toBe(64)
  })
})
