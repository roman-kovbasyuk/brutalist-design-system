import { createHash, randomUUID } from 'node:crypto'
import {
  campaignRecordSchema,
  campaignVersionRecordSchema,
  createDeliveryRequestSchema,
  deliveryManifestSchema,
  deliveryRecordSchema,
  reviewEventRecordSchema,
  roleSchema,
} from '../../shared/contracts.js'
import { canonicalJson, hashCanonical } from '../../shared/canonicalJson.js'
import { deriveReviewStatus, InvalidReviewHistoryError, orderReviewEvents } from '../../shared/reviewHistory.js'
import { transitionCampaign } from '../../shared/workflowRules.js'
import { withDeadlineTransaction } from '../db/pool.js'
import { decodeGeneratedImage } from '../images/imageDecoder.js'
import { createDeliveryRepository } from '../repositories/deliveryRepository.js'
import { createIdempotencyRepository } from '../repositories/idempotencyRepository.js'
import { assertSafeObjectKey, validateAssetStore } from '../storage/assetStore.js'
import { buildDeterministicDeliveryArchive } from './deliveryArchive.js'

const exporters = new Set(['marketer', 'admin'])

export class DeliveryServiceError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'DeliveryServiceError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.details = details
    this.expose = true
  }
}

function fail(statusCode, code, message, details) {
  throw new DeliveryServiceError(statusCode, code, message, details)
}

function requireActor(actor) {
  if (!actor?.id || !roleSchema.safeParse(actor.role).success || actor.disabled === true
    || actor.disabledAt != null || !exporters.has(actor.role)) {
    fail(403, 'forbidden', 'This actor cannot export approved assets')
  }
}

function validateKey(value) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(value)) {
    fail(400, 'invalid_idempotency_key', 'Idempotency-Key must be 1-255 visible ASCII characters without whitespace')
  }
}

function validateInput(value) {
  const result = createDeliveryRequestSchema.safeParse(value)
  if (!result.success) fail(400, 'invalid_request', 'Request validation failed', result.error.issues)
  return result.data
}

function safeInstant(value) {
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(result.getTime())) throw new TypeError('The delivery clock returned an invalid value')
  return result
}

function operationTimeout() {
  return new DeliveryServiceError(503, 'delivery_operation_timeout', 'Delivery creation exceeded its deadline')
}

function recoveryTimeout() {
  return new DeliveryServiceError(503, 'delivery_recovery_unavailable', 'Delivery recovery is temporarily unavailable')
}

function remaining(deadlineAt) {
  return Math.max(0, Math.ceil(deadlineAt - Date.now()))
}

async function beforeDeadline(deadlineAt, operation, timeoutFactory = operationTimeout) {
  const timeoutMs = remaining(deadlineAt)
  if (timeoutMs <= 0) throw timeoutFactory()
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(timeoutMs)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutFactory()), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function hashes(values, code = 'invalid_review_history') {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
    fail(409, code, 'Immutable asset hash history is invalid')
  }
  return [...new Set(values)].sort()
}

