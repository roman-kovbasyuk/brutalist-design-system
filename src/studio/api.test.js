import { describe, expect, test, vi } from 'vitest'
import { createStudioApi, StudioApiError } from './api.js'

describe('Studio HTTP client', () => {
  test('approves the exact encoded candidate with a revision-protected PUT', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'campaign/1' })))
    const api = createStudioApi({ fetchImpl })
    await api.approveCopy('campaign/1', 'job:copy/2', 7)
    const [url, request] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/campaigns/campaign%2F1/copies/job%3Acopy%2F2/approval')
    expect(request.method).toBe('PUT')
    expect(request.body).toBe('{}')
    expect(request.headers.get('if-match')).toBe('"7"')
  })
  test.each(['getWorkspace', 'getJob', 'getReview', 'getDelivery', 'getAssetBlob'])(
    '%s forwards cancellation to the authenticated read', async method => {
      const controller = new AbortController()
      const fetchImpl = vi.fn(async (_url, options) => {
        expect(options.signal).toBe(controller.signal)
        throw controller.signal.reason
      })
      const api = createStudioApi({ fetchImpl })
      controller.abort()
      await expect(api[method]('resource-1', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    },
  )
  test('posts brief files to the authenticated extraction endpoint', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: 'Extracted copy' })))
    const api = createStudioApi({ fetchImpl, getToken: () => 'token' })

    await expect(api.extractBriefFile({ name: 'brief.md', mimeType: 'text/markdown', data: 'IyBMYXVuY2g=' }))
      .resolves.toEqual({ text: 'Extracted copy' })
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/brief-files/extract', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ name: 'brief.md', mimeType: 'text/markdown', data: 'IyBMYXVuY2g=' }),
    }))
  })
  test('uses dedicated campaign duplicate and revision-protected delete endpoints', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'copy', title: 'Autumn copy' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const api = createStudioApi({ fetchImpl })

    await api.duplicateCampaign('campaign/1')
    await api.deleteCampaign('campaign/1', 4)

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/campaigns/campaign%2F1/duplicate')
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST')
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/campaigns/campaign%2F1')
    expect(fetchImpl.mock.calls[1][1].method).toBe('DELETE')
    expect(fetchImpl.mock.calls[1][1].headers.get('if-match')).toBe('"4"')
  })
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
