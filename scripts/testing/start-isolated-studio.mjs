import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildApp } from '../../server/app.js'
import { AuthorizationError, unauthorized } from '../../server/auth/authorize.js'
import { runMigrations } from '../../server/db/migrate.js'
import { createPool } from '../../server/db/pool.js'
import { createMockProvider } from '../../server/providers/mockProvider.js'
import { createGenerationControlPlane } from '../../server/repositories/generationJobRepository.js'
import { createAssetService } from '../../server/services/assetService.js'
import { createDeliveryService } from '../../server/services/deliveryService.js'
import { createGenerationService } from '../../server/services/generationService.js'
import { createReviewService } from '../../server/services/reviewService.js'
import { createVersionService } from '../../server/services/versionService.js'
import { createVisualUploadService } from '../../server/services/visualUploadService.js'
import { createWorkflowService } from '../../server/services/workflowService.js'
import { createWorkspaceService } from '../../server/services/workspaceService.js'
import { createLocalDemoAssetStore } from '../../server/storage/localDemoAssetStore.js'

const defaultConnectionString = 'postgresql:///banner_studio_test'
const roles = ['marketer', 'designer', 'admin']
const safeSchema = /^campaign_modules_test_[0-9a-f]{32}$/
const connectionOverrides = new Set(['database', 'dbname', 'host', 'hostaddr', 'options', 'port', 'service'])
const loopbackHosts = new Set(['', 'localhost', '127.0.0.1', '[::1]'])
const isLoopbackAddress = (value) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value)
const isLoopbackDatabaseHost = (value) => loopbackHosts.has(value) || value === '::1' || value.startsWith('/')

function localHttpUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && !url.username && !url.password
  } catch { return false }
}

function validateConnectionString(value) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('A PostgreSQL test connection string is required')
  let url
  try { url = new URL(value) } catch { throw new TypeError('A valid PostgreSQL test connection string is required') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new TypeError('A PostgreSQL test connection string is required')
  if (!isLoopbackDatabaseHost(url.hostname)) throw new Error('The isolated studio database host must be loopback')
  if (url.hostname === '' && process.env.PGHOST && !isLoopbackDatabaseHost(process.env.PGHOST)) {
    throw new Error('The isolated studio database host must be loopback')
  }
  for (const key of connectionOverrides) {
    if (url.searchParams.has(key)) throw new Error('The isolated studio database host must be loopback without connection overrides')
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!database) throw new Error('The isolated studio requires a named test database')
  if (database === 'banner_studio_demo') throw new Error('The isolated studio cannot use the demo database')
  return value
}

function assertOwnedSchema(schema) {
  if (!safeSchema.test(schema)) throw new Error('Unsafe isolated schema name')
}

function assertOwnedAssetDirectory(directory) {
  if (dirname(directory) !== tmpdir() || !/^campaign-modules-test-[0-9a-f]{32}-/.test(basename(directory))) {
    throw new Error('Unsafe isolated asset directory')
  }
}

