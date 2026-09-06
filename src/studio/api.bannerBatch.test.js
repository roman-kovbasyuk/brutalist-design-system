import { expect, it, vi } from 'vitest'
import { createStudioApi } from './api.js'

it('sends a revision-protected batch selection to its dedicated campaign endpoint', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
  const api = createStudioApi({ fetchImpl })
  const input = { designs: [{ templateId: 'editorial-split', templateVersion: '1.2.0', copySetId: 's', copyId: 'c', directionId: 'v' }], ratioIds: ['square'] }
  await api.saveBannerBatch('campaign/a', input, 8)
  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('/api/v1/campaigns/campaign%2Fa/banner-batch')
  expect(init.method).toBe('PUT')
  expect(init.headers.get('If-Match')).toBe('"8"')
  expect(JSON.parse(init.body)).toEqual(input)
})
