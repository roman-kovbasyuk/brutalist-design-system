import { randomUUID } from 'node:crypto'
import {
  analyseBriefRequestSchema,
  copyGenerationRequestSchema,
  copySelectionRequestSchema,
  directionGenerationRequestSchema,
  directionSelectionRequestSchema,
  imageGenerationRequestSchema,
} from '../../shared/contracts.js'
import { invokeProvider, validateGenerationProvider } from '../providers/provider.js'

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
  if (step === 'brief_analysis') return { brief: context.brief }
  if (step === 'copy') return { brief: context.brief, analysis: context.analysis }
  if (step === 'directions') return { brief: context.brief, copy: context.copy }
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
      temporaryImage: undefined,
    }
  }
  if (step === 'brief_analysis') return { status: 'succeeded', resultMetadata: { analysis: result.analysis } }
  if (step === 'copy') return { status: 'succeeded', resultMetadata: { copies: result.copies } }
  if (step === 'directions') return { status: 'succeeded', resultMetadata: { directions: result.directions } }
  if (step === 'image') {
    return {
      status: 'succeeded',
      resultMetadata: { image: { mimeType: result.image.mimeType, width: result.image.width, height: result.image.height, byteSize: result.image.bytes.byteLength } },
      temporaryImage: result.image,
    }
  }
  throw new TypeError(`Unknown generation step ${step}`)
}

export function createGenerationService({
  pool,
  controlPlane,
  providers,
  idGenerator = randomUUID,
  ownerTokenGenerator = randomUUID,
  clock = () => new Date(),
  timeoutMs = 30_000,
  maximumCosts = defaultMaximumCosts,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  if (!controlPlane || typeof controlPlane.prepareGeneration !== 'function') throw new TypeError('A generation control plane is required')
  if (!providers || typeof providers !== 'object') throw new TypeError('Generation providers are required')
  for (const provider of Object.values(providers)) validateGenerationProvider(provider)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('Generation timeout must be a positive safe integer')
  for (const [step, cost] of Object.entries(maximumCosts)) {
    if (!Number.isSafeInteger(cost) || cost < 0) throw new TypeError(`Maximum cost for ${step} must be a non-negative safe integer`)
  }

  const execute = async ({ actor, campaignId, idempotencyKey, input, step, schema }) => {
    requireRole(actor, editorRoles)
    const command = validate(schema, input ?? {})
    validateIdempotencyKey(idempotencyKey)
    if (typeof campaignId !== 'string' || campaignId.trim().length === 0) throw new GenerationServiceError(400, 'invalid_campaign_id', 'Campaign id is required')

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
      if (typeof controlPlane.waitForResult !== 'function') {
        return { status: 202, body: { job: prepared.job }, replayed: true }
      }
      return { ...(await controlPlane.waitForResult({ jobId: prepared.job.id })), replayed: true }
    }
    if (prepared.kind !== 'owner') throw new TypeError(`Unknown generation preparation result ${prepared.kind}`)

    const dispatched = await controlPlane.markDispatched({
      jobId: prepared.job.id,
      ownerToken: prepared.ownerToken,
      dispatchedAt: safeInstant(clock(), 'Generation clock'),
    })
    if (!dispatched) {
      const observed = await controlPlane.getJob({ actor, jobId: prepared.job.id })
      return { status: 202, body: { job: observed }, replayed: true }
    }

    const provider = providers[prepared.job.provider]
    if (!provider) {
      return controlPlane.markUnknown({
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
      return controlPlane.markUnknown({
        jobId: prepared.job.id,
        ownerToken: prepared.ownerToken,
        reason: error?.code === 'provider_timeout' || error?.name === 'AbortError' ? 'provider_timeout' : 'provider_call_ambiguous',
      })
    } finally {
      clearTimeout(timer)
    }

    if (result.provider !== prepared.job.provider || result.model !== prepared.job.model || result.region !== prepared.job.region) {
      return controlPlane.markUnknown({
        jobId: prepared.job.id, ownerToken: prepared.ownerToken, reason: 'provider_identity_mismatch',
      })
    }

    const normalized = normalizedResult(step, result)
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
    return { ...committed, ...(normalized.temporaryImage ? { temporaryImage: normalized.temporaryImage } : {}) }
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

    async selectDirection({ actor, campaignId, expectedRevision, input }) {
      requireRole(actor, editorRoles)
      return controlPlane.selectDirection({ actor, campaignId, expectedRevision, input: validate(directionSelectionRequestSchema, input) })
    },
  }
}
