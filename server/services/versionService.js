import { createHash, randomUUID } from 'node:crypto'
import {
  analyseBriefInputSchema,
  briefAnalysisSchema,
  campaignRecordSchema,
  campaignVersionRecordSchema,
  campaignVersionSnapshotSchema,
  compositionSchema,
  copyVariantSchema,
  createCampaignVersionRequestSchema,
  generateCopyInputSchema,
  generateDirectionsInputSchema,
  generateImageInputSchema,
  roleSchema,
  saveCompositionRequestSchema,
  visualDirectionSchema,
} from '../../shared/contracts.js'
import { canonicalJson, hashCanonical } from '../../shared/canonicalJson.js'
import { validateComposition } from '../../shared/templateManifest.js'
import { transitionCampaign } from '../../shared/workflowRules.js'
import { withDeadlineTransaction } from '../db/pool.js'
import { decodeGeneratedImage } from '../images/imageDecoder.js'
import { validateBannerRenderer } from '../rendering/bannerRenderer.js'
import { compileRenderSlotProvenance, createInProcessRenderer } from '../rendering/inProcessRenderer.js'
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

function operationTimeout() {
  return new VersionServiceError(503, 'version_operation_timeout', 'Review version creation exceeded its deadline')
}

function recoveryTimeout() {
  return new VersionServiceError(503, 'version_recovery_unavailable', 'Review version recovery is temporarily unavailable')
}

function millisecondsRemaining(deadlineAt) {
  return Math.max(0, Math.ceil(deadlineAt - Date.now()))
}

async function beforeDeadline(deadlineAt, operation, timeoutFactory = operationTimeout) {
  const remaining = millisecondsRemaining(deadlineAt)
  if (remaining <= 0) throw timeoutFactory()
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(remaining)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutFactory()), remaining)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function verifyTemplate(template) {
  if (!template || hashCanonical(template.manifest) !== template.manifestHash) {
    fail(409, 'template_integrity_failure', 'The selected template version is unavailable or invalid')
  }
}

function verifyCopyLineage(copy, campaignBrief, analysis) {
  const copyInput = generateCopyInputSchema.safeParse(copy?.generationInput)
  const analysisInput = analyseBriefInputSchema.safeParse(analysis?.generationInput)
  const analysisResult = briefAnalysisSchema.safeParse(analysis?.generationResult?.analysis)
  if (!copy?.selectedCopy || copy.stale || copy.generationStep !== 'copy' || !isSafeGeneration(copy)
    || !copyInput.success
    || hashCanonical(copyInput.data.brief) !== hashCanonical(campaignBrief)
    || !analysis || analysis.generationStep !== 'brief_analysis' || !isSafeGeneration(analysis)
    || !analysisInput.success || !analysisResult.success
    || !exactObjectKeys(analysis.generationResult, ['analysis'])
    || hashCanonical(analysisInput.data.brief) !== hashCanonical(campaignBrief)
    || hashCanonical(copyInput.data.analysis) !== hashCanonical(analysisResult.data)
    || copy.generationResult?.copySetId !== copy.id
    || !Array.isArray(copy.generationResult?.copies) || !Array.isArray(copy.candidates)
    || hashCanonical(copy.generationResult?.copies) !== hashCanonical(copy.candidates)
    || !copy.generationResult.copies.some((candidate) => (
      candidate.id === copy.selectedCandidateId && hashCanonical(candidate) === hashCanonical(copy.selectedCopy)
    ))) {
    fail(409, 'copy_selection_invalid', 'The selected copy is stale, unsafe, or unavailable')
  }
}