export async function startIsolatedStudio({ connectionString = process.env.TEST_DATABASE_URL ?? defaultConnectionString } = {}) {
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) throw new Error('The isolated studio cannot run in production')
  validateConnectionString(connectionString)
  const id = randomUUID().replaceAll('-', '')
  const schema = `campaign_modules_test_${id}`
  assertOwnedSchema(schema)
  const assetDirectory = await mkdtemp(join(tmpdir(), `campaign-modules-test-${id}-`))
  assertOwnedAssetDirectory(assetDirectory)
  let maintenance
  let pool
  let assetStore
  let app
  let schemaCreated = false
  let closed = false

  async function cleanup({ suppressErrors = false } = {}) {
    if (closed) return
    closed = true
    const failures = []
    const attempt = async (operation) => { try { await operation() } catch (error) { failures.push(error) } }
    await attempt(async () => app?.close())
    await attempt(async () => assetStore?.close?.())
    await attempt(async () => pool?.end())
    if (schemaCreated) await attempt(async () => {
      assertOwnedSchema(schema)
      await maintenance?.query(`DROP SCHEMA ${schema} CASCADE`)
    })
    await attempt(async () => maintenance?.end())
    await attempt(async () => {
      assertOwnedAssetDirectory(assetDirectory)
      await rm(assetDirectory, { recursive: true, force: false })
    })
    if (!suppressErrors && failures.length) throw new AggregateError(failures, 'Failed to close isolated studio resources')
  }

  try {
    maintenance = createPool({ connectionString })
    await maintenance.query(`CREATE SCHEMA ${schema}`)
    schemaCreated = true
    pool = createPool({ connectionString, options: `-c search_path=${schema}` })
    await runMigrations({ pool })
    const actors = Object.fromEntries(roles.map((role) => [role, {
      id: `studio-demo-${role}`, email: `${role}@studio.local`, role,
      displayName: `Demo ${role[0].toUpperCase()}${role.slice(1)}`,
    }]))
    for (const actor of Object.values(actors)) {
      await pool.query('INSERT INTO users (id, email, role, display_name) VALUES ($1, $2, $3, $4)',
        [actor.id, actor.email, actor.role, actor.displayName])
    }
    const workflowService = createWorkflowService({ pool })
    const settings = await workflowService.getSettings({ actor: actors.admin })
    await workflowService.updateSettings({ actor: actors.admin, expectedRevision: settings.revision, patch: {
      provider: 'mock', model: 'mock-v1', region: 'europe-west6', dailyBudgetMicrounits: 1_000_000_000,
      perStepRegenerationLimit: 100, generationDisabled: false,
    } })
    const { legacyStudioTemplates, taggedStudioTemplates, studioTemplates } = await import('../../shared/studioTemplates.js')
    for (const manifest of [...legacyStudioTemplates, ...taggedStudioTemplates, ...studioTemplates]) {
      await workflowService.createTemplateVersion({
        actor: actors.admin, input: { id: manifest.id, name: manifest.name, version: manifest.version, manifest },
      })
    }
    assetStore = await createLocalDemoAssetStore({ directory: assetDirectory })
    const resolveActor = async (request) => {
      const role = request.headers['x-studio-demo-role']
      if (!roles.includes(role)) throw unauthorized()
      const result = await pool.query(
        'SELECT id, email, role, display_name, disabled, disabled_at FROM users WHERE id = $1', [`studio-demo-${role}`],
      )
      const user = result.rows[0]
      return user && { id: user.id, email: user.email, role: user.role, displayName: user.display_name, disabled: user.disabled, disabledAt: user.disabled_at }
    }
    app = buildApp({
      resolveActor, workflowService, workspaceService: createWorkspaceService({ pool }),
      readiness: async () => { await pool.query('SELECT 1'); return true },
      generationService: createGenerationService({
        pool, assetStore, controlPlane: createGenerationControlPlane({ pool }), providers: { mock: createMockProvider() },
      }),
      assetService: createAssetService({ pool, assetStore }),
      visualUploadService: createVisualUploadService({ pool, assetStore }),
      versionService: createVersionService({ pool, assetStore }),
      reviewService: createReviewService({ pool }), deliveryService: createDeliveryService({ pool, assetStore }),
    })
    app.addHook('onRequest', async (request) => {
      if (!isLoopbackAddress(request.socket.remoteAddress) || !localHttpUrl(`http://${request.headers.host}`)
        || (request.headers.origin !== undefined && !localHttpUrl(request.headers.origin))
        || request.headers['sec-fetch-site'] === 'cross-site') {
        throw new AuthorizationError(403, 'local_demo_only', 'The isolated studio accepts local browser requests only')
      }
    })
    app.get('/api/v1/dev/session-info', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
      return { demo: true, roles, provider: 'mock', assets: 'temporary-local-files' }
    })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const address = app.server.address()
    return Object.freeze({ url: `http://127.0.0.1:${address.port}`, schema, assetDirectory, close: () => cleanup() })
  } catch (error) {
    await cleanup({ suppressErrors: true })
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = await startIsolatedStudio()
  console.log(`Isolated Studio API: ${runtime.url}`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await runtime.close(); process.exit(0) })
}
