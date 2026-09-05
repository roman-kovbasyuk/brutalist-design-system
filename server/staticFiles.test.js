import { mkdtemp, mkdir, rename, rm, truncate, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildApp } from './app.js'
import { openStaticBuild } from './staticFiles.js'

const spaHtml = '<!doctype html><title>Banner Studio app</title><script type="module" src="/assets/app-deadbeef.js"></script>'
const docsHtml = '<!doctype html><title>Banner Studio docs</title><link rel="stylesheet" href="/docs/assets/style-deadbeef.css">'
const workflowHtml = '<!doctype html><title>Workflow documentation</title>'
const docsNotFoundHtml = '<!doctype html><title>Documentation page not found</title>'

async function makeBuild() {
  const root = await mkdtemp(join(tmpdir(), 'banner-studio-static-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'docs', 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), spaHtml)
  await writeFile(join(root, 'assets', 'app-deadbeef.js'), 'globalThis.bannerStudio = true')
  await writeFile(join(root, 'assets', 'unhashed.js'), 'globalThis.unhashed = true')
  await writeFile(join(root, 'docs', 'index.html'), docsHtml)
  await writeFile(join(root, 'docs', 'workflow.html'), workflowHtml)
  await writeFile(join(root, 'docs', '404.html'), docsNotFoundHtml)
  await writeFile(join(root, 'docs', 'assets', 'style-deadbeef.css'), 'body{color:#123}')
  return root
}

function expectStaticSecurityHeaders(response) {
  expect(response.headers).toMatchObject({
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
  })
}

describe('production static serving', () => {
  let root

  beforeEach(async () => {
    root = await makeBuild()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('keeps liveness and missing API routes JSON even when a browser accepts HTML', async () => {
    const app = buildApp({ staticRoot: root })

    const health = await app.inject({ method: 'GET', url: '/healthz', headers: { accept: 'text/html' } })
    const missingApi = await app.inject({ method: 'GET', url: '/api/v1/unknown', headers: { accept: 'text/html' } })

    expect(health.statusCode).toBe(200)
    expect(health.headers['content-type']).toContain('application/json')
    expect(health.json()).toMatchObject({ status: 'ok' })
    expect(missingApi.statusCode).toBe(404)
    expect(missingApi.headers['content-type']).toContain('application/json')
    expect(missingApi.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(missingApi.body).not.toContain('Banner Studio app')
    await app.close()
  })

  test('preserves private asset authentication ahead of the SPA fallback', async () => {
    const assetService = { readAsset: vi.fn() }
    const app = buildApp({
      staticRoot: root,
      resolveActor: vi.fn(async () => null),
      workflowService: {},
      assetService,
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/assets/private-asset',
      headers: { accept: 'text/html' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.json()).toMatchObject({ code: 'unauthorized' })
    expect(assetService.readAsset).not.toHaveBeenCalled()
    await app.close()
  })

  test('serves the docs root, clean nested pages, and hashed assets with route-specific caching', async () => {
    const app = buildApp({ staticRoot: root })

    const withoutSlash = await app.inject({ method: 'GET', url: '/docs', headers: { accept: 'text/html' } })
    const docsRoot = await app.inject({ method: 'GET', url: '/docs/', headers: { accept: 'text/html' } })
    const nested = await app.inject({ method: 'GET', url: '/docs/workflow', headers: { accept: 'text/html' } })
    const dirtyNested = await app.inject({ method: 'GET', url: '/docs/workflow.html', headers: { accept: 'text/html' } })
    const nestedSlash = await app.inject({ method: 'GET', url: '/docs/workflow/', headers: { accept: 'text/html' } })
    const asset = await app.inject({ method: 'GET', url: '/docs/assets/style-deadbeef.css' })

    expect(withoutSlash.statusCode).toBe(308)
    expect(withoutSlash.headers.location).toBe('/docs/')
    expect(docsRoot.statusCode).toBe(200)
    expect(docsRoot.body).toContain('Banner Studio docs')
    expect(docsRoot.headers['content-type']).toContain('text/html')
    expect(docsRoot.headers['cache-control']).toBe('no-cache')
    expect(nested.statusCode).toBe(200)
    expect(nested.body).toContain('Workflow documentation')
    expect(nested.headers['cache-control']).toBe('no-cache')
    expect(dirtyNested.statusCode).toBe(308)
    expect(dirtyNested.headers.location).toBe('/docs/workflow')
    expect(nestedSlash.statusCode).toBe(308)
    expect(nestedSlash.headers.location).toBe('/docs/workflow')
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['content-type']).toContain('text/css')
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expectStaticSecurityHeaders(docsRoot)
    expectStaticSecurityHeaders(asset)
    await app.close()
  })

  test('returns the built docs 404 with status 404 and never falls through to the SPA', async () => {
    const app = buildApp({ staticRoot: root })

    const missingPage = await app.inject({ method: 'GET', url: '/docs/missing-page', headers: { accept: 'text/html' } })
    const missingAsset = await app.inject({ method: 'GET', url: '/docs/assets/missing-deadbeef.js', headers: { accept: '*/*' } })
    const missingHtml = await app.inject({ method: 'GET', url: '/docs/missing-page.html', headers: { accept: 'text/html' } })
    const missingCssNavigation = await app.inject({ method: 'GET', url: '/docs/missing-page.css', headers: { accept: 'text/html' } })

    expect(missingPage.statusCode).toBe(404)
    expect(missingPage.headers['content-type']).toContain('text/html')
    expect(missingPage.headers['cache-control']).toBe('no-cache')
    expect(missingPage.body).toContain('Documentation page not found')
    expect(missingPage.body).not.toContain('Banner Studio app')
    expect(missingAsset.statusCode).toBe(404)
    expect(missingAsset.headers['content-type']).toContain('application/json')
    expect(missingAsset.body).not.toContain('Banner Studio app')
    expect(missingHtml.statusCode).toBe(404)
    expect(missingHtml.headers['content-type']).toContain('text/html')
    expect(missingHtml.body).toContain('Documentation page not found')
    expect(missingCssNavigation.statusCode).toBe(404)
    expect(missingCssNavigation.headers['content-type']).toContain('application/json')
    await app.close()
  })

  test('serves the SPA root, browser routes, and hashed assets without treating missing files as routes', async () => {
    const app = buildApp({ staticRoot: root })

    const rootResponse = await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } })
    const browserRoute = await app.inject({ method: 'GET', url: '/campaign/campaign-1?tab=review', headers: { accept: 'text/html,application/xhtml+xml' } })
    const asset = await app.inject({ method: 'GET', url: '/assets/app-deadbeef.js' })
    const unhashedAsset = await app.inject({ method: 'GET', url: '/assets/unhashed.js' })
    const missingAsset = await app.inject({ method: 'GET', url: '/assets/missing-deadbeef.js', headers: { accept: 'text/html' } })
    const missingAssetWithoutExtension = await app.inject({ method: 'GET', url: '/assets/missing-build-file', headers: { accept: 'text/html' } })
    const sourceMap = await app.inject({ method: 'GET', url: '/assets/hidden-deadbeef.js.map', headers: { accept: '*/*' } })
    const serverFile = await app.inject({ method: 'GET', url: '/server/app.js', headers: { accept: 'text/html' } })

    expect(rootResponse.statusCode).toBe(200)
    expect(rootResponse.body).toContain('Banner Studio app')
    expect(rootResponse.headers['cache-control']).toBe('no-cache')
    expect(browserRoute.statusCode).toBe(200)
    expect(browserRoute.body).toContain('Banner Studio app')
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['content-type']).toContain('application/javascript')
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(unhashedAsset.statusCode).toBe(200)
    expect(unhashedAsset.headers['cache-control']).toBe('no-cache')
    for (const response of [missingAsset, missingAssetWithoutExtension, sourceMap, serverFile]) {
      expect(response.statusCode).toBe(404)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.body).not.toContain('Banner Studio app')
    }
    expectStaticSecurityHeaders(rootResponse)
    expectStaticSecurityHeaders(asset)
    await app.close()
  })

  test('uses the SPA fallback only for GET or HEAD HTML navigation', async () => {
    const app = buildApp({ staticRoot: root })

    const json = await app.inject({ method: 'GET', url: '/campaign/campaign-1', headers: { accept: 'application/json' } })
    const wildcard = await app.inject({ method: 'GET', url: '/campaign/campaign-1', headers: { accept: '*/*' } })
    const post = await app.inject({ method: 'POST', url: '/campaign/campaign-1', headers: { accept: 'text/html' } })
    const healthTypo = await app.inject({ method: 'GET', url: '/healthz/missing', headers: { accept: 'text/html' } })
    const apiRoot = await app.inject({ method: 'GET', url: '/api', headers: { accept: 'text/html' } })

    for (const response of [json, wildcard, post, healthTypo, apiRoot]) {
      expect(response.statusCode).toBe(404)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.body).not.toContain('Banner Studio app')
    }
    await app.close()
  })

  test.each([
    ['TEXT/HTML ; Q = 0', 404],
    ['text/html;q=0.000', 404],
    ['text/html; q = 0.125', 200],
    ['application/xhtml+xml ; Q = 1', 200],
    ['text/html;q=1.001', 404],
    ['text/html;q=banana', 404],
    ['text/html;q=2', 404],
    ['text/html;q=1;q=0', 404],
  ])('parses HTML Accept media ranges and qvalues: %s', async (accept, statusCode) => {
    const app = buildApp({ staticRoot: root })
    const response = await app.inject({ method: 'GET', url: '/campaign/accept-check', headers: { accept } })
    expect(response.statusCode).toBe(statusCode)
    await app.close()
  })

  test.each([
    '/campaign/%252e%252e/server',
    '/campaign/%25252e%25252e/server',
    '/campaign/%255cserver',
    '/campaign/%252fserver',
    '/campaign/%25',
    '/campaign/foo%00bar',
    '/campaign/foo%2fbar',
    '/campaign/foo%5cbar',
    '/campaign/ｅvil',
    '/campaign/․․',
    '/campaign/e\u0301',
  ])('never uses the SPA fallback for non-canonical navigation path %s', async (url) => {
    const app = buildApp({ staticRoot: root })
    const response = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } })
    expect(response.statusCode).toBe(404)
    expect(response.body).not.toContain('Banner Studio app')
    await app.close()
  })

  test('preserves legitimate ASCII UUID, slug, and query-string browser routes', async () => {
    const app = buildApp({ staticRoot: root })
    for (const url of [
      '/campaign/550e8400-e29b-41d4-a716-446655440000?tab=review&version=2',
      '/templates?category=social-static',
      '/system/provider-settings',
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } })
      expect(response.statusCode, url).toBe(200)
      expect(response.body, url).toContain('Banner Studio app')
    }
    await app.close()
  })

  test('serves immutable startup snapshots after source replacement, symlink, truncation, and rename', async () => {
    const app = buildApp({ staticRoot: root })
    await app.ready()
    const assetPath = join(root, 'assets', 'app-deadbeef.js')
    const movedPath = join(root, 'assets', 'moved-app-deadbeef.js')
    const expected = 'globalThis.bannerStudio = true'

    await rename(assetPath, movedPath)
    await writeFile(assetPath, 'globalThis.bannerStudio = "replaced"')
    expect((await app.inject({ method: 'GET', url: '/assets/app-deadbeef.js' })).body).toBe(expected)

    await unlink(assetPath)
    await (await import('node:fs/promises')).symlink(movedPath, assetPath)
    expect((await app.inject({ method: 'GET', url: '/assets/app-deadbeef.js' })).body).toBe(expected)

    await truncate(movedPath, 0)
    await rename(assetPath, join(root, 'assets', 'renamed-link'))
    expect((await app.inject({ method: 'GET', url: '/assets/app-deadbeef.js' })).body).toBe(expected)
    await app.close()
  })

  test('serves concurrent bounded GET and HEAD reads from independent snapshot offsets', async () => {
    const app = buildApp({ staticRoot: root })
    await app.ready()
    const expected = 'globalThis.bannerStudio = true'
    const responses = await Promise.all(Array.from({ length: 24 }, (_, index) => app.inject({
      method: index % 3 === 0 ? 'HEAD' : 'GET',
      url: '/assets/app-deadbeef.js',
    })))

    for (const [index, response] of responses.entries()) {
      expect(response.statusCode).toBe(200)
      expect(response.headers['content-length']).toBe(String(Buffer.byteLength(expected)))
      expect(response.body).toBe(index % 3 === 0 ? '' : expected)
    }
    await app.close()
  })

  test('returns a standard no-store JSON 500 for a closed retained descriptor', async () => {
    const staticBuild = await openStaticBuild(root)
    const entry = staticBuild.getFile('assets/app-deadbeef.js')
    const app = buildApp({ staticBuild })
    await app.ready()
    await entry.handle.close()

    for (const method of ['GET', 'HEAD']) {
      const response = await app.inject({ method, url: '/assets/app-deadbeef.js' })
      expect(response.statusCode).toBe(500)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers.etag).toBeUndefined()
      expect(response.headers['x-frame-options']).toBeUndefined()
      if (method === 'GET') expect(response.json()).toMatchObject({ code: 'INTERNAL_ERROR' })
      else expect(response.body).toBe('')
    }
    await app.close()
  })

  test('gives HEAD the same status and headers as GET without response bytes', async () => {
    const app = buildApp({ staticRoot: root })

    for (const url of ['/', '/campaign/campaign-1', '/assets/app-deadbeef.js', '/docs/', '/docs/workflow', '/docs/assets/style-deadbeef.css']) {
      const headers = url.includes('/assets/') ? {} : { accept: 'text/html' }
      const get = await app.inject({ method: 'GET', url, headers })
      const head = await app.inject({ method: 'HEAD', url, headers })
      expect(head.statusCode, url).toBe(get.statusCode)
      expect(head.headers['content-type'], url).toBe(get.headers['content-type'])
      expect(head.headers['cache-control'], url).toBe(get.headers['cache-control'])
      expect(head.headers['content-length'], url).toBe(get.headers['content-length'])
      expect(head.body, url).toBe('')
    }
    await app.close()
  })

  test.each([
    '/docs/%2e%2e/index.html',
    '/docs/%2e%2e%2findex.html',
    '/docs/.secret',
    '/%2e%2e/server/app.js',
    '/.env',
  ])('rejects traversal and hidden-file request %s without exposing build or server files', async (url) => {
    const app = buildApp({ staticRoot: root })
    const response = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } })
    expect(response.statusCode).toBe(404)
    expect(response.body).not.toContain('Banner Studio app')
    expect(response.body).not.toContain('Banner Studio docs')
    await app.close()
  })

  test('fails construction with a clear message when required build artifacts are absent', async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), 'banner-studio-missing-static-'))
    await writeFile(join(missingRoot, 'index.html'), spaHtml)
    const missingDocsApp = buildApp({ staticRoot: missingRoot })
    await expect(missingDocsApp.ready()).rejects.toThrow(/dist\/docs\/index\.html.*npm run build/i)
    await missingDocsApp.close().catch(() => {})
    await rm(missingRoot, { recursive: true, force: true })

    await unlink(join(root, 'docs', '404.html'))
    const missingNotFoundApp = buildApp({ staticRoot: root })
    await expect(missingNotFoundApp.ready()).rejects.toThrow(/dist\/docs\/404\.html.*npm run build/i)
    await missingNotFoundApp.close().catch(() => {})
  })

  test('closes cleanly after serving production files', async () => {
    const app = buildApp({ staticRoot: root })
    await app.ready()
    await expect(app.close()).resolves.toBeUndefined()
    await expect(app.close()).resolves.toBeUndefined()
  })
})
