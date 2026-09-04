import { z } from 'zod'
import { createTemplateVersionRequestSchema } from '../../shared/contracts.js'
import { notFound, parse, requireActor } from './support.js'

const idParamsSchema = z.strictObject({ templateId: z.string().trim().min(1) })
const versionParamsSchema = idParamsSchema.extend({ version: z.string().trim().min(1) })

export function registerTemplateRoutes(app, { resolveActor, workflowService }) {
  app.get('/api/v1/templates', async (request) => {
    const actor = await requireActor(request, resolveActor)
    return { templates: await workflowService.listTemplates({ actor }) }
  })

  app.get('/api/v1/templates/:templateId/versions', async (request) => {
    const actor = await requireActor(request, resolveActor)
    const { templateId } = parse(idParamsSchema, request.params)
    return { templates: await workflowService.listTemplateVersions({ actor, templateId }) }
  })

  app.get('/api/v1/templates/:templateId/versions/:version', async (request) => {
    const actor = await requireActor(request, resolveActor)
    const { templateId, version } = parse(versionParamsSchema, request.params)
    const template = await workflowService.getTemplateVersion({ actor, templateId, version })
    if (!template) return notFound('Template version')
    return template
  })

  app.post('/api/v1/templates', async (request, reply) => {
    const actor = await requireActor(request, resolveActor, ['admin'])
    const input = parse(createTemplateVersionRequestSchema, request.body)
    reply.code(201)
    return workflowService.createTemplateVersion({ actor, input })
  })
}
