import { randomUUID } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { Pool } from 'pg'
import { expect, test } from 'vitest'
import { runMigrations } from '../db/migrate.js'
import { createCampaignRepository } from '../repositories/campaignRepository.js'
import { createTemplateRepository } from '../repositories/templateRepository.js'
import { createGenerationControlPlane } from '../repositories/generationJobRepository.js'
import { createGenerationService } from './generationService.js'
import { createVersionService } from './versionService.js'
import { createReviewService } from './reviewService.js'
import { createDeliveryService } from './deliveryService.js'
import { createWorkspaceService } from './workspaceService.js'
import { createVersionRepository } from '../repositories/versionRepository.js'
import { createDeliveryRepository } from '../repositories/deliveryRepository.js'
import { createMockProvider } from '../providers/mockProvider.js'
import { createMemoryAssetStore } from '../storage/memoryAssetStore.js'
import { createInProcessRenderer, RendererError } from '../rendering/inProcessRenderer.js'
import { studioTemplates } from '../../shared/studioTemplates.js'
import { hashCanonical } from '../../shared/canonicalJson.js'

test('batch resolves multiple approved source pairs, rejects invalid selections, and reviews/delivers every design × size', async () => {
  const schema = `banner_batch_${randomUUID().replaceAll('-', '')}`
  const connectionString = process.env.TEST_DATABASE_URL ?? 'postgresql:///banner_studio_test'
  const maintenance = new Pool({ connectionString })
  await maintenance.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` })
  try {
    await runMigrations({ pool })
    await pool.query('UPDATE settings SET daily_budget_microunits=10000000, per_step_regeneration_limit=100')
    await pool.query("INSERT INTO users (id,email,role,display_name) VALUES ('marketer','batch@example.test','marketer','Batch'), ('designer','designer@example.test','designer','Designer')")
    const actor = { id: 'marketer', role: 'marketer' }
    const common = { actor, campaignId: 'campaign' }
    const brief = { product: 'Headphones', audience: 'Commuters', objective: 'Shop', offer: '20% off until Sunday', locale: 'en', notes: '' }
    for (const id of ['campaign', 'other']) await createCampaignRepository(pool).create({ id, title: 'Launch', createdBy: actor.id, brief })
    for (const manifest of studioTemplates) await createTemplateRepository(pool).createVersion({ ...manifest, manifest, manifestHash: hashCanonical(manifest), createdBy: actor.id })
    const assetStore = createMemoryAssetStore()
    const generation = createGenerationService({ pool, assetStore, controlPlane: createGenerationControlPlane({ pool }), providers: { mock: createMockProvider() } })
    const versions = createVersionService({ pool, assetStore })
    const read = () => createWorkspaceService({ pool }).getWorkspace(common)
    await generation.analyseBrief({ ...common, input: {}, idempotencyKey: 'brief' })
    await generation.generateCopy({ ...common, input: {}, idempotencyKey: 'copy' })
    await generation.analyseBrief({ ...common, campaignId: 'other', input: {}, idempotencyKey: 'other-brief' })
    const foreignCopy = await generation.generateCopy({ ...common, campaignId: 'other', input: {}, idempotencyKey: 'other-copy' })
    const set = (await read()).copies[0]
    await generation.generateCopy({ ...common, input: {}, idempotencyKey: 'copy-second-set' })
    const secondSet = (await read()).copies.find(candidate => candidate.id !== set.id)
    const copies = [set.candidates[1], secondSet.candidates[1]]
    for (const copy of copies) await generation.approveCopy({ ...common, expectedRevision: (await read()).campaign.revision, input: { copyId: copy.id } })
    await generation.generateDirections({ ...common, idempotencyKey: 'directions', input: { mode: 'selected_copy', copyIds: copies.map(copy => copy.id) } })
    const directions = []
    for (const [index, copy] of copies.entries()) {
      directions[index] = (await read()).directions.find(direction => direction.copy?.id === copy.id)
      await generation.generateImage({ ...common, idempotencyKey: `image-${index}`, input: { directionId: directions[index].id, width: 1000, height: 1000 } })
    }
    await generation.selectDirection({ ...common, expectedRevision: (await read()).campaign.revision, input: { directionId: directions[0].id } })
    const designs = copies.map((copy, index) => ({ templateId: studioTemplates[index].id, templateVersion: studioTemplates[index].version, copySetId: [set.id, secondSet.id][index], copyId: copy.id, directionId: directions[index].id }))
    const input = { designs, ratioIds: ['square', 'landscape'] }
    const revision = (await read()).campaign.revision
    const save = (input, expectedRevision = revision, campaignId = common.campaignId) => versions.saveBannerBatch({ ...common, campaignId, expectedRevision, input })
    for (const invalid of [{ ...input, designs: [] }, { ...input, ratioIds: [] }, { ...input, designs: [designs[0], designs[0]] }, { ...input, ratioIds: ['square', 'square'] }, { ...input, designs: [{ ...designs[0], slotValues: { headline: 'Forged' } }] }]) {
      await expect(save(invalid)).rejects.toMatchObject({ code: 'invalid_request' })
    }
    await expect(save(input, revision - 1)).rejects.toMatchObject({ code: 'revision_conflict' })
    await expect(save({ ...input, designs: [{ ...designs[0], directionId: directions[1].id }] })).rejects.toMatchObject({ code: 'direction_selection_invalid' })
    await expect(save({ ...input, designs: [{ ...designs[0], copyId: set.candidates[2].id }] })).rejects.toMatchObject({ code: 'copy_selection_invalid' })
    await expect(save({ ...input, designs: [{ ...designs[0], copySetId: 'other-set' }] })).rejects.toMatchObject({ code: 'copy_selection_invalid' })
    await expect(save({ ...input, designs: [{ ...designs[0], copySetId: foreignCopy.body.job.result.copySetId, copyId: foreignCopy.body.job.result.copies[0].id }] })).rejects.toMatchObject({ code: 'copy_selection_invalid' })
    await expect(save({ ...input, ratioIds: ['not-a-format'] })).rejects.toMatchObject({ code: 'invalid_composition' })
    await pool.query('UPDATE visual_directions SET stale=true WHERE id=$1', [directions[1].id])
    await expect(save(input)).rejects.toMatchObject({ code: 'direction_selection_invalid' })
    await pool.query('UPDATE visual_directions SET stale=false WHERE id=$1', [directions[1].id])
    const saved = await save(input)
    expect(saved.composition.designs).toHaveLength(2)
    expect(saved.composition.designs.map(design => design.slotValues.headline)).toEqual(copies.map(copy => copy.headline))
    expect(saved.composition.designs.map(design => design.slotValues.tag)).toEqual(['20% off until Sunday', '20% off until Sunday'])
    expect((await read()).composition).toEqual(saved.composition)
    await expect(pool.query("UPDATE compositions SET designs=designs - 1 WHERE id=$1", [saved.composition.id])).rejects.toMatchObject({ code: '55000' })
    const tightTemplate = structuredClone(studioTemplates[1])
    tightTemplate.id = 'tight-headline'
    tightTemplate.name = 'Tight headline'
    tightTemplate.slots.find(slot => slot.id === 'headline').placements.landscape.height = 1
    await createTemplateRepository(pool).createVersion({ ...tightTemplate, manifest: tightTemplate, manifestHash: hashCanonical(tightTemplate), createdBy: actor.id })
    await expect(save({ ...input, designs: [designs[0], { ...designs[1], templateId: tightTemplate.id }] }, saved.campaign.revision)).rejects.toMatchObject({
      statusCode: 400, code: 'invalid_composition',
      publicMessage: expect.stringContaining('Tight headline'),
      details: [expect.objectContaining({ path: 'designs[1].ratios.landscape.headline', designIndex: 1, templateId: tightTemplate.id, ratioId: 'landscape', slotId: 'headline', code: 'line_overflow', message: expect.stringContaining('1200×628') })],
    })
    expect((await read()).composition).toEqual(saved.composition)
    expect((await read()).campaign.revision).toBe(saved.campaign.revision)
    const renderFailure = createVersionService({ pool, assetStore, renderer: { async renderComposition() { throw new RendererError('line_overflow', 'Slot headline exceeds its line limit') } } })
    await expect(renderFailure.createVersion({ ...common, expectedRevision: saved.campaign.revision, idempotencyKey: 'typed-render-failure', input: {} })).rejects.toMatchObject({
      statusCode: 400, code: 'invalid_composition',
      details: [expect.objectContaining({ path: 'designs[0].ratios.square.headline', designIndex: 0, templateId: designs[0].templateId, ratioId: 'square', slotId: 'headline', code: 'line_overflow' })],
    })
    expect((await read()).versions).toHaveLength(0)
    expect((await read()).composition).toEqual(saved.composition)
    const renderer = createInProcessRenderer()
    let mutated = false
    const interrupted = createVersionService({ pool, assetStore, renderer: { async renderComposition(input) {
      const rendered = await renderer.renderComposition(input)
      if (!mutated) {
        mutated = true
        await pool.query('UPDATE visual_directions SET stale=true WHERE id=$1', [directions[1].id])
      }
      return rendered
    } } })
    await expect(interrupted.createVersion({ ...common, expectedRevision: saved.campaign.revision, idempotencyKey: 'review', input: {} })).rejects.toMatchObject({ code: 'direction_selection_invalid' })
    expect((await read()).composition).toEqual(saved.composition)
    expect((await read()).versions).toHaveLength(0)
    await pool.query('UPDATE visual_directions SET stale=false WHERE id=$1', [directions[1].id])
    for (const tamper of ['missing-source', 'wrong-preview', 'wrong-slot', 'wrong-bound-preview']) {
      const corruptPersistence = createVersionService({ pool, assetStore, repositoryFactory(client) {
        const repository = createVersionRepository(client)
        return { ...repository, async finalizeBuild(input) {
          const snapshot = structuredClone(input.snapshot)
          const secondSourceId = snapshot.designs[1].selectedDirection.previewAssetId
          if (tamper === 'missing-source') snapshot.assets = snapshot.assets.filter(asset => asset.id !== secondSourceId)
          if (tamper === 'wrong-preview') snapshot.designs[1].selectedDirection.previewAssetId = snapshot.designs[0].selectedDirection.previewAssetId
          if (tamper === 'wrong-slot') snapshot.composition.designs[1].slotValues.image = snapshot.designs[0].selectedDirection.previewAssetId
          if (tamper === 'wrong-bound-preview') {
            snapshot.designs[1].selectedDirection.previewAssetId = snapshot.designs[0].selectedDirection.previewAssetId
            snapshot.composition.designs[1].slotValues.image = snapshot.designs[0].selectedDirection.previewAssetId
          }
          const result = await repository.finalizeBuild({ ...input, snapshot, contentHash: hashCanonical(snapshot),
            sourceAssets: tamper === 'missing-source' ? input.sourceAssets.filter(asset => asset.id !== secondSourceId) : input.sourceAssets })
          await client.query('SET CONSTRAINTS ALL IMMEDIATE')
          return result
        } }
      } })
      await expect(corruptPersistence.createVersion({ ...common, expectedRevision: saved.campaign.revision, idempotencyKey: `corrupt-${tamper}`, input: {} })).rejects.toMatchObject({ code: '23514' })
      expect((await read()).versions).toHaveLength(0)
    }
    const created = await versions.createVersion({ ...common, expectedRevision: saved.campaign.revision, idempotencyKey: 'review', input: {} })
    const snapshot = created.body.version.snapshot
    expect(snapshot.designs.map(design => design.selectedCopy.id)).toEqual(copies.map(copy => copy.id))
    expect(snapshot.assets.filter(asset => asset.kind === 'review_png')).toHaveLength(4)
    const manifestAsset = (await pool.query("SELECT object_key FROM assets WHERE version_id=$1 AND kind='manifest'", [created.body.version.id])).rows[0]
    const manifest = JSON.parse(Buffer.from(await assetStore.get({ objectKey: manifestAsset.object_key })).toString())
    expect(new Set(manifest.renders.map(render => `${render.designId}:${render.ratioId}`)).size).toBe(4)
    expect(manifest.renders.map(render => render.manifest.template.id)).toEqual([designs[0].templateId, designs[0].templateId, designs[1].templateId, designs[1].templateId])
    expect(manifest.renders.map(render => render.manifest.slots.find(slot => slot.id === 'tag')?.lines.join(' '))).toEqual(Array(4).fill('20% off until Sunday'))
    const delivery = createDeliveryService({ pool, assetStore })
    await expect(delivery.createDelivery({ actor, versionId: created.body.version.id, idempotencyKey: 'too-early', input: {} })).rejects.toMatchObject({ statusCode: 409 })
    const review = createReviewService({ pool })
    await review.markReady({ actor: { id: 'designer', role: 'designer' }, versionId: created.body.version.id, expectedRevision: created.body.campaign.revision, idempotencyKey: 'ready', input: { figmaUrl: 'https://figma.com/design/file/manual-review', checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true } } })
    await review.approve({ actor, versionId: created.body.version.id, expectedRevision: (await read()).campaign.revision, idempotencyKey: 'approve', input: {} })
    for (const tamper of ['missing-source', 'wrong-preview']) {
      const corruptDelivery = createDeliveryService({ pool, assetStore, repositoryFactory(client) {
        const repository = createDeliveryRepository(client)
        return { ...repository, async findVersionById(id) {
          const version = await repository.findVersionById(id)
          if (tamper === 'missing-source') version.snapshot.assets = version.snapshot.assets.filter(asset => asset.id !== version.snapshot.designs[1].selectedDirection.previewAssetId)
          else version.snapshot.designs[1].selectedDirection.previewAssetId = version.snapshot.designs[0].selectedDirection.previewAssetId
          return { ...version, contentHash: hashCanonical(version.snapshot) }
        } }
      } })
      await expect(corruptDelivery.createDelivery({ actor, versionId: created.body.version.id, idempotencyKey: `corrupt-delivery-${tamper}`, input: {} })).rejects.toMatchObject({ code: 'version_integrity_failure' })
    }
    const delivered = await delivery.createDelivery({ actor, versionId: created.body.version.id, idempotencyKey: 'delivery', input: {} })
    expect(delivered.status).toBe(201)
    const zipAsset = (await pool.query('SELECT object_key FROM assets WHERE id=$1', [delivered.body.delivery.asset.id])).rows[0]
    const zip = Buffer.from(await assetStore.get({ objectKey: zipAsset.object_key }))
    const files = new Map()
    for (let offset = 0; offset < zip.length - 46; offset++) {
      if (zip.readUInt32LE(offset) !== 0x02014b50) continue
      const filename = zip.subarray(offset + 46, offset + 46 + zip.readUInt16LE(offset + 28)).toString()
      const local = zip.readUInt32LE(offset + 42)
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const data = zip.subarray(start, start + zip.readUInt32LE(offset + 20))
      files.set(filename, zip.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data) : data)
    }
    expect([...files.keys()].filter(name => name.endsWith('.png'))).toHaveLength(4)
    expect(JSON.parse(files.get('delivery-manifest.json')).files.filter(file => file.mimeType === 'image/png')).toHaveLength(4)
    expect((await versions.getVersion({ actor, campaignId: 'campaign', versionNumber: 1 })).snapshot).toEqual(snapshot)
  } finally {
    await pool.end()
    await maintenance.query(`DROP SCHEMA ${schema} CASCADE`)
    await maintenance.end()
  }
}, 60000)