function same(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function strictVersion(value) {
  const parsed = campaignVersionRecordSchema.safeParse(value)
  if (!parsed.success) fail(409, 'version_integrity_failure', 'The immutable version is invalid')
  return parsed.data
}

function strictCampaign(value) {
  const parsed = campaignRecordSchema.safeParse(value)
  if (!parsed.success) throw new Error('Persistence returned an invalid campaign')
  return parsed.data
}

function strictEvents(values, version) {
  if (!Array.isArray(values)) fail(409, 'invalid_review_history', 'Review history is invalid')
  const parsed = values.map((value) => reviewEventRecordSchema.safeParse(value))
  if (parsed.some((value) => !value.success)) fail(409, 'invalid_review_history', 'Review history is invalid')
  const events = orderReviewEvents(parsed.map((value) => value.data))
  if (events.some((event) => event.versionId !== version.id || event.campaignId !== version.campaignId)) {
    fail(409, 'invalid_review_history', 'Review history belongs to another version')
  }
  return events
}

function reviewAssetSets(records, version, reviewAssets) {
  if (!records || !Array.isArray(records.source) || !Array.isArray(records.review) || !Array.isArray(reviewAssets)) {
    throw new Error('Persistence returned invalid version assets')
  }
  const snapshotSources = version.snapshot.assets.filter((asset) => ['direction', 'final_image'].includes(asset.kind))
  const snapshotReview = version.snapshot.assets.filter((asset) => ['review_png', 'manifest'].includes(asset.kind))
  const source = hashes(records.source)
  const review = hashes(records.review)
  if (!same(source, hashes(snapshotSources.map((asset) => asset.sha256)))
    || !same(review, hashes(snapshotReview.map((asset) => asset.sha256)))
    || snapshotReview.filter((asset) => asset.kind === 'manifest').length !== 1
    || snapshotReview.filter((asset) => asset.kind === 'review_png').length < 1
    || reviewAssets.length !== snapshotReview.length) {
    fail(409, 'version_asset_mismatch', 'Review assets do not match the immutable version')
  }
  const expectedById = new Map(snapshotReview.map((asset) => [asset.id, asset]))
  if (expectedById.size !== snapshotReview.length) fail(409, 'version_asset_mismatch', 'Review asset identities are ambiguous')
  for (const asset of reviewAssets) {
    const expected = expectedById.get(asset?.id)
    if (!expected || expected.kind !== asset.kind || expected.sha256 !== asset.sha256
      || asset.campaignId !== version.campaignId || asset.versionId !== version.id
      || asset.source !== 'render' || asset.generationJobId != null
      || !Number.isSafeInteger(asset.byteSize) || asset.byteSize <= 0
      || (asset.kind === 'review_png' && (asset.mimeType !== 'image/png'
        || !Number.isSafeInteger(asset.width) || asset.width <= 0
        || !Number.isSafeInteger(asset.height) || asset.height <= 0))
      || (asset.kind === 'manifest' && (asset.mimeType !== 'application/json'
        || asset.width !== null || asset.height !== null))) {
      fail(409, 'version_asset_mismatch', 'Review asset metadata is invalid')
    }
    try { assertSafeObjectKey(asset.objectKey) } catch { fail(409, 'version_asset_mismatch', 'Review asset metadata is invalid') }
  }
  return { source, review, all: hashes([...source, ...review]) }
}

function verifyReviewChain({ campaign, version, events, assetSets, expectedStatus, delivery }) {
  if (campaign.id !== version.campaignId || campaign.currentVersionNumber !== version.versionNumber
    || campaign.openVersionId !== null || campaign.status !== expectedStatus) {
    fail(409, 'version_not_current', `Delivery requires the exact current ${expectedStatus} version`)
  }
  let status
  try { status = deriveReviewStatus(events) } catch (error) {
    if (error instanceof InvalidReviewHistoryError) fail(409, 'invalid_review_history', 'Review history contains an impossible sequence')
    throw error
  }
  if (status !== expectedStatus) fail(409, 'invalid_review_history', 'Campaign status does not match review history')
  const sent = events[0]
  const ready = events.find((event) => event.eventType === 'ready')
  const approved = events.find((event) => event.eventType === 'approved')
  if (sent?.eventType !== 'sent' || sent.payload.contentHash !== version.contentHash
    || !same(hashes(sent.payload.assetHashes), assetSets.review)
    || !ready || ready.payload.contentHash !== version.contentHash
    || ready.payload.readyActorId !== ready.actorId
    || !same(hashes(ready.payload.assetHashes), assetSets.all)
    || !approved || approved.payload.contentHash !== version.contentHash
    || !same(hashes(approved.payload.assetHashes), assetSets.all)) {
    fail(409, 'invalid_review_history', 'Approval history does not match the immutable version')
  }
  if (expectedStatus === 'delivered') {
    const delivered = events.at(-1)
    if (!delivery || delivered?.eventType !== 'delivered'
      || delivered.payload.deliveryId !== delivery.id
      || delivered.payload.contentHash !== version.contentHash
      || !same(hashes(delivered.payload.assetHashes), [delivery.asset.sha256])) {
      fail(409, 'invalid_delivery_history', 'Delivery history does not match the stored ZIP')
    }
  }
  return { ready, approved, delivered: expectedStatus === 'delivered' ? events.at(-1) : null }
}

function immutableReviewAsset(asset) {
  return {
    id: asset.id, kind: asset.kind, objectKey: asset.objectKey, mimeType: asset.mimeType,
    byteSize: asset.byteSize, width: asset.width, height: asset.height, sha256: asset.sha256,
  }
}

function deterministicIdentity(version) {
  const digest = createHash('sha256').update(`banner-studio-delivery\n${version.id}\n${version.contentHash}`).digest('hex')
  return {
    buildId: `delivery-build-${digest}`,
    deliveryId: `delivery-${digest}`,
    assetId: `delivery-zip-${digest}`,
  }
}

function deliveryObjectKey(version) {
  const campaign = createHash('sha256').update(version.campaignId).digest('hex')
  const id = createHash('sha256').update(version.id).digest('hex')
  return `campaigns/${campaign}/versions/${id}/delivery/package.zip`
}

function buildPlan({ version, approval, reviewAssets, assetSets }) {
  const identity = deterministicIdentity(version)
  return {
    schemaVersion: 1,
    campaignId: version.campaignId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    versionCreatedAt: version.createdAt,
    contentHash: version.contentHash,
    approval: { eventId: approval.id, actorId: approval.actorId, at: approval.createdAt },
    immutableAssetHashes: assetSets.all,
    reviewAssets: reviewAssets.map(immutableReviewAsset).sort((left, right) => compareText(left.id, right.id)),
    buildId: identity.buildId,
    deliveryId: identity.deliveryId,
    assetId: identity.assetId,
    objectKey: deliveryObjectKey(version),
  }
}

function publicDelivery(value) {
  if (!value) return null
  const parsed = deliveryRecordSchema.safeParse({
    id: value.id, campaignId: value.campaignId, versionId: value.versionId,
    contentHash: value.contentHash, asset: value.asset, byteSize: value.byteSize,
    createdBy: value.createdBy, createdAt: value.createdAt,
  })
  if (!parsed.success) fail(409, 'delivery_integrity_failure', 'Stored delivery metadata is invalid', parsed.error.issues)
  return parsed.data
}

function verifyStoredDeliveryRecord(delivery, version) {
  const result = publicDelivery(delivery)
  const asset = delivery?.storedAsset
  if (!result || result.campaignId !== version.campaignId || result.versionId !== version.id
    || result.contentHash !== version.contentHash || result.asset.id !== asset?.id
    || result.asset.sha256 !== asset?.sha256 || result.byteSize !== asset?.byteSize
    || asset.campaignId !== version.campaignId || asset.versionId !== version.id
    || asset.kind !== 'delivery_zip' || asset.source !== 'delivery'
    || asset.mimeType !== 'application/zip' || asset.width !== null || asset.height !== null
    || asset.generationJobId != null) {
    fail(409, 'delivery_integrity_failure', 'Stored delivery metadata is invalid')
  }
  try { assertSafeObjectKey(asset.objectKey) } catch { fail(409, 'delivery_integrity_failure', 'Stored delivery metadata is invalid') }
  return result
}

async function readAssetBytes(assetStore, asset, deadlineAt) {
  let stored
  try {
    stored = await beforeDeadline(deadlineAt, (timeoutMs) => assetStore.get({
      objectKey: asset.objectKey, maxBytes: asset.byteSize, timeoutMs,
    }))
  } catch (error) {
    if (error instanceof DeliveryServiceError) throw error
    fail(502, 'asset_bytes_missing', 'Stored approved asset bytes are unavailable')
  }
  if (stored == null) fail(502, 'asset_bytes_missing', 'Stored approved asset bytes are unavailable')
  const result = Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength)
  if (result.length !== asset.byteSize || createHash('sha256').update(result).digest('hex') !== asset.sha256) {
    fail(502, 'asset_integrity_failure', 'Stored approved asset integrity verification failed')
  }
  return result
}

