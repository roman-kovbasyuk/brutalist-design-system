import { roleSchema } from '../../shared/contracts.js'

export class AuthorizationError extends Error {
  constructor(statusCode, code, message) {
    super(message)
    this.name = 'AuthorizationError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.expose = true
  }
}
export function unauthorized() {
  return new AuthorizationError(401, 'unauthorized', 'Authentication is required')
}

export function createAuthorizer(authenticate) {
  if (typeof authenticate !== 'function') throw new TypeError('An authenticate function is required')

  return {
    requireRole(...roles) {
      const allowedRoles = roles.length === 0 ? roleSchema.options : roles
      for (const role of allowedRoles) roleSchema.parse(role)

      return async function authorize(request) {
        const actor = await authenticate(request)
        if (!actor?.id || !roleSchema.safeParse(actor.role).success) {
          throw unauthorized()
        }
        if (actor.disabled === true || actor.disabledAt != null) {
          throw new AuthorizationError(403, 'user_disabled', 'This user is disabled')
        }
        if (!allowedRoles.includes(actor.role)) {
          throw new AuthorizationError(403, 'forbidden', 'This role cannot perform the requested operation')
        }
        request.actor = actor
      }
    },
  }
}
