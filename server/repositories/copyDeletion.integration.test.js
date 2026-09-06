import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { expect, test } from 'vitest'
import { runMigrations } from '../db/migrate.js'
import { createCampaignRepository } from './campaignRepository.js'
import { createGenerationControlPlane } from './generationJobRepository.js'
import { createWorkspaceService } from '../services/workspaceService.js'

test('copy deletion persists without rewriting generation history and resets selected copy', async () => {
  const schema = `copy_delete_test_${randomUUID().replaceAll('-', '')}`
  const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
  const maintenance = new Pool({ connectionString })
  await maintenance.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
  try {
    await runMigrations({ pool })
    const actor = { id: 'test-marketer', role: 'marketer' }
    await pool.query("INSERT INTO users (id, email, role, display_name) VALUES ($1, 'copy@example.test', 'marketer', 'Copy test')", [actor.id])
    const brief = { product: 'Studio', audience: 'Designers', objective: 'Trial', offer: '', locale: 'en', notes: '' }
    const campaign = await createCampaignRepository(pool).create({ id: 'campaign', title: 'Copy deletion test', brief, createdBy: actor.id })
    const candidates = [1, 2].map((n) => ({ id: `copy-${n}`, headline: `Headline ${n}`, body: 'Short copy', cta: 'Try it', offer: '', visualPrompt: 'A quiet studio' }))
    await pool.query('INSERT INTO copy_sets (id, campaign_id, candidates) VALUES ($1, $2, $3)', ['copy-set', campaign.id, JSON.stringify(candidates)])
    const control = createGenerationControlPlane({ pool })
    const workspace = createWorkspaceService({ pool })
    const remove = (copyId, expectedRevision) => control.deleteCopy({ actor, campaignId: campaign.id, expectedRevision, input: { copyId } })

    await expect(remove('copy-1', 9)).rejects.toMatchObject({ code: 'revision_conflict' })
    await expect(remove('unknown', 0)).rejects.toMatchObject({ code: 'copy_not_found' })
    const deleted = await remove('copy-2', 0)
    expect(deleted.revision).toBe(1)
    expect((await workspace.getWorkspace({ actor, campaignId: campaign.id })).copies[0].candidates.map(c => c.id)).toEqual(['copy-1'])
    await expect(control.selectCopy({ actor, campaignId: campaign.id, expectedRevision: 1, input: { copyId: 'copy-2' } })).rejects.toMatchObject({ code: 'copy_not_found' })
    const selected = await control.selectCopy({ actor, campaignId: campaign.id, expectedRevision: 1, input: { copyId: 'copy-1' } })
    expect(selected.status).toBe('copy_ready')
    const cleared = await remove('copy-1', selected.revision)
    expect(cleared).toMatchObject({ status: 'draft', selectedCopyId: null, selectedDirectionId: null, compositionId: null })
    const reloaded = await workspace.getWorkspace({ actor, campaignId: campaign.id })
    expect(reloaded.copies[0].candidates).toEqual([])
    expect(reloaded.copies[0].selectedCandidateId).toBeNull()
    expect((await pool.query('SELECT candidates FROM copy_sets')).rows[0].candidates).toEqual(candidates)
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE action = 'campaign.copy_deleted'")).rows[0].count).toBe(2)
  } finally {
    await pool.end()
    await maintenance.query(`DROP SCHEMA ${schema} CASCADE`)
    await maintenance.end()
  }
}, 30000)
