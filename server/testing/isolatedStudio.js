import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { createWorkflowService } from '../services/workflowService.js'
import { createWorkspaceService } from '../services/workspaceService.js'
import { createGenerationService } from '../services/generationService.js'
import { createAssetService } from '../services/assetService.js'
import { createVisualUploadService } from '../services/visualUploadService.js'
import { createVersionService } from '../services/versionService.js'
import { createReviewService } from '../services/reviewService.js'
import { createDeliveryService } from '../services/deliveryService.js'
import { createGenerationControlPlane } from '../repositories/generationJobRepository.js'
import { createMockProvider } from '../providers/mockProvider.js'
import { createMemoryAssetStore } from '../storage/memoryAssetStore.js'
import { createStudioApi } from '../../src/studio/api.js'
import { studioTemplates } from '../../shared/studioTemplates.js'

const roles = ['marketer', 'designer', 'admin']

export async function createIsolatedStudio() {
  const schema = `runtime_flow_${randomUUID().replaceAll('-', '')}`
  if (!/^runtime_flow_[0-9a-f]{32}$/.test(schema)) throw new Error('Unsafe isolated schema name')
  const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
  const maintenance = new Pool({ connectionString })
  let pool, app, assetStore, closed = false
  try {
    await maintenance.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
    await runMigrations({ pool })
    await pool.query('UPDATE settings SET daily_budget_microunits=10000000, per_step_regeneration_limit=100')
    const actors = Object.fromEntries(roles.map(role => [role, {
      id: `runtime-${role}`, role, displayName: `Runtime ${role}`, email: `${role}@runtime.test`,
    }]))
    for (const value of Object.values(actors)) {
      await pool.query('INSERT INTO users (id,email,role,display_name) VALUES ($1,$2,$3,$4)',
        [value.id, value.email, value.role, value.displayName])
    }
    const workflowService = createWorkflowService({ pool })
    for (const manifest of studioTemplates) await workflowService.createTemplateVersion({
      actor: actors.admin, input: { id: manifest.id, name: manifest.name, version: manifest.version, manifest },
    })
    assetStore = createMemoryAssetStore()
    const workspaceService = createWorkspaceService({ pool })
    const generationService = createGenerationService({ pool, assetStore,
      controlPlane: createGenerationControlPlane({ pool }), providers: { mock: createMockProvider() } })
    app = buildApp({
      readiness: async () => { await pool.query('SELECT 1'); return true },
      resolveActor: async request => actors[request.headers['x-test-studio-role']] ?? null,
      workflowService, workspaceService, generationService,
      assetService: createAssetService({ pool, assetStore }),
      visualUploadService: createVisualUploadService({ pool, assetStore }),
      versionService: createVersionService({ pool, assetStore }),
      reviewService: createReviewService({ pool }),
      deliveryService: createDeliveryService({ pool, assetStore }),
    })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const url = `http://127.0.0.1:${app.server.address().port}`
    return {
      pool, url,
      actor(role) { if (!actors[role]) throw new TypeError(`Unknown test role: ${role}`); return structuredClone(actors[role]) },
      api(role) {
        if (!actors[role]) throw new TypeError(`Unknown test role: ${role}`)
        return createStudioApi({ baseUrl: url, getHeaders: () => ({ 'X-Test-Studio-Role': role }) })
      },
      async close() {
        if (closed) return
        closed = true
        const failures = []
        for (const operation of [() => app.close(), () => assetStore.close?.(), () => pool.end()]) {
          try { await operation() } catch (error) { failures.push(error) }
        }
        try { await maintenance.query(`DROP SCHEMA ${schema} CASCADE`) } catch (error) { failures.push(error) }
        try { await maintenance.end() } catch (error) { failures.push(error) }
        if (failures.length) throw failures[0]
      },
    }
  } catch (error) {
    await app?.close().catch(() => {})
    await assetStore?.close?.().catch(() => {})
    await pool?.end().catch(() => {})
    await maintenance.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
    await maintenance.end().catch(() => {})
    throw error
  }
}
