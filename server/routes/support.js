import { roleSchema } from '../../shared/contracts.js'

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

export function setRevisionEtag(reply, resource) {
  reply.header('etag', `"${resource.revision}"`)
  return resource
}

export async function requireActor(request, resolveActor, allowedRoles = roleSchema.options) {
  const actor = await resolveActor(request)
  if (!actor) throw new PublicApiError(401, 'unauthorized', 'Authentication is required')
  if (!actor.id || !roleSchema.safeParse(actor.role).success) {
    throw new PublicApiError(403, 'forbidden', 'The authenticated actor is not invited')
  }
  if (actor.disabled) throw new PublicApiError(403, 'user_disabled', 'This user is disabled')
  if (!allowedRoles.includes(actor.role)) throw new PublicApiError(403, 'forbidden', 'This role cannot perform the requested operation')
  return actor
}

export function notFound(resourceName) {
  throw new PublicApiError(404, 'not_found', `${resourceName} was not found`)
}
