import { expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'

test('visual upload route enforces editor, revision, key and strict image input', async () => {
  let role = 'marketer'
  const uploadVisual = vi.fn(async () => ({ directionId: 'direction', assetId: 'asset' }))
  const app = buildApp({ resolveActor: async () => ({ id: 'actor', role }), workflowService: {}, visualUploadService: { uploadVisual } })
  const request = { method: 'POST', url: '/api/v1/campaigns/campaign/visual-uploads',
    headers: { 'if-match': '"3"', 'idempotency-key': 'upload' },
    payload: { target: { mode: 'campaign' }, name: 'visual.png', mimeType: 'image/png', data: 'aGVsbG8=' } }
  try {
    expect((await app.inject({ ...request, headers: {} })).statusCode).toBe(428)
    expect((await app.inject({ ...request, payload: { ...request.payload, mimeType: 'image/svg+xml' } })).statusCode).toBe(400)
    role = 'designer'
    expect((await app.inject(request)).statusCode).toBe(403)
    expect(uploadVisual).not.toHaveBeenCalled()
    role = 'marketer'
    const response = await app.inject(request)
    expect(response.statusCode).toBe(201)
    expect(uploadVisual).toHaveBeenCalledWith({ actor: { id: 'actor', role }, campaignId: 'campaign', expectedRevision: 3, idempotencyKey: 'upload', input: request.payload })
    expect(response.json()).toMatchObject({ directionId: 'direction', assetId: 'asset' })
  } finally { await app.close() }
})
