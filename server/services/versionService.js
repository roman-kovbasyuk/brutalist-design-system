import { createHash, randomUUID } from 'node:crypto'
import {
  campaignRecordSchema,
  campaignVersionRecordSchema,
  campaignVersionSnapshotSchema,
  compositionSchema,
  copyVariantSchema,
  createCampaignVersionRequestSchema,
  roleSchema,
  saveCompositionRequestSchema,
  visualDirectionSchema,
} from '../../shared/contracts.js'
import { canonicalJson, hashCanonical } from '../../shared/canonicalJson.js'
import { validateComposition } from '../../shared/templateManifest.js'
import { transitionCampaign } from '../../shared/workflowRules.js'
import { withTransaction } from '../db/pool.js'
import { decodeGeneratedImage } from '../images/imageDecoder.js'
import { validateBannerRenderer } from '../rendering/bannerRenderer.js'
import { createInProcessRenderer } from '../rendering/inProcessRenderer.js'
import { createIdempotencyRepository } from '../repositories/idempotencyRepository.js'
import { createVersionRepository } from '../repositories/versionRepository.js'
import { validateAssetStore } from '../storage/assetStore.js'

const editors = new Set(['marketer', 'admin'])
const readers = new Set(['marketer', 'designer', 'admin'])

export class VersionServiceError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'VersionServiceError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.details = details
    this.expose = true
  }
}

function fail(statusCode, code, message, details) {
  throw new VersionServiceError(statusCode, code, message, details)
}

function parse(schema, value) {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  fail(400, 'invalid_request', 'Request validation failed', result.error.issues.map((issue) => ({
    path: issue.path.join('.'), message: issue.message,
  })))
}

function requireRole(actor, allowed) {
  if (!actor?.id || !roleSchema.safeParse(actor.role).success || actor.disabled === true || actor.disabledAt != null || !allowed.has(actor.role)) {
    fail(403, 'forbidden', 'This actor cannot perform the requested operation')
  }
}

function validateRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(400, 'invalid_revision', 'Expected revision must be a non-negative integer')
}

function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(value)) {
    fail(400, 'invalid_idempotency_key', 'Idempotency-Key must be 1-255 visible ASCII characters without whitespace')
  }
}

function safeInstant(value) {
  const instant = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(instant.getTime())) throw new TypeError('The version clock returned an invalid value')
  return instant
}

function isSafeGeneration(value) {
  return value?.generationStatus === 'succeeded' && value?.generationSafety?.verdict === 'safe'
}

function verifyTemplate(template) {
  if (!template || hashCanonical(template.manifest) !== template.manifestHash) {
    fail(409, 'template_integrity_failure', 'The selected template version is unavailable or invalid')
  }
}

function verifySelectionLineage({ copy, direction, sourceAsset }) {
  if (!copy?.selectedCopy || copy.stale || !isSafeGeneration(copy)) {
    fail(409, 'copy_selection_invalid', 'The selected copy is stale, unsafe, or unavailable')
  }
  if (!direction || direction.stale || direction.status !== 'ready' || !direction.previewAssetId || !isSafeGeneration(direction)) {
    fail(409, 'direction_selection_invalid', 'The selected direction is stale, unsafe, or unavailable')
  }
  if (!sourceAsset || sourceAsset.id !== direction.previewAssetId
    || !['direction', 'final_image'].includes(sourceAsset.kind)
    || sourceAsset.source !== 'generation'
    || sourceAsset.generationStep !== 'image'
    || !isSafeGeneration(sourceAsset)
    || sourceAsset.generationInput?.direction?.id !== direction.id) {
    fail(409, 'composition_source_mismatch', 'The composition image must be the verified selected direction preview')
  }
}

