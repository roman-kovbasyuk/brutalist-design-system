import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { buildApp } from '../server/app.js'
import { createPool } from '../server/db/pool.js'
import { runMigrations } from '../server/db/migrate.js'
import { createWorkflowService } from '../server/services/workflowService.js'
import { createWorkspaceService } from '../server/services/workspaceService.js'
import { createGenerationService } from '../server/services/generationService.js'
import { createGenerationControlPlane } from '../server/repositories/generationJobRepository.js'
import { createLocalDemoAssetStore } from '../server/storage/localDemoAssetStore.js'
import { createMockProvider } from '../server/providers/mockProvider.js'
import { createAssetService } from '../server/services/assetService.js'
import { createVersionService } from '../server/services/versionService.js'
import { createReviewService } from '../server/services/reviewService.js'
import { createDeliveryService } from '../server/services/deliveryService.js'
import { AuthorizationError, unauthorized } from '../server/auth/authorize.js'

const databaseUrl = 'postgresql:///banner_studio_demo'
const roles = ['marketer', 'designer', 'admin']
const isLoopback = (value) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value)
function localUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password
  } catch { return false }
}

export async function startDemoServer({ port = 3010 } = {}) {
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) throw new Error('The local demo cannot run in production')
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('Invalid demo port')
  const maintenance = createPool({ connectionString: 'postgresql:///postgres' })
  try {
    const exists = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', ['banner_studio_demo'])
    if (!exists.rowCount) await maintenance.query('CREATE DATABASE banner_studio_demo')
  } finally { await maintenance.end() }
  const pool = createPool({ connectionString: databaseUrl })
  let app
  try {
    await runMigrations({ pool })
    for (const role of roles) {
      await pool.query(`INSERT INTO users (id, email, role, display_name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [`studio-demo-${role}`, `${role}@studio.local`, role, `Demo ${role[0].toUpperCase()}${role.slice(1)}`])
    }
    const workflowService = createWorkflowService({ pool })
    const admin = { id: 'studio-demo-admin', role: 'admin' }
    const settings = await workflowService.getSettings({ actor: admin })
    await workflowService.updateSettings({ actor: admin, expectedRevision: settings.revision, patch: {
      provider: 'mock', model: 'mock-v1', region: 'europe-west6', dailyBudgetMicrounits: 1_000_000_000,
      perStepRegenerationLimit: 20, generationDisabled: false,
    } })
    const { studioTemplates } = await import('../shared/studioTemplates.js')
    for (const manifest of studioTemplates) {
      const existing = await workflowService.getTemplateVersion({ actor: admin, templateId: manifest.id, version: manifest.version })
      if (!existing) await workflowService.createTemplateVersion({ actor: admin, input: { id: manifest.id, name: manifest.name, version: manifest.version, manifest } })
    }
    const assetStore = await createLocalDemoAssetStore({ directory: fileURLToPath(new URL('../.studio-demo-assets', import.meta.url)) })
    const mockProvider = createMockProvider()
    const sampleImage = await readFile(new URL('../src/studio/assets/headphones.png', import.meta.url))
    const demoProvider = {
      ...mockProvider,
      async generateImage(input, signal) {
        const result = await mockProvider.generateImage(input, signal)
        if (!result.image) return result
        const bytes = await sharp(sampleImage).resize(input.width, input.height, { fit: 'cover' }).png().toBuffer()
        signal.throwIfAborted()
        return { ...result, image: { ...result.image, bytes } }
      },
    }
    const resolveActor = async (request) => {
      const role = request.headers['x-studio-demo-role']
      if (!roles.includes(role)) throw unauthorized()
      const result = await pool.query('SELECT id, email, role, display_name, disabled, disabled_at FROM users WHERE id = $1', [`studio-demo-${role}`])
      const user = result.rows[0]
      return user && { id: user.id, email: user.email, role: user.role, displayName: user.display_name, disabled: user.disabled, disabledAt: user.disabled_at }
    }
    app = buildApp({
      resolveActor, workflowService, workspaceService: createWorkspaceService({ pool }),
      readiness: async () => { await pool.query('SELECT 1'); return true },
      generationService: createGenerationService({ pool, assetStore, controlPlane: createGenerationControlPlane({ pool }), providers: { mock: demoProvider } }),
      assetService: createAssetService({ pool, assetStore }), versionService: createVersionService({ pool, assetStore }),
      reviewService: createReviewService({ pool }), deliveryService: createDeliveryService({ pool, assetStore }),
    })
    // This guard and demo identity resolver exist only in this launcher. Firebase production startup is unchanged.
    app.addHook('onRequest', async (request) => {
      if (!isLoopback(request.socket.remoteAddress) || !localUrl(`http://${request.headers.host}`)
        || (request.headers.origin !== undefined && !localUrl(request.headers.origin))
        || request.headers['sec-fetch-site'] === 'cross-site') {
        throw new AuthorizationError(403, 'local_demo_only', 'The demo accepts local browser requests only')
      }
    })
    app.get('/api/v1/dev/session-info', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
      return { demo: true, roles, provider: 'mock', assets: 'local-files' }
    })
    await app.listen({ host: '127.0.0.1', port })
    const address = app.server.address()
    return { app, pool, url: `http://127.0.0.1:${address.port}`, close: async () => { await app.close(); await assetStore.close(); await pool.end() } }
  } catch (error) {
    await app?.close().catch(() => {})
    await pool.end()
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = await startDemoServer({ port: Number(process.env.STUDIO_DEMO_PORT ?? 3010) })
  console.log(`Studio demo API: ${runtime.url} (PostgreSQL: banner_studio_demo; mock provider; persistent local assets)`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await runtime.close(); process.exit(0) })
}
