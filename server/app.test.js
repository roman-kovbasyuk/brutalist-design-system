import { describe, expect, test } from 'vitest'
import { resolve } from 'node:path'
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

    const productionEnvironment = {
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
      FIREBASE_PROJECT_ID: 'banner-project',
      GENERATION_PROVIDER: 'gemini',
      VERTEX_AI_PROJECT_ID: 'banner-project',
      ASSET_STORE: 'gcs',
      GCS_ASSET_BUCKET: 'banner-private-assets',
      GCS_PROJECT_ID: 'banner-project',
    }

    expect(() => loadConfig(productionEnvironment))
      .not.toThrow()
    expect(() => loadConfig({ NODE_ENV: 'production' }))
      .toThrow('DATABASE_URL is required in production')
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: databaseUrl }))
      .toThrow('FIREBASE_PROJECT_ID is required in production')
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: databaseUrl, FIREBASE_PROJECT_ID: 'banner-project' }))
      .toThrow('GENERATION_PROVIDER=gemini is required in production')
    expect(() => loadConfig({ ...productionEnvironment, GENERATION_PROVIDER: 'mock' }))
      .toThrow('GENERATION_PROVIDER=gemini is required in production')
    expect(() => loadConfig({ ...productionEnvironment, VERTEX_AI_PROJECT_ID: '' }))
      .toThrow('VERTEX_AI_PROJECT_ID is required for Gemini')
    expect(() => loadConfig({ ...productionEnvironment, ASSET_STORE: 'memory' }))
      .toThrow('ASSET_STORE=gcs is required in production')
    expect(() => loadConfig({ ...productionEnvironment, GCS_ASSET_BUCKET: '' }))
      .toThrow('GCS_ASSET_BUCKET is required for GCS asset storage')
    expect(() => loadConfig({ ...productionEnvironment, GCS_PROJECT_ID: '' }))
      .toThrow('GCS_PROJECT_ID is required for GCS asset storage')
    expect(() => loadConfig({ ...productionEnvironment, PORT: 'invalid' }))
      .toThrow('PORT must be an integer between 1 and 65535')
    expect(() => loadConfig({ ...productionEnvironment, PORT: databaseUrl }))
      .toThrowError(/PORT must be an integer/)
  })

  test.each([
    ['VERTEX_AI_LOCATION', 'global'],
    ['GEMINI_TEXT_MODEL', 'gemini-2.5-flash'],
    ['GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image'],
  ])('rejects unapproved Gemini configuration in %s', (key, value) => {
    expect(() => loadConfig({
      NODE_ENV: 'test',
      GENERATION_PROVIDER: 'gemini',
      VERTEX_AI_PROJECT_ID: 'banner-project',
      [key]: value,
    })).toThrow(/approved/i)
  })

  test('returns an immutable configuration from only the supplied environment', () => {
    const config = loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '4000', GENERATION_PROVIDER: 'mock' })

    expect(config).toEqual({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 4000,
      databaseUrl: undefined,
      firebaseProjectId: undefined,
      generation: {
        provider: 'mock',
        projectId: undefined,
        location: 'eu',
        textModel: 'gemini-3.5-flash',
        imageModel: 'gemini-3.1-flash-image',
      },
      assetStorage: {
        provider: 'memory',
        bucket: undefined,
        projectId: undefined,
      },
      staticServing: {
        enabled: false,
        root: resolve('dist'),
      },
      runMigrationsOnStartup: true,
    })
    expect(Object.isFrozen(config)).toBe(true)
  })

  test('rejects a missing environment object', () => {
    expect(() => loadConfig()).toThrow('Environment configuration must be an object')
  })

  test('enables the production static build and allows an explicit local production-parity composition', () => {
    const production = loadConfig({
      NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner', FIREBASE_PROJECT_ID: 'banner-project',
      GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project',
      ASSET_STORE: 'gcs', GCS_ASSET_BUCKET: 'banner-assets', GCS_PROJECT_ID: 'banner-project',
      STATIC_ROOT: './release-output',
    })
    const parity = loadConfig({ NODE_ENV: 'test', GENERATION_PROVIDER: 'mock', SERVE_STATIC: 'true', STATIC_ROOT: './test-output' })

    expect(production.staticServing).toEqual({ enabled: true, root: resolve('release-output') })
    expect(production.runMigrationsOnStartup).toBe(false)
    expect(parity.staticServing).toEqual({ enabled: true, root: resolve('test-output') })
    expect(parity.runMigrationsOnStartup).toBe(true)
    expect(() => loadConfig({ NODE_ENV: 'test', SERVE_STATIC: 'yes' })).toThrow('SERVE_STATIC must be true or false')
    expect(() => loadConfig({ NODE_ENV: 'test', RUN_MIGRATIONS: 'yes' })).toThrow('RUN_MIGRATIONS must be true or false')
    expect(() => loadConfig({
      NODE_ENV: 'production', DATABASE_URL: 'postgresql:///banner', FIREBASE_PROJECT_ID: 'banner-project',
      GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project',
      ASSET_STORE: 'gcs', GCS_ASSET_BUCKET: 'banner-assets', GCS_PROJECT_ID: 'banner-project',
      SERVE_STATIC: 'false',
    })).toThrow('SERVE_STATIC cannot be disabled in production')
  })
})
