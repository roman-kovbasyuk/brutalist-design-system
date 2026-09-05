import { afterEach, describe, expect, test } from 'vitest'
import { mkdtemp, rm, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { createLocalDemoAssetStore } from './localDemoAssetStore.js'

const directories = []
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'studio-assets-test-'))
  directories.push(directory)
  return { directory, store: await createLocalDemoAssetStore({ directory }) }
}
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

describe('persistent local demo assets', () => {
  test('survives a fresh adapter with exact hash and generation and supports fenced cleanup', async () => {
    const { store, directory } = await fixture()
    const bytes = Buffer.from('durable image')
    const created = await store.put({ objectKey: 'campaigns/demo/image.png', bytes, contentType: 'image/png' })
    await store.close()
    const restarted = await createLocalDemoAssetStore({ directory })
    expect(await restarted.get({ objectKey: created.objectKey })).toEqual(bytes)
    expect(await restarted.getMetadata({ objectKey: created.objectKey })).toEqual(created)
    await expect(restarted.delete({ objectKey: created.objectKey, generation: 'other' })).rejects.toMatchObject({ code: 'object_generation_mismatch' })
    expect(await restarted.delete({ objectKey: created.objectKey, generation: created.generation })).toEqual({ deleted: true })
    expect(await restarted.get({ objectKey: created.objectKey })).toBeNull()
    expect(await readdir(directory)).toEqual([])
  })
  test('publishes bounded stream content once and rejects hash mismatch without leftover files', async () => {
    const { store, directory } = await fixture()
    const bytes = Buffer.from('approved zip')
    await expect(store.putStream({ objectKey: 'zip', stream: Readable.from([bytes]), contentType: 'application/zip', maxBytes: 1024, sha256: digest('other') })).rejects.toMatchObject({ code: 'asset_hash_mismatch' })
    expect(await readdir(directory)).toEqual([])
    const stored = await store.putStream({ objectKey: 'zip', stream: Readable.from([bytes]), contentType: 'application/zip', maxBytes: 1024, sha256: digest(bytes) })
    const parts = []
    for await (const part of await store.createReadStream({ objectKey: 'zip', generation: stored.generation })) parts.push(part)
    expect(Buffer.concat(parts)).toEqual(bytes)
    await expect(store.put({ objectKey: 'zip', bytes: Buffer.from('replacement'), contentType: 'application/zip' })).rejects.toMatchObject({ code: 'object_exists' })
    expect(await store.get({ objectKey: 'zip' })).toEqual(bytes)
    expect((await readdir(directory)).length).toBe(1)
  })
  test('rejects path traversal, symlink storage and oversize streams', async () => {
    const { store, directory } = await fixture()
    await expect(store.get({ objectKey: '../escape' })).rejects.toMatchObject({ code: 'unsafe_object_key' })
    const alias = join(directory, 'alias')
    await symlink(directory, alias)
    await expect(createLocalDemoAssetStore({ directory: alias })).rejects.toThrow('real directory')
    await expect(store.putStream({ objectKey: 'big', stream: Readable.from(['too large']), contentType: 'image/png', maxBytes: 2 })).rejects.toMatchObject({ code: 'asset_too_large' })
    expect(await store.get({ objectKey: 'big' })).toBeNull()
  })
})