function verifyDirectionLineage(direction, selectedCopy, campaignBrief) {
  const directionInput = generateDirectionsInputSchema.safeParse(direction?.generationInput)
  const generated = Array.isArray(direction?.generationResult?.directions)
    ? direction.generationResult.directions.find((candidate) => candidate.id === direction.id)
    : null
  if (!direction || direction.stale || direction.status !== 'ready' || !direction.previewAssetId
    || direction.generationStep !== 'directions' || !isSafeGeneration(direction)
    || !directionInput.success
    || hashCanonical(directionInput.data.brief) !== hashCanonical(campaignBrief)
    || hashCanonical(directionInput.data.copy) !== hashCanonical(selectedCopy)
    || !generated || hashCanonical(generated) !== hashCanonical({
      id: direction.id,
      title: direction.title,
      prompt: direction.prompt,
      status: 'pending',
      previewAssetId: null,
    })) {
    fail(409, 'direction_selection_invalid', 'The selected direction is stale, unsafe, or unavailable')
  }
}

function matchesGeneratedAssetResult(asset) {
  const image = asset.generationResult?.image
  return image?.asset?.id === asset.id
    && image.asset.kind === asset.kind
    && image.asset.sha256 === asset.sha256
    && image.mimeType === asset.mimeType
    && image.width === asset.width
    && image.height === asset.height
    && image.byteSize === asset.byteSize
}

function verifyImageAssetLineage(asset, direction, { requireGenerated = false } = {}) {
  const imageInput = generateImageInputSchema.safeParse(asset?.generationInput)
  const validShape = asset && ['direction', 'final_image'].includes(asset.kind)
    && Number.isSafeInteger(asset.byteSize) && asset.byteSize > 0
    && Number.isSafeInteger(asset.width) && asset.width > 0
    && Number.isSafeInteger(asset.height) && asset.height > 0
    && typeof asset.sha256 === 'string' && /^[a-f0-9]{64}$/.test(asset.sha256)
  const generated = asset?.source === 'generation'
    && asset.generationStep === 'image'
    && isSafeGeneration(asset)
    && imageInput.success
    && hashCanonical(imageInput.data.direction) === hashCanonical({
      id: direction.id,
      title: direction.title,
      prompt: direction.prompt,
      status: 'pending',
      previewAssetId: null,
    })
    && imageInput.data.width === asset.width
    && imageInput.data.height === asset.height
    && matchesGeneratedAssetResult(asset)
  const uploaded = asset?.source === 'upload' && asset.generationJobId == null
  if (!validShape || (requireGenerated ? !generated : !(generated || uploaded))) {
    fail(409, 'composition_source_mismatch', 'The composition image must be the verified selected direction preview')
  }
}

function referencedImageAssetIds(manifest, slotValues) {
  return [...new Set(manifest.slots
    .filter((slot) => slot.type === 'image')
    .map((slot) => slotValues[slot.id])
    .filter((value) => typeof value === 'string' && value.trim().length > 0))].sort()
}

function provenanceImageAssetIds(manifest, slotValues, previewAssetId) {
  return [...new Set([
    previewAssetId,
    ...referencedImageAssetIds(manifest, slotValues),
  ].filter((value) => typeof value === 'string' && value.length > 0))].sort()
}

function immutableSourceAsset(asset) {
  return {
    id: asset.id, kind: asset.kind, objectKey: asset.objectKey,
    mimeType: asset.mimeType, byteSize: asset.byteSize, width: asset.width,
    height: asset.height, sha256: asset.sha256,
  }
}

