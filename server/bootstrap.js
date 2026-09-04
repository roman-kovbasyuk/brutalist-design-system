import { buildApp } from './app.js'
import { createAuthenticator, createFirebaseTokenVerifier } from './auth/verifyToken.js'
import { loadConfig } from './config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { createWorkflowService } from './services/workflowService.js'
import { createGenerationService } from './services/generationService.js'
import { createGenerationControlPlane } from './repositories/generationJobRepository.js'
import { createMockProvider } from './providers/mockProvider.js'
import { createGeminiProvider } from './providers/geminiProvider.js'
import { createGenerationProviderRegistry } from './providers/registry.js'
import { reconcileGenerationSettings } from './services/generationSettingsService.js'

const productionDependencies = {
  buildApp,
  createAuthenticator,
  createFirebaseTokenVerifier,
  createPool,
  createWorkflowService,
  createGenerationControlPlane,
  createGenerationService,
  createMockProvider,
  createGeminiProvider,
  createGenerationProviderRegistry,
  reconcileGenerationSettings,
  runMigrations,
}

export async function createServerRuntime({ environment = process.env, dependencies = {} } = {}) {
  const resolved = { ...productionDependencies, ...dependencies }
  const config = loadConfig(environment)
  const pool = resolved.createPool({ connectionString: config.databaseUrl })
  let app
  let tokenVerifier
  let generationProvider
  let closePromise

  const close = () => {
    if (!closePromise) {
      closePromise = (async () => {
        const failures = []
        for (const operation of [
          () => app?.close?.(),
          () => tokenVerifier?.close?.(),
          () => generationProvider?.close?.(),
          () => pool.end(),
        ]) {
          try {
            await operation()
          } catch (error) {
            failures.push(error)
          }
        }
        if (failures.length > 0) throw failures[0]
      })()
    }
    return closePromise
  }

  try {
    await resolved.runMigrations({ pool })
    const providerSelection = config.generation.provider === 'gemini'
      ? {
          provider: 'gemini',
          textModel: config.generation.textModel,
          imageModel: config.generation.imageModel,
          region: config.generation.location,
        }
      : { provider: 'mock', textModel: 'mock-v1', imageModel: 'mock-v1', region: 'europe-west6' }
    const providerRegistry = resolved.createGenerationProviderRegistry(providerSelection)
    await resolved.reconcileGenerationSettings({
      pool,
      providerRegistry,
      selected: { provider: providerSelection.provider, model: providerSelection.textModel, region: providerSelection.region },
    })
    const workflowService = resolved.createWorkflowService({ pool, providerRegistry })
    generationProvider = config.generation.provider === 'gemini'
      ? resolved.createGeminiProvider({
          project: config.generation.projectId,
          location: config.generation.location,
          textModel: config.generation.textModel,
          imageModel: config.generation.imageModel,
        })
      : resolved.createMockProvider({ model: providerSelection.textModel, region: providerSelection.region })
    const generationControlPlane = resolved.createGenerationControlPlane({
      pool,
      providerRegistry,
    })
    const generationService = resolved.createGenerationService({
      pool,
      controlPlane: generationControlPlane,
      providers: { [config.generation.provider]: generationProvider },
    })
    tokenVerifier = resolved.createFirebaseTokenVerifier({ projectId: config.firebaseProjectId })
    const resolveActor = resolved.createAuthenticator({ pool, tokenVerifier })
    app = resolved.buildApp({
      readiness: async () => {
        await pool.query('SELECT 1')
        return true
      },
      resolveActor,
      workflowService,
      generationService,
    })
    return { app, close, config }
  } catch (error) {
    await close().catch(() => {})
    throw error
  }
}
