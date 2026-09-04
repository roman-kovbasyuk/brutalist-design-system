import { z } from 'zod'
import { notFound, parse } from './support.js'

const paramsSchema = z.strictObject({ assetId: z.string().trim().min(1) })

export function registerAssetRoutes(app, { requireRole, assetService }) {
  app.get('/api/v1/assets/:assetId', { preHandler: requireRole() }, async (request, reply) => {
    const { assetId } = parse(paramsSchema, request.params)
    const asset = await assetService.readAsset({ actor: request.actor, assetId })
    if (!asset) return notFound('Asset')
    reply.header('Content-Type', asset.mimeType)
    reply.header('Content-Length', String(asset.byteSize))
    reply.header('ETag', `"${asset.sha256}"`)
    reply.header('Cache-Control', 'private, max-age=31536000, immutable')
    reply.header('X-Content-Type-Options', 'nosniff')
    return reply.send(asset.bytes)
  })
}
