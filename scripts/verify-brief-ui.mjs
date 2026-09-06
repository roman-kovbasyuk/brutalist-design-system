// Real browser + real API, isolated PostgreSQL schema and mock provider only.
// PLAYWRIGHT_MODULE may point to a locally available Playwright installation.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { Pool } from 'pg'
import { createServer } from 'vite'
import { buildApp } from '../server/app.js'
import { runMigrations } from '../server/db/migrate.js'
import { createWorkflowService } from '../server/services/workflowService.js'
import { createWorkspaceService } from '../server/services/workspaceService.js'
import { createGenerationService } from '../server/services/generationService.js'
import { createGenerationControlPlane } from '../server/repositories/generationJobRepository.js'
import { createMockProvider } from '../server/providers/mockProvider.js'
import { studioTemplates } from '../shared/studioTemplates.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const schema = `brief_browser_${randomUUID().replaceAll('-', '')}`
const connectionString = process.env.TEST_DATABASE_URL || 'postgresql:///banner_studio_test'
const maintenance = new Pool({ connectionString })
await maintenance.query(`CREATE SCHEMA ${schema}`)
const pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
let app, vite, browser
try {
  await runMigrations({ pool })
  await pool.query('UPDATE settings SET daily_budget_microunits = 1000000, per_step_regeneration_limit = 20')
  const actor = { id: 'browser-editor', role: 'marketer', displayName: 'Test Marketer', email: 'browser@example.test' }
  await pool.query("INSERT INTO users (id,email,role,display_name) VALUES ($1,$2,$3,$4)", [actor.id, actor.email, actor.role, actor.displayName])
  const workflowService = createWorkflowService({ pool })
  for (const manifest of studioTemplates) await workflowService.createTemplateVersion({ actor: { ...actor, role: 'admin' },
    input: { id: manifest.id, name: manifest.name, version: manifest.version, manifest } })
  app = buildApp({ resolveActor: async () => actor, workflowService, workspaceService: createWorkspaceService({ pool }),
    generationService: createGenerationService({ pool, controlPlane: createGenerationControlPlane({ pool }), providers: { mock: createMockProvider() } }) })
  app.get('/api/v1/dev/session-info', async () => ({ demo: true }))
  await app.listen({ host: '127.0.0.1', port: 0 })
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, proxy: { '/api': `http://127.0.0.1:${app.server.address().port}` } } })
  await vite.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
  const errors = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.method() === 'POST') requests.push(request.url()) })
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/mvp/new`)
  await page.getByLabel('Campaign description').fill('Quiet autumn launch. Wireless headphones for commuters. Instagram, 1080 × 1080. A calm editorial campaign with 20% off until Sunday.')
  await page.getByRole('button', { name: 'Analyze brief', exact: true }).click()
  await page.getByRole('button', { name: 'Edit summary', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('.bs-visuals-module .v2-media-workflow-card').length > 0 || document.querySelectorAll('[aria-label="Copy option 1"]').length > 0)
  // Wait for both known text jobs, not a fixed delay.
  await page.waitForFunction(async () => {
    const id = location.pathname.split('/').at(-1)
    const response = await fetch(`/api/v1/campaigns/${id}/workspace`)
    const data = await response.json()
    return data.workspace?.directions?.length === 3 && data.workspace?.copies?.[0]?.candidates?.length === 5
  })
  assert.equal(new URL(page.url()).searchParams.get('module'), 'brief')
  const id = new URL(page.url()).pathname.split('/').at(-1)
  const read = () => createWorkspaceService({ pool }).getWorkspace({ actor, campaignId: id })
  assert.equal((await read()).copies[0].candidates.length, 5)
  assert.equal((await read()).directions.length, 3)
  await page.getByRole('button', { name: 'Edit audience', exact: true }).click()
  await page.getByRole('textbox', { name: 'Audience', exact: true }).fill('Designers and creative teams')
  await page.getByRole('textbox', { name: 'Audience', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Edit audience', exact: true }).waitFor()
  assert.equal((await read()).campaign.brief.analysis.audience, 'Designers and creative teams')
  await page.getByRole('textbox', { name: 'Refine brief', exact: true }).fill('Emphasize a quieter daily commute.')
  await page.getByRole('button', { name: 'Update brief', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[aria-label="Edit summary"]')?.textContent.includes('Emphasize a quieter daily commute.'))
  await page.reload()
  await page.getByRole('button', { name: 'Edit summary', exact: true }).waitFor()
  assert.equal((await read()).campaign.brief.analysis.audience, 'Designers and creative teams')
  assert.equal(requests.filter(url => url.includes('image-generations')).length, 0)
  assert.equal(requests.filter(url => url.includes('copy-generations')).length, 1)
  assert.equal(requests.filter(url => url.includes('direction-generations')).length, 1)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM assets')).rows[0].n, 0)
  await mkdir('.impeccable/review/brief', { recursive: true })
  for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 1000], ['user-2252', 2252, 1486]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `.impeccable/review/brief/${name}.png`, fullPage: true, animations: 'disabled' })
    await page.screenshot({ path: `.impeccable/review/brief/${name}-viewport.png`, animations: 'disabled' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} has horizontal overflow`)
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ verified: ['creation', 'automatic copy', 'prompt-only visuals', 'inline edit', 'refinement', 'reload persistence', 'no image generation', 'responsive layout'], screenshots: '.impeccable/review/brief' }))
} finally {
  await browser?.close()
  await vite?.close()
  await app?.close()
  await pool.end()
  await maintenance.query(`DROP SCHEMA ${schema} CASCADE`)
  await maintenance.end()
}
