import { sessionResponseSchema } from '../../shared/contracts.js'
import { strictResponse } from './support.js'

export function registerSessionRoute(app, { requireRole }) {
  app.get('/api/v1/session', { preHandler: requireRole() }, async (request) => {
    const actor = request.actor
    return strictResponse(sessionResponseSchema, request, {
      id: actor.id,
      email: actor.email,
      role: actor.role,
      displayName: actor.displayName,
    })
  })
}
