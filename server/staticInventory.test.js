import { execFileSync } from 'node:child_process'
import { link, lstat, mkdtemp, mkdir, open, rename, rm, symlink, truncate, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { openStaticBuild } from './staticFiles.js'

async function makeBuild() {
  const root = await mkdtemp(join(tmpdir(), 'banner-static-inventory-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'docs', 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<title>App</title>')
  await writeFile(join(root, 'assets', 'app-deadbeef.js'), 'export const value = "original"')
  await writeFile(join(root, 'docs', 'index.html'), '<title>Docs</title>')
  await writeFile(join(root, 'docs', '404.html'), '<title>Not found</title>')
  await writeFile(join(root, 'docs', 'workflow.html'), '<title>Workflow</title>')
  await writeFile(join(root, 'docs', 'assets', 'docs-deadbeef.js'), 'export {}')
  return root
}

describe('immutable static build inventory', () => {
  const roots = []
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  test('rejects symlinks and non-regular files instead of silently inventorying them', async () => {
    const root = await makeBuild()
    roots.push(root)
    const linked = join(root, 'assets', 'linked-deadbeef.js')
    await symlink('/etc/passwd', linked)
    await expect(openStaticBuild(root)).rejects.toThrow(/symbolic link/i)

    await unlink(linked)
    const fifo = join(root, 'assets', 'stream-deadbeef.bin')
    execFileSync('mkfifo', [fifo])
    await expect(openStaticBuild(root)).rejects.toThrow(/regular file/i)
  })

  test('rejects a final file swapped after lstat and closes partial inventory descriptors', async () => {
    const root = await makeBuild()
    roots.push(root)
    const target = join(root, 'assets', 'app-deadbeef.js')
    const original = `${target}.original`
    const handles = []
    let swapped = false
    let snapshotDirectory
    const operations = {
      lstat: async (path) => {
        const metadata = await lstat(path)
        if (path === target && !swapped) {
          swapped = true
          await rename(target, original)
          await writeFile(target, 'export const value = "replacement"')
        }
        return metadata
      },
      open: async (...arguments_) => {
        const handle = await open(...arguments_)
        handles.push(handle)
        return handle
      },
      mkdtemp: async (prefix) => {
        snapshotDirectory = await mkdtemp(prefix)
        return snapshotDirectory
      },
    }

    await expect(openStaticBuild(root, { operations })).rejects.toThrow(/changed during startup|identity/i)
    expect(swapped).toBe(true)
    expect(handles.length).toBeGreaterThan(2)
    for (const handle of handles) await expect(handle.stat()).rejects.toMatchObject({ code: 'EBADF' })
    await expect(lstat(snapshotDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('rejects an intermediate directory swapped after lstat', async () => {
    const root = await makeBuild()
    roots.push(root)
    const target = join(root, 'assets')
    const original = `${target}-original`
    let swapped = false
    const operations = {
      lstat: async (path) => {
        const metadata = await lstat(path)
        if (path === target && !swapped) {
          swapped = true
          await rename(target, original)
          await mkdir(target)
          await writeFile(join(target, 'app-deadbeef.js'), 'export const value = "replacement"')
        }
        return metadata
      },
    }

    await expect(openStaticBuild(root, { operations })).rejects.toThrow(/changed during startup|identity/i)
    expect(swapped).toBe(true)
  })

  test('rejects truncation between lstat and the verified descriptor copy', async () => {
    const root = await makeBuild()
    roots.push(root)
    const target = join(root, 'assets', 'app-deadbeef.js')
    let truncated = false
    const operations = {
      open: async (...arguments_) => {
        const handle = await open(...arguments_)
        if (arguments_[0] === target && !truncated) {
          truncated = true
          await truncate(target, 0)
        }
        return handle
      },
    }

    await expect(openStaticBuild(root, { operations })).rejects.toThrow(/changed during startup|identity/i)
    expect(truncated).toBe(true)
  })

  test('rejects hard-linked and non-canonical build entries', async () => {
    const hardLinkRoot = await makeBuild()
    roots.push(hardLinkRoot)
    await link(join(hardLinkRoot, 'assets', 'app-deadbeef.js'), join(hardLinkRoot, 'assets', 'hardlink-deadbeef.js'))
    await expect(openStaticBuild(hardLinkRoot)).rejects.toThrow(/hard link/i)

    for (const name of ['café-deadbeef.png', 'cafe%CC%81-deadbeef.png', 'cafe\u0301-deadbeef.png']) {
      const root = await makeBuild()
      roots.push(root)
      await writeFile(join(root, 'assets', name), 'image')
      await expect(openStaticBuild(root)).rejects.toThrow(/canonical|non-ASCII|encoding/i)
    }
  })

  test.each([
    'source-deadbeef.js.map',
    'source-deadbeef.js.MAP',
    'source-deadbeef.js.map.gz',
    'source-deadbeef.js.MAP.BR',
    'source-deadbeef.js.map.zst',
  ])('fails startup when the build contains source-map artifact %s', async (name) => {
    const root = await makeBuild()
    roots.push(root)
    await writeFile(join(root, 'assets', name), '{}')
    await expect(openStaticBuild(root)).rejects.toThrow(/source map/i)
  })

  test('closes every retained snapshot FileHandle exactly once', async () => {
    const root = await makeBuild()
    roots.push(root)
    const build = await openStaticBuild(root)
    const entry = build.getFile('index.html')

    await expect(entry.handle.stat()).resolves.toMatchObject({ size: Buffer.byteLength('<title>App</title>') })
    await expect(build.close()).resolves.toBeUndefined()
    await expect(build.close()).resolves.toBeUndefined()
    await expect(entry.handle.stat()).rejects.toMatchObject({ code: 'EBADF' })
  })
})
