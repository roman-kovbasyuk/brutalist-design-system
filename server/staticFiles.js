import { readdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import fastifyStatic from '@fastify/static'

const immutableName = /[.-][A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/
const staticSecurityHeaders = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
})

function inventoryFiles(directory, root, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      inventoryFiles(absolutePath, root, files)
      continue
    }
    if (!entry.isFile()) continue
    const relativePath = relative(root, absolutePath).split(sep).join('/')
    if (!relativePath.endsWith('.map')) files.add(relativePath)
  }
}

export function inspectStaticBuild(staticRoot) {
  if (typeof staticRoot !== 'string' || staticRoot.trim() === '') {
    throw new TypeError('staticRoot must be a non-empty directory path')
  }

  const root = resolve(staticRoot)
  const files = new Set()
  try {
    inventoryFiles(root, root, files)
  } catch (error) {
    throw new Error(`Production static build is unavailable at ${root}; run npm run build before startup`, { cause: error })
  }

  const missing = ['index.html', 'docs/index.html', 'docs/404.html'].filter((file) => !files.has(file))
  if (missing.length > 0) {
    throw new Error(`Production static build is missing dist/${missing.join(' and dist/')}; run npm run build before startup`)
  }

  return Object.freeze({ root, files })
}

function requestPath(request) {
  const rawPath = request.raw.url?.split('?', 1)[0] ?? request.url.split('?', 1)[0]
  if (/%(?:2e|2f|5c|00)/i.test(rawPath)) return null

  let decoded
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return null
  }

  if (decoded.includes('\\') || decoded.includes('\0')) return null
  const segments = decoded.split('/')
  if (segments.some((segment) => segment.startsWith('.'))) return null
  return decoded
}

function acceptsHtml(request) {
  const accept = request.headers.accept
  if (typeof accept !== 'string') return false
  return accept.split(',').some((entry) => {
    const [mediaType, ...parameters] = entry.trim().toLowerCase().split(';')
    if (mediaType !== 'text/html' && mediaType !== 'application/xhtml+xml') return false
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='))
    return quality === undefined || Number(quality.trim().slice(2)) > 0
  })
}

function setStaticHeaders(reply, file) {
  for (const [name, value] of Object.entries(staticSecurityHeaders)) reply.header(name, value)
  const cacheControl = immutableName.test(file)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
  reply.header('Cache-Control', cacheControl)
}

function sendKnownFile(reply, build, file, statusCode = 200) {
  if (!build.files.has(file)) return null
  setStaticHeaders(reply, file)
  reply.code(statusCode)
  return reply.sendFile(file, {
    cacheControl: false,
    dotfiles: 'deny',
    index: false,
  })
}

function sendNotFound(reply) {
  return reply.callNotFound()
}

function redirect(reply, location) {
  return reply.code(308).header('Location', location).send()
}

function docsRoute(request, reply, build) {
  const pathname = requestPath(request)
  if (pathname === null || !pathname.startsWith('/docs/')) return sendNotFound(reply)
  const suffix = pathname.slice('/docs/'.length)

  if (suffix === '') return sendKnownFile(reply, build, 'docs/index.html')

  if (suffix.endsWith('.html')) {
    if (!build.files.has(`docs/${suffix}`)) return sendNotFound(reply)
    if (suffix === 'index.html') return redirect(reply, '/docs/')
    return redirect(reply, `/docs/${suffix.slice(0, -'.html'.length)}`)
  }

  if (suffix.endsWith('/')) {
    const directoryIndex = `docs/${suffix}index.html`
    if (build.files.has(directoryIndex)) return sendKnownFile(reply, build, directoryIndex)
    const cleanPage = `docs/${suffix.slice(0, -1)}.html`
    if (build.files.has(cleanPage)) return redirect(reply, `/docs/${suffix.slice(0, -1)}`)
    return acceptsHtml(request)
      ? sendKnownFile(reply, build, 'docs/404.html', 404)
      : sendNotFound(reply)
  }

  const exactFile = `docs/${suffix}`
  if (build.files.has(exactFile)) return sendKnownFile(reply, build, exactFile)

  const cleanPage = `${exactFile}.html`
  if (build.files.has(cleanPage)) return sendKnownFile(reply, build, cleanPage)

  const directoryIndex = `${exactFile}/index.html`
  if (build.files.has(directoryIndex)) return redirect(reply, `${pathname}/`)

  if (suffix.includes('.') || suffix.startsWith('assets/')) return sendNotFound(reply)
  return acceptsHtml(request)
    ? sendKnownFile(reply, build, 'docs/404.html', 404)
    : sendNotFound(reply)
}

function spaRoute(request, reply, build) {
  const pathname = requestPath(request)
  if (pathname === null) return sendNotFound(reply)
  if (pathname === '/') return acceptsHtml(request)
    ? sendKnownFile(reply, build, 'index.html')
    : sendNotFound(reply)

  const relativePath = pathname.slice(1)
  if (build.files.has(relativePath) && !relativePath.startsWith('docs/') && !relativePath.endsWith('.html')) {
    return sendKnownFile(reply, build, relativePath)
  }

  if (
    ['/api', '/assets', '/healthz', '/readyz', '/docs']
      .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    || relativePath.includes('.')
    || !acceptsHtml(request)
  ) return sendNotFound(reply)

  return sendKnownFile(reply, build, 'index.html')
}

export function registerStaticFiles(app, staticRoot) {
  const build = inspectStaticBuild(staticRoot)
  if (!isAbsolute(build.root)) throw new Error('Production static root must resolve to an absolute path')

  app.register(fastifyStatic, {
    root: build.root,
    serve: false,
  })

  app.get('/docs', (request, reply) => redirect(reply, '/docs/'))
  app.get('/docs/*', (request, reply) => docsRoute(request, reply, build))
  app.get('/*', (request, reply) => spaRoute(request, reply, build))
}
