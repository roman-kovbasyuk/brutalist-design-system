import { z } from 'zod'
import { workspaceResponseSchema } from '../../shared/studioContracts.js'
import { notFound, parse, strictResponse, setRevisionEtag } from './support.js'

export function registerWorkspaceRoutes(app, { requireRole, workspaceService }) {
  app.get('/api/v1/campaigns/:campaignId/workspace', { preHandler: requireRole() }, async (request, reply) => {
    const { campaignId } = parse(z.strictObject({ campaignId: z.string().trim().min(1) }), request.params)
    const workspace = await workspaceService.getWorkspace({ actor: request.actor, campaignId })
    if (!workspace) return notFound('Campaign')
    setRevisionEtag(reply, workspace.campaign)
    reply.header('Cache-Control', 'private, no-store')
    return strictResponse(workspaceResponseSchema, request, workspace)
  })
}
