import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { afterEach, describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { createIsolatedStudio } from '../testing/isolatedStudio.js'
import { createStudioApi } from '../../src/studio/api.js'
import { createCampaignRuntime } from '../../src/studio/campaign/campaignRuntime.js'
import { createWorkflowCoordinator } from '../../src/studio/campaign/workflowCoordinator.js'

const openStudios = new Set()
afterEach(async () => {
  const results = await Promise.allSettled([...openStudios].map(studio => studio.close()))
  openStudios.clear()
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
})

const brief = {
  product: 'Quiet wireless headphones', audience: 'City commuters', objective: 'Shop the autumn launch',
  offer: '20% off until Sunday', locale: 'en', notes: 'Calm editorial campaign for Instagram.',
}

async function setup() {
  const studio = await createIsolatedStudio(); openStudios.add(studio)
  const api = studio.api('marketer')
  const templates = (await api.listTemplates()).templates
  const campaign = await api.createCampaign({ title: 'Autumn launch', brief })
  return { studio, api, templates, campaign }
}

async function connect(studio, templates, campaignId, role = 'marketer', api = studio.api(role)) {
  const runtime = createCampaignRuntime({ api, actor: studio.actor(role), templates,
    workspace: await api.getWorkspace(campaignId) })
  const coordinator = createWorkflowCoordinator({ runtime })
  if (runtime.getSnapshot('review').input.version) await runtime.refresh({ review: true })
  return { api, runtime, coordinator, actions: coordinator.actions }
}

const workspace = runtime => runtime.read(({ workspace: value }) => value)
const expectOk = result => expect(result).toEqual({ ok: true })
const blobBytes = blob => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(Buffer.from(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsArrayBuffer(blob)
})

function unzip(bytes) {
  const zip = Buffer.from(bytes), files = new Map()
  for (let offset = 0; offset < zip.length - 46; offset++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) continue
    const name = zip.subarray(offset + 46, offset + 46 + zip.readUInt16LE(offset + 28)).toString()
    const local = zip.readUInt32LE(offset + 42)
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const data = zip.subarray(start, start + zip.readUInt32LE(offset + 20))
    files.set(name, zip.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data) : data)
  }
  return files
}

