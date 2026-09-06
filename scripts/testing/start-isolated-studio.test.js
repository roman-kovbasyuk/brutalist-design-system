import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { afterEach, describe, expect, test } from 'vitest'
import { createStudioApi } from '../../src/studio/api.js'
import { startIsolatedStudio } from './start-isolated-studio.mjs'

const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
const runtimes = []

afterEach(async () => {
  await Promise.allSettled(runtimes.splice(0).map((runtime) => runtime.close()))
})

function api(runtime, role = 'marketer') {
  return createStudioApi({
    baseUrl: runtime.url,
    getHeaders: () => ({ 'X-Studio-Demo-Role': role }),
  })
}

async function schemaExists(pool, schema) {
  const result = await pool.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema])
  return result.rowCount === 1
}

describe('startIsolatedStudio', () => {
  test('rejects unsafe database targets before startup', async () => {
    await expect(startIsolatedStudio({ connectionString: 'postgresql:///banner_studio_demo' })).rejects.toThrow(/demo database/i)
    await expect(startIsolatedStudio({ connectionString: 'postgresql://db.example.com/banner_studio_test' })).rejects.toThrow(/loopback/i)
    await expect(startIsolatedStudio({ connectionString: 'postgresql:///banner_studio_test?host=db.example.com' })).rejects.toThrow(/loopback/i)
  })

  test('rejects a remote PGHOST before an empty-host URL can connect', async () => {
    const previous = process.env.PGHOST
    process.env.PGHOST = 'db.example.com'
    try {
      await expect(startIsolatedStudio({ connectionString: 'postgresql:///banner_studio_test' })).rejects.toThrow(/loopback/i)
    } finally {
      if (previous === undefined) delete process.env.PGHOST
      else process.env.PGHOST = previous
    }
  })

  test('removes its temporary directory when database startup fails without inspecting unrelated runtimes', async () => {
    const database = `missing_isolated_${randomUUID().replaceAll('-', '')}`
    const originalTmpdir = tmpdir()
    const isolatedTmpdir = await mkdtemp(join(originalTmpdir, 'isolated-studio-test-parent-'))
    const unrelated = await mkdtemp(join(originalTmpdir, 'campaign-modules-test-unrelated-'))
    const previousTmpdir = process.env.TMPDIR
    const maintenance = new Pool({ connectionString })
    process.env.TMPDIR = isolatedTmpdir
    try {
      expect((await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount).toBe(0)
      await expect(startIsolatedStudio({ connectionString: `postgresql:///${database}` })).rejects.toBeTruthy()
      expect((await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount).toBe(0)
      expect(await readdir(isolatedTmpdir)).toEqual([])
    } finally {
      if (previousTmpdir === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previousTmpdir
      await maintenance.end()
      await rm(unrelated, { recursive: true })
      await rm(isolatedTmpdir, { recursive: true })
    }
  })

  test('isolates campaigns and removes only each runtime schema and asset directory', async () => {
    const maintenance = new Pool({ connectionString })
    let first
    let second
    try {
      first = await startIsolatedStudio({ connectionString })
      runtimes.push(first)
      second = await startIsolatedStudio({ connectionString })
      runtimes.push(second)

      expect(first.schema).toMatch(/^campaign_modules_test_[0-9a-f]{32}$/)
      expect(second.schema).toMatch(/^campaign_modules_test_[0-9a-f]{32}$/)
      expect(first.schema).not.toBe(second.schema)
      expect(await schemaExists(maintenance, first.schema)).toBe(true)
      expect(await schemaExists(maintenance, second.schema)).toBe(true)

      const created = await api(first).createCampaign({
        title: 'Isolated campaign',
        brief: { product: 'Studio', audience: 'teams', objective: 'Test isolation', offer: 'Trial', locale: 'en', notes: '' },
      })
      await expect(api(second).getWorkspace(created.id)).rejects.toMatchObject({ status: 404 })

      expect((await fetch(`${first.url}/api/v1/campaigns`)).status).toBe(401)
      expect((await fetch(`${first.url}/api/v1/dev/session-info`, { headers: { Origin: 'https://example.com' } })).status).toBe(403)
      expect((await fetch(`${first.url}/api/v1/dev/session-info`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)

      await first.close()
      runtimes.splice(runtimes.indexOf(first), 1)
      expect(await schemaExists(maintenance, first.schema)).toBe(false)
      expect(await schemaExists(maintenance, second.schema)).toBe(true)
      await expect(access(first.assetDirectory)).rejects.toMatchObject({ code: 'ENOENT' })

      await second.close()
      runtimes.splice(runtimes.indexOf(second), 1)
      expect(await schemaExists(maintenance, second.schema)).toBe(false)
      await expect(access(second.assetDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await maintenance.end()
    }
  }, 60_000)
})
