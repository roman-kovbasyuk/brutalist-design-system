import { describe, expect, test, vi } from 'vitest'
import { createGenerationService } from './generationService.js'

const actor = { id: 'marketer-1', role: 'marketer', disabled: false }
const brief = { product: 'Course', audience: 'Learners', objective: 'Signups', offer: '', locale: 'en', notes: '' }
const job = {
  id: 'job-1', campaignId: 'campaign-1', step: 'copy', provider: 'mock', model: 'mock-v1', region: 'europe-west6',
  status: 'pending', attempts: 0, safety: {}, usage: {}, reservedCostMicrounits: 3_000, actualCostMicrounits: null,
  timeoutAt: '2026-09-04T10:00:30.000Z', result: null, errorCode: null,
}
const copyResult = {
  provider: 'mock', model: 'mock-v1', region: 'europe-west6', usage: { inputUnits: 20, outputUnits: 30 },
  actualCostMicrounits: 240, safety: { verdict: 'safe', categories: [] },
  copies: [{ id: 'copy-1', headline: 'Learn now', body: 'Short lessons.', offer: '', cta: 'Start', visualPrompt: 'A clear desk.' }],
}

function harness(overrides = {}) {
  const succeeded = { ...job, status: 'succeeded', attempts: 1, safety: copyResult.safety, usage: copyResult.usage, actualCostMicrounits: 240, result: { copySetId: 'set-1', copies: copyResult.copies } }
  const controlPlane = {
    preflightGeneration: vi.fn(async () => ({ kind: 'new' })),
    prepareGeneration: vi.fn(async () => ({ kind: 'owner', ownerToken: 'owner-1', job, context: { brief, analysis: { summary: 'A course.', themes: ['clarity'], warnings: [] } } })),
    markDispatched: vi.fn(async () => true),
    waitForResult: vi.fn(async () => ({ status: 202, body: { job: { ...job, status: 'unknown' } } })),
    completeProviderResult: vi.fn(async () => ({ status: 201, body: { job: succeeded } })),
    markUnknown: vi.fn(async () => ({ status: 202, body: { job: { ...job, status: 'unknown', attempts: 1 } } })),
    getJob: vi.fn(async () => succeeded),
    ...overrides.controlPlane,
  }
  const provider = {
    analyseBrief: vi.fn(), generateCopy: vi.fn(async () => copyResult), generateDirections: vi.fn(), generateImage: vi.fn(),
    ...overrides.provider,
  }
  const serviceOptions = {
      pool: { query: vi.fn() }, controlPlane, providers: { mock: provider },
      idGenerator: () => 'job-1', ownerTokenGenerator: () => 'owner-1', timeoutMs: 25,
      clock: () => new Date('2026-09-04T10:00:00.000Z'),
    }
  return {
    service: createGenerationService(serviceOptions),
    controlPlane,
    provider,
  }
}

