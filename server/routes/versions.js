import { z } from 'zod'
import {
  campaignVersionCommandResponseSchema,
  campaignVersionListResponseSchema,
  campaignVersionResponseSchema,
  compositionCommandResponseSchema,
  createCampaignVersionRequestSchema,
  saveCompositionRequestSchema,
} from '../../shared/contracts.js'
import { notFound, parse, parseIdempotencyKey, parseIfMatch, setRevisionEtag, strictResponse } from './support.js'

const campaignParamsSchema = z.strictObject({ campaignId: z.string().trim().min(1) })
const versionParamsSchema = z.strictObject({
  campaignId: z.string().trim().min(1),
  versionNumber: z.coerce.number().int().positive(),
})
const editors = ['marketer', 'admin']

export function registerVersionRoutes(app, { requireRole, versionService }) {
  app.put('/api/v1/campaigns/:campaignId/composition', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const { campaignId } = parse(campaignParamsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const input = parse(saveCompositionRequestSchema, request.body)
    const result = await versionService.saveComposition({ actor: request.actor, campaignId, expectedRevision, input })
    const response = strictResponse(compositionCommandResponseSchema, request, result)
    setRevisionEtag(reply, response.campaign)
    return response
  })

  app.post('/api/v1/campaigns/:campaignId/versions', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const { campaignId } = parse(campaignParamsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const idempotencyKey = parseIdempotencyKey(request)
    const input = parse(createCampaignVersionRequestSchema, request.body ?? {})
    const outcome = await versionService.createVersion({ actor: request.actor, campaignId, expectedRevision, idempotencyKey, input })
    const response = strictResponse(campaignVersionCommandResponseSchema, request, outcome.body)
    setRevisionEtag(reply, response.campaign)
    reply.code(outcome.status)
    return response
  })

  app.get('/api/v1/campaigns/:campaignId/versions', { preHandler: requireRole() }, async (request) => {
    const { campaignId } = parse(campaignParamsSchema, request.params)
    const versions = await versionService.listVersions({ actor: request.actor, campaignId })
    return strictResponse(campaignVersionListResponseSchema, request, { versions })
  })

  app.get('/api/v1/campaigns/:campaignId/versions/:versionNumber', { preHandler: requireRole() }, async (request) => {
    const { campaignId, versionNumber } = parse(versionParamsSchema, request.params)
    const version = await versionService.getVersion({ actor: request.actor, campaignId, versionNumber })
    if (!version) return notFound('Version')
    return strictResponse(campaignVersionResponseSchema, request, version)
  })
}
