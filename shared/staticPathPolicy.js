const sourceMapArtifact = /\.map(?:\.[A-Za-z0-9_-]+)*$/i
const uriPathCharacters = /^[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/

export class StaticPathPolicyError extends Error {
  constructor(reason, pathname) {
    super(`Static path is not canonical (${reason}): ${pathname}`)
    this.name = 'StaticPathPolicyError'
    this.reason = reason
  }
}

function pathSegments(pathname, leadingSlash, allowTrailingSlash) {
  let value = leadingSlash ? pathname.slice(1) : pathname
  if (allowTrailingSlash && value.endsWith('/')) value = value.slice(0, -1)
  return value === '' ? [] : value.split('/')
}

function classifyDecodedPath(pathname, options) {
  if (pathname.normalize('NFKC') !== pathname) return 'normalization'
  if (/[^\x00-\x7f]/.test(pathname)) return 'non-ASCII'
  if (/[\\\0-\x20\x7f]/.test(pathname)) return 'control or separator'
  const segments = pathSegments(pathname, options.leadingSlash, options.allowTrailingSlash)
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || segment.startsWith('.'))) {
    return 'dot segment or separator'
  }
  if (sourceMapArtifact.test(pathname)) return 'source map'
  return undefined
}

function classifyEncodedPath(pathname, options) {
  let decoded = pathname
  try {
    for (let depth = 0; depth < 8; depth += 1) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) return classifyDecodedPath(decoded, options) ?? 'percent encoding'
      decoded = next
    }
  } catch {
    return 'percent encoding'
  }
  return 'percent encoding depth'
}

export function inspectStaticPathname(pathname, { leadingSlash = true, allowTrailingSlash = false } = {}) {
  if (typeof pathname !== 'string' || pathname === '') return Object.freeze({ ok: false, reason: 'empty path' })
  if (leadingSlash ? !pathname.startsWith('/') : pathname.startsWith('/')) {
    return Object.freeze({ ok: false, reason: leadingSlash ? 'missing leading slash' : 'unexpected leading slash' })
  }
  if (pathname.includes('?') || pathname.includes('#')) return Object.freeze({ ok: false, reason: 'query or fragment' })

  const options = { leadingSlash, allowTrailingSlash }
  if (pathname.includes('%')) return Object.freeze({ ok: false, reason: classifyEncodedPath(pathname, options) })
  const reason = classifyDecodedPath(pathname, options)
  if (reason) return Object.freeze({ ok: false, reason })
  if (!uriPathCharacters.test(pathname)) return Object.freeze({ ok: false, reason: 'invalid character' })
  if (!allowTrailingSlash && pathname.endsWith('/') && pathname !== '/') {
    return Object.freeze({ ok: false, reason: 'trailing separator' })
  }
  return Object.freeze({ ok: true, pathname })
}

export function assertStaticPathname(pathname, options) {
  const result = inspectStaticPathname(pathname, options)
  if (!result.ok) throw new StaticPathPolicyError(result.reason, pathname)
  return result.pathname
}
