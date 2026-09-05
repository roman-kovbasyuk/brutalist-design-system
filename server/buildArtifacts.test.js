import { link, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { verifyBuildArtifacts } from '../scripts/verify-build.mjs'

async function writeValidBuild() {
  const root = await mkdtemp(join(tmpdir(), 'banner-studio-build-check-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'docs', 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<script type="module" src="/assets/app-a1b2c3d4.js"></script><link rel="stylesheet" href="/assets/style-a1b2c3d4.css">')
  await writeFile(join(root, 'assets', 'app-a1b2c3d4.js'), 'export {}')
  await writeFile(join(root, 'assets', 'style-a1b2c3d4.css'), '@font-face{src:url(/assets/font-a1b2c3d4.woff2)}')
  await writeFile(join(root, 'assets', 'font-a1b2c3d4.woff2'), 'font')
  await writeFile(join(root, 'docs', 'index.html'), '<script type="module" src="/docs/assets/docs-a1b2c3d4.js"></script><link rel="stylesheet" href="/docs/assets/style-a1b2c3d4.css">')
  await writeFile(join(root, 'docs', 'workflow.html'), '<h1>Workflow</h1>')
  await writeFile(join(root, 'docs', '404.html'), '<h1>Not found</h1>')
  await writeFile(join(root, 'docs', 'assets', 'docs-a1b2c3d4.js'), 'export {}')
  await writeFile(join(root, 'docs', 'assets', 'style-a1b2c3d4.css'), '@font-face{src:url(/docs/assets/font-a1b2c3d4.woff2)}')
  await writeFile(join(root, 'docs', 'assets', 'font-a1b2c3d4.woff2'), 'font')
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
      spaAssetCount: 3,
      docsAssetCount: 3,
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

  test('rejects a symlink build root and hard-linked build entries exactly as production startup does', async () => {
    const target = await writeValidBuild()
    roots.push(target)
    const linkedRoot = `${target}-link`
    roots.push(linkedRoot)
    await symlink(target, linkedRoot)
    await expect(verifyBuildArtifacts(linkedRoot)).rejects.toThrow(/static build root|regular directory/i)

    const hardLinked = await writeValidBuild()
    roots.push(hardLinked)
    const outside = `${hardLinked}-outside.js`
    roots.push(outside)
    await writeFile(outside, 'export {}')
    await link(outside, join(hardLinked, 'assets', 'hard-link-a1b2c3d4.js'))
    await expect(verifyBuildArtifacts(hardLinked)).rejects.toThrow(/hard link/i)
  })

  test('closes the shared production inventory on successful and failed reference verification', async () => {
    for (const invalid of [false, true]) {
      const root = await writeValidBuild()
      roots.push(root)
      if (invalid) {
        await writeFile(join(root, 'index.html'), '<script src="/assets/app-a1b2c3d4.js"></script><img src="./relative.png">')
      }
      let capturedBuild
      const openBuild = async (staticRoot) => {
        const { openStaticBuild } = await import('./staticFiles.js')
        capturedBuild = await openStaticBuild(staticRoot)
        return capturedBuild
      }

      if (invalid) await expect(verifyBuildArtifacts(root, { openBuild })).rejects.toThrow(/relative asset reference/i)
      else await expect(verifyBuildArtifacts(root, { openBuild })).resolves.toBeDefined()
      await expect(capturedBuild.getFile('index.html').handle.stat()).rejects.toMatchObject({ code: 'EBADF' })
    }
  })

  test.each([
    'source-a1b2c3d4.js.MAP',
    'source-a1b2c3d4.js.map.gz',
    'source-a1b2c3d4.js.MAP.BR',
  ])('rejects case-insensitive and compressed source-map output %s', async (name) => {
    const root = await writeValidBuild()
    roots.push(root)
    await writeFile(join(root, 'assets', name), '{}')
    await expect(verifyBuildArtifacts(root)).rejects.toThrow(/source map/i)
  })

  test('rejects non-canonical raw and encoded Unicode build paths and references', async () => {
    const rawPath = await writeValidBuild()
    roots.push(rawPath)
    await writeFile(join(rawPath, 'assets', 'café-a1b2c3d4.png'), 'image')
    await writeFile(join(rawPath, 'index.html'), '<script src="/assets/app-a1b2c3d4.js"></script><img src="/assets/café-a1b2c3d4.png">')
    await expect(verifyBuildArtifacts(rawPath)).rejects.toThrow(/canonical|non-ASCII/i)

    const encodedPath = await writeValidBuild()
    roots.push(encodedPath)
    await writeFile(join(encodedPath, 'assets', 'cafe%CC%81-a1b2c3d4.png'), 'image')
    await expect(verifyBuildArtifacts(encodedPath)).rejects.toThrow(/canonical|encoding/i)

    const encodedReference = await writeValidBuild()
    roots.push(encodedReference)
    await writeFile(join(encodedReference, 'assets', 'café-a1b2c3d4.png'), 'image')
    await writeFile(join(encodedReference, 'index.html'), '<script src="/assets/app-a1b2c3d4.js"></script><img src="/assets/caf%C3%A9-a1b2c3d4.png">')
    await expect(verifyBuildArtifacts(encodedReference)).rejects.toThrow(/canonical|non-ASCII|encoding/i)
  })

  test('parses every HTML and CSS asset reference and rejects one invalid reference among valid ones', async () => {
    const cases = [
      {
        name: 'nested HTML relative reference',
        file: 'docs/workflow.html',
        content: '<script src="/docs/assets/docs-a1b2c3d4.js"></script><img src="./relative.png">',
        error: /relative asset reference/i,
      },
      {
        name: 'SPA index without an asset reference',
        file: 'index.html',
        content: '<h1>Not a deployable SPA shell</h1>',
        error: /root-relative \/assets\//i,
      },
      {
        name: 'docs HTML wrong root',
        file: 'docs/workflow.html',
        content: '<script src="/docs/assets/docs-a1b2c3d4.js"></script><script src="/assets/app-a1b2c3d4.js"></script>',
        error: /wrong static root/i,
      },
      {
        name: 'missing HTML asset',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><img src="/assets/missing-a1b2c3d4.png">',
        error: /missing build asset/i,
      },
      {
        name: 'HTML traversal',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><img src="/assets/../server.js">',
        error: /traversal/i,
      },
      {
        name: 'HTML source map',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><script src="/assets/app-a1b2c3d4.js.map.br"></script>',
        error: /source map/i,
      },
      {
        name: 'SPA HTML asset that runtime will not serve directly',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><iframe src="/assets/embed.html"></iframe>',
        error: /not served directly/i,
        extraFile: ['assets/embed.html', '<h1>Embedded</h1>'],
      },
      {
        name: 'docs HTML asset that runtime canonicalizes instead of serving directly',
        file: 'docs/index.html',
        content: '<script src="/docs/assets/docs-a1b2c3d4.js"></script><iframe src="/docs/workflow.html"></iframe>',
        error: /not served directly/i,
      },
      {
        name: 'malformed HTML URL',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><img src="/assets/%ZZ.png">',
        error: /malformed asset reference/i,
      },
      {
        name: 'empty HTML asset URL',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><img src="">',
        error: /malformed asset reference/i,
      },
      {
        name: 'second-order HTML traversal',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><img src="/assets/%252e%252e%252fserver.js">',
        error: /traversal/i,
      },
      {
        name: 'inline HTML style reference',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><style>a{background:url(./relative.png)}</style>',
        error: /relative asset reference/i,
      },
      {
        name: 'SVG image reference',
        file: 'index.html',
        content: '<script src="/assets/app-a1b2c3d4.js"></script><svg><image href="./relative.png"></image></svg>',
        error: /relative asset reference/i,
      },
      {
        name: 'relative CSS URL',
        file: 'assets/style-a1b2c3d4.css',
        content: '@font-face{src:url(/assets/font-a1b2c3d4.woff2),url(./font.woff2)}',
        error: /relative asset reference/i,
      },
      {
        name: 'docs CSS wrong root',
        file: 'docs/assets/style-a1b2c3d4.css',
        content: 'a{background:url(/docs/assets/font-a1b2c3d4.woff2)}b{background:url(/assets/font-a1b2c3d4.woff2)}',
        error: /wrong static root/i,
      },
      {
        name: 'missing CSS asset',
        file: 'assets/style-a1b2c3d4.css',
        content: 'a{background:url(/assets/font-a1b2c3d4.woff2)}b{background:url(/assets/missing-a1b2c3d4.png)}',
        error: /missing build asset/i,
      },
      {
        name: 'malformed CSS',
        file: 'assets/style-a1b2c3d4.css',
        content: 'a{background:url("unterminated)}',
        error: /invalid CSS/i,
      },
    ]

    for (const testCase of cases) {
      const root = await writeValidBuild()
      roots.push(root)
      if (testCase.extraFile) await writeFile(join(root, testCase.extraFile[0]), testCase.extraFile[1])
      await writeFile(join(root, testCase.file), testCase.content)
      await expect(verifyBuildArtifacts(root), testCase.name).rejects.toThrow(testCase.error)
    }
  })
})