function parseCanonicalManifest(bytes) {
  let value
  try {
    const text = bytes.toString('utf8')
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('Invalid UTF-8')
    value = JSON.parse(text)
    if (canonicalJson(value) !== text) throw new Error('Not canonical')
  } catch {
    fail(502, 'manifest_integrity_failure', 'Stored render manifest is invalid')
  }
  return value
}

function verifyRenderManifest(value, version, pngAssets) {
  if (!exactKeys(value, ['schemaVersion', 'campaignId', 'versionId', 'versionNumber', 'template', 'compositionId', 'sourceAssets', 'renders'])
    || value.schemaVersion !== 1 || value.campaignId !== version.campaignId || value.versionId !== version.id
    || value.versionNumber !== version.versionNumber || value.compositionId !== version.snapshot.composition.id
    || !exactKeys(value.template, ['id', 'version', 'sha256'])
    || value.template.id !== version.snapshot.templateManifest.id
    || value.template.version !== version.snapshot.templateManifest.version
    || value.template.sha256 !== version.snapshot.templateManifestHash
    || !Array.isArray(value.sourceAssets) || !Array.isArray(value.renders)) {
    fail(502, 'manifest_integrity_failure', 'Stored render manifest does not match the immutable version')
  }
  const sourceRefs = version.snapshot.assets.filter((asset) => ['direction', 'final_image'].includes(asset.kind))
    .map(({ id, kind, sha256 }) => ({ id, kind, sha256 })).sort((left, right) => compareText(left.id, right.id))
  const manifestSources = value.sourceAssets.map((asset) => ({ id: asset?.id, kind: asset?.kind, sha256: asset?.sha256 }))
    .sort((left, right) => compareText(String(left.id), String(right.id)))
  if (hashCanonical(sourceRefs) !== hashCanonical(manifestSources)
    || value.renders.length !== pngAssets.length
    || value.renders.length !== version.snapshot.composition.ratioIds.length) {
    fail(502, 'manifest_integrity_failure', 'Stored render manifest does not match the immutable version')
  }
  const assetById = new Map(pngAssets.map((asset) => [asset.id, asset]))
  const ratios = new Map(version.snapshot.templateManifest.ratios.map((ratio) => [ratio.id, ratio]))
  const seenAssets = new Set()
  const seenRatios = new Set()
  for (const render of value.renders) {
    const asset = assetById.get(render?.asset?.id)
    const ratio = ratios.get(render?.ratioId)
    if (!exactKeys(render, ['ratioId', 'asset', 'manifest'])
      || !exactKeys(render.asset, ['id', 'kind', 'sha256'])
      || !asset || !ratio || render.asset.kind !== 'review_png' || render.asset.sha256 !== asset.sha256
      || seenAssets.has(asset.id) || seenRatios.has(render.ratioId)
      || !version.snapshot.composition.ratioIds.includes(render.ratioId)
      || render.manifest?.ratio !== render.ratioId
      || render.manifest?.output?.mimeType !== 'image/png'
      || render.manifest?.output?.width !== asset.width || render.manifest?.output?.height !== asset.height
      || render.manifest?.output?.byteSize !== asset.byteSize || render.manifest?.output?.sha256 !== asset.sha256
      || asset.width !== ratio.width || asset.height !== ratio.height) {
      fail(502, 'manifest_integrity_failure', 'Stored render manifest does not match its banner PNGs')
    }
    seenAssets.add(asset.id)
    seenRatios.add(render.ratioId)
  }
  if (!same([...seenRatios].sort(), [...version.snapshot.composition.ratioIds].sort())) {
    fail(502, 'manifest_integrity_failure', 'Stored render manifest is missing a composition ratio')
  }
}

