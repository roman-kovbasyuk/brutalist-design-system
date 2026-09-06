import { describe, expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'

const pendingJob = {
  id: 'job-1', campaignId: 'campaign-1', step: 'copy', provider: 'mock', model: 'mock-v1', region: 'europe-west6',
  status: 'succeeded', attempts: 1, safety: { verdict: 'safe', categories: [] }, usage: { inputUnits: 10, outputUnits: 20 },
  reservedCostMicrounits: 3_000, actualCostMicrounits: 240, timeoutAt: '2026-09-04T10:00:30.000Z',
  result: { copySetId: 'set-1', copies: [] }, errorCode: null,
  createdAt: '2026-09-04T10:00:00.000Z', updatedAt: '2026-09-04T10:00:01.000Z',
}
const blockedImageJob = {
  ...pendingJob,
  step: 'image',
  status: 'blocked',
  safety: { verdict: 'blocked', categories: ['mock_policy'] },
  actualCostMicrounits: 0,
  result: null,
  errorCode: 'provider_blocked',
}
const historicalImageResults = [
  {
    shape: 'legacy image metadata',
    result: { image: { mimeType: 'image/png', width: 1200, height: 628, byteSize: 4096 } },
  },
  {
    shape: 'interim asset-linked metadata',
    result: { image: { assetId: 'asset-legacy-1', mimeType: 'image/png', width: 1200, height: 628, byteSize: 4096 } },
  },
]

function successfulHistoricalImageJob(result) {
  return {
    ...pendingJob,
    step: 'image',
    reservedCostMicrounits: 250_000,
    actualCostMicrounits: 1_000,
    result,
  }
}
const campaign = {
  id: 'campaign-1', title: 'Launch', brief: { product: 'Course', audience: 'Learners', objective: 'Signups', offer: '', locale: 'en', notes: '' },
  status: 'copy_ready', revision: 1, selectedCopyId: 'set-1', selectedDirectionId: null, compositionId: null,
  currentVersionNumber: 0, openVersionId: null, createdBy: 'marketer-1', archivedAt: null,
  createdAt: '2026-09-04T10:00:00.000Z', updatedAt: '2026-09-04T10:00:01.000Z',
}

function makeApp({ role = 'marketer', generation = {} } = {}) {
  const generationService = {
    analyseBrief: vi.fn(async () => ({ status: 201, body: { job: { ...pendingJob, step: 'brief_analysis' } } })),
    generateCopy: vi.fn(async () => ({ status: 201, body: { job: pendingJob } })),
    generateDirections: vi.fn(async () => ({ status: 201, body: { job: { ...pendingJob, step: 'directions' } } })),
    generateImage: vi.fn(async () => ({ status: 201, body: { job: blockedImageJob } })),
    getJob: vi.fn(async () => pendingJob),
    selectCopy: vi.fn(async () => campaign),
    approveCopy: vi.fn(async () => campaign),
    deleteCopy: vi.fn(async () => campaign),
    selectDirection: vi.fn(async () => ({ ...campaign, status: 'direction_selected', revision: 2, selectedDirectionId: 'direction-1' })),
    ...generation,
  }
  const app = buildApp({
    resolveActor: vi.fn(async () => ({ id: `${role}-1`, role, disabled: false })),
    workflowService: {}, generationService,
  })
  return { app, generationService }
}

describe('generation and selection routes', () => {
  test('approves an individual copy with role, revision and strict-body checks', async () => {
    const { app, generationService } = makeApp()
    const url = '/api/v1/campaigns/campaign-1/copies/copy-1/approval'
    expect((await app.inject({ method: 'PUT', url, payload: {} })).statusCode).toBe(428)
    expect((await app.inject({ method: 'PUT', url, headers: { 'if-match': '"1"' }, payload: { approved: false } })).statusCode).toBe(400)
    const response = await app.inject({ method: 'PUT', url, headers: { 'if-match': '"1"' }, payload: {} })
    expect(response.statusCode).toBe(200)
    expect(response.headers.etag).toBe('"1"')
    expect(generationService.approveCopy).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'campaign-1', expectedRevision: 1, input: { copyId: 'copy-1' } }))
    const designer = makeApp({ role: 'designer' })
    expect((await designer.app.inject({ method: 'PUT', url, headers: { 'if-match': '"1"' }, payload: {} })).statusCode).toBe(403)
    expect(designer.generationService.approveCopy).not.toHaveBeenCalled()
    await app.close(); await designer.app.close()
  })
  test('deletes copy with revision protection and editor permissions', async () => {
    const { app, generationService } = makeApp()
    const url = '/api/v1/campaigns/campaign-1/copies/copy-1'
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(428)
    const response = await app.inject({ method: 'DELETE', url, headers: { 'if-match': '"1"' } })
    expect(response.statusCode).toBe(200)
    expect(generationService.deleteCopy).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'campaign-1', expectedRevision: 1, input: { copyId: 'copy-1' } }))
    const designer = makeApp({ role: 'designer' })
    expect((await designer.app.inject({ method: 'DELETE', url, headers: { 'if-match': '"1"' } })).statusCode).toBe(403)
    expect(designer.generationService.deleteCopy).not.toHaveBeenCalled()
    await app.close()
    await designer.app.close()
  })
  test('exposes the four strict idempotent generation commands with request IDs', async () => {
    const { app, generationService } = makeApp()
    const requests = [
      ['analyseBrief', '/api/v1/campaigns/campaign-1/analyse-brief', {}],
      ['generateCopy', '/api/v1/campaigns/campaign-1/copy-generations', {}],
      ['generateDirections', '/api/v1/campaigns/campaign-1/direction-generations', {}],
      ['generateImage', '/api/v1/campaigns/campaign-1/image-generations', { directionId: 'direction-1', width: 1200, height: 628 }],
    ]
    for (const [method, url, payload] of requests) {
      const response = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': `${method}-key` }, payload })
      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({ job: { campaignId: 'campaign-1' }, requestId: response.headers['x-request-id'] })
      expect(generationService[method]).toHaveBeenCalledWith(expect.objectContaining({
        actor: expect.objectContaining({ role: 'marketer' }), campaignId: 'campaign-1', idempotencyKey: `${method}-key`, input: payload,
      }))
    }
    await app.close()
  })

  test('requires a valid idempotency key before generation and rejects undeclared input', async () => {
    const { app, generationService } = makeApp()
    const missing = await app.inject({ method: 'POST', url: '/api/v1/campaigns/campaign-1/copy-generations', payload: {} })
    const malformed = await app.inject({ method: 'POST', url: '/api/v1/campaigns/campaign-1/copy-generations', headers: { 'idempotency-key': 'contains whitespace' }, payload: {} })
    const extra = await app.inject({ method: 'POST', url: '/api/v1/campaigns/campaign-1/copy-generations', headers: { 'idempotency-key': 'copy-key' }, payload: { model: 'client-selected' } })

    expect(missing.statusCode).toBe(428)
    expect(missing.json().code).toBe('precondition_required')
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json().code).toBe('invalid_idempotency_key')
    expect(extra.statusCode).toBe(400)
    expect(generationService.generateCopy).not.toHaveBeenCalled()
    await app.close()
  })

  test('allows authenticated reads of blocked image jobs without provider bytes', async () => {
    const { app } = makeApp({ role: 'designer', generation: { getJob: vi.fn(async () => blockedImageJob) } })
    const response = await app.inject({ method: 'GET', url: '/api/v1/generation-jobs/job-1' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ id: 'job-1', step: 'image', requestId: response.headers['x-request-id'] })
    expect(response.body).not.toContain('bytes')
    await app.close()
  })

  test.each(historicalImageResults)('replays a successful historical image job with $shape', async ({ result }) => {
    const job = successfulHistoricalImageJob(result)
    const { app } = makeApp({ generation: { generateImage: vi.fn(async () => ({ status: 201, body: { job } })) } })

    const response = await app.inject({
      method: 'POST', url: '/api/v1/campaigns/campaign-1/image-generations',
      headers: { 'idempotency-key': 'historical-image-key' },
      payload: { directionId: 'direction-1', width: 1200, height: 628 },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().job.result).toEqual(result)
    expect(response.body).not.toContain('bytes')
    await app.close()
  })

  test.each(historicalImageResults)('reads a successful historical image job with $shape', async ({ result }) => {
    const { app } = makeApp({ role: 'designer', generation: { getJob: vi.fn(async () => successfulHistoricalImageJob(result)) } })

    const response = await app.inject({ method: 'GET', url: '/api/v1/generation-jobs/job-1' })

    expect(response.statusCode).toBe(200)
    expect(response.json().result).toEqual(result)
    expect(response.body).not.toContain('bytes')
    await app.close()
  })

  test.each(historicalImageResults)('rejects arbitrary nested fields from $shape', async ({ result }) => {
    const invalidResult = { image: { ...result.image, providerInternal: 'must-not-leak' } }
    const { app } = makeApp({ role: 'designer', generation: { getJob: vi.fn(async () => successfulHistoricalImageJob(invalidResult)) } })

    const response = await app.inject({ method: 'GET', url: '/api/v1/generation-jobs/job-1' })

    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('must-not-leak')
    await app.close()
  })

  test('protects copy and direction selection with roles and If-Match revisions', async () => {
    const marketer = makeApp()
    const designer = makeApp({ role: 'designer' })
    const copy = await marketer.app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/copy-selection', headers: { 'if-match': '"0"' }, payload: { copyId: 'copy-1' } })
    const direction = await marketer.app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/direction-selection', headers: { 'if-match': '"1"' }, payload: { directionId: 'direction-1' } })
    const missing = await marketer.app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/copy-selection', payload: { copyId: 'copy-1' } })
    const forbidden = await designer.app.inject({ method: 'PUT', url: '/api/v1/campaigns/campaign-1/copy-selection', headers: { 'if-match': '"0"' }, payload: { copyId: 'copy-1' } })

    expect(copy.statusCode).toBe(200)
    expect(copy.headers.etag).toBe('"1"')
    expect(direction.statusCode).toBe(200)
    expect(direction.headers.etag).toBe('"2"')
    expect(missing.statusCode).toBe(428)
    expect(forbidden.statusCode).toBe(403)
    expect(marketer.generationService.selectCopy).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0, input: { copyId: 'copy-1' } }))
    expect(designer.generationService.selectCopy).not.toHaveBeenCalled()
    await Promise.all([marketer.app.close(), designer.app.close()])
  })

  test('forbids designers from dispatching every generation command', async () => {
    const { app, generationService } = makeApp({ role: 'designer' })
    for (const url of ['analyse-brief', 'copy-generations', 'direction-generations', 'image-generations']) {
      const payload = url === 'image-generations' ? { directionId: 'direction-1', width: 1200, height: 628 } : {}
      expect((await app.inject({ method: 'POST', url: `/api/v1/campaigns/campaign-1/${url}`, headers: { 'idempotency-key': 'forbidden-key' }, payload })).statusCode).toBe(403)
    }
    expect(generationService.analyseBrief).not.toHaveBeenCalled()
    expect(generationService.generateCopy).not.toHaveBeenCalled()
    expect(generationService.generateDirections).not.toHaveBeenCalled()
    expect(generationService.generateImage).not.toHaveBeenCalled()
    await app.close()
  })

  test('fails closed on malformed service output and never leaks provider errors', async () => {
    const { app } = makeApp({ generation: {
      getJob: vi.fn(async () => ({ ...pendingJob, providerSecret: 'secret' })),
      generateCopy: vi.fn(async () => { throw new Error('provider credential secret-value') }),
    } })
    const malformed = await app.inject({ method: 'GET', url: '/api/v1/generation-jobs/job-1' })
    const failure = await app.inject({ method: 'POST', url: '/api/v1/campaigns/campaign-1/copy-generations', headers: { 'idempotency-key': 'failed-key' }, payload: {} })

    expect(malformed.statusCode).toBe(500)
    expect(malformed.body).not.toContain('providerSecret')
    expect(failure.statusCode).toBe(500)
    expect(failure.body).not.toContain('credential')
    expect(failure.body).not.toContain('secret-value')
    await app.close()
  })
})
