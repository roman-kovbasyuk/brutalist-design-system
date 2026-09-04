import pg from 'pg'

const { Pool } = pg

export function createPool({ connectionString, ...options } = {}) {
  if (!connectionString) throw new Error('A PostgreSQL connection string is required')
  return new Pool({ connectionString, ...options })
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