describe('generation service external-call recovery', () => {
  test('rejects image generation before reservation when no durable image-result sink is installed', async () => {
    const { service, controlPlane, provider } = harness()

    await expect(service.generateImage({
      actor, campaignId: 'campaign-1', idempotencyKey: 'image-key',
      input: { directionId: 'direction-1', width: 1200, height: 628 },
    })).rejects.toMatchObject({ code: 'image_storage_unavailable', statusCode: 503 })

    expect(controlPlane.prepareGeneration).not.toHaveBeenCalled()
    expect(controlPlane.markDispatched).not.toHaveBeenCalled()
    expect(provider.generateImage).not.toHaveBeenCalled()
  })

  test('replays a stored image response before applying the unavailable capability gate', async () => {
    const replay = { status: 201, body: { job: { ...job, step: 'image', status: 'blocked', errorCode: 'provider_blocked' } } }
    const { service, controlPlane, provider } = harness({
      controlPlane: { preflightGeneration: vi.fn(async () => ({ kind: 'replay', response: replay })) },
    })

    await expect(service.generateImage({
      actor, campaignId: 'campaign-1', idempotencyKey: 'legacy-image-key',
      input: { directionId: 'direction-1', width: 1200, height: 628 },
    })).resolves.toEqual({ ...replay, replayed: true })

    expect(controlPlane.prepareGeneration).not.toHaveBeenCalled()
    expect(controlPlane.markDispatched).not.toHaveBeenCalled()
    expect(provider.generateImage).not.toHaveBeenCalled()
  })

  test('reserves and persists dispatch before invoking a provider, then commits its validated result', async () => {
    const { service, controlPlane, provider } = harness()
    const outcome = await service.generateCopy({ actor, campaignId: 'campaign-1', idempotencyKey: 'copy-key', input: {} })

    expect(outcome).toMatchObject({ status: 201, body: { job: { status: 'succeeded', result: { copySetId: 'set-1' } } } })
    expect(controlPlane.prepareGeneration).toHaveBeenCalledWith(expect.objectContaining({
      actor, campaignId: 'campaign-1', step: 'copy', idempotencyKey: 'copy-key', jobId: 'job-1', maxCostMicrounits: 3_000,
    }))
    expect(controlPlane.markDispatched.mock.invocationCallOrder[0]).toBeLessThan(provider.generateCopy.mock.invocationCallOrder[0])
    expect(controlPlane.completeProviderResult).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1', ownerToken: 'owner-1', status: 'succeeded', actualCostMicrounits: 240,
    }))
  })

  test('replays a same-key known result without dispatching or calling the provider', async () => {
    const replay = { status: 201, body: { job: { ...job, status: 'succeeded', actualCostMicrounits: 240 } } }
    const { service, provider, controlPlane } = harness({ controlPlane: { prepareGeneration: vi.fn(async () => ({ kind: 'replay', response: replay })) } })

    expect(await service.generateCopy({ actor, campaignId: 'campaign-1', idempotencyKey: 'copy-key', input: {} })).toEqual({ ...replay, replayed: true })
    expect(provider.generateCopy).not.toHaveBeenCalled()
    expect(controlPlane.markDispatched).not.toHaveBeenCalled()
  })

  test('waits for the persisted result when dispatch ownership was lost', async () => {
    const stored = { status: 201, body: { job: { ...job, status: 'succeeded', attempts: 1 } } }
    const { service, provider, controlPlane } = harness({
      controlPlane: {
        markDispatched: vi.fn(async () => false),
        waitForResult: vi.fn(async () => stored),
      },
    })

    await expect(service.generateCopy({ actor, campaignId: 'campaign-1', idempotencyKey: 'lost-owner', input: {} }))
      .resolves.toEqual({ ...stored, replayed: true })

    expect(controlPlane.waitForResult).toHaveBeenCalledWith({ jobId: 'job-1' })
    expect(controlPlane.getJob).not.toHaveBeenCalled()
    expect(provider.generateCopy).not.toHaveBeenCalled()
  })

  test('marks a timed-out dispatched call unknown and never commits a late provider result', async () => {
    const { service, provider, controlPlane } = harness({ provider: { generateCopy: vi.fn(() => new Promise(() => {})) } })
    const outcome = await service.generateCopy({ actor, campaignId: 'campaign-1', idempotencyKey: 'timeout-key', input: {} })

    expect(outcome.body.job.status).toBe('unknown')
    expect(provider.generateCopy).toHaveBeenCalledOnce()
    expect(controlPlane.markUnknown).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1', ownerToken: 'owner-1', reason: 'provider_timeout' }))
    expect(controlPlane.completeProviderResult).not.toHaveBeenCalled()
  })

  test('treats an exception after dispatch as ambiguous and a retry replays unknown with one provider call maximum', async () => {
    let replay = false
    const unknown = { status: 202, body: { job: { ...job, status: 'unknown', attempts: 1 } } }
    const { service, provider, controlPlane } = harness({
      provider: { generateCopy: vi.fn(async () => { throw new Error('socket closed after send') }) },
      controlPlane: {
        prepareGeneration: vi.fn(async () => replay
          ? ({ kind: 'replay', response: unknown })
          : ({ kind: 'owner', ownerToken: 'owner-1', job, context: { brief, analysis: { summary: 'A course.', themes: [], warnings: [] } } })),
        markUnknown: vi.fn(async () => { replay = true; return unknown }),
      },
    })

    expect((await service.generateCopy({ actor, campaignId: 'campaign-1', idempotencyKey: 'crash-key', input: {} })).body.job.status).toBe('unknown')
    expect((await service.generateCopy({ actor, campaignId: 'campaign-1', idempotencyKey: 'crash-key', input: {} })).body.job.status).toBe('unknown')
    expect(provider.generateCopy).toHaveBeenCalledOnce()
    expect(controlPlane.markUnknown).toHaveBeenCalledOnce()
  })

})
