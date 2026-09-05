import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  unlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import mime from 'mime'
import { assertStaticPathname, inspectStaticPathname } from '../shared/staticPathPolicy.js'

const viteAssetPath = /^assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/
const vitePressAssetPath = /^docs\/assets\/(?:[^/]+\/)*[^/]+\.[A-Za-z0-9_-]{8}(?:\.lean)?\.[A-Za-z0-9]+$/
const staticSecurityHeaders = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
})
const requiredBuildFiles = Object.freeze(['index.html', 'docs/index.html', 'docs/404.html'])
const copyBufferSize = 64 * 1024
const defaultOperations = Object.freeze({ chmod, lstat, mkdtemp, open, readdir, realpath, rm, unlink })

function buildError(message, cause) {
  return new Error(`${message}; run npm run build before startup`, cause ? { cause } : undefined)
}

function insideRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

async function copyOpenedFile(source, target, size, hash) {
  const buffer = Buffer.allocUnsafe(Math.min(copyBufferSize, Math.max(size, 1)))
  let offset = 0
  while (offset < size) {
    const length = Math.min(buffer.length, size - offset)
    const { bytesRead } = await source.read(buffer, 0, length, offset)
    if (bytesRead === 0) throw new Error('File changed while the static snapshot was being created')
    hash.update(buffer.subarray(0, bytesRead))
    let written = 0
    while (written < bytesRead) {
      const result = await target.write(buffer, written, bytesRead - written, offset + written)
      if (result.bytesWritten === 0) throw new Error('Could not persist the static snapshot')
      written += result.bytesWritten
    }
    offset += bytesRead
  }
}

async function hashOpenedFile(handle, size) {
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(Math.min(copyBufferSize, Math.max(size, 1)))
  let offset = 0
  while (offset < size) {
    const length = Math.min(buffer.length, size - offset)
    const { bytesRead } = await handle.read(buffer, 0, length, offset)
    if (bytesRead === 0) throw new Error('Static snapshot ended before its recorded length')
    hash.update(buffer.subarray(0, bytesRead))
    offset += bytesRead
  }
  return hash.digest('hex')
}

function sameOpenedFile(expected, actual) {
  return expected.isFile()
    && actual.isFile()
    && expected.dev === actual.dev
    && expected.ino === actual.ino
    && expected.mode === actual.mode
    && expected.size === actual.size
}

function sameOpenedDirectory(expected, actual) {
  return expected.isDirectory()
    && actual.isDirectory()
    && expected.dev === actual.dev
    && expected.ino === actual.ino
    && expected.mode === actual.mode
}

async function snapshotFile({ absolutePath, file, metadata, temporaryRoot, index, operations }) {
  const noFollow = constants.O_NOFOLLOW ?? 0
  let source
  let target
  let snapshot
  const temporaryPath = join(temporaryRoot, `file-${index}`)

  try {
    source = await operations.open(absolutePath, constants.O_RDONLY | noFollow)
    const before = await source.stat()
    if (!sameOpenedFile(metadata, before)) throw new Error(`Static build entry identity changed during startup: ${file}`)
    if (before.nlink !== 1) throw new Error(`Static build must not contain a hard link: ${file}`)

    target = await operations.open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | noFollow,
      0o600,
    )
    const hash = createHash('sha256')
    await copyOpenedFile(source, target, before.size, hash)
    await target.sync()
    const expectedHash = hash.digest('hex')

    const after = await source.stat()
    if (
      !sameOpenedFile(before, after)
      || before.mtimeMs !== after.mtimeMs
    ) throw new Error(`Static build entry changed during startup: ${file}`)

    const targetStat = await target.stat()
    if (!targetStat.isFile() || targetStat.size !== before.size) {
      throw new Error(`Static snapshot size verification failed: ${file}`)
    }

    await target.close()
    target = undefined
    await operations.chmod(temporaryPath, 0o400)
    snapshot = await operations.open(temporaryPath, constants.O_RDONLY | noFollow)
    const snapshotStat = await snapshot.stat()
    if (!snapshotStat.isFile() || snapshotStat.size !== before.size) {
      throw new Error(`Static snapshot size verification failed: ${file}`)
    }
    const snapshotHash = await hashOpenedFile(snapshot, snapshotStat.size)
    if (snapshotHash !== expectedHash) throw new Error(`Static snapshot hash verification failed: ${file}`)
    await operations.unlink(temporaryPath)

    return Object.freeze({
      file,
      handle: snapshot,
      size: snapshotStat.size,
      dev: snapshotStat.dev,
      ino: snapshotStat.ino,
      mode: snapshotStat.mode,
      mtimeMs: snapshotStat.mtimeMs,
      sourceDev: before.dev,
      sourceIno: before.ino,
      sourceMtimeMs: before.mtimeMs,
      etag: `"${expectedHash}"`,
      mimeType: file.endsWith('.js') ? 'application/javascript' : (mime.getType(file) ?? 'application/octet-stream'),
    })
  } catch (error) {
    await snapshot?.close().catch(() => {})
    await target?.close().catch(() => {})
    await operations.unlink(temporaryPath).catch(() => {})
    throw error
  } finally {
    await source?.close().catch(() => {})
  }
}

