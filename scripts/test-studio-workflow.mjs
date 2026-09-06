import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { inflateRawSync } from 'node:zlib'
import { createStudioApi } from '../src/studio/api.js'
import { startIsolatedStudio } from './testing/start-isolated-studio.mjs'

function unzip(bytes) {
  const zip = Buffer.from(bytes)
  const files = new Map()
  for (let offset = 0; offset < zip.length - 46; offset += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) continue
    const name = zip.subarray(offset + 46, offset + 46 + zip.readUInt16LE(offset + 28)).toString()
    const local = zip.readUInt32LE(offset + 42)
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const data = zip.subarray(start, start + zip.readUInt32LE(offset + 20))
    files.set(name, zip.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data) : data)
  }
  return files
}

export async function verifyStudioWorkflow(baseUrl, { templateId = 'product-spotlight' } = {}) {
  const marketer = createStudioApi({ baseUrl, getHeaders: () => ({ 'X-Studio-Demo-Role': 'marketer' }) })
  const designer = createStudioApi({ baseUrl, getHeaders: () => ({ 'X-Studio-Demo-Role': 'designer' }) })
  const key = () => randomUUID()
  const campaign = await marketer.createCampaign({ title: `Workflow verification ${new Date().toISOString()}`, brief: {
    product: 'Studio', audience: 'creative teams', objective: 'Start a trial', offer: 'Free trial', locale: 'en', notes: 'Clear and confident.',
  } })
  const id = campaign.id
  const initial = await marketer.getWorkspace(id)
  assert.equal(initial.campaign.revision, 0)
  assert.deepEqual(initial.copies, [])
  await assert.rejects(() => designer.patchCampaign(id, { title: 'Unauthorized' }, 0), { status: 403 })
  await assert.rejects(() => marketer.patchCampaign(id, { title: 'Stale' }, 99), { status: 409 })
  const briefKey = key()
  const analysis = await marketer.generate(id, 'brief', {}, briefKey)
  assert.equal(analysis.job.status, 'succeeded')
  assert.equal((await marketer.generate(id, 'brief', {}, briefKey)).job.id, analysis.job.id)
  const copies = await marketer.generate(id, 'copy', {}, key())
  assert.equal(copies.job.status, 'succeeded')
  let workspace = await marketer.getWorkspace(id)
  const copySet = workspace.copies[0]
  const selectedCopy = copySet.candidates.reduce((shortest, candidate) => candidate.headline.length < shortest.headline.length ? candidate : shortest)
  const copyApproval = await marketer.approveCopy(id, selectedCopy.id, workspace.campaign.revision)
  assert.equal(copyApproval.revision, workspace.campaign.revision + 1)
  const directionsKey = key()
  const directions = await marketer.generate(id, 'directions', { mode: 'selected_copy', copyIds: [selectedCopy.id] }, directionsKey)
  assert.equal(directions.job.status, 'succeeded')
  assert.equal((await marketer.generate(id, 'directions', { mode: 'selected_copy', copyIds: [selectedCopy.id] }, directionsKey)).job.id, directions.job.id)
  workspace = await marketer.getWorkspace(id)
  const direction = workspace.directions.find((item) => item.copy?.id === selectedCopy.id)
  assert.ok(direction)
  const imageKey = key()
  const image = await marketer.generate(id, 'image', { directionId: direction.id, width: 1200, height: 1200 }, imageKey)
  assert.equal(image.job.status, 'succeeded')
  assert.equal((await marketer.generate(id, 'image', { directionId: direction.id, width: 1200, height: 1200 }, imageKey)).job.id, image.job.id)
  workspace = await marketer.getWorkspace(id)
  const readyDirection = workspace.directions.find((item) => item.id === direction.id)
  assert.equal(readyDirection.status, 'ready')
  await marketer.selectDirection(id, { directionId: direction.id }, workspace.campaign.revision)
  workspace = await marketer.getWorkspace(id)
  const { templates } = await marketer.listTemplates()
  const template = templates.find((item) => item.id === templateId)
  assert.ok(template, `Template ${templateId} is installed`)
  const composition = await marketer.saveBannerBatch(id, {
    designs: [{ templateId: template.id, templateVersion: template.version, copySetId: copySet.id,
      copyId: selectedCopy.id, directionId: readyDirection.id }],
    ratioIds: ['square'],
  }, workspace.campaign.revision)
  assert.equal(composition.composition.validation.valid, true, JSON.stringify(composition.composition.validation.errors))
  const created = await marketer.createVersion(id, {}, composition.campaign.revision, key())
  const versionId = created.version.id
  assert.equal(created.campaign.status, 'in_review')
  await assert.rejects(() => marketer.review(versionId, 'approve', {}, created.campaign.revision, key()), { status: 409 })
  await assert.rejects(() => marketer.review(versionId, 'mark-ready', {}, created.campaign.revision, key()), { status: 403 })
  const ready = await designer.review(versionId, 'mark-ready', {
    figmaUrl: 'https://www.figma.com/design/studio-demo/workflow-check',
    checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
  }, created.campaign.revision, key())
  const approved = await marketer.review(versionId, 'approve', {}, ready.campaign.revision, key())
  assert.equal(approved.campaign.status, 'approved')
  const deliveryKey = key()
  const delivered = await marketer.deliver(versionId, {}, deliveryKey)
  const replayed = await marketer.deliver(versionId, {}, deliveryKey)
  assert.equal(replayed.delivery.id, delivered.delivery.id)
  assert.equal(delivered.campaign.status, 'delivered')
  const blob = await marketer.downloadDelivery(versionId)
  const bytes = Buffer.from(await blob.arrayBuffer())
  assert.equal(bytes.readUInt32LE(0), 0x04034b50)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), delivered.delivery.asset.sha256)
  assert.equal(bytes.length, delivered.delivery.byteSize)
  assert.equal(delivered.delivery.versionId, versionId)
  const files = unzip(bytes)
  const manifest = JSON.parse(files.get('delivery-manifest.json'))
  assert.equal(manifest.versionId, versionId)
  assert.equal(manifest.contentHash, created.version.contentHash)
  assert.equal(manifest.files.filter((file) => file.mimeType === 'image/png').length, 1)
  await assert.rejects(() => designer.getAssetBlob(delivered.delivery.asset.id), { status: 404 })
  const reloaded = await marketer.getWorkspace(id)
  assert.equal(reloaded.delivery.id, delivered.delivery.id)
  assert.equal(reloaded.versions[0].id, versionId)
  assert.equal(reloaded.composition.designs[0].slotValues.headline, selectedCopy.headline)
  assert.equal((await designer.getWorkspace(id)).delivery, null)
  assert.deepEqual((await marketer.getReview(versionId)).events.map((item) => item.eventType), ['sent', 'ready', 'approved', 'delivered'])
  const response = await fetch(`${baseUrl}/api/v1/campaigns/${id}/workspace`)
  assert.equal(response.status, 401)
  const hostile = await fetch(`${baseUrl}/api/v1/dev/session-info`, { headers: { Origin: 'https://example.com' } })
  assert.equal(hostile.status, 403)
  return { campaignId: id, versionId, templateId, finalStatus: reloaded.campaign.status, zipBytes: bytes.length, zipSha256: delivered.delivery.asset.sha256, generationJobs: reloaded.jobs.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = process.env.STUDIO_TEST_BASE_URL ? null : await startIsolatedStudio()
  try {
    const baseUrl = runtime?.url ?? process.env.STUDIO_TEST_BASE_URL
    const target = new URL(baseUrl)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('Workflow verification only targets the local demo')
    if (!runtime) console.warn('STUDIO_TEST_BASE_URL is an explicit local integration target; workflow verification creates records there.')
    console.log(JSON.stringify(await verifyStudioWorkflow(baseUrl), null, 2))
  } finally { await runtime?.close() }
}
