import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { runMigrations } from '../db/migrate.js'
import { createCampaignRepository } from '../repositories/campaignRepository.js'
import { createTemplateRepository } from '../repositories/templateRepository.js'
import { createGenerationControlPlane } from '../repositories/generationJobRepository.js'
import { createGenerationService } from './generationService.js'
import { createVisualUploadService } from './visualUploadService.js'
import { createVersionService } from './versionService.js'
import { createWorkspaceService } from './workspaceService.js'
import { createMockProvider } from '../providers/mockProvider.js'
import { createMemoryAssetStore } from '../storage/memoryAssetStore.js'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'
import { hashCanonical } from '../../shared/canonicalJson.js'

test.each(['campaign', 'selected_copy', 'ready_upload', 'prompt_upload', 'partial_copy', 'legacy_selection'])(
  '%s visuals remain verifiable through Banners and immutable review', async mode => {
    const schema = `visual_version_${randomUUID().replaceAll('-', '')}`
    const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
    const maintenance = new Pool({ connectionString })
    await maintenance.query(`CREATE SCHEMA ${schema}`)
    const pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
    try {
      await runMigrations({ pool })
      await pool.query('UPDATE settings SET daily_budget_microunits=10000000, per_step_regeneration_limit=100')
      const actor = { id: 'marketer', role: 'marketer' }
      await pool.query("INSERT INTO users (id,email,role,display_name) VALUES ('marketer','visual@example.test','marketer','Visual test')")
      await createCampaignRepository(pool).create({ id: 'campaign', title: 'Launch', createdBy: actor.id,
        brief: { product: 'Headphones', audience: 'Commuters', objective: 'Shop', offer: '', locale: 'en', notes: '' } })
      await createTemplateRepository(pool).createVersion({ ...pilotTemplateFixture, manifest: pilotTemplateFixture,
        manifestHash: hashCanonical(pilotTemplateFixture), createdBy: actor.id })
      const assetStore = createMemoryAssetStore()
      const generation = createGenerationService({ pool, assetStore, controlPlane: createGenerationControlPlane({ pool }), providers: { mock: createMockProvider() } })
      const upload = createVisualUploadService({ pool, assetStore })
      const versions = createVersionService({ pool, assetStore })
      const read = () => createWorkspaceService({ pool }).getWorkspace({ actor, campaignId: 'campaign' })
      const common = { actor, campaignId: 'campaign' }
      await generation.analyseBrief({ ...common, input: {}, idempotencyKey: 'brief' })
      await generation.generateCopy({ ...common, input: {}, idempotencyKey: 'copy' })
      if (mode === 'partial_copy') {
        for (let batch = 1; batch < 6; batch++) await generation.generateCopy({ ...common, input: {}, idempotencyKey: `copy-${batch}` })
        const firstTwo = (await read()).copies[0].candidates.slice(0, 2)
        for (const candidate of firstTwo) await generation.deleteCopy({ ...common, expectedRevision: (await read()).campaign.revision, input: { copyId: candidate.id } })
        const finalBatch = await generation.generateCopy({ ...common, input: {}, idempotencyKey: 'partial-copy' })
        expect(finalBatch.body.job.result.copies).toHaveLength(2)
        const stored = (await pool.query("SELECT input_snapshot FROM generation_jobs WHERE idempotency_key='partial-copy'")).rows[0]
        expect(stored.input_snapshot.copySlots).toBe(2)
      }
      const copy = (await read()).copies.at(-1).candidates[0]
      await generation.approveCopy({ ...common, expectedRevision: (await read()).campaign.revision, input: { copyId: copy.id } })
      if (mode === 'legacy_selection') {
        // A reopened historical campaign keeps its legacy selected candidate even
        // though migration 024 deliberately did not rewrite its locked approvals.
        await pool.query("UPDATE copy_sets SET approved_candidate_ids='[]'")
        expect((await read()).copies[0].approvedCandidateIds).toContain(copy.id)
      }
      let directionId
      if (mode !== 'ready_upload') {
        await generation.generateDirections({ ...common, idempotencyKey: 'directions',
          input: ['selected_copy', 'legacy_selection'].includes(mode) ? { mode: 'selected_copy', copyIds: [copy.id] } : { mode: 'campaign' } })
        directionId = (await read()).directions[0].id
      }
      if (mode.endsWith('upload')) {
        const bytes = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#79d9ff' } }).png().toBuffer()
        const saved = await upload.uploadVisual({ ...common, expectedRevision: (await read()).campaign.revision, idempotencyKey: 'upload', input: {
          target: directionId ? { directionId } : { mode: 'campaign' }, name: 'visual.png', mimeType: 'image/png', data: bytes.toString('base64'),
        } })
        directionId = saved.directionId
      } else {
        await generation.generateImage({ ...common, idempotencyKey: 'image', input: { directionId, width: 1000, height: 1000 } })
      }
      await generation.selectDirection({ ...common, expectedRevision: (await read()).campaign.revision, input: { directionId } })
      if (mode === 'legacy_selection') {
        const second = (await read()).copies[0].candidates[1]
        await generation.approveCopy({ ...common, expectedRevision: (await read()).campaign.revision, input: { copyId: second.id } })
        const next = await generation.generateDirections({ ...common, idempotencyKey: 'second-linked', input: { mode: 'selected_copy', copyIds: [second.id] } })
        directionId = next.body.job.result.directions[0].id
        await generation.generateImage({ ...common, idempotencyKey: 'second-image', input: { directionId, width: 1000, height: 1000 } })
        await generation.selectDirection({ ...common, expectedRevision: (await read()).campaign.revision, input: { directionId } })
        expect((await read()).copies[0].approvedCandidateIds).toEqual(expect.arrayContaining([copy.id, second.id]))
      }
      let workspace = await read()
      const direction = workspace.directions.find(item => item.id === directionId)
      const compositionInput = { templateId: pilotTemplateFixture.id, templateVersion: pilotTemplateFixture.version,
        ratioIds: ['square'], slotValues: { headline: 'Find your quiet', body: 'A quieter commute.', cta: 'Shop now', image: direction.previewAssetId } }
      const saved = await versions.saveComposition({ ...common, expectedRevision: workspace.campaign.revision, input: compositionInput })
      expect(saved.composition.validation.valid).toBe(true)
      workspace = await read()
      // Provenance still rejects a changed association or uploaded-byte binding.
      if (mode === 'selected_copy') {
        await pool.query("UPDATE visual_directions SET copy_snapshot=jsonb_set(copy_snapshot,'{headline}','\"Wrong copy\"') WHERE id=$1", [directionId])
        await expect(versions.saveComposition({ ...common, expectedRevision: workspace.campaign.revision, input: compositionInput })).rejects.toMatchObject({ code: 'direction_selection_invalid' })
        await pool.query('UPDATE visual_directions SET copy_snapshot=$2 WHERE id=$1', [directionId, copy])
      }
      if (mode.endsWith('upload')) {
        const original = (await pool.query('SELECT upload_provenance FROM visual_directions WHERE id=$1', [directionId])).rows[0].upload_provenance
        await pool.query('UPDATE visual_directions SET upload_provenance=$2 WHERE id=$1', [directionId, { ...original, sha256: '0'.repeat(64) }])
        await expect(versions.saveComposition({ ...common, expectedRevision: workspace.campaign.revision, input: compositionInput })).rejects.toMatchObject({ code: 'composition_source_mismatch' })
        await pool.query('UPDATE visual_directions SET upload_provenance=$2 WHERE id=$1', [directionId, original])
      }
      const review = await versions.createVersion({ ...common, expectedRevision: workspace.campaign.revision, idempotencyKey: 'review', input: {} })
      expect(review.body.version.snapshot.selectedDirection.previewAssetId).toBe(direction.previewAssetId)
      expect(review.body.campaign.status).toBe('in_review')
      if (mode === 'ready_upload') expect(review.body.version.snapshot.selectedDirection.prompt).toBe('')
    } finally {
      await pool.end()
      await maintenance.query(`DROP SCHEMA ${schema} CASCADE`)
      await maintenance.end()
    }
  }, 30000)
