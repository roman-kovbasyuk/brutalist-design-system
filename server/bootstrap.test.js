import { describe, expect, test, vi } from 'vitest'
import { createServerRuntime } from './bootstrap.js'

describe('production server composition', () => {
  test('migrates before wiring authenticated API dependencies and closes every owned resource', async () => {
    const calls = []
    const pool = { query: vi.fn(), end: vi.fn(async () => { calls.push('pool.end') }) }
    const app = { close: vi.fn(async () => { calls.push('app.close') }) }
    const verifier = { verify: vi.fn(), close: vi.fn(async () => { calls.push('verifier.close') }) }
    const workflowService = { kind: 'workflow' }
    const resolveActor = vi.fn()
    const dependencies = {
      createPool: vi.fn(() => pool),
      runMigrations: vi.fn(async () => { calls.push('migrate') }),
      createWorkflowService: vi.fn(() => workflowService),
      createFirebaseTokenVerifier: vi.fn(() => verifier),
      createAuthenticator: vi.fn(() => resolveActor),
      buildApp: vi.fn((input) => { calls.push('buildApp'); return app }),
    }

    const runtime = await createServerRuntime({
      environment: { NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner_studio' },
      dependencies,
    })

    expect(calls.slice(0, 2)).toEqual(['migrate', 'buildApp'])
    expect(dependencies.createWorkflowService).toHaveBeenCalledWith({ pool })
    expect(dependencies.createAuthenticator).toHaveBeenCalledWith(expect.objectContaining({ pool, tokenVerifier: verifier }))
    expect(dependencies.buildApp).toHaveBeenCalledWith(expect.objectContaining({ resolveActor, workflowService }))
    await runtime.close()
    await runtime.close()
    expect(app.close).toHaveBeenCalledOnce()
    expect(verifier.close).toHaveBeenCalledOnce()
    expect(pool.end).toHaveBeenCalledOnce()
  })

  test('closes a created pool when startup migration fails', async () => {
    const pool = { query: vi.fn(), end: vi.fn(async () => {}) }
    const dependencies = {
      createPool: vi.fn(() => pool),
      runMigrations: vi.fn(async () => { throw new Error('migration failed') }),
    }

    await expect(createServerRuntime({
      environment: { NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner_studio' },
      dependencies,
    })).rejects.toThrow('migration failed')
    expect(pool.end).toHaveBeenCalledOnce()
  })
})
