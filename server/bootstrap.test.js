import { describe, expect, test, vi } from 'vitest'
import { createServerRuntime } from './bootstrap.js'

describe('production server composition', () => {
  test('selects Gemini in production, migrates before wiring dependencies, and closes every owned resource', async () => {
    const calls = []
    const pool = { query: vi.fn(), end: vi.fn(async () => { calls.push('pool.end') }) }
    const app = { close: vi.fn(async () => { calls.push('app.close') }) }
    const verifier = { verify: vi.fn(), close: vi.fn(async () => { calls.push('verifier.close') }) }
    const workflowService = { kind: 'workflow' }
    const generationControlPlane = { kind: 'generation-control-plane' }
    const generationProvider = {
      analyseBrief: vi.fn(), generateCopy: vi.fn(), generateDirections: vi.fn(), generateImage: vi.fn(),
      close: vi.fn(async () => { calls.push('provider.close') }),
    }
    const generationService = { kind: 'generation' }
    const providerRegistry = { gemini: [{ model: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image', region: 'eu' }] }
    const resolveActor = vi.fn()
    const dependencies = {
      createPool: vi.fn(() => pool),
      runMigrations: vi.fn(async () => { calls.push('migrate') }),
      createWorkflowService: vi.fn(() => workflowService),
      createGenerationControlPlane: vi.fn(() => generationControlPlane),
      createMockProvider: vi.fn(() => { throw new Error('production must not create mock') }),
      createGeminiProvider: vi.fn(() => generationProvider),
      createGenerationService: vi.fn(() => generationService),
      createGenerationProviderRegistry: vi.fn(() => providerRegistry),
      createFirebaseTokenVerifier: vi.fn(() => verifier),
      createAuthenticator: vi.fn(() => resolveActor),
      buildApp: vi.fn((input) => { calls.push('buildApp'); return app }),
    }

    const runtime = await createServerRuntime({
      environment: {
        NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner_studio', FIREBASE_PROJECT_ID: 'banner-project',
        GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project', VERTEX_AI_LOCATION: 'eu',
        GEMINI_TEXT_MODEL: 'gemini-3.5-flash', GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image',
      },
      dependencies,
    })

    expect(calls.slice(0, 2)).toEqual(['migrate', 'buildApp'])
    expect(dependencies.createWorkflowService).toHaveBeenCalledWith({ pool })
    expect(dependencies.createGenerationProviderRegistry).toHaveBeenCalledWith({
      provider: 'gemini', textModel: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image', region: 'eu',
    })
    expect(dependencies.createGeminiProvider).toHaveBeenCalledWith({
      project: 'banner-project', location: 'eu', textModel: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image',
    })
    expect(dependencies.createMockProvider).not.toHaveBeenCalled()
    expect(dependencies.createGenerationControlPlane).toHaveBeenCalledWith({ pool, providerRegistry })
    expect(dependencies.createGenerationService).toHaveBeenCalledWith({
      pool, controlPlane: generationControlPlane, providers: { gemini: generationProvider },
    })
    expect(dependencies.createFirebaseTokenVerifier).toHaveBeenCalledWith({ projectId: 'banner-project' })
    expect(dependencies.createAuthenticator).toHaveBeenCalledWith(expect.objectContaining({ pool, tokenVerifier: verifier }))
    expect(dependencies.buildApp).toHaveBeenCalledWith(expect.objectContaining({ resolveActor, workflowService, generationService }))
    await runtime.close()
    await runtime.close()
    expect(app.close).toHaveBeenCalledOnce()
    expect(verifier.close).toHaveBeenCalledOnce()
    expect(generationProvider.close).toHaveBeenCalledOnce()
    expect(pool.end).toHaveBeenCalledOnce()
  })

  test('keeps explicitly selected mock composition available outside production', async () => {
    const pool = { query: vi.fn(), end: vi.fn(async () => {}) }
    const app = { close: vi.fn(async () => {}) }
    const verifier = { verify: vi.fn(), close: vi.fn(async () => {}) }
    const provider = { analyseBrief: vi.fn(), generateCopy: vi.fn(), generateDirections: vi.fn(), generateImage: vi.fn() }
    const providerRegistry = { mock: [{ model: 'mock-v1', region: 'europe-west6' }] }
    const dependencies = {
      createPool: vi.fn(() => pool), runMigrations: vi.fn(async () => {}), createWorkflowService: vi.fn(() => ({})),
      createGenerationControlPlane: vi.fn(() => ({})), createGenerationService: vi.fn(() => ({})),
      createGenerationProviderRegistry: vi.fn(() => providerRegistry), createMockProvider: vi.fn(() => provider),
      createGeminiProvider: vi.fn(), createFirebaseTokenVerifier: vi.fn(() => verifier),
      createAuthenticator: vi.fn(() => vi.fn()), buildApp: vi.fn(() => app),
    }

    const runtime = await createServerRuntime({ environment: { NODE_ENV: 'test', GENERATION_PROVIDER: 'mock' }, dependencies })

    expect(dependencies.createMockProvider).toHaveBeenCalledWith({ model: 'mock-v1', region: 'europe-west6' })
    expect(dependencies.createGeminiProvider).not.toHaveBeenCalled()
    expect(dependencies.createGenerationService).toHaveBeenCalledWith(expect.objectContaining({ providers: { mock: provider } }))
    await runtime.close()
  })

  test('closes a created pool when startup migration fails', async () => {
    const pool = { query: vi.fn(), end: vi.fn(async () => {}) }
    const dependencies = {
      createPool: vi.fn(() => pool),
      runMigrations: vi.fn(async () => { throw new Error('migration failed') }),
    }

    await expect(createServerRuntime({
      environment: {
        NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner_studio', FIREBASE_PROJECT_ID: 'banner-project',
        GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project',
      },
      dependencies,
    })).rejects.toThrow('migration failed')
    expect(pool.end).toHaveBeenCalledOnce()
  })
})
