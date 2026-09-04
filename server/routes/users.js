import { z } from 'zod'
import { createInvitationRequestSchema, invitationResponseSchema, userResponseSchema } from '../../shared/contracts.js'
import { parse, strictResponse } from './support.js'

const userParamsSchema = z.strictObject({ userId: z.string().trim().min(1) })
const emptyCommandSchema = z.strictObject({})

export function registerUserRoutes(app, { requireRole, workflowService }) {
  app.post('/api/v1/users/invitations', { preHandler: requireRole('admin') }, async (request, reply) => {
    const actor = request.actor
    const input = parse(createInvitationRequestSchema, request.body)
    reply.code(201)
    return strictResponse(invitationResponseSchema, request, await workflowService.createInvitation({ actor, input }))
  })

  app.post('/api/v1/users/:userId/disable', { preHandler: requireRole('admin') }, async (request) => {
    const actor = request.actor
    const { userId } = parse(userParamsSchema, request.params)
    parse(emptyCommandSchema, request.body ?? {})
    return strictResponse(userResponseSchema, request, await workflowService.disableUser({ actor, userId }))
  })
}
