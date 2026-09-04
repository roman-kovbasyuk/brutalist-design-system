import { z } from 'zod'
import {
  createDeliveryRequestSchema,
  deliveryCommandResponseSchema,
  deliveryResponseSchema,
} from '../../shared/contracts.js'
import { notFound, parse, parseIdempotencyKey, setRevisionEtag, strictResponse } from './support.js'

const paramsSchema = z.strictObject({ versionId: z.string().trim().min(1) })
const exporters = ['marketer', 'admin']

export function registerDeliveryRoutes(app, { requireRole, deliveryService }) {
  app.post('/api/v1/versions/:versionId/delivery', { preHandler: requireRole(...exporters) }, async (request, reply) => {
    const { versionId } = parse(paramsSchema, request.params)
    const idempotencyKey = parseIdempotencyKey(request)
    const input = parse(createDeliveryRequestSchema, request.body ?? {})
    const outcome = await deliveryService.createDelivery({ actor: request.actor, versionId, idempotencyKey, input })
    const response = strictResponse(deliveryCommandResponseSchema, request, outcome.body)
    setRevisionEtag(reply, response.campaign)
    reply.code(outcome.status)
    return response
  })

  app.get('/api/v1/versions/:versionId/delivery', { preHandler: requireRole(...exporters) }, async (request) => {
    const { versionId } = parse(paramsSchema, request.params)
    const delivery = await deliveryService.getDelivery({ actor: request.actor, versionId })
    if (!delivery) return notFound('Delivery')
    return strictResponse(deliveryResponseSchema, request, delivery)
  })
}
