import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../server/app.js'

const defaultStaticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

function ensure(condition, message) {
  if (!condition) throw new Error(`Production smoke failed: ${message}`)
}

export async function smokeProductionServer({ staticRoot = defaultStaticRoot } = {}) {
  const app = buildApp({
    staticRoot,
    resolveActor: async () => null,
    workflowService: {},
    assetService: { readAsset: async () => { throw new Error('authentication must run before asset storage') } },
  })
  let port
  let routes

  try {
    await app.listen({ host: '127.0.0.1', port: 0 })
    port = app.server.address().port
    const origin = `http://127.0.0.1:${port}`
    const htmlHeaders = { accept: 'text/html' }
    const [health, spa, browserRoute, docsRedirect, docs, docsPage, apiMissing, privateAsset] = await Promise.all([
      fetch(`${origin}/healthz`),
      fetch(`${origin}/`, { headers: htmlHeaders }),
      fetch(`${origin}/campaign/smoke`, { headers: htmlHeaders }),
      fetch(`${origin}/docs`, { headers: htmlHeaders, redirect: 'manual' }),
      fetch(`${origin}/docs/`, { headers: htmlHeaders }),
      fetch(`${origin}/docs/workflow`, { headers: htmlHeaders }),
      fetch(`${origin}/api/v1/smoke-missing`, { headers: htmlHeaders }),
      fetch(`${origin}/api/v1/assets/private-smoke`, { headers: htmlHeaders }),
    ])

    routes = {
      health: health.status,
      spa: spa.status,
      browserRoute: browserRoute.status,
      docsRedirect: docsRedirect.status,
      docs: docs.status,
      docsPage: docsPage.status,
      apiMissing: apiMissing.status,
      privateAsset: privateAsset.status,
    }
    ensure(health.status === 200 && (await health.json()).status === 'ok', 'health route')
    ensure(spa.status === 200 && (await spa.text()).includes('<title>'), 'SPA root')
    ensure(browserRoute.status === 200 && (await browserRoute.text()).includes('<title>'), 'SPA browser fallback')
    ensure(docsRedirect.status === 308 && docsRedirect.headers.get('location') === '/docs/', 'docs redirect')
    ensure(docs.status === 200 && (await docs.text()).includes('<title>'), 'docs root')
    ensure(docsPage.status === 200 && (await docsPage.text()).includes('<title>'), 'docs clean nested page')
    ensure(apiMissing.status === 404 && apiMissing.headers.get('content-type')?.includes('application/json'), 'API 404 precedence')
    ensure(privateAsset.status === 401 && privateAsset.headers.get('content-type')?.includes('application/json'), 'private asset authentication')
  } finally {
    await app.close()
  }

  return Object.freeze({ port, closed: !app.server.listening, routes: Object.freeze(routes) })
}

async function main() {
  const result = await smokeProductionServer({ staticRoot: process.argv[2] || defaultStaticRoot })
  process.stdout.write(`Production smoke passed on ephemeral port ${result.port}; server closed cleanly\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
