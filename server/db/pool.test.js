import { describe, expect, test, vi } from 'vitest'
import * as poolModule from './pool.js'

const withDeadlineTransaction = poolModule.withDeadlineTransaction
const never = () => new Promise(() => {})

function fakePool(clientOrPromise) {
  return {
    connect: vi.fn(() => Promise.resolve(clientOrPromise)),
    query: vi.fn(),
  }
}

function fakeClient(query = async () => ({ rows: [], rowCount: 0 })) {
  return { query: vi.fn(query), release: vi.fn() }
}

test('production pools have a finite checkout timeout by default', async () => {
  const pool = poolModule.createPool({ connectionString: 'postgresql:///not_connected' })

  expect(pool.options.connectionTimeoutMillis).toBe(5_000)
  await pool.end()
})

describe('deadline-bounded database transactions', () => {
  test('commits and releases once when every phase completes before the absolute deadline', async () => {
    const client = fakeClient()
    const operation = vi.fn(async () => 'committed')

    await expect(withDeadlineTransaction(fakePool(client), operation, { timeoutMs: 50 }))
      .resolves.toBe('committed')
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT'])
    expect(client.release).toHaveBeenCalledOnce()
    expect(client.release).toHaveBeenCalledWith()
  })

  test('times out pool checkout and destroys a client delivered after the caller has returned', async () => {
    let deliverClient
    const pool = fakePool(new Promise((resolve) => { deliverClient = resolve }))
    const client = fakeClient()
    const operation = vi.fn()

    await expect(withDeadlineTransaction(pool, operation, { timeoutMs: 15 }))
      .rejects.toMatchObject({ code: 'transaction_deadline_exceeded' })
    deliverClient(client)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(operation).not.toHaveBeenCalled()
    expect(client.release).toHaveBeenCalledOnce()
    expect(client.release).toHaveBeenCalledWith(true)
  })

  test.each([
    ['BEGIN', (client) => {
      client.query.mockImplementation((sql) => sql === 'BEGIN' ? never() : Promise.resolve())
      return async () => 'unused'
    }],
    ['body', () => async () => never()],
    ['COMMIT', (client) => {
      client.query.mockImplementation((sql) => sql === 'COMMIT' ? never() : Promise.resolve())
      return async () => 'unused'
    }],
    ['ROLLBACK', (client) => {
      client.query.mockImplementation((sql) => sql === 'ROLLBACK' ? never() : Promise.resolve())
      return async () => { throw new Error('operation failed') }
    }],
  ])('destroys the checked-out client when %s stalls past the shared deadline', async (_phase, arrange) => {
    const client = fakeClient()
    const operation = arrange(client)

    await expect(withDeadlineTransaction(fakePool(client), operation, { timeoutMs: 15 }))
      .rejects.toMatchObject({ code: 'transaction_deadline_exceeded' })
    expect(client.release).toHaveBeenCalledOnce()
    expect(client.release).toHaveBeenCalledWith(true)
  })

  test('preserves an operation failure when bounded rollback succeeds', async () => {
    const client = fakeClient()
    const failure = new Error('operation failed')

    await expect(withDeadlineTransaction(fakePool(client), async () => { throw failure }, { timeoutMs: 50 }))
      .rejects.toBe(failure)
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK'])
    expect(client.release).toHaveBeenCalledOnce()
    expect(client.release).toHaveBeenCalledWith()
  })
})