async function buildPackage({ assetStore, plan, version, deadlineAt, maxArchiveBytes }) {
  if (plan.reviewAssets.reduce((total, asset) => total + asset.byteSize, 0) > maxArchiveBytes) {
    fail(413, 'delivery_too_large', 'Approved assets exceed the delivery size limit')
  }
  const loaded = []
  for (const asset of plan.reviewAssets) {
    const bytes = await readAssetBytes(assetStore, asset, deadlineAt)
    if (asset.kind === 'review_png') {
      const decoded = await beforeDeadline(deadlineAt, () => decodeGeneratedImage(bytes, 'image/png'))
      if (!decoded || decoded.width !== asset.width || decoded.height !== asset.height) {
        fail(502, 'asset_integrity_failure', 'Stored approved PNG dimensions are invalid')
      }
    }
    loaded.push({ asset, bytes })
  }
  const manifestEntry = loaded.find((entry) => entry.asset.kind === 'manifest')
  const pngEntries = loaded.filter((entry) => entry.asset.kind === 'review_png')
  const renderManifest = parseCanonicalManifest(manifestEntry.bytes)
  verifyRenderManifest(renderManifest, version, pngEntries.map((entry) => entry.asset))

  const sortedPng = [...pngEntries].sort((left, right) => {
    const leftRender = renderManifest.renders.find((render) => render.asset.id === left.asset.id)
    const rightRender = renderManifest.renders.find((render) => render.asset.id === right.asset.id)
    return compareText(leftRender.ratioId, rightRender.ratioId) || compareText(left.asset.id, right.asset.id)
  })
  const files = [
    ...sortedPng.map((entry, index) => ({
      filename: `banners/banner-${String(index + 1).padStart(3, '0')}.png`,
      assetId: entry.asset.id, mimeType: entry.asset.mimeType, byteSize: entry.asset.byteSize,
      width: entry.asset.width, height: entry.asset.height, sha256: entry.asset.sha256,
    })),
    {
      filename: 'render-manifest.json', assetId: manifestEntry.asset.id,
      mimeType: manifestEntry.asset.mimeType, byteSize: manifestEntry.asset.byteSize,
      width: null, height: null, sha256: manifestEntry.asset.sha256,
    },
  ].sort((left, right) => compareText(left.filename, right.filename))
  const deliveryManifest = deliveryManifestSchema.parse({
    schemaVersion: 1, campaignId: version.campaignId, versionId: version.id,
    versionNumber: version.versionNumber, contentHash: version.contentHash,
    approval: { actorId: plan.approval.actorId, at: plan.approval.at }, files,
  })
  const deliveryManifestBytes = Buffer.from(canonicalJson(deliveryManifest), 'utf8')
  let archive
  try {
    archive = await beforeDeadline(deadlineAt, () => buildDeterministicDeliveryArchive({
      entries: [
        ...sortedPng.map((entry, index) => ({ filename: `banners/banner-${String(index + 1).padStart(3, '0')}.png`, bytes: entry.bytes })),
        { filename: 'render-manifest.json', bytes: manifestEntry.bytes },
      ],
      deliveryManifestBytes,
      timestamp: version.createdAt,
      maxBytes: maxArchiveBytes,
    }))
  } catch (error) {
    if (error?.code === 'archive_too_large') fail(413, 'delivery_too_large', 'Approved assets exceed the delivery size limit')
    throw error
  }
  return { ...archive, deliveryManifest }
}