describe('campaign runtime through real HTTP and PostgreSQL', () => {
  test('notes-only brief prepares review for two templates sharing one selected source', async () => {
    const studio = await createIsolatedStudio(); openStudios.add(studio)
    const api = studio.api('marketer'), templates = (await api.listTemplates()).templates
    const campaign = await api.createCampaign({ title: 'QA autumn launch', brief: {
      product: '', audience: '', objective: '', offer: '', locale: 'auto',
      notes: 'QA autumn headphones launch. Promote Studio wireless headphones to urban commuters aged 25–40. Offer 20% off until September 30. Drive online purchases. Use English, a calm editorial tone, and square and portrait social banners.',
    } })
    const session = await connect(studio, templates, campaign.id)
    expectOk(await session.coordinator.analyzeAndGenerate())
    let state = await workspace(session.runtime)
    const copies = state.copies[0].candidates.slice(0, 2)
    for (const copy of copies) expectOk(await session.actions.copy.approve(copy.id))
    expectOk(await session.actions.visuals.generate('selected_copy'))
    state = await workspace(session.runtime)
    const direction = state.directions.find(item => item.copy?.id === copies[0].id && item.status === 'ready')
    expectOk(await session.actions.visuals.select(direction.id))
    state = await workspace(session.runtime)
    const designs = templates.slice(0, 2).map(template => ({ templateId: template.id, templateVersion: template.version,
      copySetId: state.copies[0].id, copyId: copies[0].id, directionId: direction.id }))
    const before = structuredClone(state)
    const rejected = await api.saveBannerBatch(campaign.id, { designs, ratioIds: ['square', 'portrait'] }, state.campaign.revision)
      .then(() => null, error => error)
    expect(rejected).toMatchObject({ status: 400, code: 'invalid_composition', details: [{
      path: 'designs[0].ratios.square.headline', designId: expect.any(String), designIndex: 0,
      templateId: designs[0].templateId, templateVersion: designs[0].templateVersion,
      copyId: copies[0].id, directionId: direction.id, ratioId: 'square', slotId: 'headline', code: 'line_overflow',
      message: expect.stringContaining('Use shorter copy, choose a different design, or remove this size.'),
    }] })
    await session.runtime.refresh()
    state = await workspace(session.runtime)
    expect(state.campaign.revision).toBe(before.campaign.revision)
    expect(state.composition).toEqual(before.composition)
    expect(state.versions).toEqual(before.versions)
    const fittingCopy = copies.reduce((shortest, candidate) => candidate.headline.length < shortest.headline.length ? candidate : shortest)
    const fittingDirection = state.directions.find(item => item.copy?.id === fittingCopy.id && item.status === 'ready')
    expectOk(await session.actions.visuals.select(fittingDirection.id))
    state = await workspace(session.runtime)
    const fittingTemplate = templates.find(template => template.id === 'product-spotlight')
    const fittingDesign = { templateId: fittingTemplate.id, templateVersion: fittingTemplate.version,
      copySetId: state.copies[0].id, copyId: fittingCopy.id, directionId: fittingDirection.id }
    const receipt = await session.actions.banners.saveBatch({ designs: [fittingDesign], ratioIds: ['square'] })
    expect(receipt).toEqual({ ok: true, reviewInputKey: session.runtime.getSnapshot('review').inputKey })
    expectOk(await session.actions.banners.prepareReview({ expectedInputKey: receipt.reviewInputKey }))
    state = await workspace(session.runtime)
    expect(state.campaign.status).toBe('in_review')
    expect(state.versions[0].snapshot.assets.filter(asset => asset.kind === 'review_png')).toHaveLength(1)
    expect(state.versions[0].snapshot.selectedCopy.headline).toBe(fittingCopy.headline)
    session.runtime.dispose()
  }, 30_000)

  test('complete six-module flow preserves v1, scopes review history, and delivers v2', async () => {
    const { studio, api, templates, campaign } = await setup()
    let session = await connect(studio, templates, campaign.id)
    expectOk(await session.coordinator.analyzeAndGenerate())
    let state = await workspace(session.runtime)
    expect(state.copies[0].candidates).toHaveLength(5)
    expect(state.directions).toHaveLength(3)
    expect(state.directions.every(item => item.status === 'pending' && !item.previewAssetId)).toBe(true)
    expect(state.jobs.filter(item => item.step === 'image')).toHaveLength(0)
    expect((await studio.pool.query('SELECT count(*)::int n FROM assets')).rows[0].n).toBe(0)
    const initialJobIds = state.jobs.map(item => item.id)

    session.runtime.dispose()
    session = await connect(studio, templates, campaign.id)
    await session.coordinator.resumeInitialDrafts()
    state = await workspace(session.runtime)
    expect(state.jobs.map(item => item.id)).toEqual(initialJobIds)
    const copies = state.copies[0].candidates.slice(0, 2)
    for (const copy of copies) expectOk(await session.actions.copy.approve(copy.id))
    expectOk(await session.actions.visuals.generate('selected_copy'))
    state = await workspace(session.runtime)
    const directions = copies.map(copy => state.directions.find(item => item.copy?.id === copy.id && item.status === 'ready'))
    expect(directions.every(Boolean)).toBe(true)
    expectOk(await session.actions.visuals.select(directions[0].id))
    state = await workspace(session.runtime)
    const designs = copies.map((copy, index) => ({ templateId: templates[index].id, templateVersion: templates[index].version,
      copySetId: state.copies[0].id, copyId: copy.id, directionId: directions[index].id }))
    const v1Receipt = await session.actions.banners.saveBatch({ designs, ratioIds: ['square', 'landscape'] })
    expect(v1Receipt).toEqual({ ok: true, reviewInputKey: expect.any(String) })
    state = await workspace(session.runtime)
    expect(v1Receipt.reviewInputKey).toBe(session.runtime.getSnapshot('review').inputKey)
    expect(state.composition.designs.map(({ templateId, templateVersion, copySetId, copyId, directionId }) => ({ templateId, templateVersion, copySetId, copyId, directionId }))).toEqual(designs)
    expect(state.composition.ratioIds).toEqual(['square', 'landscape'])
    expectOk(await session.actions.banners.prepareReview({ expectedInputKey: v1Receipt.reviewInputKey }))
    state = await workspace(session.runtime)
    const v1 = structuredClone(state.versions.find(item => item.versionNumber === 1))
    expect(v1.snapshot.assets.filter(item => item.kind === 'review_png')).toHaveLength(4)
    expect((await session.actions.review.markReady({ figmaUrl: 'https://figma.com/design/test/v1', checklistAnswers: {
      copyAccuracy: true, layoutQuality: true, exportReadiness: true } })).code).toBe('not_allowed')
    expect((await session.actions.distribute.build()).code).toBe('not_allowed')

    session.runtime.dispose()
    session = await connect(studio, templates, campaign.id, 'designer')
    expectOk(await session.actions.review.requestChanges('Use the alternate layout'))
    const v1History = await session.api.getReview(v1.id)
    expect(v1History.events.map(event => event.eventType)).toEqual(['sent', 'changes_requested'])
    expect(v1History.events[1].payload.comment).toBe('Use the alternate layout')
    session.runtime.dispose()
    session = await connect(studio, templates, campaign.id)
    expectOk(await session.actions.review.reopen())
    state = await workspace(session.runtime)
    const changedDesigns = [designs[1], designs[0]]
    const v2Receipt = await session.actions.banners.saveBatch({ designs: changedDesigns, ratioIds: ['portrait', 'square'] })
    expect(v2Receipt).toEqual({ ok: true, reviewInputKey: session.runtime.getSnapshot('review').inputKey })
    expectOk(await session.actions.banners.prepareReview({ expectedInputKey: v2Receipt.reviewInputKey }))
    state = await workspace(session.runtime)
    const v2 = state.versions.find(item => item.versionNumber === 2)
    expect(v2.contentHash).not.toBe(v1.contentHash)
    expect(v2.snapshot.composition.ratioIds).toEqual(['portrait', 'square'])
    expect(v2.snapshot.composition.designs.map(({ templateId, templateVersion, copySetId, copyId, directionId }) =>
      ({ templateId, templateVersion, copySetId, copyId, directionId }))).toEqual(changedDesigns)
    expect(v2.snapshot.composition.designs.map(item => item.id)).not.toEqual(v1.snapshot.composition.designs.map(item => item.id))
    const persistedV1 = (await studio.pool.query('SELECT snapshot, content_hash FROM campaign_versions WHERE id=$1', [v1.id])).rows[0]
    expect(persistedV1).toEqual({ snapshot: v1.snapshot, content_hash: v1.contentHash })

    session.runtime.dispose()
    session = await connect(studio, templates, campaign.id, 'designer')
    expectOk(await session.actions.review.markReady({ figmaUrl: 'https://www.figma.com/design/runtime/v2', checklistAnswers: {
      copyAccuracy: true, layoutQuality: true, exportReadiness: true } }))
    expect((await session.api.getReview(v2.id)).events.every(event => event.versionId === v2.id)).toBe(true)
    expect((await session.api.getReview(v1.id)).events.every(event => event.versionId === v1.id)).toBe(true)
    session.runtime.dispose()
    session = await connect(studio, templates, campaign.id)
    expectOk(await session.actions.review.approve())
    const finalV1History = await session.api.getReview(v1.id)
    const finalV2History = await session.api.getReview(v2.id)
    expect(finalV1History.events.map(event => event.eventType)).toEqual(['sent', 'changes_requested'])
    expect(finalV1History.events[1].payload.comment).toBe('Use the alternate layout')
    expect(finalV2History.events.map(event => event.eventType)).toEqual(['sent', 'ready', 'approved'])
    expect(finalV2History.events).toHaveLength(3)
    await expect(session.api.deliver(v1.id, {}, 'reject-v1')).rejects.toMatchObject({ status: 409 })
    expectOk(await session.actions.distribute.build())
    state = await workspace(session.runtime)
    expect(state.delivery.versionId).toBe(v2.id)
    const blob = await session.actions.distribute.download(), bytes = await blobBytes(blob)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(state.delivery.asset.sha256)
    const files = unzip(bytes), manifest = JSON.parse(files.get('delivery-manifest.json'))
    expect([...files.keys()].filter(name => name.endsWith('.png'))).toHaveLength(4)
    expect(manifest.files.filter(item => item.mimeType === 'image/png')).toHaveLength(4)
    expect(manifest.versionId).toBe(v2.id)
    const renderManifest = JSON.parse(files.get('render-manifest.json'))
    expect(new Set(renderManifest.renders.map(item => `${item.designId}:${item.ratioId}`))).toEqual(
      new Set(v2.snapshot.designs.flatMap(design => ['portrait', 'square'].map(ratio => `${design.id}:${ratio}`))))
    const deliveredV1History = await session.api.getReview(v1.id)
    const deliveredV2History = await session.api.getReview(v2.id)
    expect(deliveredV1History.events.map(event => event.eventType)).toEqual(['sent', 'changes_requested'])
    expect(deliveredV1History.events.every(event => event.versionId === v1.id)).toBe(true)
    expect(deliveredV1History.events[1].payload.comment).toBe('Use the alternate layout')
    expect(deliveredV2History.events.map(event => event.eventType)).toEqual(['sent', 'ready', 'approved', 'delivered'])
    expect(deliveredV2History.events.every(event => event.versionId === v2.id)).toBe(true)
    const readyEvent = deliveredV2History.events[1], deliveredEvent = deliveredV2History.events[3]
    expect(readyEvent).toMatchObject({ actorId: studio.actor('designer').id, actorRole: 'designer', payload: {
      figmaUrl: 'https://www.figma.com/design/runtime/v2', readyActorId: studio.actor('designer').id,
      checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true }, contentHash: v2.contentHash,
    } })
    expect(deliveredEvent).toMatchObject({ actorId: studio.actor('marketer').id, actorRole: 'marketer', payload: {
      deliveryId: state.delivery.id, contentHash: v2.contentHash, assetHashes: [state.delivery.asset.sha256],
    } })
    session.runtime.dispose()
    session = await connect(studio, templates, campaign.id)
    const downloadedAgain = await blobBytes(await session.actions.distribute.download())
    expect(downloadedAgain).toEqual(bytes)
    session.runtime.dispose()
  }, 60_000)

  test('brief refinement rejects captured stale lineage and can rebuild current sources', async () => {
    const { studio, templates, campaign } = await setup()
    const session = await connect(studio, templates, campaign.id)
    expectOk(await session.coordinator.analyzeAndGenerate())
    let state = await workspace(session.runtime)
    const copy = state.copies[0].candidates[0]
    expectOk(await session.actions.copy.approve(copy.id))
    expectOk(await session.actions.visuals.generate('selected_copy'))
    state = await workspace(session.runtime)
    const direction = state.directions.find(item => item.copy?.id === copy.id && item.status === 'ready')
    expectOk(await session.actions.visuals.select(direction.id))
    state = await workspace(session.runtime)
    const oldBannerKey = session.runtime.getSnapshot('banners').inputKey
    const oldDesign = { templateId: templates[0].id, templateVersion: templates[0].version,
      copySetId: state.copies[0].id, copyId: copy.id, directionId: direction.id }
    const oldReceipt = await session.actions.banners.saveBatch({ designs: [oldDesign], ratioIds: ['square'] })
    expect(oldReceipt).toEqual({ ok: true, reviewInputKey: session.runtime.getSnapshot('review').inputKey })
    const oldReviewKey = oldReceipt.reviewInputKey
    expectOk(await session.actions.brief.refine('Emphasize a quieter daily commute.'))
    state = await workspace(session.runtime)
    expect(state.copies.filter(item => !item.stale)).toHaveLength(0)
    expect(state.directions.filter(item => !item.stale)).toHaveLength(0)
    expect(state.composition).toBeNull()
    expect(await session.actions.banners.saveBatch({ designs: [oldDesign], ratioIds: ['square'] }, { expectedInputKey: oldBannerKey }))
      .toMatchObject({ ok: false, code: 'not_allowed', message: 'Complete the preceding module first.' })
    expect(await session.actions.review.createVersion({ expectedInputKey: oldReviewKey }))
      .toMatchObject({ ok: false, code: 'not_allowed', message: 'Complete the preceding module first.' })
    expectOk(await session.actions.copy.generate())
    state = await workspace(session.runtime)
    const currentCopy = state.copies.find(item => !item.stale).candidates[0]
    expectOk(await session.actions.copy.approve(currentCopy.id))
    expectOk(await session.actions.visuals.generate('selected_copy'))
    state = await workspace(session.runtime)
    const currentDirection = state.directions.find(item => !item.stale && item.copy?.id === currentCopy.id && item.status === 'ready')
    expectOk(await session.actions.visuals.select(currentDirection.id))
    state = await workspace(session.runtime)
    const currentReceipt = await session.actions.banners.saveBatch({ designs: [{ templateId: templates[0].id, templateVersion: templates[0].version,
      copySetId: state.copies.find(item => !item.stale).id, copyId: currentCopy.id, directionId: currentDirection.id }], ratioIds: ['square'] })
    expect(currentReceipt).toEqual({ ok: true, reviewInputKey: session.runtime.getSnapshot('review').inputKey })
    expectOk(await session.actions.banners.prepareReview({ expectedInputKey: currentReceipt.reviewInputKey }))
    session.runtime.dispose()
  }, 45_000)

  test('batch dependencies invalidate only used secondary copy and image sources and remain rebuildable', async () => {
    const { studio, templates, campaign } = await setup()
    let session = await connect(studio, templates, campaign.id)
    expectOk(await session.coordinator.analyzeAndGenerate())
    let state = await workspace(session.runtime)
    const copies = state.copies[0].candidates.slice(0, 3)
    for (const copy of copies) expectOk(await session.actions.copy.approve(copy.id))
    expectOk(await session.actions.visuals.generate('selected_copy'))
    state = await workspace(session.runtime)
    const directions = copies.map(copy => state.directions.find(item => item.copy?.id === copy.id && item.status === 'ready'))
    expect(directions.every(Boolean)).toBe(true)
    expectOk(await session.actions.visuals.select(directions[0].id))
    state = await workspace(session.runtime)
    const design = index => ({ templateId: templates[index].id, templateVersion: templates[index].version,
      copySetId: state.copies[0].id, copyId: copies[index].id, directionId: directions[index].id })
    const firstBatch = await session.actions.banners.saveBatch({ designs: [design(0), design(1)], ratioIds: ['square'] })
    expect(firstBatch).toEqual({ ok: true, reviewInputKey: expect.any(String) })
    state = await workspace(session.runtime)
    const firstComposition = structuredClone(state.composition)
    expect(session.runtime.getSnapshot('review').access.canVisit).toBe(true)
    expectOk(await session.actions.banners.prepareReview({ expectedInputKey: firstBatch.reviewInputKey }))
    state = await workspace(session.runtime)
    const historicalVersion = structuredClone(state.versions.find(item => item.versionNumber === 1))
    session.runtime.dispose()
    const designer = await connect(studio, templates, campaign.id, 'designer')
    expectOk(await designer.actions.review.requestChanges('Keep this reviewed batch as history.'))
    designer.runtime.dispose()
    session = await connect(studio, templates, campaign.id)
    expectOk(await session.actions.review.reopen())
    state = await workspace(session.runtime)
    expect(state.composition).toEqual(firstComposition)

    const replacementBytes = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#79d9ff' } }).png().toBuffer()
    const replacementFile = new File([replacementBytes], 'replacement.png', { type: 'image/png' })
    expectOk(await session.actions.visuals.upload({ directionId: directions[2].id }, replacementFile))
    expectOk(await session.actions.copy.remove(copies[2].id))
    state = await workspace(session.runtime)
    expect(state.campaign).toMatchObject({ status: 'composed', compositionId: firstComposition.id })
    expect(state.composition).toEqual(firstComposition)
    expect(session.runtime.getSnapshot('review').access.canVisit).toBe(true)
    expect((await studio.pool.query('SELECT stale, designs FROM compositions WHERE id=$1', [firstComposition.id])).rows[0])
      .toEqual({ stale: false, designs: firstComposition.designs })

    expectOk(await session.actions.visuals.upload({ directionId: directions[1].id }, replacementFile))
    state = await workspace(session.runtime)
    expect(state.campaign).toMatchObject({ status: 'direction_selected', compositionId: null })
    expect(state.composition).toBeNull()
    expect(session.runtime.getSnapshot('review').access.canVisit).toBe(false)
    expect((await studio.pool.query('SELECT stale, designs FROM compositions WHERE id=$1', [firstComposition.id])).rows[0])
      .toEqual({ stale: true, designs: firstComposition.designs })

    const rebuiltWithReplacement = await session.actions.banners.saveBatch({ designs: [design(0), design(1)], ratioIds: ['square'] })
    expect(rebuiltWithReplacement).toEqual({ ok: true, reviewInputKey: expect.any(String) })
    state = await workspace(session.runtime)
    const secondComposition = structuredClone(state.composition)
    expect(secondComposition.id).not.toBe(firstComposition.id)
    expect(secondComposition.designs[1].slotValues.image).not.toBe(firstComposition.designs[1].slotValues.image)
    expect(session.runtime.getSnapshot('review').access.canVisit).toBe(true)

    expectOk(await session.actions.copy.remove(copies[1].id))
    state = await workspace(session.runtime)
    expect(state.campaign).toMatchObject({ status: 'direction_selected', compositionId: null })
    expect(state.composition).toBeNull()
    expect(session.runtime.getSnapshot('review').access.canVisit).toBe(false)
    expect((await studio.pool.query('SELECT stale, designs FROM compositions WHERE id=$1', [secondComposition.id])).rows[0])
      .toEqual({ stale: true, designs: secondComposition.designs })

    const rebuiltWithoutDeletedCopy = await session.actions.banners.saveBatch({ designs: [design(0)], ratioIds: ['square'] })
    expect(rebuiltWithoutDeletedCopy).toEqual({ ok: true, reviewInputKey: expect.any(String) })
    state = await workspace(session.runtime)
    expect(state.campaign).toMatchObject({ status: 'composed', compositionId: state.composition.id })
    expect(state.composition.designs.map(item => item.copyId)).toEqual([copies[0].id])
    expect(session.runtime.getSnapshot('review').access.canVisit).toBe(true)
    expect((await studio.pool.query('SELECT snapshot, content_hash FROM campaign_versions WHERE id=$1', [historicalVersion.id])).rows[0])
      .toEqual({ snapshot: historicalVersion.snapshot, content_hash: historicalVersion.contentHash })
    session.runtime.dispose()
  }, 60_000)

  test('an analyzed campaign duplicates to a raw brief and submits normally with fresh provenance', async () => {
    const { studio, api, templates, campaign } = await setup()
    const sourceSession = await connect(studio, templates, campaign.id)
    expectOk(await sourceSession.coordinator.analyzeAndGenerate())
    const sourceBefore = structuredClone(await workspace(sourceSession.runtime))
    sourceSession.runtime.dispose()

    const duplicated = await api.duplicateCampaign(campaign.id)
    const duplicateBefore = await api.getWorkspace(duplicated.id)
    expect(duplicateBefore.campaign).toMatchObject({ status: 'draft', revision: 0 })
    expect(duplicateBefore.campaign.brief).toEqual({ ...brief, analysis: null })
    expect((await studio.pool.query('SELECT brief FROM campaigns WHERE id=$1', [duplicated.id])).rows[0].brief).toEqual(brief)
    expect(duplicateBefore.jobs).toEqual([])
    expect(duplicateBefore.copies).toEqual([])
    expect(duplicateBefore.directions).toEqual([])

    const duplicateSession = await connect(studio, templates, duplicated.id)
    expectOk(await duplicateSession.actions.brief.submit())
    const duplicateAfter = await workspace(duplicateSession.runtime)
    const analysisJobs = duplicateAfter.jobs.filter(job => job.step === 'brief_analysis' && job.status === 'succeeded')
    expect(analysisJobs).toHaveLength(1)
    expect(duplicateAfter.campaign.brief.analysis).toEqual(analysisJobs[0].result.analysis)
    expect(duplicateAfter.copies.flatMap(set => set.candidates)).toHaveLength(5)
    expect(duplicateAfter.directions).toHaveLength(3)
    expect(duplicateAfter.directions.every(item => item.status === 'pending' && !item.previewAssetId)).toBe(true)
    expect(duplicateAfter.jobs.filter(job => job.step === 'image')).toHaveLength(0)
    expect((await studio.pool.query('SELECT count(*)::int n FROM assets WHERE campaign_id=$1', [duplicated.id])).rows[0].n).toBe(0)

    const sourceAfter = await api.getWorkspace(campaign.id)
    expect(sourceAfter.campaign).toEqual(sourceBefore.campaign)
    expect(sourceAfter.jobs).toEqual(sourceBefore.jobs)
    expect(sourceAfter.copies).toEqual(sourceBefore.copies)
    expect(sourceAfter.directions).toEqual(sourceBefore.directions)
    duplicateSession.runtime.dispose()
  }, 30_000)

  test('lost HTTP response after a real image mutation reconciles without duplicate output', async () => {
    const { studio, templates, campaign } = await setup()
    let session = await connect(studio, templates, campaign.id)
    expectOk(await session.coordinator.analyzeAndGenerate())
    let state = await workspace(session.runtime)
    const direction = state.directions[0]
    session.runtime.dispose()
    let lose = true
    const fetchImpl = async (...args) => {
      const response = await fetch(...args)
      if (lose && args[0].includes('/image-generations') && args[1]?.method === 'POST') {
        lose = false
        await response.arrayBuffer()
        throw new TypeError('Simulated response loss after server mutation')
      }
      return response
    }
    const lossyApi = createStudioApi({ baseUrl: studio.url, fetchImpl, getHeaders: () => ({ 'X-Test-Studio-Role': 'marketer' }) })
    session = await connect(studio, templates, campaign.id, 'marketer', lossyApi)
    expect((await session.actions.visuals.image(direction.id)).ok).toBe(false)
    expect(session.runtime.getSnapshot('visuals').operation.kind).toBe('uncertain')
    const counts = () => studio.pool.query("SELECT (SELECT count(*)::int FROM generation_jobs WHERE campaign_id=$1 AND step='image') jobs, (SELECT count(*)::int FROM assets WHERE campaign_id=$1 AND generation_job_id IS NOT NULL) outputs", [campaign.id])
    const before = (await counts()).rows[0]
    expectOk(await session.actions.visuals.image(direction.id))
    const after = (await counts()).rows[0]
    expect(after).toEqual(before)
    expect(after).toEqual({ jobs: 1, outputs: 1 })
    session.runtime.dispose()
  }, 30_000)
})
