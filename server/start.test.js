import { describe, expect, test, vi } from 'vitest'
import { installShutdownHandlers, startServer } from './start.js'

describe('server startup', () => {
  test('listens with composed configuration and returns the closable runtime', async () => {
    const runtime = {
      app: { listen: vi.fn(async () => {}) },
      config: { host: '127.0.0.1', port: 4321 },
      close: vi.fn(async () => {}),
    }
    const runtimeFactory = vi.fn(async () => runtime)

    await expect(startServer({ environment: { NODE_ENV: 'test' }, runtimeFactory })).resolves.toBe(runtime)
    expect(runtimeFactory).toHaveBeenCalledWith({ environment: { NODE_ENV: 'test' } })
    expect(runtime.app.listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: 4321 })
  })

  test('closes composed resources when listening fails', async () => {
    const runtime = {
      app: { listen: vi.fn(async () => { throw new Error('address unavailable') }) },
      config: { host: '127.0.0.1', port: 4321 },
      close: vi.fn(async () => {}),
    }

    await expect(startServer({ runtimeFactory: async () => runtime })).rejects.toThrow('address unavailable')
    expect(runtime.close).toHaveBeenCalledOnce()
  })

  test('installs SIGTERM and SIGINT handling that closes once without forcing process exit', async () => {
    const listeners = new Map()
    const processLike = {
      exitCode: undefined,
      once: vi.fn((signal, listener) => listeners.set(signal, listener)),
    }
    const runtime = { close: vi.fn(async () => {}) }
    const shutdown = installShutdownHandlers(runtime, { processLike, logger: { error: vi.fn() } })

    expect([...listeners.keys()]).toEqual(['SIGTERM', 'SIGINT'])
    await Promise.all([shutdown(), shutdown()])
    expect(runtime.close).toHaveBeenCalledOnce()
    expect(processLike.exitCode).toBeUndefined()
  })

  test('sets a failing exit code when graceful shutdown cannot close a resource', async () => {
    const processLike = { exitCode: undefined, once: vi.fn() }
    const logger = { error: vi.fn() }
    const shutdown = installShutdownHandlers({ close: async () => { throw new Error('close failed') } }, { processLike, logger })

    await shutdown()
    expect(processLike.exitCode).toBe(1)
    expect(logger.error).toHaveBeenCalledWith('Banner Studio shutdown failed', expect.any(Error))
  })
})
