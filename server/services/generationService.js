import { createHash, randomUUID } from 'node:crypto'
import {
  analyseBriefRequestSchema,
  copyGenerationRequestSchema,
  copySelectionRequestSchema,
  directionGenerationRequestSchema,
  directionSelectionRequestSchema,
  imageGenerationRequestSchema,
} from '../../shared/contracts.js'
import { invokeProvider, validateGenerationProvider } from '../providers/provider.js'
import { decodeGeneratedImage } from '../images/imageDecoder.js'
import { assertAssetBytes, validateAssetStore } from '../storage/assetStore.js'
import { validVisualResult } from './visualContext.js'

const editorRoles = ['marketer', 'admin']
const readerRoles = ['marketer', 'designer', 'admin']
const defaultMaximumCosts = Object.freeze({ brief_analysis: 1_000, copy: 3_000, directions: 5_000, image: 250_000 })

export class GenerationServiceError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'GenerationServiceError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.details = details
    this.expose = true
  }
}

function requireRole(actor, roles) {
  if (!actor?.id || actor.disabled === true || actor.disabledAt != null || !roles.includes(actor.role)) {
    throw new GenerationServiceError(403, 'forbidden', 'This actor cannot perform the requested operation')
  }
}

function validate(schema, value) {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new GenerationServiceError(400, 'invalid_request', 'Request validation failed', result.error.issues.map((issue) => ({
    path: issue.path.join('.'), message: issue.message,
  })))
}

function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(value)) {
    throw new GenerationServiceError(400, 'invalid_idempotency_key', 'Idempotency-Key must be 1-255 visible ASCII characters without whitespace')
  }
  return value
}

function safeInstant(value, name) {
  const instant = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(instant.getTime())) throw new TypeError(`${name} must be a valid instant`)
  return instant
}

function providerInput(step, context, input) {
  if (step === 'brief_analysis') return { brief: context.brief, ...(context.instruction ? { instruction: context.instruction } : {}) }
  if (step === 'copy') return { brief: context.brief, analysis: context.analysis,
    ...(context.previousHeadlines ? { previousHeadlines: context.previousHeadlines } : {}) }
  if (step === 'directions') return context.mode ? { brief: context.brief, analysis: context.analysis, mode: context.mode, copies: context.copies } : { brief: context.brief, copy: context.copy }
  if (step === 'image') return { direction: context.direction, width: input.width, height: input.height }
  throw new TypeError(`Unknown generation step ${step}`)
}

function operationFor(step) {
  return ({ brief_analysis: 'analyseBrief', copy: 'generateCopy', directions: 'generateDirections', image: 'generateImage' })[step]
}

function normalizedResult(step, result) {
  if (result.error || result.safety.verdict === 'blocked') {
    return {
      status: result.safety.verdict === 'blocked' || result.error?.code === 'content_rejected' ? 'blocked' : 'failed',
      resultMetadata: null,
      errorCode: result.error?.code ?? 'provider_blocked',
    }
  }
  if (step === 'brief_analysis') return { status: 'succeeded', resultMetadata: { analysis: result.analysis } }
  if (step === 'copy') return { status: 'succeeded', resultMetadata: { copies: result.copies } }
  if (step === 'directions') return { status: 'succeeded', resultMetadata: { directions: result.directions } }
  throw new TypeError(`Unknown generation step ${step}`)
}

const extensionsByMimeType = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })

function hashedPathSegment(value) {
  return createHash('sha256').update(value).digest('hex')
}

function generatedObjectKey({ campaignId, jobId, assetId, mimeType }) {
  if (typeof assetId !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(assetId)) throw new TypeError('Generated asset id is unsafe')
  const extension = extensionsByMimeType[mimeType]
  if (!extension) throw new TypeError('Generated image MIME type is unsupported')
  return `campaigns/${hashedPathSegment(campaignId)}/generation-jobs/${hashedPathSegment(jobId)}/generated/${assetId}.${extension}`
}

function persistenceTimedOut(error) {
  return ['55P03', '57014', 'generation_persistence_timeout'].includes(error?.code)
}

