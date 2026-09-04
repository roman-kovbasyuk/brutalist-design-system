import pg from 'pg'

const { Pool } = pg

export function createPool({ connectionString, ...options } = {}) {
  if (!connectionString) throw new Error('A PostgreSQL connection string is required')
  return new Pool({ connectionString, connectionTimeoutMillis: 5_000, ...options })
}

export async function withTransaction(pool, operation) {
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function' || typeof pool.release === 'function') {
    throw new TypeError('withTransaction requires a PostgreSQL pool')
  }
  if (typeof operation !== 'function') throw new TypeError('A transaction operation is required')

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export class TransactionDeadlineError extends Error {
  constructor() {
    super('Database transaction exceeded its deadline')
    this.name = 'TransactionDeadlineError'
    this.code = 'transaction_deadline_exceeded'
  }
}

export async function withDeadlineTransaction(pool, operation, { timeoutMs } = {}) {
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function' || typeof pool.release === 'function') {
    throw new TypeError('withDeadlineTransaction requires a PostgreSQL pool')
  }
  if (typeof operation !== 'function') throw new TypeError('A transaction operation is required')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('Transaction timeout must be a positive safe integer')

  const deadlineAt = Date.now() + timeoutMs
  const deadlineError = new TransactionDeadlineError()
  let client
  let released = false
  let timedOut = false
  let timer

  const release = (destroy = false) => {
    if (!client || released) return
    released = true
    try {
      if (destroy) client.release(true)
      else client.release()
    } catch {}
  }
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      release(true)
      reject(deadlineError)
    }, timeoutMs)
  })
  const withinDeadline = (operationAtPhase) => Promise.race([
    Promise.resolve().then(operationAtPhase),
    deadline,
  ])
  const connect = Promise.resolve().then(() => pool.connect()).then((acquired) => {
    if (timedOut) {
      try { acquired.release(true) } catch {}
      throw deadlineError
    }
    client = acquired
    return acquired
  })

  let began = false
  try {
    await Promise.race([connect, deadline])
    await withinDeadline(() => client.query('BEGIN'))
    began = true
    const result = await withinDeadline(() => operation(client, Object.freeze({
      deadlineAt: new Date(deadlineAt),
      remainingMs: () => Math.max(0, deadlineAt - Date.now()),
    })))
    await withinDeadline(() => client.query('COMMIT'))
    began = false
    release()
    return result
  } catch (error) {
    let failure = timedOut ? deadlineError : error
    if (began && !timedOut && !released) {
      try {
        await withinDeadline(() => client.query('ROLLBACK'))
        began = false
      } catch {
        if (timedOut) failure = deadlineError
        else release(true)
      }
    }
    if (!released) release(timedOut || began)
    throw failure
  } finally {
    clearTimeout(timer)
  }
}
