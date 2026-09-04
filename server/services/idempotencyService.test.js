import { describe, expect, test, vi } from 'vitest'
import { createIdempotencyService } from './idempotencyService.js'
import { hashCanonical } from '../../shared/canonicalJson.js'

function memoryRepository() {
  const records = new Map()
  const scopeKey = ({ actorId, method, resourceId, key }) => `${actorId}|${method.toUpperCase()}|${resourceId}|${key}`
  return {
    records,
    async claim(input) {
      const scope = scopeKey(input)
      const record = records.get(scope)
      if (!record) {
        records.set(scope, { fingerprint: input.fingerprint, ownerToken: input.ownerToken, state: 'in_progress', leaseExpiresAt: input.leaseExpiresAt })
        return { kind: 'owner' }
      }
      if (record.fingerprint !== input.fingerprint) return { kind: 'conflict' }
      if (record.state === 'completed') return { kind: 'replay', responseStatus: record.responseStatus, responseBody: record.responseBody }
      if (record.state === 'failed' || record.leaseExpiresAt <= input.now) {
        records.set(scope, { fingerprint: input.fingerprint, ownerToken: input.ownerToken, state: 'in_progress', leaseExpiresAt: input.leaseExpiresAt })
        return { kind: 'owner' }
      }
      return { kind: 'in_progress' }
    },
    async lockOwner(input) {
      const record = records.get(scopeKey(input))
      if (record?.ownerToken !== input.ownerToken || record.fingerprint !== input.fingerprint || record.state !== 'in_progress' || record.leaseExpiresAt <= input.now) return null
      return { ...record }
    },
    async complete(input) {
      const scope = scopeKey(input)
      const record = records.get(scope)
      if (record?.ownerToken !== input.ownerToken || record.state !== 'in_progress') throw new Error('not owner')
      Object.assign(record, { state: 'completed', responseStatus: input.responseStatus, responseBody: input.responseBody })
    },
    async fail(input) {
      const scope = scopeKey(input)
      const record = records.get(scope)
      if (record?.ownerToken !== input.ownerToken || record.state !== 'in_progress') throw new Error('not owner')
      Object.assign(record, { state: 'failed' })
    },
    async find(input) {
      const record = records.get(scopeKey(input))
      return record ? { ...record } : null
    },
  }
}

function makeService(repository, options = {}) {
  const pool = { query: vi.fn() }
  return createIdempotencyService({
    pool,
    repositoryFactory: () => repository,
    transaction: async (_pool, operation) => operation({ query: vi.fn() }),
    ...options,
  })
}

const scope = { actorId: 'actor-1', method: 'POST', resourceId: 'campaign-1' }

describe('idempotency service', () => {
  test('requires a bounded non-whitespace idempotency key', async () => {
    const service = makeService(memoryRepository())
    const operation = vi.fn()

    for (const key of [undefined, '', ' ', 'has whitespace', 'x'.repeat(256)]) {
      await expect(service.executeDatabaseCommand({ ...scope, key, payload: {}, operation }))
        .rejects.toMatchObject({ statusCode: 400, code: 'invalid_idempotency_key', expose: true })
    }
    expect(operation).not.toHaveBeenCalled()
  })

  test('claims ownership, persists the result, and replays canonically equivalent payloads', async () => {
    const repository = memoryRepository()
    const operation = vi.fn(async () => ({ status: 201, body: { id: 'version-1' } }))
    const service = makeService(repository, { idGenerator: () => 'owner-1' })

    const first = await service.executeDatabaseCommand({ ...scope, key: 'retry-1', payload: { b: 2, a: 1 }, operation })
    const replay = await service.executeDatabaseCommand({ ...scope, key: 'retry-1', payload: { a: 1, b: 2 }, operation })

    expect(first).toEqual({ status: 201, body: { id: 'version-1' }, replayed: false })
    expect(replay).toEqual({ status: 201, body: { id: 'version-1' }, replayed: true })
    expect(operation).toHaveBeenCalledOnce()
  })

  test('returns 409 when a scoped key is reused with a changed payload', async () => {
    const service = makeService(memoryRepository())
    await service.executeDatabaseCommand({ ...scope, key: 'retry-2', payload: { selection: 'a' }, operation: async () => ({ status: 200, body: { ok: true } }) })

    await expect(service.executeDatabaseCommand({ ...scope, key: 'retry-2', payload: { selection: 'b' }, operation: vi.fn() }))
      .rejects.toMatchObject({ statusCode: 409, code: 'idempotency_conflict', expose: true })
  })

  test('waits for the persisted owner result and replays it to a concurrent caller', async () => {
    const repository = memoryRepository()
    const waiters = []
    let releaseOperation
    const operationGate = new Promise((resolve) => { releaseOperation = resolve })
    const wait = vi.fn(() => new Promise((resolve) => waiters.push(resolve)))
    let ownerNumber = 0
    const service = makeService(repository, { idGenerator: () => `owner-${++ownerNumber}`, wait, timeoutMs: 1_000 })
    const operation = vi.fn(async () => { await operationGate; return { status: 202, body: { accepted: true } } })

    const owner = service.executeDatabaseCommand({ ...scope, key: 'retry-3', payload: { action: 'render' }, operation })
    await Promise.resolve()
    const concurrent = service.executeDatabaseCommand({ ...scope, key: 'retry-3', payload: { action: 'render' }, operation })
    await Promise.resolve()
    releaseOperation()
    const ownerResult = await owner
    await Promise.resolve()
    waiters.splice(0).forEach((resolve) => resolve())
    const concurrentResult = await concurrent

    expect(ownerResult.replayed).toBe(false)
    expect(concurrentResult).toEqual({ ...ownerResult, replayed: true })
    expect(wait).toHaveBeenCalled()
    expect(operation).toHaveBeenCalledOnce()
  })

  test('marks owner failures retriable so the same request can deterministically take ownership again', async () => {
    const repository = memoryRepository()
    let ownerNumber = 0
    const service = makeService(repository, { idGenerator: () => `owner-${++ownerNumber}` })
    const failure = new Error('provider failed')

    await expect(service.executeDatabaseCommand({ ...scope, key: 'retry-4', payload: {}, operation: async () => { throw failure } }))
      .rejects.toBe(failure)
    const record = [...repository.records.values()][0]
    expect(record.state).toBe('failed')

    const retried = await service.executeDatabaseCommand({ ...scope, key: 'retry-4', payload: {}, operation: async () => ({ status: 200, body: { recovered: true } }) })
    expect(retried).toEqual({ status: 200, body: { recovered: true }, replayed: false })
  })

  test('bounds concurrent polling with the injected clock and wait', async () => {
    const repository = memoryRepository()
    await repository.claim({ ...scope, key: 'retry-5', fingerprint: hashCanonical({}), ownerToken: 'other', now: new Date(0), leaseExpiresAt: new Date(1_000) })
    let now = 0
    const service = makeService(repository, {
      clock: () => new Date(now),
      wait: async (duration) => { now += duration },
      pollIntervalMs: 10,
      timeoutMs: 25,
    })

    await expect(service.executeDatabaseCommand({ ...scope, key: 'retry-5', payload: {}, operation: vi.fn() }))
      .rejects.toMatchObject({ statusCode: 409, code: 'idempotency_in_progress' })
  })
})
