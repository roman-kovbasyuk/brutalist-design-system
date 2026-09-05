import { extractBriefFileRequestSchema, extractBriefFileResponseSchema } from '../../shared/contracts.js'
import { extractBriefText, MAX_BRIEF_FILE_BYTES } from '../briefTextExtractor.js'
import { parse, strictResponse } from './support.js'

const editors = ['marketer', 'admin']

export function registerBriefFileRoutes(app, { requireRole }) {
  const bodyLimit = Math.ceil(MAX_BRIEF_FILE_BYTES / 3) * 4 + 1_024
  app.post('/api/v1/brief-files/extract', { bodyLimit, preHandler: requireRole(...editors) }, async (request) => {
    const input = parse(extractBriefFileRequestSchema, request.body)
    return strictResponse(extractBriefFileResponseSchema, request, { text: await extractBriefText(input) })
  })
}