async function beforeDeadline(operation, timeoutAt, clock, code) {
  const remaining = safeInstant(timeoutAt, 'Generation timeout').getTime() - safeInstant(clock(), 'Generation clock').getTime()
  if (remaining <= 0) {
    const error = new Error('Generation durability deadline elapsed')
    error.code = code
    error.operationStarted = false
    throw error
  }
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(remaining)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Generation durability deadline elapsed')
          error.code = code
          error.operationStarted = true
          reject(error)
        }, remaining)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function createGenerationService({
  pool,
  controlPlane,
  providers,
  idGenerator = randomUUID,
  ownerTokenGenerator = randomUUID,
  assetIdGenerator = randomUUID,
  clock = () => new Date(),
  timeoutMs = 30_000,
  maximumCosts = defaultMaximumCosts,
  assetStore,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  if (!controlPlane || typeof controlPlane.prepareGeneration !== 'function') throw new TypeError('A generation control plane is required')
  if (typeof controlPlane.preflightGeneration !== 'function' || typeof controlPlane.waitForResult !== 'function'
    || typeof controlPlane.recoverGeneration !== 'function') {
    throw new TypeError('The generation control plane must support replay preflight and result coordination')
  }
  if (!providers || typeof providers !== 'object') throw new TypeError('Generation providers are required')
  for (const provider of Object.values(providers)) validateGenerationProvider(provider)
  if (assetStore !== undefined) {
    validateAssetStore(assetStore)
    if (typeof controlPlane.completeGeneratedImage !== 'function') {
      throw new TypeError('Durable image generation requires image persistence')
    }
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('Generation timeout must be a positive safe integer')
  for (const [step, cost] of Object.entries(maximumCosts)) {
    if (!Number.isSafeInteger(cost) || cost < 0) throw new TypeError(`Maximum cost for ${step} must be a non-negative safe integer`)
  }
  const recoverGeneration = async (input) => {
    try {
      return await controlPlane.recoverGeneration(input)
    } catch {
      throw new GenerationServiceError(
        503,
        'generation_recovery_unavailable',
        'Generation result recovery is temporarily unavailable',
      )
    }
  }
  const execute = async ({ actor, campaignId, idempotencyKey, input, step, schema }) => {
    requireRole(actor, editorRoles)
    const command = validate(schema, input ?? {})
    validateIdempotencyKey(idempotencyKey)
    if (typeof campaignId !== 'string' || campaignId.trim().length === 0) throw new GenerationServiceError(400, 'invalid_campaign_id', 'Campaign id is required')

    const preflight = await controlPlane.preflightGeneration({ actor, campaignId, step, input: command, idempotencyKey })
    if (preflight.kind === 'replay') return { ...preflight.response, replayed: true }
    if (preflight.kind === 'in_progress') {
      return { ...(await controlPlane.waitForResult({ jobId: preflight.job.id })), replayed: true }
    }
    if (preflight.kind !== 'new' && preflight.kind !== 'claimable') {
      throw new TypeError(`Unknown generation preflight result ${preflight.kind}`)
    }

    if (step === 'image' && !assetStore) {
      throw new GenerationServiceError(503, 'image_storage_unavailable', 'Image generation is unavailable until durable storage is configured')
    }

    const startedAt = safeInstant(clock(), 'Generation clock')
    const jobId = idGenerator()
    const ownerToken = ownerTokenGenerator()
    const prepared = await controlPlane.prepareGeneration({
      actor,
      campaignId,
      step,
      input: command,
      idempotencyKey,
      jobId,
      ownerToken,
      maxCostMicrounits: maximumCosts[step],
      startedAt,
      timeoutAt: new Date(startedAt.getTime() + timeoutMs),
    })
    if (prepared.kind === 'replay') return { ...prepared.response, replayed: true }
    if (prepared.kind === 'in_progress') {
      return { ...(await controlPlane.waitForResult({ jobId: prepared.job.id })), replayed: true }
    }
    if (prepared.kind !== 'owner') throw new TypeError(`Unknown generation preparation result ${prepared.kind}`)

    const dispatched = await controlPlane.markDispatched({
      jobId: prepared.job.id,
      ownerToken: prepared.ownerToken,
      dispatchedAt: safeInstant(clock(), 'Generation clock'),
    })
    if (!dispatched) {
      return { ...(await controlPlane.waitForResult({ jobId: prepared.job.id })), replayed: true }
    }

    const provider = providers[prepared.job.provider]
    if (!provider) {
      return recoverGeneration({
        jobId: prepared.job.id, ownerToken: prepared.ownerToken, reason: 'provider_configuration_missing',
      })
    }

    const abortController = new AbortController()
    let timer
    const providerCall = Promise.resolve().then(() => invokeProvider(
      provider,
      operationFor(step),
      providerInput(step, prepared.context, command),
      abortController.signal,
    ))
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        abortController.abort()
        const error = new Error('Provider call timed out')
        error.code = 'provider_timeout'
        reject(error)
      }, timeoutMs)
    })

    let result
    try {
      result = await Promise.race([providerCall, timeout])
    } catch (error) {
      return recoverGeneration({
        jobId: prepared.job.id,
        ownerToken: prepared.ownerToken,
        reason: error?.code === 'provider_timeout' || error?.name === 'AbortError' ? 'provider_timeout' : 'provider_call_ambiguous',
      })
    } finally {
      clearTimeout(timer)
    }

    if (result.provider !== prepared.job.provider || result.model !== prepared.job.model || result.region !== prepared.job.region) {
      return recoverGeneration({
        jobId: prepared.job.id, ownerToken: prepared.ownerToken, reason: 'provider_identity_mismatch',
      })
    }

    if (step === 'image' && !result.error && result.safety.verdict !== 'blocked') {
      const decoded = await decodeGeneratedImage(result.image.bytes, result.image.mimeType)
      if (!decoded) {
        return controlPlane.completeProviderResult({
          jobId: prepared.job.id,
          ownerToken: prepared.ownerToken,
          status: 'failed',
          safety: result.safety,
          usage: result.usage,
          actualCostMicrounits: result.actualCostMicrounits,
          resultMetadata: null,
          errorCode: 'invalid_output',
          completedAt: safeInstant(clock(), 'Generation clock'),
        })
      }
      const bytes = Buffer.from(decoded.bytes)
      const assetId = assetIdGenerator()
      const objectKey = generatedObjectKey({ campaignId, jobId: prepared.job.id, assetId, mimeType: decoded.mimeType })
      const asset = {
        id: assetId,
        campaignId,
        kind: 'direction',
        objectKey,
        mimeType: decoded.mimeType,
        byteSize: bytes.length,
        width: decoded.width,
        height: decoded.height,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        source: 'generation',
        generationJobId: prepared.job.id,
        versionId: null,
      }
      try {
        const stored = await beforeDeadline(
          (remaining) => assetStore.put({ objectKey, bytes, contentType: decoded.mimeType, timeoutMs: remaining }),
          prepared.job.timeoutAt,
          clock,
          'asset_upload_timeout',
        )
        if (stored?.objectKey !== objectKey || stored?.byteSize !== bytes.length) throw new Error('Asset store response mismatch')
      } catch (error) {
        if (error?.code === 'object_exists') {
          return recoverGeneration({
            jobId: prepared.job.id, ownerToken: prepared.ownerToken, reason: 'asset_object_exists',
          })
        }
        if (error?.code === 'asset_upload_timeout' && error.operationStarted === false) {
          return recoverGeneration({
            jobId: prepared.job.id, ownerToken: prepared.ownerToken, reason: 'asset_upload_timeout',
          })
        }
        return recoverGeneration({
          jobId: prepared.job.id, ownerToken: prepared.ownerToken, reason: 'asset_upload_ambiguous',
          orphan: { objectKey, campaignId, reason: 'generation_image_upload_ambiguous' },
        })
      }
      try {
        const readback = await beforeDeadline(
          (remaining) => assetStore.get({ objectKey, timeoutMs: remaining, maxBytes: asset.byteSize }),
          prepared.job.timeoutAt,
          clock,
          'asset_readback_timeout',
        )
        const readbackBytes = assertAssetBytes(readback)
        const readbackSha256 = createHash('sha256').update(readbackBytes).digest('hex')
        if (readbackBytes.length !== asset.byteSize || readbackSha256 !== asset.sha256) {
          throw new Error('Stored asset readback did not match the provider bytes')
        }
      } catch {
        return recoverGeneration({
          jobId: prepared.job.id, ownerToken: prepared.ownerToken, reason: 'asset_readback_failed',
          orphan: { objectKey, campaignId, reason: 'generation_image_readback_failed' },
        })
      }
      try {
        const completion = await controlPlane.completeGeneratedImage({
          jobId: prepared.job.id,
          ownerToken: prepared.ownerToken,
          directionId: command.directionId,
          requestedWidth: command.width,
          requestedHeight: command.height,
          asset,
          safety: result.safety,
          usage: result.usage,
          actualCostMicrounits: result.actualCostMicrounits,
          completedAt: safeInstant(clock(), 'Generation clock'),
        })
        if (completion.status === 201) return completion
        return recoverGeneration({
          jobId: prepared.job.id,
          ownerToken: prepared.ownerToken,
          reason: 'asset_persistence_declined',
          orphan: { objectKey, campaignId, reason: 'generation_image_persistence_declined' },
        })
      } catch (error) {
        const timedOut = persistenceTimedOut(error)
        return recoverGeneration({
          jobId: prepared.job.id,
          ownerToken: prepared.ownerToken,
          reason: timedOut ? 'asset_persistence_timeout' : 'asset_persistence_ambiguous',
          orphan: {
            objectKey,
            campaignId,
            reason: timedOut ? 'generation_image_persistence_timeout' : 'generation_image_persistence_failed',
          },
        })
      }
    }

    const normalized = normalizedResult(step, result)
    if (step === 'directions' && normalized.status === 'succeeded' && !validVisualResult(prepared.context, result.directions)) {
      normalized.status = 'failed'
      normalized.resultMetadata = null
      normalized.errorCode = 'invalid_output'
    }
    const committed = await controlPlane.completeProviderResult({
      jobId: prepared.job.id,
      ownerToken: prepared.ownerToken,
      status: normalized.status,
      safety: result.safety,
      usage: result.usage,
      actualCostMicrounits: result.actualCostMicrounits,
      resultMetadata: normalized.resultMetadata,
      errorCode: normalized.errorCode ?? null,
      completedAt: safeInstant(clock(), 'Generation clock'),
    })
    return committed
  }

  return {
    analyseBrief: (options) => execute({ ...options, step: 'brief_analysis', schema: analyseBriefRequestSchema }),
    generateCopy: (options) => execute({ ...options, step: 'copy', schema: copyGenerationRequestSchema }),
    generateDirections: (options) => execute({ ...options, step: 'directions', schema: directionGenerationRequestSchema }),
    generateImage: (options) => execute({ ...options, step: 'image', schema: imageGenerationRequestSchema }),

    async getJob({ actor, jobId }) {
      requireRole(actor, readerRoles)
      if (typeof jobId !== 'string' || jobId.trim().length === 0) throw new GenerationServiceError(400, 'invalid_job_id', 'Generation job id is required')
      return controlPlane.getJob({ actor, jobId })
    },

    async selectCopy({ actor, campaignId, expectedRevision, input }) {
      requireRole(actor, editorRoles)
      return controlPlane.selectCopy({ actor, campaignId, expectedRevision, input: validate(copySelectionRequestSchema, input) })
    },

    async approveCopy({ actor, campaignId, expectedRevision, input }) {
      requireRole(actor, editorRoles)
      return controlPlane.approveCopy({ actor, campaignId, expectedRevision, input: validate(copySelectionRequestSchema, input) })
    },

    async deleteCopy({ actor, campaignId, expectedRevision, input }) {
      requireRole(actor, editorRoles)
      return controlPlane.deleteCopy({ actor, campaignId, expectedRevision, input: validate(copySelectionRequestSchema, input) })
    },

    async selectDirection({ actor, campaignId, expectedRevision, input }) {
      requireRole(actor, editorRoles)
      return controlPlane.selectDirection({ actor, campaignId, expectedRevision, input: validate(directionSelectionRequestSchema, input) })
    },
  }
}