async function inventoryDirectory({ directory, metadata, root, rootRealPath, temporaryRoot, entries, operations }) {
  const noFollow = constants.O_NOFOLLOW ?? 0
  const directoryOnly = constants.O_DIRECTORY ?? 0
  let directoryHandle
  try {
    directoryHandle = await operations.open(directory, constants.O_RDONLY | noFollow | directoryOnly)
    const openedMetadata = await directoryHandle.stat()
    if (!sameOpenedDirectory(metadata, openedMetadata)) {
      throw new Error(`Static build directory identity changed during startup: ${relative(root, directory) || '.'}`)
    }

    const resolvedDirectory = await operations.realpath(directory)
    if (!insideRoot(rootRealPath, resolvedDirectory)) {
      throw new Error(`Static build directory resolves outside its root: ${relative(root, directory) || '.'}`)
    }

    const directoryEntries = await operations.readdir(directory, { withFileTypes: true })
    directoryEntries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const directoryEntry of directoryEntries) {
      const absolutePath = join(directory, directoryEntry.name)
      const file = relative(root, absolutePath).split(sep).join('/')
      const details = await operations.lstat(absolutePath)

      if (details.isSymbolicLink()) throw new Error(`Static build must not contain a symbolic link: ${file}`)
      try {
        assertStaticPathname(file, { leadingSlash: false })
      } catch (error) {
        if (error.reason === 'source map') throw new Error(`Static build must not contain a source map artifact: ${file}`, { cause: error })
        throw new Error(`Static build contains a non-canonical path: ${file}`, { cause: error })
      }

      const resolvedPath = await operations.realpath(absolutePath)
      if (!insideRoot(rootRealPath, resolvedPath)) throw new Error(`Static build entry resolves outside its root: ${file}`)

      if (details.isDirectory()) {
        await inventoryDirectory({
          directory: absolutePath,
          metadata: details,
          root,
          rootRealPath,
          temporaryRoot,
          entries,
          operations,
        })
        continue
      }
      if (!details.isFile()) throw new Error(`Static build entry is not a regular file: ${file}`)
      if (details.nlink !== 1) throw new Error(`Static build must not contain a hard link: ${file}`)

      const snapshot = await snapshotFile({
        absolutePath,
        file,
        metadata: details,
        temporaryRoot,
        index: entries.size,
        operations,
      })
      entries.set(file, snapshot)
    }

    const finalMetadata = await operations.lstat(directory)
    if (!sameOpenedDirectory(openedMetadata, finalMetadata)) {
      throw new Error(`Static build directory changed during startup: ${relative(root, directory) || '.'}`)
    }
  } finally {
    await directoryHandle?.close().catch(() => {})
  }
}

export async function openStaticBuild(staticRoot, { operations: operationOverrides = {} } = {}) {
  if (typeof staticRoot !== 'string' || staticRoot.trim() === '') {
    throw new TypeError('staticRoot must be a non-empty directory path')
  }

  const root = resolve(staticRoot)
  const operations = { ...defaultOperations, ...operationOverrides }
  const entries = new Map()
  let temporaryRoot
  let closePromise

  const close = () => {
    if (!closePromise) {
      closePromise = Promise.allSettled([...entries.values()].map((entry) => entry.handle.close()))
        .then((results) => {
          const failure = results.find((result) => result.status === 'rejected')
          if (failure) throw failure.reason
        })
    }
    return closePromise
  }

  try {
    const rootDetails = await operations.lstat(root)
    if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
      throw new Error(`Production static build root is not a regular directory: ${root}`)
    }
    const rootRealPath = await operations.realpath(root)
    temporaryRoot = await operations.mkdtemp(join(tmpdir(), 'banner-studio-static-snapshot-'))
    await inventoryDirectory({
      directory: root,
      metadata: rootDetails,
      root,
      rootRealPath,
      temporaryRoot,
      entries,
      operations,
    })

    const missing = requiredBuildFiles.filter((file) => !entries.has(file))
    if (missing.length > 0) {
      throw new Error(`Production static build is missing dist/${missing.join(' and dist/')}`)
    }
  } catch (error) {
    await close().catch(() => {})
    if (/static build|source map|symbolic link|regular file|dotfile/i.test(error.message)) {
      throw buildError(error.message, error)
    }
    throw buildError(`Production static build is unavailable at ${root}`, error)
  } finally {
    if (temporaryRoot) await operations.rm(temporaryRoot, { recursive: true, force: true }).catch(() => {})
  }

  return Object.freeze({
    root,
    fileCount: entries.size,
    files: Object.freeze([...entries.keys()].sort()),
    hasFile: (file) => entries.has(file),
    getFile: (file) => entries.get(file),
    close,
  })
}

