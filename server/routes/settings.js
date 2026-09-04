import { settingsPatchRequestSchema, settingsResponseSchema } from '../../shared/contracts.js'
import { parse, parseIfMatch, requireActor, setRevisionEtag, strictResponse } from './support.js'

export function registerSettingsRoutes(app, { resolveActor, workflowService }) {
  app.get('/api/v1/settings', async (request, reply) => {
    const actor = await requireActor(request, resolveActor)
    const settings = await workflowService.getSettings({ actor })
    return setRevisionEtag(reply, strictResponse(settingsResponseSchema, request, settings))
  })

  app.patch('/api/v1/settings', async (request, reply) => {
    const actor = await requireActor(request, resolveActor, ['admin'])
    const expectedRevision = parseIfMatch(request)
    const patch = parse(settingsPatchRequestSchema, request.body)
    const settings = await workflowService.updateSettings({ actor, expectedRevision, patch })
    return setRevisionEtag(reply, strictResponse(settingsResponseSchema, request, settings))
  })
}