async function readVerifiedImage(assetStore, asset) {
  let stored
  try {
    stored = await assetStore.get({ objectKey: asset.objectKey, maxBytes: asset.byteSize })
  } catch {
    fail(502, 'asset_bytes_missing', 'Source asset bytes are unavailable')
  }
  if (stored == null) fail(502, 'asset_bytes_missing', 'Source asset bytes are unavailable')
  const bytes = Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== asset.byteSize || sha256 !== asset.sha256) {
    fail(502, 'asset_integrity_failure', 'Source asset integrity verification failed')
  }
  let decoded
  try {
    decoded = await decodeGeneratedImage(bytes, asset.mimeType)
  } catch {
    fail(502, 'asset_integrity_failure', 'Source asset integrity verification failed')
  }
  if (!decoded || decoded.mimeType !== asset.mimeType || decoded.width !== asset.width || decoded.height !== asset.height) {
    fail(502, 'asset_integrity_failure', 'Source asset integrity verification failed')
  }
  return Buffer.from(decoded.bytes)
}

function publicDirection(direction) {
  return visualDirectionSchema.parse({
    id: direction.id, title: direction.title, prompt: direction.prompt,
    status: direction.status, previewAssetId: direction.previewAssetId,
  })
}

function immutableObjectKey(campaignId, versionId, leaf) {
  const campaign = createHash('sha256').update(campaignId).digest('hex')
  const version = createHash('sha256').update(versionId).digest('hex')
  return `campaigns/${campaign}/versions/${version}/${leaf}`
}

function validatePreparedContext({ campaign, copy, direction, composition, template, sourceAsset, expectedRevision }) {
  if (!campaign) fail(404, 'not_found', 'Campaign was not found')
  if (campaign.revision !== expectedRevision) fail(409, 'revision_conflict', 'The resource changed since it was loaded')
  if (campaign.openVersionId) fail(409, 'open_version_conflict', 'The campaign already has an open review version')
  if (campaign.status !== 'composed') fail(409, 'transition_not_allowed', `Action send_for_review is not allowed from ${campaign.status}.`)
  if (!composition || composition.stale || !composition.validation?.valid || composition.id !== campaign.compositionId) {
    fail(409, 'composition_invalid', 'The selected composition is stale or invalid')
  }
  verifyTemplate(template)
  if (composition.templateId !== template.id || composition.templateVersion !== template.version) {
    fail(409, 'template_mismatch', 'The composition does not match its immutable template version')
  }
  verifySelectionLineage({ copy, direction, sourceAsset })
}

function contextMatchesPlan({ copy, direction, composition, template, sourceAsset }, plan) {
  const plannedSource = plan.sourceAssets[0]
  const source = sourceAsset && {
    id: sourceAsset.id, kind: sourceAsset.kind, objectKey: sourceAsset.objectKey,
    mimeType: sourceAsset.mimeType, byteSize: sourceAsset.byteSize, width: sourceAsset.width,
    height: sourceAsset.height, sha256: sourceAsset.sha256,
  }
  return hashCanonical(copy.selectedCopy) === hashCanonical(plan.selectedCopy)
    && hashCanonical(publicDirection(direction)) === hashCanonical(plan.selectedDirection)
    && hashCanonical(composition) === hashCanonical(plan.composition)
    && hashCanonical(template.manifest) === hashCanonical(plan.templateManifest)
    && template.manifestHash === plan.templateManifestHash
    && hashCanonical(source) === hashCanonical(plannedSource)
}

function normalizeStoreFailure(error) {
  if (error instanceof VersionServiceError) return error
  if (error?.code === 'object_exists') return error
  return new VersionServiceError(503, 'asset_storage_unavailable', 'Review asset storage is unavailable')
}

