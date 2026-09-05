import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises'
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
