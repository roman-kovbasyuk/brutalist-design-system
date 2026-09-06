import { z } from 'zod'
import { MAX_VISUAL_UPLOAD_BYTES, visualUploadRequestSchema, visualUploadResponseSchema } from '../../shared/visualContracts.js'
import { parse, parseIfMatch, parseIdempotencyKey, strictResponse } from './support.js'

export function registerVisualRoutes(app, { requireRole, visualUploadService }) {
  app.post('/api/v1/campaigns/:campaignId/visual-uploads', {
    bodyLimit: Math.ceil(MAX_VISUAL_UPLOAD_BYTES / 3) * 4 + 2048,
    preHandler: requireRole('marketer', 'admin'),
  }, async (request, reply) => {
    const { campaignId } = parse(z.strictObject({ campaignId: z.string().min(1) }), request.params)
    const result = await visualUploadService.uploadVisual({ actor: request.actor, campaignId,
      input: parse(visualUploadRequestSchema, request.body), expectedRevision: parseIfMatch(request), idempotencyKey: parseIdempotencyKey(request) })
    return reply.code(201).send(strictResponse(visualUploadResponseSchema, request, result))
  })
}
