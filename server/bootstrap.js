import { buildApp } from './app.js'
import { createAuthenticator, createFirebaseTokenVerifier } from './auth/verifyToken.js'
import { loadConfig } from './config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { createWorkflowService } from './services/workflowService.js'

const productionDependencies = {
  buildApp,
  createAuthenticator,
  createFirebaseTokenVerifier,
  createPool,
  createWorkflowService,
  runMigrations,
}

export async function createServerRuntime({ environment = process.env, dependencies = {} } = {}) {
  const resolved = { ...productionDependencies, ...dependencies }
  const config = loadConfig(environment)
  const pool = resolved.createPool({ connectionString: config.databaseUrl })
  let app
  let tokenVerifier
  let closePromise

  const close = () => {
    if (!closePromise) {
      closePromise = (async () => {
        const failures = []
        for (const operation of [
          () => app?.close?.(),
          () => tokenVerifier?.close?.(),
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
    const workflowService = resolved.createWorkflowService({ pool })
    tokenVerifier = resolved.createFirebaseTokenVerifier({ projectId: config.firebaseProjectId })
    const resolveActor = resolved.createAuthenticator({ pool, tokenVerifier })
    app = resolved.buildApp({
      readiness: async () => {
        await pool.query('SELECT 1')
        return true
      },
      resolveActor,
      workflowService,
    })
    return { app, close, config }
  } catch (error) {
    await close().catch(() => {})
    throw error
  }
}
