import { z } from 'zod'
import {
  analyseBriefRequestSchema,
  campaignResponseSchema,
  copyGenerationRequestSchema,
  copySelectionRequestSchema,
  directionGenerationRequestSchema,
  directionSelectionRequestSchema,
  generationCommandResponseSchema,
  generationJobResponseSchema,
  imageGenerationRequestSchema,
} from '../../shared/contracts.js'
import { notFound, parse, parseIdempotencyKey, parseIfMatch, setRevisionEtag, strictResponse } from './support.js'

const campaignParamsSchema = z.strictObject({ campaignId: z.string().trim().min(1) })
const jobParamsSchema = z.strictObject({ jobId: z.string().trim().min(1) })
const editors = ['marketer', 'admin']

export function registerGenerationRoutes(app, { requireRole, generationService }) {
  const registerGeneration = (path, schema, method) => {
    app.post(path, { preHandler: requireRole(...editors) }, async (request, reply) => {
      const { campaignId } = parse(campaignParamsSchema, request.params)
      const idempotencyKey = parseIdempotencyKey(request)
      const input = parse(schema, request.body ?? {})
      const outcome = await generationService[method]({ actor: request.actor, campaignId, idempotencyKey, input })
      reply.code(outcome.status)
      return strictResponse(generationCommandResponseSchema, request, outcome.body)
    })
  }

  registerGeneration('/api/v1/campaigns/:campaignId/analyse-brief', analyseBriefRequestSchema, 'analyseBrief')
  registerGeneration('/api/v1/campaigns/:campaignId/copy-generations', copyGenerationRequestSchema, 'generateCopy')
  registerGeneration('/api/v1/campaigns/:campaignId/direction-generations', directionGenerationRequestSchema, 'generateDirections')
  registerGeneration('/api/v1/campaigns/:campaignId/image-generations', imageGenerationRequestSchema, 'generateImage')

  app.get('/api/v1/generation-jobs/:jobId', { preHandler: requireRole() }, async (request) => {
    const { jobId } = parse(jobParamsSchema, request.params)
    const job = await generationService.getJob({ actor: request.actor, jobId })
    if (!job) return notFound('Generation job')
    return strictResponse(generationJobResponseSchema, request, job)
  })

  app.put('/api/v1/campaigns/:campaignId/copy-selection', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const { campaignId } = parse(campaignParamsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const input = parse(copySelectionRequestSchema, request.body)
    const campaign = await generationService.selectCopy({ actor: request.actor, campaignId, expectedRevision, input })
    return setRevisionEtag(reply, strictResponse(campaignResponseSchema, request, campaign))
  })

  app.put('/api/v1/campaigns/:campaignId/copies/:copyId/approval', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const { campaignId, copyId } = parse(campaignParamsSchema.extend({ copyId: z.string().trim().min(1) }), request.params)
    const body = parse(z.strictObject({ revoke: z.boolean().optional() }), request.body ?? {})
    const campaign = await generationService.approveCopy({ actor: request.actor, campaignId,
      expectedRevision: parseIfMatch(request), input: { copyId, revoke: body.revoke } })
    return setRevisionEtag(reply, strictResponse(campaignResponseSchema, request, campaign))
  })

  app.delete('/api/v1/campaigns/:campaignId/copies/:copyId', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const { campaignId, copyId } = parse(campaignParamsSchema.extend({ copyId: z.string().trim().min(1) }), request.params)
    const campaign = await generationService.deleteCopy({
      actor: request.actor, campaignId, expectedRevision: parseIfMatch(request), input: { copyId },
    })
    return setRevisionEtag(reply, strictResponse(campaignResponseSchema, request, campaign))
  })

  app.put('/api/v1/campaigns/:campaignId/direction-selection', { preHandler: requireRole(...editors) }, async (request, reply) => {
    const { campaignId } = parse(campaignParamsSchema, request.params)
    const expectedRevision = parseIfMatch(request)
    const input = parse(directionSelectionRequestSchema, request.body)
    const campaign = await generationService.selectDirection({ actor: request.actor, campaignId, expectedRevision, input })
    return setRevisionEtag(reply, strictResponse(campaignResponseSchema, request, campaign))
  })
}
