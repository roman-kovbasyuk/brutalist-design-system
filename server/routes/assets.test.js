import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'

const bytes = Buffer.from('private image bytes')
const asset = {
  id: 'asset-1', campaignId: 'campaign-1', kind: 'direction',
  objectKey: 'campaigns/abc/generation-jobs/def/generated/asset-1.png', mimeType: 'image/png',
  byteSize: bytes.length, width: 1200, height: 628,
  sha256: createHash('sha256').update(bytes).digest('hex'), source: 'generation', bytes,
}

function makeApp({ role = 'designer', result = asset } = {}) {
  const assetService = { readAsset: vi.fn(async () => result) }
  const app = buildApp({
    resolveActor: vi.fn(async () => ({ id: `${role}-1`, role, disabled: false })),
    workflowService: {}, assetService,
  })
  return { app, assetService }
}

describe('private asset route', () => {
  test.each(['marketer', 'designer', 'admin'])('streams verified private bytes to an active %s with safe headers', async (role) => {
    const { app, assetService } = makeApp({ role })
    const response = await app.inject({ method: 'GET', url: '/api/v1/assets/asset-1' })

    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(bytes)
    expect(response.headers).toMatchObject({
      'content-type': 'image/png',
      'content-length': String(bytes.length),
      etag: `"${asset.sha256}"`,
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    })
    expect(response.body).not.toContain('storage.googleapis.com')
    expect(assetService.readAsset).toHaveBeenCalledWith({ actor: expect.objectContaining({ role }), assetId: 'asset-1' })
    await app.close()
  })

  test('returns the same not-found envelope for unknown and unauthorized campaign assets', async () => {
    const { app } = makeApp({ result: null })
    const response = await app.inject({ method: 'GET', url: '/api/v1/assets/unknown' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'not_found' })
    await app.close()
  })

  test.each([
    ['manifest', 'application/json', 'json'],
    ['delivery_zip', 'application/zip', 'zip'],
  ])('forces %s downloads with a safe server-owned filename', async (kind, mimeType, extension) => {
    const { app } = makeApp({ result: { ...asset, kind, mimeType } })
    const response = await app.inject({ method: 'GET', url: '/api/v1/assets/asset-1' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-disposition'])
      .toBe(`attachment; filename="${kind === 'manifest' ? 'manifest' : 'delivery'}-${asset.sha256.slice(0, 16)}.${extension}"`)
    await app.close()
  })
})
