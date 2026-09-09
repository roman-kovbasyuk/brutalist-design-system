/** Build an internal page URL that also works when the app is hosted below a repository path. */
export function sitePath(path) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}` || '/'
}