function requestPath(request) {
  const rawPath = request.raw.url?.split('?', 1)[0] ?? request.url.split('?', 1)[0]
  const result = inspectStaticPathname(rawPath, { leadingSlash: true, allowTrailingSlash: true })
  return result.ok ? result.pathname : null
}

function acceptsHtml(request) {
  const accept = request.headers.accept
  if (typeof accept !== 'string') return false

  return accept.split(',').some((entry) => {
    const [rawMediaType, ...rawParameters] = entry.split(';')
    const mediaType = rawMediaType.trim().toLowerCase()
    if (mediaType !== 'text/html' && mediaType !== 'application/xhtml+xml') return false

    let quality = 1
    let qualitySeen = false
    for (const rawParameter of rawParameters) {
      const parameter = rawParameter.trim()
      const separator = parameter.indexOf('=')
      if (separator < 0) continue
      const name = parameter.slice(0, separator).trim().toLowerCase()
      if (name !== 'q') continue
      if (qualitySeen) return false
      qualitySeen = true
      const value = parameter.slice(separator + 1).trim()
      if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value)) return false
      quality = Number(value)
    }
    return quality > 0
  })
}

function setStaticHeaders(reply, entry) {
  for (const [name, value] of Object.entries(staticSecurityHeaders)) reply.header(name, value)
  const isHtml = entry.mimeType.toLowerCase().split(';', 1)[0] === 'text/html'
  const contentAddressedAsset = viteAssetPath.test(entry.file) || vitePressAssetPath.test(entry.file)
  const cacheControl = !isHtml && contentAddressedAsset
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
  reply.header('Cache-Control', cacheControl)
  reply.header('Content-Length', String(entry.size))
  reply.header('ETag', entry.etag)
  reply.type(entry.mimeType)
}

function clearStaticHeaders(reply) {
  for (const name of Object.keys(staticSecurityHeaders)) reply.removeHeader(name)
  for (const name of ['Content-Length', 'Content-Type', 'ETag']) reply.removeHeader(name)
  reply.header('Cache-Control', 'no-store')
}

function snapshotIdentityMatches(entry, metadata) {
  return metadata.isFile()
    && entry.dev === metadata.dev
    && entry.ino === metadata.ino
    && entry.mode === metadata.mode
    && entry.size === metadata.size
}

async function readInitialChunk(entry) {
  if (entry.size === 0) return Buffer.alloc(0)
  const length = Math.min(copyBufferSize, entry.size)
  const buffer = Buffer.allocUnsafe(length)
  let offset = 0
  while (offset < length) {
    const { bytesRead } = await entry.handle.read(buffer, offset, length - offset, offset)
    if (bytesRead === 0) throw new Error('Static snapshot ended before its recorded length')
    offset += bytesRead
  }
  return buffer
}

async function sendKnownFile(request, reply, build, file, statusCode = 200) {
  const entry = build.getFile(file)
  if (!entry) return null
  let initialChunk
  try {
    const metadata = await entry.handle.stat()
    if (!snapshotIdentityMatches(entry, metadata)) throw new Error('Static snapshot descriptor identity changed')
    initialChunk = request.method === 'HEAD' ? Buffer.alloc(0) : await readInitialChunk(entry)
  } catch (cause) {
    clearStaticHeaders(reply)
    throw new Error('Static snapshot is unavailable', { cause })
  }
  setStaticHeaders(reply, entry)
  reply.code(statusCode)
  const stream = createEntryStream(entry, initialChunk)
  return reply.send(stream)
}

