import { describe, expect, test, vi } from 'vitest'
import { startServer } from './start.js'

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
})