function verifyCompositionSources({ template, composition, copy, direction, previewAsset, sourceAssets, campaignBrief }) {
  verifyDirectionLineage(direction, copy.selectedCopy, campaignBrief)
  verifyImageAssetLineage(previewAsset, direction, { requireGenerated: true })
  if (previewAsset.id !== direction.previewAssetId) {
    fail(409, 'composition_source_mismatch', 'The composition image must be the verified selected direction preview')
  }
  const sourceIds = provenanceImageAssetIds(template.manifest, composition.slotValues, direction.previewAssetId)
  if (sourceAssets.length !== sourceIds.length
    || sourceAssets.some((asset, index) => asset.id !== sourceIds[index])) {
    fail(409, 'composition_source_mismatch', 'Every composition image must be bound to this campaign')
  }
  for (const asset of sourceAssets) verifyImageAssetLineage(asset, direction)
  const validation = validateComposition(template.manifest, {
    ratioIds: composition.ratioIds,
    slotValues: composition.slotValues,
    assetMetadata: Object.fromEntries(sourceAssets.map((asset) => [asset.id, {
      width: asset.width, height: asset.height, mimeType: asset.mimeType,
    }])),
  })
  if (!validation.valid || hashCanonical(validation) !== hashCanonical(composition.validation)) {
    fail(409, 'composition_invalid', 'The selected composition is stale or invalid')
  }
}

