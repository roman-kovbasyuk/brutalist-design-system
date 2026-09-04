import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool } from './pool.js'

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
const migrationLockId = 4_249_733_141

async function loadMigrations(directory) {
  const names = (await readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right))

  return Promise.all(names.map(async (name) => {
    const sql = await readFile(join(directory, name), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    return { name, sql, checksum }
  }))
}

export async function runMigrations({ pool, directory = migrationsDirectory } = {}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('runMigrations requires an injected PostgreSQL pool')
  }

  const migrations = await loadMigrations(directory)
  const client = await pool.connect()
  const applied = []

  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    for (const migration of migrations) {
      const tracked = await client.query(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [migration.name],
      )
      if (tracked.rowCount > 0) {
        if (tracked.rows[0].checksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch for ${migration.name}`)
        }
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [migration.name, migration.checksum],
        )
        await client.query('COMMIT')
        applied.push(migration.name)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]).catch(() => {})
    client.release()
  }

  return { applied }
}

async function main() {
  const pool = createPool({ connectionString: process.env.DATABASE_URL })
  try {
    const result = await runMigrations({ pool })
    process.stdout.write(`${result.applied.length === 0 ? 'No migrations applied' : `Applied ${result.applied.join(', ')}`}\n`)
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
