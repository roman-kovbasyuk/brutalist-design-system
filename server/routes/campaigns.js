import { z } from 'zod'
import { campaignListResponseSchema, campaignPatchRequestSchema, campaignResponseSchema, createCampaignRequestSchema } from '../../shared/contracts.js'
import { notFound, parse, parseIfMatch, setRevisionEtag, strictResponse } from './support.js'

const paramsSchema = z.strictObject({ campaignId: z.string().trim().min(1) })
const editors = ['marketer', 'admin']

export function registerCampaignRoutes(app, { requireRole, workflowService }) {
  app.get('/api/v1/campaigns', { preHandler: requireRole() }, async (request) => {
    const actor = request.actor
    return strictResponse(campaignListResponseSchema, request, { campaigns: await workflowService.listCampaigns({ actor }) })
  })

  app.post('/api/v1/campaigns', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const actor = request.actor
    const input = parse(createCampaignRequestSchema, request.body)
    const created = strictResponse(campaignResponseSchema, request, await workflowService.createCampaign({ actor, input }))
    reply.code(201)
    return setRevisionEtag(reply, created)
  })

  app.get('/api/v1/campaigns/:campaignId', { preHandler: requireRole() }, async (request, reply) => {
    const actor = request.actor
    const { campaignId } = parse(paramsSchema, request.params)
    const loaded = await workflowService.getCampaign({ actor, campaignId })
    if (!loaded) return notFound('Campaign')
    return setRevisionEtag(reply, strictResponse(campaignResponseSchema, request, loaded))
  })

  app.patch('/api/v1/campaigns/:campaignId', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const actor = request.actor
    const { campaignId } = parse(paramsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const patch = parse(campaignPatchRequestSchema, request.body)
    const updated = await workflowService.patchCampaign({ actor, campaignId, expectedRevision, patch })
    return setRevisionEtag(reply, strictResponse(campaignResponseSchema, request, updated))
  })

  app.delete('/api/v1/campaigns/:campaignId', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const actor = request.actor
    const { campaignId } = parse(paramsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const archived = strictResponse(
      campaignResponseSchema,
      request,
      await workflowService.archiveCampaign({ actor, campaignId, expectedRevision }),
    )
    setRevisionEtag(reply, archived)
    return reply.code(204).send()
  })
}
