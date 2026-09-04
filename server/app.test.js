import { describe, expect, test } from 'vitest'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'

describe('Banner Studio API shell', () => {
  test('reports process liveness with a request ID', async () => {
    const app = buildApp({ readiness: async () => true })

    const response = await app.inject({ method: 'GET', url: '/healthz' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ok' })
    expect(response.json().requestId).toBe(response.headers['x-request-id'])
    await app.close()
  })

  test('does not listen while the application is built', async () => {
    const app = buildApp({ readiness: async () => true })

    expect(app.server.listening).toBe(false)
    await app.close()
  })

  test('reports ready when injected dependencies are ready', async () => {
    const app = buildApp({ readiness: async () => true })

    const response = await app.inject({ method: 'GET', url: '/readyz' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ready' })
    expect(response.json().requestId).toBe(response.headers['x-request-id'])
    await app.close()
  })

  test('returns an unavailable normalized error when dependencies are not ready', async () => {
    const app = buildApp({ readiness: async () => false })

    const response = await app.inject({ method: 'GET', url: '/readyz' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Dependencies are not ready',
      requestId: response.headers['x-request-id'],
    })
    await app.close()
  })

  test('uses a safe inbound request ID and replaces unsafe values', async () => {
    const app = buildApp({ readiness: async () => true })

    const safeResponse = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'trace-42' },
    })
    const unsafeResponse = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'invalid request id' },
    })

    expect(safeResponse.json().requestId).toBe('trace-42')
    expect(unsafeResponse.json().requestId).not.toBe('invalid request id')
    expect(unsafeResponse.json().requestId).toBe(unsafeResponse.headers['x-request-id'])
    await app.close()
  })

  test('normalizes unknown routes without exposing implementation details', async () => {
    const app = buildApp({ readiness: async () => true })

    const response = await app.inject({ method: 'GET', url: '/missing' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Route not found',
      requestId: response.headers['x-request-id'],
    })
    expect(response.body).not.toContain('stack')
    await app.close()
  })

  test('normalizes unexpected readiness errors without stack traces', async () => {
    const app = buildApp({ readiness: async () => { throw new Error('database password: secret') } })

    const response = await app.inject({ method: 'GET', url: '/readyz' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: response.headers['x-request-id'],
    })
    expect(response.body).not.toContain('secret')
    await app.close()
  })

  test('fails invalid production configuration without echoing sensitive values', () => {
    const databaseUrl = 'postgres://banner:top-secret@db.example/banner'

    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: databaseUrl, FIREBASE_PROJECT_ID: 'banner-project' }))
      .not.toThrow()
    expect(() => loadConfig({ NODE_ENV: 'production' }))
      .toThrow('DATABASE_URL is required in production')
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: databaseUrl }))
      .toThrow('FIREBASE_PROJECT_ID is required in production')
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: databaseUrl, FIREBASE_PROJECT_ID: 'banner-project', PORT: 'invalid' }))
      .toThrow('PORT must be an integer between 1 and 65535')
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: databaseUrl, FIREBASE_PROJECT_ID: 'banner-project', PORT: databaseUrl }))
      .toThrowError(/PORT must be an integer/)
  })

  test('returns an immutable configuration from only the supplied environment', () => {
    const config = loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '4000' })

    expect(config).toEqual({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 4000,
      databaseUrl: undefined,
      firebaseProjectId: undefined,
    })
    expect(Object.isFrozen(config)).toBe(true)
  })

  test('rejects a missing environment object', () => {
    expect(() => loadConfig()).toThrow('Environment configuration must be an object')
  })
})
