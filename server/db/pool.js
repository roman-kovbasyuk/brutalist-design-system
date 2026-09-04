import pg from 'pg'

const { Pool } = pg

export function createPool({ connectionString, ...options } = {}) {
  if (!connectionString) throw new Error('A PostgreSQL connection string is required')
  return new Pool({ connectionString, ...options })
}

export async function withTransaction(clientOrPool, operation) {
  if (!clientOrPool || typeof clientOrPool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool or client is required')
  }
  if (typeof operation !== 'function') throw new TypeError('A transaction operation is required')

  const client = typeof clientOrPool.connect === 'function'
    ? await clientOrPool.connect()
    : clientOrPool
  const release = typeof client.release === 'function' ? () => client.release() : () => {}

  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    release()
  }
}
