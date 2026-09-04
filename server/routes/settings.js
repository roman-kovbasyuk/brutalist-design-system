import { settingsPatchRequestSchema, settingsResponseSchema } from '../../shared/contracts.js'
import { parse, parseIfMatch, setRevisionEtag, strictResponse } from './support.js'

export function registerSettingsRoutes(app, { requireRole, workflowService }) {
  app.get('/api/v1/settings', { preHandler: requireRole() }, async (request, reply) => {
    const actor = request.actor
    const settings = await workflowService.getSettings({ actor })
    return setRevisionEtag(reply, strictResponse(settingsResponseSchema, request, settings))
  })

  app.patch('/api/v1/settings', { preHandler: requireRole('admin') }, async (request, reply) => {
    const actor = request.actor
    const expectedRevision = parseIfMatch(request)
    const patch = parse(settingsPatchRequestSchema, request.body)
    const settings = await workflowService.updateSettings({ actor, expectedRevision, patch })
    return setRevisionEtag(reply, strictResponse(settingsResponseSchema, request, settings))
  })
}