async function verifyStoredZip(assetStore, asset, deadlineAt) {
  const bytes = await readAssetBytes(assetStore, asset, deadlineAt)
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) {
    fail(502, 'delivery_integrity_failure', 'Stored delivery ZIP is invalid')
  }
  return bytes
}

export function createDeliveryService({
  pool,
  assetStore,
  transaction = withDeadlineTransaction,
  recoveryTransaction = transaction,
  repositoryFactory = createDeliveryRepository,
  idempotencyRepositoryFactory = createIdempotencyRepository,
  idGenerator = () => randomUUID(),
  clock = () => new Date(),
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  leaseMs = 120_000,
  pollIntervalMs = 10,
  timeoutMs = 30_000,
  recoveryTimeoutMs = 250,
  maxArchiveBytes = 256 * 1024 * 1024,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  validateAssetStore(assetStore)
  if (![transaction, recoveryTransaction, repositoryFactory, idempotencyRepositoryFactory, idGenerator, clock, wait]
    .every((value) => typeof value === 'function')) throw new TypeError('Delivery persistence dependencies are required')
  if (![leaseMs, pollIntervalMs, timeoutMs, recoveryTimeoutMs, maxArchiveBytes]
    .every((value) => Number.isSafeInteger(value) && value > 0)) throw new TypeError('Delivery limits must be positive safe integers')
  if (leaseMs <= timeoutMs + recoveryTimeoutMs) throw new TypeError('Delivery lease must exceed the operation and recovery deadlines')

  const mainTransaction = (deadlineAt, operation) => beforeDeadline(
    deadlineAt,
    (timeout) => transaction(pool, operation, { timeoutMs: timeout }),
  ).catch((error) => {
    if (error?.code === 'transaction_deadline_exceeded') throw operationTimeout()
    throw error
  })
  const boundedRecovery = (operation) => {
    const deadlineAt = Date.now() + recoveryTimeoutMs
    return beforeDeadline(deadlineAt, (timeout) => recoveryTransaction(pool, operation, { timeoutMs: timeout }), recoveryTimeout)
      .catch((error) => {
        if (error?.code === 'transaction_deadline_exceeded') throw recoveryTimeout()
        throw error
      })
  }

  async function loadContext(repository, versionId, { forUpdate = false } = {}) {
    const version = strictVersion(await repository.findVersionById(versionId) ?? fail(404, 'not_found', 'Version was not found'))
    const campaign = strictCampaign(await repository.lockCampaign(version.campaignId) ?? fail(404, 'not_found', 'Campaign was not found'))
    const events = strictEvents(await repository.listEvents(version.id, { forUpdate }), version)
    const reviewAssets = await repository.listReviewAssets(version.id, { forUpdate })
    const assetSets = reviewAssetSets(await repository.listVersionAssetHashes(version.id), version, reviewAssets)
    return { version, campaign, events, reviewAssets, assetSets }
  }

  async function prepare({ actor, versionId, key, fingerprint, ownerToken, deadlineAt }) {
    return mainTransaction(deadlineAt, async (client) => {
      const idempotency = idempotencyRepositoryFactory(client)
      if (!await idempotency.lockOwner({
        actorId: actor.id, method: 'POST', resourceId: versionId, key, fingerprint, ownerToken, now: safeInstant(clock()),
      })) fail(409, 'idempotency_owner_lost', 'Delivery command ownership was lost')
      const repository = repositoryFactory(client)
      const context = await loadContext(repository, versionId, { forUpdate: true })
      const existing = await repository.findDeliveryByVersion(versionId)
      if (existing) {
        const delivery = verifyStoredDeliveryRecord(existing, context.version)
        const chain = verifyReviewChain({ ...context, expectedStatus: 'delivered', delivery })
        return { kind: 'existing', context, delivery, event: chain.delivered, storedAsset: existing.storedAsset }
      }
      const chain = verifyReviewChain({ ...context, expectedStatus: 'approved' })
      const plan = buildPlan({ ...context, approval: chain.approved })
      const existingBuild = await repository.findBuildForUpdate(versionId)
      if (!existingBuild) {
        const build = await repository.createBuild({
          id: plan.buildId, campaignId: context.campaign.id, versionId, actorId: actor.id,
          key, fingerprint, ownerToken, plan,
        })
        return { kind: 'build', build, context }
      }
      if (hashCanonical(existingBuild.plan) !== hashCanonical(plan)) {
        fail(409, 'delivery_source_changed', 'The approved delivery source changed')
      }
      if (existingBuild.state === 'completed') fail(409, 'delivery_integrity_failure', 'Completed delivery is missing')
      const prior = await idempotency.find({
        actorId: existingBuild.actorId, method: 'POST', resourceId: versionId, key: existingBuild.key,
      })
      const now = safeInstant(clock())
      if (existingBuild.state === 'in_progress' && prior?.state === 'in_progress'
        && prior.ownerToken === existingBuild.ownerToken && prior.leaseExpiresAt > now) {
        return { kind: 'wait' }
      }
      const build = await repository.takeOverBuild({
        id: existingBuild.id, actorId: actor.id, key, fingerprint, ownerToken,
      })
      if (!build) fail(409, 'delivery_build_owner_lost', 'Delivery build ownership was lost')
      return { kind: 'build', build, context }
    })
  }

  async function adopt(build, ownerToken, deadlineAt) {
    return mainTransaction(deadlineAt, async (client) => {
      if (!await repositoryFactory(client).adoptBuildObject({
        buildId: build.id, ownerToken, campaignId: build.campaignId,
        objectKey: build.plan.objectKey, orphanId: idGenerator(), adoptedAt: safeInstant(clock()),
      })) fail(409, 'delivery_build_owner_lost', 'Delivery build ownership was lost')
    })
  }

  async function storeArchive(build, archive, deadlineAt) {
    let created = true
    try {
      await beforeDeadline(deadlineAt, (timeout) => assetStore.put({
        objectKey: build.plan.objectKey, bytes: archive.bytes, contentType: 'application/zip', timeoutMs: timeout,
      }))
    } catch (error) {
      if (error?.code !== 'object_exists') {
        if (error instanceof DeliveryServiceError) throw error
        fail(503, 'asset_storage_unavailable', 'Delivery storage is unavailable')
      }
      created = false
    }
    let stored
    try {
      stored = await beforeDeadline(deadlineAt, (timeout) => assetStore.get({
        objectKey: build.plan.objectKey, maxBytes: archive.byteSize, timeoutMs: timeout,
      }))
    } catch (error) {
      if (error instanceof DeliveryServiceError) throw error
      fail(503, 'asset_storage_unavailable', 'Delivery storage is unavailable')
    }
    const bytes = stored && Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength)
    if (!bytes || bytes.length !== archive.byteSize
      || createHash('sha256').update(bytes).digest('hex') !== archive.sha256) {
      if (!created) fail(409, 'immutable_asset_conflict', 'A delivery object already exists with different bytes')
      fail(502, 'delivery_integrity_failure', 'Stored delivery ZIP failed integrity verification')
    }
  }

  async function completeExisting({ actor, versionId, key, fingerprint, ownerToken, existing, deadlineAt }) {
    await verifyStoredZip(assetStore, existing.storedAsset, deadlineAt)
    return mainTransaction(deadlineAt, async (client) => {
      const idempotency = idempotencyRepositoryFactory(client)
      if (!await idempotency.lockOwner({
        actorId: actor.id, method: 'POST', resourceId: versionId, key, fingerprint, ownerToken, now: safeInstant(clock()),
      })) fail(409, 'idempotency_owner_lost', 'Delivery command ownership was lost')
      const repository = repositoryFactory(client)
      const context = await loadContext(repository, versionId, { forUpdate: true })
      const persisted = await repository.findDeliveryByVersion(versionId)
      const delivery = verifyStoredDeliveryRecord(persisted, context.version)
      const chain = verifyReviewChain({ ...context, expectedStatus: 'delivered', delivery })
      const body = { delivery, campaign: context.campaign, reviewStatus: 'delivered', event: chain.delivered }
      await idempotency.complete({
        actorId: actor.id, method: 'POST', resourceId: versionId, key, ownerToken,
        responseStatus: 200, responseBody: body,
      })
      return { status: 200, body, replayed: false }
    })
  }

  async function finalize({ actor, versionId, key, fingerprint, ownerToken, build, archive, deadlineAt }) {
    return mainTransaction(deadlineAt, async (client) => {
      const idempotency = idempotencyRepositoryFactory(client)
      if (!await idempotency.lockOwner({
        actorId: actor.id, method: 'POST', resourceId: versionId, key, fingerprint, ownerToken, now: safeInstant(clock()),
      })) fail(409, 'idempotency_owner_lost', 'Delivery command ownership was lost')
      const repository = repositoryFactory(client)
      const context = await loadContext(repository, versionId, { forUpdate: true })
      const chain = verifyReviewChain({ ...context, expectedStatus: 'approved' })
      const currentPlan = buildPlan({ ...context, approval: chain.approved })
      const lockedBuild = await repository.findBuildForUpdate(versionId)
      if (!lockedBuild || lockedBuild.id !== build.id || lockedBuild.ownerToken !== ownerToken
        || lockedBuild.state !== 'in_progress' || hashCanonical(lockedBuild.plan) !== hashCanonical(currentPlan)) {
        fail(409, 'delivery_build_owner_lost', 'Delivery build ownership was lost')
      }
      const transition = transitionCampaign({
        campaign: { ...context.campaign, currentVersion: {
          id: context.version.id, number: context.version.versionNumber, contentHash: context.version.contentHash,
        } },
        action: 'deliver', actor, input: { deliveryId: currentPlan.deliveryId },
      })
      if (!transition.ok) fail(transition.status, transition.code, transition.message)
      const latestTime = Math.max(...context.events.map((event) => Date.parse(event.createdAt)))
      const clockTime = safeInstant(clock()).getTime()
      const createdAt = new Date(Math.max(clockTime, latestTime + 1))
      const result = await repository.finalizeBuild({
        build: lockedBuild, campaign: context.campaign, version: context.version, actor,
        zipAsset: {
          id: currentPlan.assetId, objectKey: currentPlan.objectKey,
          byteSize: archive.byteSize, sha256: archive.sha256,
        },
        deliveryId: currentPlan.deliveryId, reviewEventId: idGenerator(), auditId: idGenerator(), createdAt,
      })
      const delivery = publicDelivery(result.delivery)
      const campaign = strictCampaign(result.campaign)
      const event = reviewEventRecordSchema.parse(result.event)
      const body = { delivery, campaign, reviewStatus: 'delivered', event }
      await idempotency.complete({
        actorId: actor.id, method: 'POST', resourceId: versionId, key, ownerToken,
        responseStatus: 201, responseBody: body,
      })
      return { status: 201, body, replayed: false }
    })
  }

  async function recover({ actor, versionId, key, fingerprint, ownerToken, build, error }) {
    return boundedRecovery(async (client) => {
      const idempotency = idempotencyRepositoryFactory(client)
      await idempotency.lockOwner({
        actorId: actor.id, method: 'POST', resourceId: versionId, key, fingerprint, ownerToken, now: safeInstant(clock()),
      })
      const record = await idempotency.find({ actorId: actor.id, method: 'POST', resourceId: versionId, key })
      if (record?.state === 'completed') return { status: record.responseStatus, body: record.responseBody, replayed: true }
      if (!record || record.fingerprint !== fingerprint || record.ownerToken !== ownerToken || record.state !== 'in_progress') return null
      if (build) {
        await repositoryFactory(client).failBuild({
          buildId: build.id, ownerToken, campaignId: build.campaignId, objectKey: build.plan.objectKey,
          orphanId: idGenerator(), reason: `delivery_${error?.code ?? 'failed'}`, failedAt: safeInstant(clock()),
        })
      }
      await idempotency.fail({
        actorId: actor.id, method: 'POST', resourceId: versionId, key, ownerToken,
        failureCode: error?.code ?? 'delivery_command_failed',
      })
      return null
    })
  }

  return Object.freeze({
    async createDelivery({ actor, versionId, idempotencyKey, input }) {
      requireActor(actor)
      if (typeof versionId !== 'string' || versionId.trim().length === 0) fail(400, 'invalid_version_id', 'Version id is required')
      validateKey(idempotencyKey)
      const command = validateInput(input ?? {})
      const fingerprint = hashCanonical({ action: 'deliver', input: command })
      const scope = { actorId: actor.id, method: 'POST', resourceId: versionId, key: idempotencyKey }
      const deadlineAt = Date.now() + timeoutMs

      while (true) {
        const ownerToken = idGenerator()
        const now = safeInstant(clock())
        const claim = await mainTransaction(deadlineAt, (client) => idempotencyRepositoryFactory(client).claim({
          ...scope, fingerprint, ownerToken, now, leaseExpiresAt: new Date(now.getTime() + leaseMs),
        }))
        if (claim.kind === 'conflict') fail(409, 'idempotency_conflict', 'This idempotency key was already used with a different request')
        if (claim.kind === 'replay') return { status: claim.responseStatus, body: claim.responseBody, replayed: true }
        if (claim.kind === 'in_progress') {
          await beforeDeadline(deadlineAt, (timeout) => wait(Math.min(pollIntervalMs, timeout)))
          continue
        }
        if (claim.kind !== 'owner') throw new TypeError(`Unknown idempotency claim result: ${claim.kind}`)

        let build
        try {
          while (true) {
            const prepared = await prepare({ actor, versionId, key: idempotencyKey, fingerprint, ownerToken, deadlineAt })
            if (prepared.kind === 'wait') {
              await beforeDeadline(deadlineAt, (timeout) => wait(Math.min(pollIntervalMs, timeout)))
              continue
            }
            if (prepared.kind === 'existing') {
              return await completeExisting({
                actor, versionId, key: idempotencyKey, fingerprint, ownerToken, existing: prepared, deadlineAt,
              })
            }
            build = prepared.build
            const version = prepared.context.version
            await adopt(build, ownerToken, deadlineAt)
            const archive = await buildPackage({ assetStore, plan: build.plan, version, deadlineAt, maxArchiveBytes })
            await storeArchive(build, archive, deadlineAt)
            return await finalize({
              actor, versionId, key: idempotencyKey, fingerprint, ownerToken, build, archive, deadlineAt,
            })
          }
        } catch (error) {
          let replay
          try { replay = await recover({ actor, versionId, key: idempotencyKey, fingerprint, ownerToken, build, error }) } catch {
            fail(503, 'delivery_recovery_unavailable', 'Delivery recovery is temporarily unavailable')
          }
          if (replay) return replay
          throw error
        }
      }
    },

    async getDelivery({ actor, versionId }) {
      requireActor(actor)
      const repository = repositoryFactory(pool)
      const version = strictVersion(await repository.findVersionById(versionId) ?? fail(404, 'not_found', 'Version was not found'))
      const campaign = strictCampaign(await repository.lockCampaign(version.campaignId) ?? fail(404, 'not_found', 'Campaign was not found'))
      const deliveryRow = await repository.findDeliveryByVersion(versionId)
      if (!deliveryRow) return null
      const events = strictEvents(await repository.listEvents(versionId), version)
      const reviewAssets = await repository.listReviewAssets(versionId)
      const assetSets = reviewAssetSets(await repository.listVersionAssetHashes(versionId), version, reviewAssets)
      const delivery = verifyStoredDeliveryRecord(deliveryRow, version)
      verifyReviewChain({ campaign, version, events, reviewAssets, assetSets, expectedStatus: 'delivered', delivery })
      return delivery
    },
  })
}
