import { z } from 'zod'
import { campaignPatchRequestSchema, createCampaignRequestSchema } from '../../shared/contracts.js'
import { notFound, parse, parseIfMatch, requireActor, setRevisionEtag } from './support.js'

const paramsSchema = z.strictObject({ campaignId: z.string().trim().min(1) })
const editors = ['marketer', 'admin']

export function registerCampaignRoutes(app, { resolveActor, workflowService }) {
  app.get('/api/v1/campaigns', async (request) => {
    const actor = await requireActor(request, resolveActor)
    return { campaigns: await workflowService.listCampaigns({ actor }) }
  })

  app.post('/api/v1/campaigns', async (request, reply) => {
    const actor = await requireActor(request, resolveActor, editors)
    const input = parse(createCampaignRequestSchema, request.body)
    const created = await workflowService.createCampaign({ actor, input })
    reply.code(201)
    return setRevisionEtag(reply, created)
  })

  app.get('/api/v1/campaigns/:campaignId', async (request, reply) => {
    const actor = await requireActor(request, resolveActor)
    const { campaignId } = parse(paramsSchema, request.params)
    const loaded = await workflowService.getCampaign({ actor, campaignId })
    if (!loaded) return notFound('Campaign')
    return setRevisionEtag(reply, loaded)
  })

  app.patch('/api/v1/campaigns/:campaignId', async (request, reply) => {
    const actor = await requireActor(request, resolveActor, editors)
    const { campaignId } = parse(paramsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const patch = parse(campaignPatchRequestSchema, request.body)
    const updated = await workflowService.patchCampaign({ actor, campaignId, expectedRevision, patch })
    return setRevisionEtag(reply, updated)
  })
}
