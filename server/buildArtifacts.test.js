import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { verifyBuildArtifacts } from '../scripts/verify-build.mjs'

async function writeValidBuild() {
  const root = await mkdtemp(join(tmpdir(), 'banner-studio-build-check-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'docs', 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<script type="module" src="/assets/app-a1b2c3d4.js"></script>')
  await writeFile(join(root, 'assets', 'app-a1b2c3d4.js'), 'export {}')
  await writeFile(join(root, 'docs', 'index.html'), '<script type="module" src="/docs/assets/docs-a1b2c3d4.js"></script>')
  await writeFile(join(root, 'docs', 'workflow.html'), '<h1>Workflow</h1>')
  await writeFile(join(root, 'docs', '404.html'), '<h1>Not found</h1>')
  await writeFile(join(root, 'docs', 'assets', 'docs-a1b2c3d4.js'), 'export {}')
  return root
}

describe('production build verification', () => {
  const roots = []
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  test('accepts a deployable SPA and docs build with nested pages and referenced assets', async () => {
    const root = await writeValidBuild()
    roots.push(root)
    await expect(verifyBuildArtifacts(root)).resolves.toMatchObject({
      spaIndex: 'index.html',
      docsIndex: 'docs/index.html',
      nestedDocsPage: 'docs/workflow.html',
      spaAssetCount: 1,
      docsAssetCount: 1,
    })
  })

  test('fails missing docs, route-breaking relative SPA assets, source maps, and symlinks', async () => {
    const missingDocs = await mkdtemp(join(tmpdir(), 'banner-studio-build-missing-'))
    roots.push(missingDocs)
    await writeFile(join(missingDocs, 'index.html'), '<script src="/assets/app-a1b2c3d4.js"></script>')
    await expect(verifyBuildArtifacts(missingDocs)).rejects.toThrow(/docs\/index\.html/i)

    const relativeAssets = await writeValidBuild()
    roots.push(relativeAssets)
    await writeFile(join(relativeAssets, 'index.html'), '<script src=".\/assets/app-a1b2c3d4.js"></script>')
    await expect(verifyBuildArtifacts(relativeAssets)).rejects.toThrow(/root-relative \/assets/i)

    const sourceMap = await writeValidBuild()
    roots.push(sourceMap)
    await writeFile(join(sourceMap, 'assets', 'app-a1b2c3d4.js.map'), '{}')
    await expect(verifyBuildArtifacts(sourceMap)).rejects.toThrow(/source map/i)

    const symlinkRoot = await writeValidBuild()
    roots.push(symlinkRoot)
    await symlink('/etc/passwd', join(symlinkRoot, 'assets', 'outside-a1b2c3d4.txt'))
    await expect(verifyBuildArtifacts(symlinkRoot)).rejects.toThrow(/symbolic link/i)
  })
})
