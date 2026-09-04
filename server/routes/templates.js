import { z } from 'zod'
import { createTemplateVersionRequestSchema, templateListResponseSchema, templateVersionResponseSchema } from '../../shared/contracts.js'
import { notFound, parse, strictResponse } from './support.js'

const idParamsSchema = z.strictObject({ templateId: z.string().trim().min(1) })
const versionParamsSchema = idParamsSchema.extend({ version: z.string().trim().min(1) })

export function registerTemplateRoutes(app, { requireRole, workflowService }) {
  app.get('/api/v1/templates', { preHandler: requireRole() }, async (request) => {
    const actor = request.actor
    return strictResponse(templateListResponseSchema, request, { templates: await workflowService.listTemplates({ actor }) })
  })

  app.get('/api/v1/templates/:templateId/versions', { preHandler: requireRole() }, async (request) => {
    const actor = request.actor
    const { templateId } = parse(idParamsSchema, request.params)
    return strictResponse(templateListResponseSchema, request, { templates: await workflowService.listTemplateVersions({ actor, templateId }) })
  })

  app.get('/api/v1/templates/:templateId/versions/:version', { preHandler: requireRole() }, async (request) => {
    const actor = request.actor
    const { templateId, version } = parse(versionParamsSchema, request.params)
    const template = await workflowService.getTemplateVersion({ actor, templateId, version })
    if (!template) return notFound('Template version')
    return strictResponse(templateVersionResponseSchema, request, template)
  })

  app.post('/api/v1/templates', { preHandler: requireRole('admin') }, async (request, reply) => {
    const actor = request.actor
    const input = parse(createTemplateVersionRequestSchema, request.body)
    reply.code(201)
    return strictResponse(templateVersionResponseSchema, request, await workflowService.createTemplateVersion({ actor, input }))
  })
}