export function createVersionService({
  pool,
  assetStore,
  renderer = createInProcessRenderer(),
  transaction = withTransaction,
  repositoryFactory = createVersionRepository,
  idempotencyRepositoryFactory = createIdempotencyRepository,
  idGenerator = randomUUID,
  clock = () => new Date(),
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  leaseMs = 120_000,
  pollIntervalMs = 10,
  waitTimeoutMs = 5_000,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  validateAssetStore(assetStore)
  validateBannerRenderer(renderer)
  if (typeof transaction !== 'function' || typeof repositoryFactory !== 'function' || typeof idempotencyRepositoryFactory !== 'function') {
    throw new TypeError('Version persistence dependencies are required')
  }
  const coordinator = idempotencyRepositoryFactory(pool)

  const saveComposition = async ({ actor, campaignId, expectedRevision, input }) => {
    requireRole(actor, editors)
    validateRevision(expectedRevision)
    const command = parse(saveCompositionRequestSchema, input)
    return transaction(pool, async (client) => {
      const repository = repositoryFactory(client)
      const campaign = await repository.lockCampaign(campaignId)
      if (!campaign) fail(404, 'not_found', 'Campaign was not found')
      if (campaign.revision !== expectedRevision) fail(409, 'revision_conflict', 'The resource changed since it was loaded')
      if (campaign.status !== 'direction_selected') {
        fail(409, campaign.openVersionId ? 'campaign_locked' : 'transition_not_allowed', 'The campaign cannot save a composition in its current state')
      }
      const template = await repository.findTemplate(command.templateId, command.templateVersion)
      verifyTemplate(template)
      const direction = await repository.findSelectedDirection(campaign.id, campaign.selectedDirectionId)
      const sourceAsset = await repository.findAsset(campaign.id, direction?.previewAssetId)
      if (!direction || !sourceAsset) fail(409, 'composition_source_mismatch', 'The composition image must be the verified selected direction preview')
      if (direction.stale || direction.status !== 'ready' || !isSafeGeneration(direction) || sourceAsset.id !== direction.previewAssetId
        || sourceAsset.source !== 'generation' || sourceAsset.generationStep !== 'image'
        || !isSafeGeneration(sourceAsset) || sourceAsset.generationInput?.direction?.id !== direction.id) {
        fail(409, 'composition_source_mismatch', 'The composition image must be the verified selected direction preview')
      }
      const imageSlotIds = template.manifest.slots.filter((slot) => slot.type === 'image').map((slot) => slot.id)
      if (imageSlotIds.some((slotId) => command.slotValues[slotId] !== direction.previewAssetId)) {
        fail(409, 'composition_source_mismatch', 'The composition image must be the verified selected direction preview')
      }
      const sourceBytes = await readVerifiedImage(assetStore, sourceAsset)
      const validation = validateComposition(template.manifest, {
        ratioIds: command.ratioIds,
        slotValues: command.slotValues,
        assetMetadata: {
          [sourceAsset.id]: { width: sourceAsset.width, height: sourceAsset.height, mimeType: sourceAsset.mimeType },
        },
      })
      if (!validation.valid) fail(400, 'invalid_composition', 'Composition validation failed', validation.errors)
      if (sourceBytes.length < 1) fail(502, 'asset_integrity_failure', 'Source asset integrity verification failed')
      const composition = compositionSchema.parse({ id: idGenerator(), ...command, validation, stale: false })
      const transition = transitionCampaign({ campaign, action: 'save_composition', actor, input: { composition } })
      if (!transition.ok) fail(transition.status, transition.code, transition.message)
      return repository.insertComposition({
        composition, campaign, actor: { ...actor, auditId: idGenerator() }, createdAt: safeInstant(clock()),
      })
    })
  }

  const prepareBuild = async ({ actor, campaignId, expectedRevision, key, fingerprint, ownerToken }) => transaction(pool, async (client) => {
    const idempotency = idempotencyRepositoryFactory(client)
    const lockedOwner = await idempotency.lockOwner({
      actorId: actor.id, method: 'POST', resourceId: campaignId, key, fingerprint, ownerToken, now: safeInstant(clock()),
    })
    if (!lockedOwner) fail(409, 'idempotency_owner_lost', 'Version command ownership was lost')
    const repository = repositoryFactory(client)
    const campaign = await repository.lockCampaign(campaignId)
    if (!campaign) fail(404, 'not_found', 'Campaign was not found')
    if (campaign.revision !== expectedRevision) fail(409, 'revision_conflict', 'The resource changed since it was loaded')

    let existing = await repository.findBuildForUpdate({ actorId: actor.id, campaignId, key })
    if (existing) {
      if (existing.fingerprint !== fingerprint || existing.expectedRevision !== expectedRevision) {
        fail(409, 'idempotency_conflict', 'This idempotency key was already used with a different request')
      }
      if (existing.state === 'completed') fail(409, 'idempotency_owner_lost', 'Completed version response is unavailable')
      if (existing.state === 'failed') {
        const active = await repository.findActiveBuildForUpdate(campaignId)
        if (active && active.id !== existing.id) fail(409, 'version_build_in_progress', 'Another review version is being created')
        existing = await repository.reactivateBuild({ id: existing.id, ownerToken })
      } else if (existing.ownerToken !== ownerToken) {
        existing = await repository.takeOverBuild({ id: existing.id, ownerToken })
        if (!existing) fail(409, 'version_build_in_progress', 'Another review version is being created')
      }
      const currentContext = {
        copy: await repository.findSelectedCopy(campaign.id, campaign.selectedCopyId),
        direction: await repository.findSelectedDirection(campaign.id, campaign.selectedDirectionId),
        composition: await repository.findComposition(campaign.id, campaign.compositionId),
        template: await repository.findTemplate(existing.plan.templateManifest.id, existing.plan.templateManifest.version),
        sourceAsset: await repository.findAsset(campaign.id, existing.plan.sourceAssets[0].id),
      }
      validatePreparedContext({ campaign, ...currentContext, expectedRevision })
      if (!contextMatchesPlan(currentContext, existing.plan)) {
        fail(409, 'version_source_changed', 'The selected source changed while the review version was being created')
      }
      if (!await repository.generationSafetyAvailable()) {
        fail(409, 'generation_safety_unavailable', 'Generation safety or budget controls do not allow review')
      }
      return existing
    }

    const active = await repository.findActiveBuildForUpdate(campaignId)
    if (active) fail(409, 'version_build_in_progress', 'Another review version is being created')
    const copy = await repository.findSelectedCopy(campaign.id, campaign.selectedCopyId)
    const direction = await repository.findSelectedDirection(campaign.id, campaign.selectedDirectionId)
    const composition = await repository.findComposition(campaign.id, campaign.compositionId)
    const template = composition ? await repository.findTemplate(composition.templateId, composition.templateVersion) : null
    const sourceAsset = await repository.findAsset(campaign.id, direction?.previewAssetId)
    validatePreparedContext({ campaign, copy, direction, composition, template, sourceAsset, expectedRevision })
    if (!await repository.generationSafetyAvailable()) {
      fail(409, 'generation_safety_unavailable', 'Generation safety or budget controls do not allow review')
    }
    const versionId = idGenerator()
    const ratioAssets = composition.ratioIds.map((ratioId) => {
      const id = idGenerator()
      return { id, ratioId, objectKey: immutableObjectKey(campaign.id, versionId, `review-${createHash('sha256').update(ratioId).digest('hex')}-${id}.png`) }
    })
    const manifestAssetId = idGenerator()
    const plan = {
      binding: {
        selectedCopyId: campaign.selectedCopyId,
        selectedDirectionId: campaign.selectedDirectionId,
        compositionId: campaign.compositionId,
        currentVersionNumber: campaign.currentVersionNumber,
      },
      selectedCopy: copyVariantSchema.parse(copy.selectedCopy),
      selectedDirection: publicDirection(direction),
      composition: compositionSchema.parse(composition),
      templateManifest: template.manifest,
      templateManifestHash: template.manifestHash,
      sourceAssets: [{
        id: sourceAsset.id, kind: sourceAsset.kind, objectKey: sourceAsset.objectKey,
        mimeType: sourceAsset.mimeType, byteSize: sourceAsset.byteSize, width: sourceAsset.width,
        height: sourceAsset.height, sha256: sourceAsset.sha256,
      }],
      ratioAssets,
      manifestAsset: {
        id: manifestAssetId,
        objectKey: immutableObjectKey(campaign.id, versionId, `render-manifest-${manifestAssetId}.json`),
      },
    }
    const transition = transitionCampaign({
      campaign, action: 'send_for_review', actor,
      input: {
        version: { id: versionId, number: campaign.currentVersionNumber + 1, contentHash: '0'.repeat(64) },
        hasOpenVersion: false, safetyPassed: true, budgetAvailable: true,
      },
    })
    if (!transition.ok) fail(transition.status, transition.code, transition.message)
    return repository.createBuild({
      id: idGenerator(), campaignId: campaign.id, actorId: actor.id, key, fingerprint, ownerToken,
      versionId, versionNumber: campaign.currentVersionNumber + 1, expectedRevision, plan,
    })
  })

  const loadRenderSource = async (plan) => {
    const asset = plan.sourceAssets[0]
    const bytes = await readVerifiedImage(assetStore, asset)
    return { ...asset, bytes }
  }

  const renderBuild = async (build) => {
    const source = await loadRenderSource(build.plan)
    const renderSlots = Object.fromEntries(Object.entries(build.plan.composition.slotValues).map(([slotId, value]) => (
      value === source.id ? [slotId, { bytes: source.bytes, mimeType: source.mimeType }] : [slotId, value]
    )))
    const renders = []
    for (const planned of build.plan.ratioAssets) {
      const rendered = await renderer.renderComposition({
        manifest: build.plan.templateManifest, slots: renderSlots, ratio: planned.ratioId,
      })
      const bytes = Buffer.from(rendered.bytes)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (rendered.mimeType !== 'image/png' || rendered.byteSize !== bytes.length || rendered.sha256 !== sha256) {
        fail(502, 'renderer_integrity_failure', 'Rendered review asset failed integrity verification')
      }
      renders.push({
        ratioId: planned.ratioId,
        renderManifest: rendered.renderManifest,
        asset: {
          id: planned.id, kind: 'review_png', objectKey: planned.objectKey, mimeType: 'image/png',
          byteSize: bytes.length, width: rendered.width, height: rendered.height, sha256, bytes,
        },
      })
    }
    const renderManifest = {
      schemaVersion: 1,
      campaignId: build.campaignId,
      versionId: build.versionId,
      versionNumber: build.versionNumber,
      template: { id: build.plan.templateManifest.id, version: build.plan.templateManifest.version, sha256: build.plan.templateManifestHash },
      compositionId: build.plan.composition.id,
      sourceAssets: build.plan.sourceAssets.map(({ objectKey: _objectKey, ...asset }) => asset),
      renders: renders.map((render) => ({ ratioId: render.ratioId, asset: { id: render.asset.id, kind: render.asset.kind, sha256: render.asset.sha256 }, manifest: render.renderManifest })),
    }
    const manifestBytes = Buffer.from(canonicalJson(renderManifest), 'utf8')
    const manifest = {
      id: build.plan.manifestAsset.id, kind: 'manifest', objectKey: build.plan.manifestAsset.objectKey,
      mimeType: 'application/json', byteSize: manifestBytes.length, width: null, height: null,
      sha256: createHash('sha256').update(manifestBytes).digest('hex'), bytes: manifestBytes,
    }
    return { source, renders, renderManifest, manifest, assets: [...renders.map((entry) => entry.asset), manifest] }
  }

  const storeBuild = async (rendered, possiblyCreated) => {
    for (const asset of rendered.assets) {
      possiblyCreated.add(asset.objectKey)
      let created = true
      try {
        await assetStore.put({ objectKey: asset.objectKey, bytes: asset.bytes, contentType: asset.mimeType })
      } catch (error) {
        if (error?.code !== 'object_exists') throw normalizeStoreFailure(error)
        created = false
        possiblyCreated.delete(asset.objectKey)
      }
      let stored
      try {
        stored = await assetStore.get({ objectKey: asset.objectKey, maxBytes: asset.byteSize })
      } catch (error) {
        throw normalizeStoreFailure(error)
      }
      const bytes = stored && Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength)
      const sha256 = bytes && createHash('sha256').update(bytes).digest('hex')
      if (!bytes || bytes.length !== asset.byteSize || sha256 !== asset.sha256) {
        if (!created) fail(409, 'immutable_asset_conflict', 'A deterministic review object already exists with different bytes')
        fail(502, 'asset_integrity_failure', 'Stored review asset integrity verification failed')
      }
      possiblyCreated.add(asset.objectKey)
    }
  }

  const finalizeBuild = async ({ actor, campaignId, expectedRevision, key, fingerprint, ownerToken, build, rendered }) => transaction(pool, async (client) => {
    const idempotency = idempotencyRepositoryFactory(client)
    const lockedOwner = await idempotency.lockOwner({
      actorId: actor.id, method: 'POST', resourceId: campaignId, key, fingerprint, ownerToken, now: safeInstant(clock()),
    })
    if (!lockedOwner) fail(409, 'idempotency_owner_lost', 'Version command ownership was lost')
    const repository = repositoryFactory(client)
    const campaign = await repository.lockCampaign(campaignId)
    if (!campaign) fail(404, 'not_found', 'Campaign was not found')
    const lockedBuild = await repository.findBuildForUpdate({ actorId: actor.id, campaignId, key })
    if (!lockedBuild || lockedBuild.id !== build.id || lockedBuild.ownerToken !== ownerToken || lockedBuild.state !== 'in_progress') {
      fail(409, 'version_build_owner_lost', 'Version build ownership was lost')
    }
    if (campaign.revision !== expectedRevision) fail(409, 'revision_conflict', 'The resource changed since it was loaded')
    if (campaign.status !== 'composed' || campaign.openVersionId
      || campaign.selectedCopyId !== build.plan.binding.selectedCopyId
      || campaign.selectedDirectionId !== build.plan.binding.selectedDirectionId
      || campaign.compositionId !== build.plan.binding.compositionId
      || campaign.currentVersionNumber !== build.plan.binding.currentVersionNumber) {
      fail(409, 'version_source_changed', 'Campaign content changed while the review version was being created')
    }
    const currentContext = {
      copy: await repository.findSelectedCopy(campaign.id, campaign.selectedCopyId),
      direction: await repository.findSelectedDirection(campaign.id, campaign.selectedDirectionId),
      composition: await repository.findComposition(campaign.id, campaign.compositionId),
      template: await repository.findTemplate(build.plan.templateManifest.id, build.plan.templateManifest.version),
      sourceAsset: await repository.findAsset(campaign.id, build.plan.sourceAssets[0].id),
    }
    validatePreparedContext({ campaign, ...currentContext, expectedRevision })
    if (!contextMatchesPlan(currentContext, build.plan)) {
      fail(409, 'version_source_changed', 'Campaign content changed while the review version was being created')
    }
    if (!await repository.generationSafetyAvailable()) {
      fail(409, 'generation_safety_unavailable', 'Generation safety or budget controls do not allow review')
    }
    const assetReferences = [
      ...build.plan.sourceAssets.map((asset) => ({ id: asset.id, kind: asset.kind, sha256: asset.sha256 })),
      ...rendered.renders.map((entry) => ({ id: entry.asset.id, kind: 'review_png', sha256: entry.asset.sha256 })),
      { id: rendered.manifest.id, kind: 'manifest', sha256: rendered.manifest.sha256 },
    ]
    const snapshot = campaignVersionSnapshotSchema.parse({
      selectedCopy: build.plan.selectedCopy,
      selectedDirection: build.plan.selectedDirection,
      composition: build.plan.composition,
      assets: assetReferences,
      templateManifest: build.plan.templateManifest,
      templateManifestHash: build.plan.templateManifestHash,
    })
    const contentHash = hashCanonical(snapshot)
    const createdAt = safeInstant(clock())
    const result = await repository.finalizeBuild({
      build: lockedBuild,
      campaign,
      actor,
      snapshot,
      contentHash,
      assets: rendered.assets.map(({ bytes: _bytes, ...asset }) => asset),
      reviewEventId: idGenerator(),
      auditId: idGenerator(),
      createdAt,
    })
    const body = {
      version: campaignVersionRecordSchema.parse(result.version),
      campaign: campaignRecordSchema.parse(result.campaign),
    }
    await idempotency.complete({
      actorId: actor.id, method: 'POST', resourceId: campaignId, key, ownerToken,
      responseStatus: 201, responseBody: body,
    })
    return { status: 201, body, replayed: false }
  })

  const recoverFailure = ({ actor, campaignId, key, fingerprint, ownerToken, build, objectKeys, error }) => transaction(pool, async (client) => {
    const idempotency = idempotencyRepositoryFactory(client)
    await idempotency.lockOwner({
      actorId: actor.id, method: 'POST', resourceId: campaignId, key, fingerprint, ownerToken, now: safeInstant(clock()),
    })
    const record = await idempotency.find({ actorId: actor.id, method: 'POST', resourceId: campaignId, key })
    if (record?.state === 'completed') {
      return { status: record.responseStatus, body: record.responseBody, replayed: true }
    }
    if (!record || record.fingerprint !== fingerprint || record.ownerToken !== ownerToken || record.state !== 'in_progress') {
      return null
    }
    const repository = repositoryFactory(client)
    const orphanIds = objectKeys.map(() => idGenerator())
    await repository.failBuild({
      buildId: build?.id,
      ownerToken,
      campaignId,
      objectKeys,
      reason: `review_version_${error?.code ?? 'failed'}`,
      orphanIds,
      failedAt: safeInstant(clock()),
    })
    await idempotency.fail({
      actorId: actor.id, method: 'POST', resourceId: campaignId, key, ownerToken,
      failureCode: error?.code ?? 'version_command_failed',
    })
    return null
  })

  const createVersion = async ({ actor, campaignId, expectedRevision, idempotencyKey, input }) => {
    requireRole(actor, editors)
    validateRevision(expectedRevision)
    validateIdempotencyKey(idempotencyKey)
    const command = parse(createCampaignVersionRequestSchema, input ?? {})
    const fingerprint = hashCanonical({ expectedRevision, input: command })
    const scope = { actorId: actor.id, method: 'POST', resourceId: campaignId, key: idempotencyKey }
    const waitDeadline = safeInstant(clock()).getTime() + waitTimeoutMs

    while (true) {
      const ownerToken = idGenerator()
      const now = safeInstant(clock())
      const claim = await coordinator.claim({
        ...scope, fingerprint, ownerToken, now, leaseExpiresAt: new Date(now.getTime() + leaseMs),
      })
      if (claim.kind === 'conflict') fail(409, 'idempotency_conflict', 'This idempotency key was already used with a different request')
      if (claim.kind === 'replay') return { status: claim.responseStatus, body: claim.responseBody, replayed: true }
      if (claim.kind === 'in_progress') {
        if (safeInstant(clock()).getTime() >= waitDeadline) fail(409, 'idempotency_in_progress', 'The original request is still in progress')
        await wait(pollIntervalMs)
        continue
      }
      if (claim.kind !== 'owner') throw new TypeError(`Unknown idempotency claim result: ${claim.kind}`)

      let build
      const possiblyCreated = new Set()
      try {
        build = await prepareBuild({
          actor, campaignId, expectedRevision, key: idempotencyKey, fingerprint, ownerToken,
        })
        const rendered = await renderBuild(build)
        await storeBuild(rendered, possiblyCreated)
        return await finalizeBuild({
          actor, campaignId, expectedRevision, key: idempotencyKey, fingerprint, ownerToken, build, rendered,
        })
      } catch (error) {
        let replay
        try {
          replay = await recoverFailure({
            actor, campaignId, key: idempotencyKey, fingerprint, ownerToken, build,
            objectKeys: [...possiblyCreated], error,
          })
        } catch {
          fail(503, 'version_recovery_unavailable', 'Review version recovery is temporarily unavailable')
        }
        if (replay) return replay
        throw error
      }
    }
  }

  return Object.freeze({
    saveComposition,
    createVersion,
    async getVersion({ actor, campaignId, versionNumber }) {
      requireRole(actor, readers)
      if (!Number.isSafeInteger(versionNumber) || versionNumber <= 0) fail(400, 'invalid_version_number', 'Version number must be a positive integer')
      return repositoryFactory(pool).findVersion(campaignId, versionNumber)
    },
    async listVersions({ actor, campaignId }) {
      requireRole(actor, readers)
      return repositoryFactory(pool).listVersions(campaignId)
    },
  })
}
