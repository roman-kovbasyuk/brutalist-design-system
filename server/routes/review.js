import { z } from 'zod'
import {
  approveVersionRequestSchema,
  markVersionReadyRequestSchema,
  rejectVersionRequestSchema,
  reopenCampaignRequestSchema,
  reopenCampaignResponseSchema,
  requestVersionChangesRequestSchema,
  reviewCommandResponseSchema,
  reviewHistoryResponseSchema,
} from '../../shared/contracts.js'
import { parse, parseIdempotencyKey, parseIfMatch, setRevisionEtag, strictResponse } from './support.js'

const versionParamsSchema = z.strictObject({ versionId: z.string().trim().min(1) })
const campaignParamsSchema = z.strictObject({ campaignId: z.string().trim().min(1) })

function versionCommand(app, { path, roles, schema, method, requireRole, reviewService }) {
  app.post(path, { preHandler: requireRole(...roles) }, async (request, reply) => {
    const { versionId } = parse(versionParamsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const idempotencyKey = parseIdempotencyKey(request)
    const input = parse(schema, request.body ?? {})
    const outcome = await reviewService[method]({ actor: request.actor, versionId, expectedRevision, idempotencyKey, input })
    const response = strictResponse(reviewCommandResponseSchema, request, outcome.body)
    setRevisionEtag(reply, response.campaign)
    reply.code(outcome.status)
    return response
  })
}

export function registerReviewRoutes(app, { requireRole, reviewService }) {
  versionCommand(app, {
    path: '/api/v1/versions/:versionId/request-changes', roles: ['designer'],
    schema: requestVersionChangesRequestSchema, method: 'requestChanges', requireRole, reviewService,
  })
  versionCommand(app, {
    path: '/api/v1/versions/:versionId/mark-ready', roles: ['designer'],
    schema: markVersionReadyRequestSchema, method: 'markReady', requireRole, reviewService,
  })
  versionCommand(app, {
    path: '/api/v1/versions/:versionId/reject', roles: ['marketer', 'admin'],
    schema: rejectVersionRequestSchema, method: 'reject', requireRole, reviewService,
  })
  versionCommand(app, {
    path: '/api/v1/versions/:versionId/approve', roles: ['marketer', 'admin'],
    schema: approveVersionRequestSchema, method: 'approve', requireRole, reviewService,
  })

  app.post('/api/v1/campaigns/:campaignId/reopen', { preHandler: requireRole('marketer', 'admin') }, async (request, reply) => {
    const { campaignId } = parse(campaignParamsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const idempotencyKey = parseIdempotencyKey(request)
    const input = parse(reopenCampaignRequestSchema, request.body ?? {})
    const outcome = await reviewService.reopen({ actor: request.actor, campaignId, expectedRevision, idempotencyKey, input })
    const response = strictResponse(reopenCampaignResponseSchema, request, outcome.body)
    setRevisionEtag(reply, response.campaign)
    reply.code(outcome.status)
    return response
  })

  app.get('/api/v1/versions/:versionId/review', { preHandler: requireRole() }, async (request) => {
    const { versionId } = parse(versionParamsSchema, request.params)
    return strictResponse(reviewHistoryResponseSchema, request, await reviewService.getReview({ actor: request.actor, versionId }))
  })
}
