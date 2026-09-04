export class PublicApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'PublicApiError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.details = details
    this.expose = true
  }
}

export function parse(schema, value) {
  const result = schema.safeParse(value)
  if (result.success) return result.data

  throw new PublicApiError(400, 'invalid_request', 'Request validation failed', result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  })))
}

export function parseIfMatch(request) {
  const value = request.headers['if-match']
  if (value === undefined) {
    throw new PublicApiError(428, 'precondition_required', 'A quoted integer If-Match header is required')
  }
  const match = /^"(0|[1-9]\d*)"$/.exec(value)
  if (!match) throw new PublicApiError(400, 'invalid_if_match', 'If-Match must be a quoted non-negative integer')
  const revision = Number(match[1])
  if (!Number.isSafeInteger(revision)) throw new PublicApiError(400, 'invalid_if_match', 'If-Match revision is too large')
  return revision
}

export function parseIdempotencyKey(request) {
  const value = request.headers['idempotency-key']
  if (value === undefined) {
    throw new PublicApiError(428, 'precondition_required', 'An Idempotency-Key header is required')
  }
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(value)) {
    throw new PublicApiError(400, 'invalid_idempotency_key', 'Idempotency-Key must be 1-255 visible ASCII characters without whitespace')
  }
  return value
}

export function setRevisionEtag(reply, resource) {
  reply.header('etag', `"${resource.revision}"`)
  return resource
}

export function strictResponse(schema, request, payload) {
  const parsed = schema.safeParse({ ...payload, requestId: request.id })
  if (!parsed.success) throw new Error('Service response violated its API contract')
  return parsed.data
}

export function notFound(resourceName) {
  throw new PublicApiError(404, 'not_found', `${resourceName} was not found`)
}