async function readVerifiedImage(assetStore, asset, deadlineAt) {
  let stored
  try {
    stored = await beforeDeadline(deadlineAt, (timeoutMs) => assetStore.get({
      objectKey: asset.objectKey, maxBytes: asset.byteSize, timeoutMs,
    }))
  } catch (error) {
    if (error instanceof VersionServiceError && error.code === 'version_operation_timeout') throw error
    if (error?.code === 'storage_timeout') throw operationTimeout()
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
    decoded = await beforeDeadline(deadlineAt, () => decodeGeneratedImage(bytes, asset.mimeType))
  } catch (error) {
    if (error instanceof VersionServiceError && error.code === 'version_operation_timeout') throw error
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

function validatePreparedContext({ campaign, analysis, copy, direction, composition, template, previewAsset, sourceAssets, expectedRevision }) {
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
  verifyCopyLineage(copy, campaign.brief, analysis)
  verifyCompositionSources({ template, composition, copy, direction, previewAsset, sourceAssets, campaignBrief: campaign.brief })
}

function exactObjectKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && hashCanonical(Object.keys(value).sort()) === hashCanonical([...keys].sort())
}

function immutableBriefAnalysis(analysis) {
  return {
    id: analysis.id,
    input: analyseBriefInputSchema.parse(analysis.generationInput),
    result: { analysis: briefAnalysisSchema.parse(analysis.generationResult.analysis) },
  }
}

function contextMatchesPlan({ analysis, copy, direction, composition, template, sourceAssets }, plan) {
  const sources = sourceAssets.map(immutableSourceAsset)
  return hashCanonical(immutableBriefAnalysis(analysis)) === hashCanonical(plan.briefAnalysis)
    && hashCanonical(copy.selectedCopy) === hashCanonical(plan.selectedCopy)
    && hashCanonical(publicDirection(direction)) === hashCanonical(plan.selectedDirection)
    && hashCanonical(composition) === hashCanonical(plan.composition)
    && hashCanonical(template.manifest) === hashCanonical(plan.templateManifest)
    && template.manifestHash === plan.templateManifestHash
    && hashCanonical(sources) === hashCanonical(plan.sourceAssets)
}

function normalizeStoreFailure(error) {
  if (error instanceof VersionServiceError) return error
  if (error?.code === 'object_exists') return error
  if (error?.code === 'storage_timeout') return operationTimeout()
  return new VersionServiceError(503, 'asset_storage_unavailable', 'Review asset storage is unavailable')
}

export function createVersionService({
  pool,
  assetStore,
  renderer = createInProcessRenderer(),
  transaction = withDeadlineTransaction,
  recoveryTransaction = transaction,
  repositoryFactory = createVersionRepository,
  idempotencyRepositoryFactory = createIdempotencyRepository,
  idGenerator = randomUUID,
  clock = () => new Date(),
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  leaseMs = 120_000,
  pollIntervalMs = 10,
  timeoutMs = 30_000,
  recoveryTimeoutMs = 250,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  validateAssetStore(assetStore)
  validateBannerRenderer(renderer)
  if (typeof transaction !== 'function' || typeof recoveryTransaction !== 'function'
    || typeof repositoryFactory !== 'function' || typeof idempotencyRepositoryFactory !== 'function') {
    throw new TypeError('Version persistence dependencies are required')
  }
  if (![leaseMs, pollIntervalMs, timeoutMs, recoveryTimeoutMs].every((duration) => Number.isSafeInteger(duration) && duration > 0)) {
    throw new TypeError('Version lease, polling, operation, and recovery timeouts must be positive safe integers')
  }
  if (leaseMs <= timeoutMs + recoveryTimeoutMs) {
    throw new TypeError('Version lease must exceed the operation and recovery deadlines')
  }
  const mainTransaction = (deadlineAt, operation) => beforeDeadline(
    deadlineAt,
    (remaining) => transaction(pool, operation, { timeoutMs: remaining }),
  ).catch((error) => {
    if (error?.code === 'transaction_deadline_exceeded') throw operationTimeout()
    throw error
  })

  const boundedRecoveryTransaction = (operation) => {
    const deadlineAt = Date.now() + recoveryTimeoutMs
    return beforeDeadline(
      deadlineAt,
      (remaining) => recoveryTransaction(pool, operation, { timeoutMs: remaining }),
      recoveryTimeout,
    ).catch((error) => {
      if (error?.code === 'transaction_deadline_exceeded') throw recoveryTimeout()
      throw error
    })
  }

  const saveComposition = async ({ actor, campaignId, expectedRevision, input }) => {
    requireRole(actor, editors)
    validateRevision(expectedRevision)
    const command = parse(saveCompositionRequestSchema, input)
    const deadlineAt = Date.now() + timeoutMs
    return mainTransaction(deadlineAt, async (client) => {
      const repository = repositoryFactory(client)
      const campaign = await repository.lockCampaign(campaignId)
      if (!campaign) fail(404, 'not_found', 'Campaign was not found')
      if (campaign.revision !== expectedRevision) fail(409, 'revision_conflict', 'The resource changed since it was loaded')
      if (campaign.status !== 'direction_selected') {
        fail(409, campaign.openVersionId ? 'campaign_locked' : 'transition_not_allowed', 'The campaign cannot save a composition in its current state')
      }
      const template = await repository.findTemplate(command.templateId, command.templateVersion)
      verifyTemplate(template)
      const analysis = await repository.findLatestBriefAnalysis(campaign.id)
      const copy = await repository.findSelectedCopy(campaign.id, campaign.selectedCopyId)
      verifyCopyLineage(copy, campaign.brief, analysis)
      const direction = await repository.findSelectedDirection(campaign.id, campaign.selectedDirectionId)
      verifyDirectionLineage(direction, copy.selectedCopy, campaign.brief)
      const previewAsset = await repository.findAsset(campaign.id, direction.previewAssetId)
      verifyImageAssetLineage(previewAsset, direction, { requireGenerated: true })
      const sourceIds = provenanceImageAssetIds(template.manifest, command.slotValues, direction.previewAssetId)
      const sourceAssets = await repository.findAssets(campaign.id, sourceIds)
      if (sourceAssets.length !== sourceIds.length
        || sourceAssets.some((asset, index) => asset.id !== sourceIds[index])) {
        fail(409, 'composition_source_mismatch', 'Every composition image must be bound to this campaign')
      }
      for (const asset of sourceAssets) {
        verifyImageAssetLineage(asset, direction)
        await readVerifiedImage(assetStore, asset, deadlineAt)
      }
      const validation = validateComposition(template.manifest, {
        ratioIds: command.ratioIds,
        slotValues: command.slotValues,
        assetMetadata: Object.fromEntries(sourceAssets.map((asset) => [asset.id, {
          width: asset.width, height: asset.height, mimeType: asset.mimeType,
        }])),
      })
      if (!validation.valid) fail(400, 'invalid_composition', 'Composition validation failed', validation.errors)
      const composition = compositionSchema.parse({ id: idGenerator(), ...command, validation, stale: false })
      const transition = transitionCampaign({ campaign, action: 'save_composition', actor, input: { composition } })
      if (!transition.ok) fail(transition.status, transition.code, transition.message)
      return repository.insertComposition({
        composition, campaign, actor: { ...actor, auditId: idGenerator() }, createdAt: safeInstant(clock()),
      })
    })
  }

  const prepareBuild = ({ actor, campaignId, expectedRevision, key, fingerprint, ownerToken, deadlineAt }) => mainTransaction(deadlineAt, async (client) => {
    const idempotency = idempotencyRepositoryFactory(client)
    const lockedOwner = await idempotency.lockOwner({
      actorId: actor.id, method: 'POST', resourceId: campaignId, key, fingerprint, ownerToken, now: safeInstant(clock()),
    })
    if (!lockedOwner) fail(409, 'idempotency_owner_lost', 'Version command ownership was lost')
    const repository = repositoryFactory(client)
    if (!await repository.generationSafetyAvailable()) {
      fail(409, 'generation_safety_unavailable', 'Generation safety or budget controls do not allow review')
    }
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
      const direction = await repository.findSelectedDirection(campaign.id, campaign.selectedDirectionId)
      const currentContext = {
        analysis: await repository.findLatestBriefAnalysis(campaign.id),
        copy: await repository.findSelectedCopy(campaign.id, campaign.selectedCopyId),
        direction,
        composition: await repository.findComposition(campaign.id, campaign.compositionId),
        template: await repository.findTemplate(existing.plan.templateManifest.id, existing.plan.templateManifest.version),
        previewAsset: await repository.findAsset(campaign.id, direction?.previewAssetId),
        sourceAssets: await repository.findAssets(campaign.id, existing.plan.sourceAssets.map((asset) => asset.id)),
      }
      validatePreparedContext({ campaign, ...currentContext, expectedRevision })
      if (!contextMatchesPlan(currentContext, existing.plan)) {
        fail(409, 'version_source_changed', 'The selected source changed while the review version was being created')
      }
      return existing
    }

    const active = await repository.findActiveBuildForUpdate(campaignId)
    if (active) fail(409, 'version_build_in_progress', 'Another review version is being created')
    const analysis = await repository.findLatestBriefAnalysis(campaign.id)
    const copy = await repository.findSelectedCopy(campaign.id, campaign.selectedCopyId)
    const direction = await repository.findSelectedDirection(campaign.id, campaign.selectedDirectionId)
    const composition = await repository.findComposition(campaign.id, campaign.compositionId)
    const template = composition ? await repository.findTemplate(composition.templateId, composition.templateVersion) : null
    const previewAsset = await repository.findAsset(campaign.id, direction?.previewAssetId)
    const sourceIds = composition && template
      ? provenanceImageAssetIds(template.manifest, composition.slotValues, direction?.previewAssetId)
      : []
    const sourceAssets = await repository.findAssets(campaign.id, sourceIds)
    validatePreparedContext({ campaign, analysis, copy, direction, composition, template, previewAsset, sourceAssets, expectedRevision })
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
      briefAnalysis: immutableBriefAnalysis(analysis),
      selectedCopy: copyVariantSchema.parse(copy.selectedCopy),
      selectedDirection: publicDirection(direction),
      composition: compositionSchema.parse(composition),
      templateManifest: template.manifest,
      templateManifestHash: template.manifestHash,
      sourceAssets: sourceAssets.map(immutableSourceAsset),
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

  const loadRenderSources = async (plan, deadlineAt) => {
    const sources = []
    for (const asset of plan.sourceAssets) {
      sources.push({ ...asset, bytes: await readVerifiedImage(assetStore, asset, deadlineAt) })
    }
    return sources
  }

  const renderBuild = async (build, deadlineAt) => {
    const sources = await loadRenderSources(build.plan, deadlineAt)
    const sourceById = new Map(sources.map((source) => [source.id, source]))
    const renderSlots = Object.fromEntries(Object.entries(build.plan.composition.slotValues).map(([slotId, value]) => (
      sourceById.has(value)
        ? [slotId, { bytes: sourceById.get(value).bytes, mimeType: sourceById.get(value).mimeType }]
        : [slotId, value]
    )))
    const renders = []
    for (const planned of build.plan.ratioAssets) {
      const rendered = await beforeDeadline(deadlineAt, () => renderer.renderComposition({
        manifest: build.plan.templateManifest, slots: renderSlots, ratio: planned.ratioId,
      }))
      let trustedSlots
      try {
        trustedSlots = await beforeDeadline(deadlineAt, () => compileRenderSlotProvenance({
          manifest: build.plan.templateManifest, slots: renderSlots, ratio: planned.ratioId,
        }))
      } catch (error) {
        if (error instanceof VersionServiceError && error.code === 'version_operation_timeout') throw error
        fail(502, 'renderer_integrity_failure', 'Rendered review asset failed integrity verification')
      }
      let bytes
      try {
        bytes = Buffer.from(rendered.bytes)
      } catch {
        fail(502, 'renderer_integrity_failure', 'Rendered review asset failed integrity verification')
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const decoded = await beforeDeadline(deadlineAt, () => decodeGeneratedImage(bytes, 'image/png'))
      const ratio = build.plan.templateManifest.ratios.find((candidate) => candidate.id === planned.ratioId)
      const nested = rendered.renderManifest
      if (!ratio || !decoded
        || rendered.mimeType !== 'image/png' || rendered.byteSize !== bytes.length || rendered.sha256 !== sha256
        || rendered.width !== ratio.width || rendered.height !== ratio.height
        || decoded.mimeType !== 'image/png' || decoded.width !== ratio.width || decoded.height !== ratio.height
        || !exactObjectKeys(nested, ['schemaVersion', 'template', 'ratio', 'canvas', 'slots', 'output'])
        || nested.schemaVersion !== 1
        || !exactObjectKeys(nested.template, ['id', 'version', 'sha256'])
        || nested.template.id !== build.plan.templateManifest.id
        || nested.template.version !== build.plan.templateManifest.version
        || nested.template.sha256 !== build.plan.templateManifestHash
        || nested.ratio !== planned.ratioId
        || !exactObjectKeys(nested.canvas, ['width', 'height'])
        || nested.canvas.width !== ratio.width || nested.canvas.height !== ratio.height
        || !exactObjectKeys(nested.output, ['mimeType', 'width', 'height', 'byteSize', 'sha256'])
        || nested.output.mimeType !== 'image/png'
        || nested.output.width !== ratio.width || nested.output.height !== ratio.height
        || nested.output.byteSize !== bytes.length || nested.output.sha256 !== sha256
        || hashCanonical(nested.slots) !== hashCanonical(trustedSlots)) {
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
    return { sources, renders, renderManifest, manifest, assets: [...renders.map((entry) => entry.asset), manifest] }
  }

  const adoptBuildObjects = (build, ownerToken, deadlineAt) => mainTransaction(deadlineAt, async (client) => {
    const repository = repositoryFactory(client)
    const objectKeys = [
      ...build.plan.ratioAssets.map((asset) => asset.objectKey),
      build.plan.manifestAsset.objectKey,
    ]
    if (!await repository.adoptBuildObjects({
      buildId: build.id,
      ownerToken,
      campaignId: build.campaignId,
      objectKeys,
      orphanIds: objectKeys.map(() => idGenerator()),
      adoptedAt: safeInstant(clock()),
    })) {
      fail(409, 'version_build_owner_lost', 'Version build ownership was lost')
    }
  })

  const storeBuild = async (rendered, possiblyCreated, deadlineAt) => {
    for (const asset of rendered.assets) {
      possiblyCreated.add(asset.objectKey)
      let created = true
      try {
        await beforeDeadline(deadlineAt, (timeoutMs) => assetStore.put({
          objectKey: asset.objectKey, bytes: asset.bytes, contentType: asset.mimeType, timeoutMs,
        }))
      } catch (error) {
        if (error?.code !== 'object_exists') throw normalizeStoreFailure(error)
        created = false
      }
      let stored
      try {
        stored = await beforeDeadline(deadlineAt, (timeoutMs) => assetStore.get({
          objectKey: asset.objectKey, maxBytes: asset.byteSize, timeoutMs,
        }))
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

  const finalizeBuild = ({ actor, campaignId, expectedRevision, key, fingerprint, ownerToken, build, rendered, deadlineAt }) => mainTransaction(deadlineAt, async (client) => {
    const idempotency = idempotencyRepositoryFactory(client)
    const lockedOwner = await idempotency.lockOwner({
      actorId: actor.id, method: 'POST', resourceId: campaignId, key, fingerprint, ownerToken, now: safeInstant(clock()),
    })
    if (!lockedOwner) fail(409, 'idempotency_owner_lost', 'Version command ownership was lost')
    const repository = repositoryFactory(client)
    if (!await repository.generationSafetyAvailable()) {
      fail(409, 'generation_safety_unavailable', 'Generation safety or budget controls do not allow review')
    }
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
    const direction = await repository.findSelectedDirection(campaign.id, campaign.selectedDirectionId)
    const currentContext = {
      analysis: await repository.findLatestBriefAnalysis(campaign.id),
      copy: await repository.findSelectedCopy(campaign.id, campaign.selectedCopyId),
      direction,
      composition: await repository.findComposition(campaign.id, campaign.compositionId),
      template: await repository.findTemplate(build.plan.templateManifest.id, build.plan.templateManifest.version),
      previewAsset: await repository.findAsset(campaign.id, direction?.previewAssetId),
      sourceAssets: await repository.findAssetsForUpdate(campaign.id, build.plan.sourceAssets.map((asset) => asset.id)),
    }
    if (hashCanonical(currentContext.sourceAssets.map(immutableSourceAsset)) !== hashCanonical(build.plan.sourceAssets)) {
      fail(409, 'version_source_changed', 'Campaign content changed while the review version was being created')
    }
    validatePreparedContext({ campaign, ...currentContext, expectedRevision })
    if (!contextMatchesPlan(currentContext, build.plan)) {
      fail(409, 'version_source_changed', 'Campaign content changed while the review version was being created')
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
      sourceAssets: currentContext.sourceAssets,
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

  const recoverFailure = ({ actor, campaignId, key, fingerprint, ownerToken, build, objectKeys, error }) => boundedRecoveryTransaction(async (client) => {
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
        await beforeDeadline(deadlineAt, (remaining) => wait(Math.min(pollIntervalMs, remaining)))
        continue
      }
      if (claim.kind !== 'owner') throw new TypeError(`Unknown idempotency claim result: ${claim.kind}`)

      let build
      const possiblyCreated = new Set()
      try {
        build = await prepareBuild({
          actor, campaignId, expectedRevision, key: idempotencyKey, fingerprint, ownerToken, deadlineAt,
        })
        for (const objectKey of [
          ...build.plan.ratioAssets.map((asset) => asset.objectKey), build.plan.manifestAsset.objectKey,
        ]) possiblyCreated.add(objectKey)
        await adoptBuildObjects(build, ownerToken, deadlineAt)
        const rendered = await renderBuild(build, deadlineAt)
        await storeBuild(rendered, possiblyCreated, deadlineAt)
        return await finalizeBuild({
          actor, campaignId, expectedRevision, key: idempotencyKey, fingerprint, ownerToken, build, rendered, deadlineAt,
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
