import { describe, expect, test, vi } from 'vitest'
import { createStudioApi, StudioApiError } from './api.js'

describe('Studio HTTP client', () => {
  test('sends token, local headers, exact revision and retry identity', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ campaign: { revision: 8 } })))
    const api = createStudioApi({ fetchImpl, getToken: () => 'token', getHeaders: () => ({ 'X-Studio-Demo-Role': 'marketer' }), baseUrl: 'http://localhost:3010/' })
    await api.createVersion('campaign/a', {}, 7, 'same-retry-key')
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:3010/api/v1/campaigns/campaign%2Fa/versions')
    expect(Object.fromEntries(options.headers)).toMatchObject({ authorization: 'Bearer token', 'if-match': '"7"', 'idempotency-key': 'same-retry-key', 'x-studio-demo-role': 'marketer' })
    expect(options.body).toBe('{}')
  })
  test('preserves actionable conflict details and request id', async () => {
    const api = createStudioApi({ fetchImpl: async () => new Response(JSON.stringify({ code: 'revision_conflict', message: 'Reload this campaign', details: { revision: 3 }, requestId: 'trace-1' }), { status: 409 }) })
    await expect(api.patchCampaign('c', { title: 'New' }, 2)).rejects.toMatchObject({ name: 'StudioApiError', status: 409, code: 'revision_conflict', details: { revision: 3 }, requestId: 'trace-1' })
  })
  test('handles non-JSON upstream failure without masking status', async () => {
    const api = createStudioApi({ fetchImpl: async () => new Response('Bad gateway', { status: 502 }) })
    await expect(api.getSession()).rejects.toBeInstanceOf(StudioApiError)
  })
  test('passes cancellation and never retries a mutation automatically', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn(async (_url, { signal }) => { throw signal.reason })
    const api = createStudioApi({ fetchImpl })
    await expect(api.request('POST', '/api/v1/campaigns', { body: {}, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  test('downloads a ZIP with authentication through the asset endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ asset: { id: 'zip-1' } }))).mockResolvedValueOnce(new Response('zip', { headers: { 'Content-Type': 'application/zip' } }))
    const api = createStudioApi({ fetchImpl, getToken: async () => 'private' })
    const blob = await api.downloadDelivery('v1')
    expect(blob.size).toBe(3)
    expect(blob.type).toBe('application/zip')
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/assets/zip-1')
    expect(fetchImpl.mock.calls[1][1].headers.get('authorization')).toBe('Bearer private')
  })
  test('rejects unknown commands and invalid revisions before HTTP', async () => {
    const fetchImpl = vi.fn()
    const api = createStudioApi({ fetchImpl })
    expect(() => api.generate('c', '__proto__')).toThrow('Unknown generation step')
    expect(() => api.review('v', 'delete')).toThrow('Unknown review action')
    await expect(api.patchCampaign('c', {}, -1)).rejects.toThrow('revision')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
