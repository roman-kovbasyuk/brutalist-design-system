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
    const assetService = { kind: 'asset-service' }
    const versionService = { kind: 'version-service' }
    const deliveryService = { kind: 'delivery-service' }
    const assetStore = { close: vi.fn(async () => { calls.push('assetStore.close') }) }
    const providerRegistry = { gemini: [{ model: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image', region: 'eu' }] }
    const resolveActor = vi.fn()
    const dependencies = {
      inspectStaticBuild: vi.fn(({ root } = {}) => { calls.push('inspect-static'); return { root } }),
      createPool: vi.fn(() => pool),
      runMigrations: vi.fn(async () => { calls.push('migrate') }),
      createWorkflowService: vi.fn(() => workflowService),
      createGenerationControlPlane: vi.fn(() => generationControlPlane),
      createMockProvider: vi.fn(() => { throw new Error('production must not create mock') }),
      createGeminiProvider: vi.fn(() => generationProvider),
      createGenerationService: vi.fn(() => generationService),
      createGcsAssetStore: vi.fn(() => assetStore),
      createMemoryAssetStore: vi.fn(() => { throw new Error('production must not create memory storage') }),
      createAssetService: vi.fn(() => assetService),
      createVersionService: vi.fn(() => versionService),
      createDeliveryService: vi.fn(() => deliveryService),
      createGenerationProviderRegistry: vi.fn(() => providerRegistry),
      reconcileGenerationSettings: vi.fn(async () => { calls.push('reconcile') }),
      createFirebaseTokenVerifier: vi.fn(() => verifier),
      createAuthenticator: vi.fn(() => resolveActor),
      buildApp: vi.fn((input) => { calls.push('buildApp'); return app }),
    }

    const runtime = await createServerRuntime({
      environment: {
        NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner_studio', FIREBASE_PROJECT_ID: 'banner-project',
        RUN_MIGRATIONS: 'true',
        GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project', VERTEX_AI_LOCATION: 'eu',
        GEMINI_TEXT_MODEL: 'gemini-3.5-flash', GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image',
        ASSET_STORE: 'gcs', GCS_ASSET_BUCKET: 'banner-private-assets', GCS_PROJECT_ID: 'banner-project',
      },
      dependencies,
    })

    expect(calls.slice(0, 4)).toEqual(['inspect-static', 'migrate', 'reconcile', 'buildApp'])
    expect(dependencies.createWorkflowService).toHaveBeenCalledWith({ pool, providerRegistry })
    expect(dependencies.createGenerationProviderRegistry).toHaveBeenCalledWith({
      provider: 'gemini', textModel: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image', region: 'eu',
    })
    expect(dependencies.reconcileGenerationSettings).toHaveBeenCalledWith({
      pool, providerRegistry, selected: { provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu' },
    })
    expect(dependencies.createGeminiProvider).toHaveBeenCalledWith({
      project: 'banner-project', location: 'eu', textModel: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image',
    })
    expect(dependencies.createMockProvider).not.toHaveBeenCalled()
    expect(dependencies.createGenerationControlPlane).toHaveBeenCalledWith({ pool, providerRegistry })
    expect(dependencies.createGenerationService).toHaveBeenCalledWith({
      pool, controlPlane: generationControlPlane, providers: { gemini: generationProvider }, assetStore,
    })
    expect(dependencies.createGcsAssetStore).toHaveBeenCalledWith({ bucketName: 'banner-private-assets', projectId: 'banner-project' })
    expect(dependencies.createMemoryAssetStore).not.toHaveBeenCalled()
    expect(dependencies.createAssetService).toHaveBeenCalledWith({ pool, assetStore })
    expect(dependencies.createVersionService).toHaveBeenCalledWith({ pool, assetStore })
    expect(dependencies.createDeliveryService).toHaveBeenCalledWith({ pool, assetStore })
    expect(dependencies.createFirebaseTokenVerifier).toHaveBeenCalledWith({ projectId: 'banner-project' })
    expect(dependencies.createAuthenticator).toHaveBeenCalledWith(expect.objectContaining({ pool, tokenVerifier: verifier }))
    expect(dependencies.inspectStaticBuild).toHaveBeenCalledWith(expect.any(String))
    expect(dependencies.buildApp).toHaveBeenCalledWith(expect.objectContaining({ resolveActor, workflowService, generationService, assetService, versionService, deliveryService, staticRoot: expect.any(String) }))
    await runtime.close()
    await runtime.close()
    expect(app.close).toHaveBeenCalledOnce()
    expect(verifier.close).toHaveBeenCalledOnce()
    expect(generationProvider.close).toHaveBeenCalledOnce()
    expect(assetStore.close).toHaveBeenCalledOnce()
    expect(pool.end).toHaveBeenCalledOnce()
  })

  test('rejects a missing production build before allocating database or provider resources', async () => {
    const createPool = vi.fn()
    const dependencies = {
      inspectStaticBuild: vi.fn(() => { throw new Error('Production static build is unavailable; run npm run build before startup') }),
      createPool,
    }

    await expect(createServerRuntime({
      environment: {
        NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner_studio', FIREBASE_PROJECT_ID: 'banner-project',
        GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project',
        ASSET_STORE: 'gcs', GCS_ASSET_BUCKET: 'banner-private-assets', GCS_PROJECT_ID: 'banner-project',
        STATIC_ROOT: '/missing/release/dist',
      },
      dependencies,
    })).rejects.toThrow(/run npm run build/i)
    expect(createPool).not.toHaveBeenCalled()
  })

  test('keeps migrations as an explicit release step for a normal production server start', async () => {
    const pool = { query: vi.fn(), end: vi.fn(async () => {}) }
    const app = { close: vi.fn(async () => {}) }
    const verifier = { close: vi.fn(async () => {}) }
    const provider = { close: vi.fn(async () => {}) }
    const assetStore = { close: vi.fn(async () => {}) }
    const runMigrations = vi.fn(async () => {})
    const dependencies = {
      inspectStaticBuild: vi.fn(), createPool: vi.fn(() => pool), runMigrations,
      createGenerationProviderRegistry: vi.fn(() => ({ gemini: [] })), reconcileGenerationSettings: vi.fn(async () => {}),
      createWorkflowService: vi.fn(() => ({})), createGenerationControlPlane: vi.fn(() => ({})),
      createGenerationService: vi.fn(() => ({})), createGeminiProvider: vi.fn(() => provider),
      createGcsAssetStore: vi.fn(() => assetStore), createAssetService: vi.fn(() => ({})),
      createVersionService: vi.fn(() => ({})), createReviewService: vi.fn(() => ({})), createDeliveryService: vi.fn(() => ({})),
      createFirebaseTokenVerifier: vi.fn(() => verifier), createAuthenticator: vi.fn(() => vi.fn()),
      buildApp: vi.fn(() => app),
    }

    const runtime = await createServerRuntime({
      environment: {
        NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner_studio', FIREBASE_PROJECT_ID: 'banner-project',
        GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project',
        ASSET_STORE: 'gcs', GCS_ASSET_BUCKET: 'banner-private-assets', GCS_PROJECT_ID: 'banner-project',
      },
      dependencies,
    })

    expect(runMigrations).not.toHaveBeenCalled()
    await runtime.close()
  })

  test('keeps explicitly selected mock composition available outside production', async () => {
    const pool = { query: vi.fn(), end: vi.fn(async () => {}) }
    const app = { close: vi.fn(async () => {}) }
    const verifier = { verify: vi.fn(), close: vi.fn(async () => {}) }
    const provider = { analyseBrief: vi.fn(), generateCopy: vi.fn(), generateDirections: vi.fn(), generateImage: vi.fn() }
    const providerRegistry = { mock: [{ model: 'mock-v1', region: 'europe-west6' }] }
    const assetStore = { close: vi.fn(async () => {}) }
    const dependencies = {
      createPool: vi.fn(() => pool), runMigrations: vi.fn(async () => {}), createWorkflowService: vi.fn(() => ({})),
      createGenerationControlPlane: vi.fn(() => ({})), createGenerationService: vi.fn(() => ({})),
      createGenerationProviderRegistry: vi.fn(() => providerRegistry), createMockProvider: vi.fn(() => provider),
      createGeminiProvider: vi.fn(), createFirebaseTokenVerifier: vi.fn(() => verifier),
      createAuthenticator: vi.fn(() => vi.fn()), buildApp: vi.fn(() => app),
      reconcileGenerationSettings: vi.fn(),
      createMemoryAssetStore: vi.fn(() => assetStore), createGcsAssetStore: vi.fn(), createAssetService: vi.fn(() => ({})),
      createVersionService: vi.fn(() => ({})),
      createDeliveryService: vi.fn(() => ({})),
    }

    const runtime = await createServerRuntime({ environment: { NODE_ENV: 'test', GENERATION_PROVIDER: 'mock' }, dependencies })

    expect(dependencies.createMockProvider).toHaveBeenCalledWith({ model: 'mock-v1', region: 'europe-west6' })
    expect(dependencies.createGeminiProvider).not.toHaveBeenCalled()
    expect(dependencies.createGenerationService).toHaveBeenCalledWith(expect.objectContaining({ providers: { mock: provider } }))
    expect(dependencies.createMemoryAssetStore).toHaveBeenCalledOnce()
    expect(dependencies.createGenerationService).toHaveBeenCalledWith(expect.objectContaining({ assetStore }))
    expect(dependencies.reconcileGenerationSettings).toHaveBeenCalledWith({
      pool, providerRegistry, selected: { provider: 'mock', model: 'mock-v1', region: 'europe-west6' },
    })
    await runtime.close()
  })

  test.each(['development', 'test'])('reconciles a fresh %s runtime when Gemini is explicitly selected', async (nodeEnv) => {
    const calls = []
    const pool = { query: vi.fn(), end: vi.fn(async () => {}) }
    const app = { close: vi.fn(async () => {}) }
    const verifier = { close: vi.fn(async () => {}) }
    const provider = { close: vi.fn(async () => {}) }
    const providerRegistry = { gemini: [{ model: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image', region: 'eu' }] }
    const dependencies = {
      createPool: vi.fn(() => pool),
      runMigrations: vi.fn(async () => { calls.push('migrate') }),
      createGenerationProviderRegistry: vi.fn(() => providerRegistry),
      reconcileGenerationSettings: vi.fn(async () => { calls.push('reconcile') }),
      createWorkflowService: vi.fn(() => ({})),
      createGenerationControlPlane: vi.fn(() => ({})),
      createGenerationService: vi.fn(() => ({})),
      createMockProvider: vi.fn(),
      createGeminiProvider: vi.fn(() => provider),
      createFirebaseTokenVerifier: vi.fn(() => verifier),
      createAuthenticator: vi.fn(() => vi.fn()),
      buildApp: vi.fn(() => { calls.push('buildApp'); return app }),
    }

    const runtime = await createServerRuntime({
      environment: {
        NODE_ENV: nodeEnv, GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project',
        VERTEX_AI_LOCATION: 'eu', GEMINI_TEXT_MODEL: 'gemini-3.5-flash', GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image',
        ASSET_STORE: 'memory',
      },
      dependencies,
    })

    expect(calls).toEqual(['migrate', 'reconcile', 'buildApp'])
    expect(dependencies.reconcileGenerationSettings).toHaveBeenCalledWith({
      pool, providerRegistry,
      selected: { provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu' },
    })
    expect(dependencies.createGeminiProvider).toHaveBeenCalledOnce()
    expect(dependencies.createMockProvider).not.toHaveBeenCalled()
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
        RUN_MIGRATIONS: 'true',
        GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project',
        ASSET_STORE: 'gcs', GCS_ASSET_BUCKET: 'banner-private-assets', GCS_PROJECT_ID: 'banner-project',
      },
      dependencies,
    })).rejects.toThrow('migration failed')
    expect(pool.end).toHaveBeenCalledOnce()
  })
})