function createEntryStream(entry, firstChunk) {
  let position = firstChunk.length
  let initialChunk = firstChunk
  let reading = false
  const stream = new Readable({
    read(requestedSize) {
      if (reading) return
      if (initialChunk !== undefined) {
        const chunk = initialChunk
        initialChunk = undefined
        if (chunk.length > 0) this.push(chunk)
        if (position >= entry.size) this.push(null)
        return
      }
      if (position >= entry.size) {
        this.push(null)
        return
      }

      reading = true
      const length = Math.min(Math.max(requestedSize, 1), copyBufferSize, entry.size - position)
      const buffer = Buffer.allocUnsafe(length)
      entry.handle.read(buffer, 0, length, position).then(({ bytesRead }) => {
        reading = false
        if (bytesRead === 0) {
          this.destroy(new Error(`Static snapshot ended before its recorded length: ${entry.file}`))
          return
        }
        position += bytesRead
        this.push(buffer.subarray(0, bytesRead))
      }, (error) => {
        reading = false
        this.destroy(error)
      })
    },
  })
  stream.on('error', () => {})
  return stream
}

function sendNotFound(reply) {
  return reply.callNotFound()
}

function redirect(reply, location) {
  return reply.code(308).header('Location', location).send()
}

function docsNotFound(request, reply, build, suffix) {
  if (suffix.startsWith('assets/') || !acceptsHtml(request)) return sendNotFound(reply)
  const extension = basename(suffix).includes('.') ? basename(suffix).split('.').at(-1).toLowerCase() : ''
  if (extension && extension !== 'html') return sendNotFound(reply)
  return sendKnownFile(request, reply, build, 'docs/404.html', 404)
}

function docsRoute(request, reply, build) {
  const pathname = requestPath(request)
  if (pathname === null || !pathname.startsWith('/docs/')) return sendNotFound(reply)
  const suffix = pathname.slice('/docs/'.length)

  if (suffix === '') return sendKnownFile(request, reply, build, 'docs/index.html')
  if (suffix === '404' || suffix === '404.html') {
    return sendKnownFile(request, reply, build, 'docs/404.html', 404)
  }

  if (suffix.endsWith('.html')) {
    if (!build.hasFile(`docs/${suffix}`)) return docsNotFound(request, reply, build, suffix)
    if (suffix === 'index.html') return redirect(reply, '/docs/')
    return redirect(reply, `/docs/${suffix.slice(0, -'.html'.length)}`)
  }

  if (suffix.endsWith('/')) {
    const directoryIndex = `docs/${suffix}index.html`
    if (build.hasFile(directoryIndex)) return sendKnownFile(request, reply, build, directoryIndex)
    const cleanPage = `docs/${suffix.slice(0, -1)}.html`
    if (build.hasFile(cleanPage)) return redirect(reply, `/docs/${suffix.slice(0, -1)}`)
    return docsNotFound(request, reply, build, suffix)
  }

  const exactFile = `docs/${suffix}`
  if (build.hasFile(exactFile)) return sendKnownFile(request, reply, build, exactFile)

  const cleanPage = `${exactFile}.html`
  if (build.hasFile(cleanPage)) return sendKnownFile(request, reply, build, cleanPage)

  const directoryIndex = `${exactFile}/index.html`
  if (build.hasFile(directoryIndex)) return redirect(reply, `${pathname}/`)
  return docsNotFound(request, reply, build, suffix)
}

function spaRoute(request, reply, build) {
  const pathname = requestPath(request)
  if (pathname === null) return sendNotFound(reply)
  if (pathname === '/') return acceptsHtml(request)
    ? sendKnownFile(request, reply, build, 'index.html')
    : sendNotFound(reply)

  const relativePath = pathname.slice(1)
  if (build.hasFile(relativePath) && !relativePath.startsWith('docs/') && !relativePath.endsWith('.html')) {
    return sendKnownFile(request, reply, build, relativePath)
  }

  if (
    ['/api', '/assets', '/healthz', '/readyz', '/docs']
      .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    || relativePath.includes('.')
    || !acceptsHtml(request)
  ) return sendNotFound(reply)

  return sendKnownFile(request, reply, build, 'index.html')
}

function registerRoutes(app, build) {
  app.get('/docs', (request, reply) => redirect(reply, '/docs/'))
  app.get('/docs/*', (request, reply) => docsRoute(request, reply, build))
  app.get('/*', (request, reply) => spaRoute(request, reply, build))
}

export function registerStaticFiles(app, { staticRoot, staticBuild } = {}) {
  if ((staticRoot === undefined) === (staticBuild === undefined)) {
    throw new TypeError('Exactly one of staticRoot or staticBuild is required')
  }

  app.register(async function immutableStaticFiles(staticApp) {
    const build = staticBuild ?? await openStaticBuild(staticRoot)
    if (!isAbsolute(build.root)) {
      await build.close().catch(() => {})
      throw new Error('Production static root must resolve to an absolute path')
    }
    staticApp.addHook('onClose', () => build.close())
    registerRoutes(staticApp, build)
  })
}
