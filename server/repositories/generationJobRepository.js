import { createHash, randomUUID } from 'node:crypto'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { transitionCampaign, applyArtifactEdit } from '../../shared/workflowRules.js'
import { rawBrief } from '../../shared/briefAnalysis.js'
import { copyVariantSchema, generateImageInputSchema, visualDirectionSchema } from '../../shared/contracts.js'
import { withDeadlineTransaction, withTransaction } from '../db/pool.js'
import { createAuditRepository } from './auditRepository.js'
import { createCampaignRepository } from './campaignRepository.js'
import { createSettingsRepository } from './settingsRepository.js'
import { loadVisualContext } from '../services/visualContext.js'
import {
  assertProviderRegistry,
  generationProviderRegistry,
  providerTupleAllowed,
  resolveProviderConfiguration,
} from '../providers/registry.js'

const maximumSafe = BigInt(Number.MAX_SAFE_INTEGER)
const editableStatuses = new Set(['draft', 'copy_ready', 'direction_selected', 'composed'])

export class GenerationControlPlaneError extends Error {
  constructor(statusCode, code, message) {
    super(message)
    this.name = 'GenerationControlPlaneError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.expose = true
  }
}

function safeMicrounits(value, field) {
  let parsed
  try { parsed = BigInt(value) } catch { throw new RangeError(`${field} must be a non-negative safe integer`) }
  if (parsed < 0n || parsed > maximumSafe) throw new RangeError(`${field} must be a non-negative safe integer`)
  return Number(parsed)
}

function iso(value) {
  const parsed = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new TypeError('Persistence returned an invalid timestamp')
  return parsed.toISOString()
}

function mapJob(row) {
  if (!row) return null
  return {
    id: row.id,
    campaignId: row.campaign_id,
    step: row.step,
    provider: row.provider,
    model: row.model,
    region: row.region,
    status: row.status,
    attempts: row.attempts,
    safety: row.safety,
    usage: row.usage,
    reservedCostMicrounits: safeMicrounits(row.reserved_cost_microunits, 'reservedCostMicrounits'),
    actualCostMicrounits: row.actual_cost_microunits == null ? null : safeMicrounits(row.actual_cost_microunits, 'actualCostMicrounits'),
    timeoutAt: iso(row.timeout_at),
    result: row.result_metadata,
    errorCode: row.error_code,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

function mapCampaignUpdate(campaign, expectedRevision, changes = {}) {
  return {
    id: campaign.id,
    expectedRevision,
    title: campaign.title,
    brief: campaign.brief,
    status: changes.status ?? campaign.status,
    selectedCopyId: changes.selectedCopyId ?? campaign.selectedCopyId,
    selectedDirectionId: changes.selectedDirectionId ?? campaign.selectedDirectionId,
    compositionId: changes.compositionId ?? campaign.compositionId,
    currentVersionNumber: campaign.currentVersionNumber,
    openVersionId: campaign.openVersionId,
  }
}

function conflict(code, message, statusCode = 409) {
  throw new GenerationControlPlaneError(statusCode, code, message)
}

function exactObjectKeys(value, expected) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\u0000') === [...expected].sort().join('\u0000')
}

function completionImageInput(current, { directionId, requestedWidth, requestedHeight }) {
  const strict = generateImageInputSchema.safeParse(current.input_snapshot)
  if (strict.success) return strict.data
  if (!exactObjectKeys(current.input_snapshot, ['direction'])) return null
  const repaired = generateImageInputSchema.safeParse({
    direction: current.input_snapshot.direction,
    width: requestedWidth,
    height: requestedHeight,
  })
  if (!repaired.success) return null
  const expectedFingerprint = hashCanonical({
    step: 'image',
    input: { directionId, width: requestedWidth, height: requestedHeight },
  })
  return current.request_fingerprint === expectedFingerprint ? repaired.data : null
}

function validateExpectedRevision(expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new GenerationControlPlaneError(400, 'invalid_revision', 'Expected revision must be a non-negative integer')
  }
}

async function lockAssetObjectKey(client, objectKey) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
}

async function hasUploadIntentColumns(client) {
  const result = await client.query(
    `SELECT count(*)::int AS count FROM pg_attribute
     WHERE attrelid = 'orphaned_uploads'::regclass
       AND attname IN ('expected_sha256', 'expected_byte_size', 'expected_mime_type')
       AND attnum > 0 AND NOT attisdropped`,
  )
  return result.rows[0]?.count === 3
}

async function settleWithin(operation, timeoutMs) {
  let pending
  try {
    pending = Promise.resolve(operation())
  } catch (error) {
    return { kind: 'rejected', error }
  }
  const observed = pending.then(
    (value) => ({ kind: 'fulfilled', value }),
    (error) => ({ kind: 'rejected', error }),
  )
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs)
  })
  try {
    return await Promise.race([observed, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function verifyObjectBytes({ createObjectReadStream, objectKey, generation, expectedByteSize, expectedSha256, timeoutMs }) {
  if (typeof createObjectReadStream !== 'function') return false
  const controller = new AbortController()
  const timeoutError = Object.assign(new Error('Object verification exceeded its deadline'), {
    code: 'cleanup_object_verification_timeout',
  })
  let readable
  const abortTimer = setTimeout(() => controller.abort(timeoutError), timeoutMs)
  try {
    const verified = await settleWithin(async () => {
      readable = await createObjectReadStream({ objectKey, generation, signal: controller.signal })
      if (!readable || typeof readable[Symbol.asyncIterator] !== 'function' || controller.signal.aborted) return false
      let byteSize = 0
      const hash = createHash('sha256')
      for await (const chunk of readable) {
        if (controller.signal.aborted) return false
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        if (bytes.length > expectedByteSize - byteSize) return false
        byteSize += bytes.length
        hash.update(bytes)
      }
      return byteSize === expectedByteSize && hash.digest('hex') === expectedSha256
    }, timeoutMs)
    return verified.kind === 'fulfilled' && verified.value === true
  } finally {
    clearTimeout(abortTimer)
    if (!controller.signal.aborted) controller.abort(timeoutError)
    if (readable && typeof readable.destroy === 'function' && !readable.destroyed) readable.destroy(timeoutError)
  }
}

function remainingDeadlineMilliseconds(timeoutAt, observedAt) {
  const remaining = timeoutAt.getTime() - observedAt.getTime()
  if (!Number.isFinite(remaining)) throw new TypeError('Generation persistence deadline is invalid')
  return Math.max(1, Math.min(2_147_483_647, Math.ceil(remaining)))
}

async function setTransactionDeadline(client, timeoutAt, observedAt) {
  const setting = `${remainingDeadlineMilliseconds(timeoutAt, observedAt)}ms`
  await client.query(
    `SELECT set_config('lock_timeout', $1, true),
            set_config('statement_timeout', $1, true)`,
    [setting],
  )
}

async function databaseClock(client) {
  const result = await client.query('SELECT clock_timestamp() AS observed_at')
  return result.rows[0].observed_at
}

function persistenceDeadlineError() {
  const error = new Error('Generated image persistence exceeded its deadline')
  error.code = 'generation_persistence_timeout'
  return error
}

function recoveryDeadlineError() {
  const error = new Error('Generation recovery exceeded its database deadline')
  error.code = 'generation_recovery_timeout'
  return error
}

async function refreshTransactionDeadline(client, deadline) {
  const observedAt = await databaseClock(client)
  if (observedAt >= deadline) throw recoveryDeadlineError()
  await setTransactionDeadline(client, deadline, observedAt)
  return observedAt
}

function providerContextError(step) {
  const requirements = {
    copy: ['brief_analysis_required', 'Analyse the campaign brief before generating copy'],
    directions: ['copy_selection_required', 'Select campaign copy before generating directions'],
    image: ['direction_not_found', 'The requested visual direction was not found'],
  }
  const [code, message] = requirements[step]
  return new GenerationControlPlaneError(409, code, message)
}

async function loadContext(client, campaign, step, input) {
  if (step === 'brief_analysis') {
    if (input.expectedRevision !== undefined && campaign.revision !== input.expectedRevision) conflict('revision_conflict', 'The brief changed. Refresh before analyzing it.')
    return { brief: campaign.brief, title: campaign.title, ...(input.instruction ? { instruction: input.instruction } : {}) }
  }
  if (step === 'copy') {
    const analysis = await client.query(
      `SELECT result_metadata->'analysis' AS analysis, input_snapshot->'brief' AS analysed_brief
       FROM generation_jobs
       WHERE campaign_id = $1 AND step = 'brief_analysis' AND status = 'succeeded'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [campaign.id],
    )
    if (!analysis.rows[0]?.analysis) throw providerContextError(step)
    if (!analysis.rows[0].analysed_brief || hashCanonical(rawBrief(analysis.rows[0].analysed_brief)) !== hashCanonical(rawBrief(campaign.brief))) {
      throw new GenerationControlPlaneError(409, 'brief_analysis_stale', 'Analyse the current campaign brief before generating copy')
    }
    // Read published cards and reservations in one MVCC snapshot. A concurrent
    // completion moves slots between these totals without freeing capacity.
    const capacity = await client.query(
      `SELECT COALESCE((SELECT jsonb_agg(candidate ORDER BY sets.created_at, sets.id, position)
        FROM copy_sets AS sets, jsonb_array_elements(sets.candidates) WITH ORDINALITY AS items(candidate, position)
        WHERE sets.campaign_id = $1 AND sets.stale = false
          AND NOT (sets.deleted_candidate_ids ? (candidate->>'id'))), '[]'::jsonb) AS copies,
        (SELECT COALESCE(sum(COALESCE((input_snapshot->>'copySlots')::int, 5)), 0)::int
         FROM generation_jobs WHERE campaign_id = $1 AND step = 'copy'
         AND status IN ('pending', 'unknown')) AS reserved`, [campaign.id],
    )
    const { copies, reserved } = capacity.rows[0]
    const available = 30 - copies.length - reserved
    if (available <= 0) conflict('copy_limit_reached', 'You can keep up to 30 copy options. Delete an option to make room.')
    return { brief: campaign.brief, analysis: campaign.brief.analysis ?? analysis.rows[0].analysis,
      previousHeadlines: copies.map(copy => copy.headline), copySlots: Math.min(5, available) }
  }
  if (step === 'directions') {
    if (input.mode) return loadVisualContext(client, campaign, input)
    if (!campaign.selectedCopyId) throw providerContextError(step)
    const selected = await client.query('SELECT candidates, selected_candidate_id FROM copy_sets WHERE campaign_id = $1 AND id = $2', [campaign.id, campaign.selectedCopyId])
    const copy = selected.rows[0]?.candidates?.find((candidate) => candidate.id === selected.rows[0].selected_candidate_id)
    if (!copy) throw providerContextError(step)
    return { brief: campaign.brief, copy: copyVariantSchema.parse(copy) }
  }
  if (step === 'image') {
    const selected = await client.query('SELECT * FROM visual_directions WHERE campaign_id = $1 AND id = $2 AND stale = false', [campaign.id, input.directionId])
    if (!selected.rows[0]) throw providerContextError(step)
    if (selected.rows[0].preview_asset_id || selected.rows[0].status === 'ready') conflict('visual_already_ready', 'This visual already has an image. Add a new visual instead.')
    const active = await client.query(`SELECT id FROM generation_jobs WHERE campaign_id = $1 AND step = 'image'
      AND input_snapshot->'direction'->>'id' = $2 AND status IN ('pending', 'unknown') LIMIT 1`, [campaign.id, input.directionId])
    if (active.rowCount) conflict('visual_generation_pending', 'This image is still processing or needs reconciliation.')
    return {
      direction: visualDirectionSchema.parse({
        id: selected.rows[0].id,
        title: selected.rows[0].title,
        prompt: selected.rows[0].prompt,
        status: selected.rows[0].status,
        previewAssetId: selected.rows[0].preview_asset_id,
      }),
      width: input.width,
      height: input.height,
    }
  }
  throw new TypeError(`Unknown generation step ${step}`)
}

async function storeResponse(client, row, responseStatus) {
  const job = mapJob(row)
  const body = { job }
  await client.query(
    'UPDATE generation_jobs SET response_status = $2, response_body = $3 WHERE id = $1',
    [job.id, responseStatus, body],
  )
  return { status: responseStatus, body }
}

export function createGenerationJobRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')
  return {
    async findById(id) {
      const result = await client.query('SELECT * FROM generation_jobs WHERE id = $1', [id])
      return mapJob(result.rows[0])
    },

    async listForCampaign(campaignId) {
      const result = await client.query('SELECT * FROM generation_jobs WHERE campaign_id = $1 ORDER BY created_at DESC, id DESC', [campaignId])
      return result.rows.map(mapJob)
    },
  }
}

export function createGenerationControlPlane({
  pool,
  transaction = withTransaction,
  idGenerator = randomUUID,
  clock = () => new Date(),
  providerRegistry = generationProviderRegistry,
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  pollIntervalMs = 10,
  recoveryTimeoutMs = 250,
  cleanupLeaseMs = 30_000,
  cleanupDeleteTimeoutMs = 15_000,
  recoveryTransaction = withDeadlineTransaction,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  assertProviderRegistry(providerRegistry)
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new TypeError('Generation polling interval must be positive')
  if (!Number.isSafeInteger(recoveryTimeoutMs) || recoveryTimeoutMs <= 0) throw new TypeError('Generation recovery timeout must be a positive integer')
  if (!Number.isSafeInteger(cleanupLeaseMs) || cleanupLeaseMs <= 0) throw new TypeError('Orphan cleanup lease must be a positive integer')
  if (!Number.isSafeInteger(cleanupDeleteTimeoutMs) || cleanupDeleteTimeoutMs <= 0) throw new TypeError('Orphan cleanup delete timeout must be a positive integer')

  const recoverGeneration = async ({ jobId, ownerToken, reason, orphan }) => recoveryTransaction(pool, async (client, deadline) => {
    const startedAt = await databaseClock(client)
    const recoveryDeadline = new Date(startedAt.getTime() + deadline.remainingMs())
    await setTransactionDeadline(client, recoveryDeadline, startedAt)

    const locked = await client.query('SELECT * FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobId])
    const current = locked.rows[0]
    await refreshTransactionDeadline(client, recoveryDeadline)
    if (!current) conflict('generation_owner_lost', 'Generation result ownership was lost')

    const response = current.response_status != null && current.response_body != null
      ? { status: current.response_status, body: current.response_body }
      : null
    if (response?.status === 201) return response
    if (!response && (current.owner_token !== ownerToken || current.status !== 'pending' || current.dispatch_state !== 'dispatched')) {
      conflict('generation_owner_lost', 'Generation result ownership was lost')
    }

    if (orphan) {
      if (orphan.campaignId !== current.campaign_id) {
        conflict('generation_asset_mismatch', 'Generated asset recovery does not match its job')
      }
      await lockAssetObjectKey(client, orphan.objectKey)
      await refreshTransactionDeadline(client, recoveryDeadline)
      await client.query(
        `INSERT INTO orphaned_uploads (id, object_key, campaign_id, reason)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (SELECT 1 FROM assets WHERE object_key = $2)
         ON CONFLICT (object_key) DO NOTHING`,
        [idGenerator(), orphan.objectKey, orphan.campaignId, orphan.reason],
      )
    }

    if (response) return response
    await refreshTransactionDeadline(client, recoveryDeadline)
    const updated = await client.query(
      `UPDATE generation_jobs
       SET status = 'unknown', unknown_reason = $3, updated_at = $4
       WHERE id = $1 AND owner_token = $2 AND status = 'pending' AND dispatch_state = 'dispatched'
       RETURNING *`,
      [jobId, ownerToken, reason, clock()],
    )
    if (updated.rowCount !== 1) conflict('generation_owner_lost', 'Generation result ownership was lost')
    await refreshTransactionDeadline(client, recoveryDeadline)
    return storeResponse(client, updated.rows[0], 202)
  }, { timeoutMs: recoveryTimeoutMs })

  return {
    recoverGeneration,
    async preflightGeneration({ actor, campaignId, step, input, idempotencyKey }) {
      const fingerprint = hashCanonical({ step, input })
      const existing = await pool.query(
        `SELECT * FROM generation_jobs
         WHERE actor_id = $1 AND method = 'POST' AND campaign_id = $2 AND step = $3 AND idempotency_key = $4`,
        [actor.id, campaignId, step, idempotencyKey],
      )
      const row = existing.rows[0]
      if (!row) return { kind: 'new' }
      if (row.request_fingerprint !== fingerprint) {
        conflict('idempotency_conflict', 'This idempotency key was already used with a different request')
      }
      if (row.response_status != null && row.response_body != null) {
        return { kind: 'replay', response: { status: row.response_status, body: row.response_body } }
      }
      if (row.status === 'pending' && row.dispatch_state === 'not_dispatched') {
        return { kind: 'claimable', job: mapJob(row) }
      }
      return { kind: 'in_progress', job: mapJob(row) }
    },

    async prepareGeneration({ actor, campaignId, step, input, idempotencyKey, jobId, ownerToken, maxCostMicrounits, startedAt, timeoutAt }) {
      const fingerprint = hashCanonical({ step, input })
      return transaction(pool, async (client) => {
        const settings = await createSettingsRepository(client).getForUpdate()
        const campaigns = createCampaignRepository(client)
        const campaign = await campaigns.findByIdForUpdate(campaignId)
        if (!campaign) conflict('not_found', 'Campaign was not found', 404)

        const existingResult = await client.query(
          `SELECT * FROM generation_jobs
           WHERE actor_id = $1 AND method = 'POST' AND campaign_id = $2 AND step = $3 AND idempotency_key = $4
           FOR UPDATE`,
          [actor.id, campaignId, step, idempotencyKey],
        )
        const existing = existingResult.rows[0]
        if (existing) {
          if (existing.request_fingerprint !== fingerprint) conflict('idempotency_conflict', 'This idempotency key was already used with a different request')
          if (existing.response_status != null && existing.response_body != null) {
            return { kind: 'replay', response: { status: existing.response_status, body: existing.response_body } }
          }
          if (existing.status === 'pending' && existing.dispatch_state === 'dispatched' && existing.timeout_at <= startedAt) {
            const expired = await client.query(
              `UPDATE generation_jobs
               SET status = 'unknown', unknown_reason = 'timeout_recovery', updated_at = $2
               WHERE id = $1 AND status = 'pending' AND dispatch_state = 'dispatched'
               RETURNING *`,
              [existing.id, startedAt],
            )
            const response = await storeResponse(client, expired.rows[0], 202)
            return { kind: 'replay', response }
          }
          if (existing.status !== 'pending' || existing.dispatch_state === 'dispatched') {
            return { kind: 'in_progress', job: mapJob(existing) }
          }
          if (settings.generationDisabled) conflict('kill_switch_active', 'Generation is temporarily disabled', 503)
          if (!providerTupleAllowed(providerRegistry, existing)) {
            conflict('provider_unavailable', 'The reserved generation provider configuration is unavailable', 503)
          }
          const reclaimed = await client.query(
            `UPDATE generation_jobs SET owner_token = $2, timeout_at = $3, updated_at = $4
             WHERE id = $1 AND status = 'pending' AND dispatch_state = 'not_dispatched'
             RETURNING *`,
            [existing.id, ownerToken, timeoutAt, startedAt],
          )
          return { kind: 'owner', ownerToken, job: mapJob(reclaimed.rows[0]), context: existing.input_snapshot }
        }

        if (!editableStatuses.has(campaign.status)) conflict('campaign_locked', 'Campaign content is not editable in its current state')
        if (settings.generationDisabled) conflict('kill_switch_active', 'Generation is temporarily disabled', 503)
        const providerConfiguration = resolveProviderConfiguration(providerRegistry, settings, step)
        if (!providerConfiguration) conflict('provider_unavailable', 'The configured generation provider is unavailable', 503)
        const cap = await client.query('SELECT count(*)::int AS count FROM generation_jobs WHERE campaign_id = $1 AND step = $2', [campaignId, step])
        if (cap.rows[0].count >= settings.perStepRegenerationLimit) {
          conflict('regeneration_cap_reached', 'The campaign regeneration limit has been reached', 429)
        }

        const budgetDay = startedAt.toISOString().slice(0, 10)
        const spent = await client.query(
          `SELECT COALESCE(sum(CASE WHEN status IN ('pending', 'unknown')
                    THEN reserved_cost_microunits ELSE COALESCE(actual_cost_microunits, reserved_cost_microunits) END), 0)::text AS used
           FROM generation_jobs WHERE budget_day = $1`,
          [budgetDay],
        )
        const used = BigInt(spent.rows[0].used)
        const requested = BigInt(maxCostMicrounits)
        if (used + requested > BigInt(settings.dailyBudgetMicrounits)) {
          conflict('over_budget', 'The UTC daily generation budget would be exceeded', 409)
        }

        const context = await loadContext(client, campaign, step, input)
        const created = await client.query(
          `INSERT INTO generation_jobs
             (id, campaign_id, actor_id, method, step, provider, model, region, status, attempts,
              reserved_cost_microunits, actual_cost_microunits, idempotency_key, request_fingerprint,
              owner_token, dispatch_state, budget_day, input_snapshot, timeout_at, created_at, updated_at)
           VALUES ($1, $2, $3, 'POST', $4, $5, $6, $7, 'pending', 0,
                   $8, NULL, $9, $10, $11, 'not_dispatched', $12, $13, $14, $15, $15)
           RETURNING *`,
          [jobId, campaignId, actor.id, step, providerConfiguration.provider, providerConfiguration.model, providerConfiguration.region,
            maxCostMicrounits, idempotencyKey, fingerprint, ownerToken, budgetDay, context, timeoutAt, startedAt],
        )
        return { kind: 'owner', ownerToken, job: mapJob(created.rows[0]), context }
      })
    },

    async waitForResult({ jobId }) {
      while (true) {
        const observation = await transaction(pool, async (client) => {
          const result = await client.query('SELECT * FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobId])
          const row = result.rows[0]
          if (!row) conflict('not_found', 'Generation job was not found', 404)
          if (row.response_status != null && row.response_body != null) {
            return { response: { status: row.response_status, body: row.response_body } }
          }
          const observedAt = clock()
          if (row.status === 'pending' && row.timeout_at <= observedAt) {
            const expired = await client.query(
              `UPDATE generation_jobs
               SET status = 'unknown',
                   unknown_reason = CASE WHEN dispatch_state = 'dispatched' THEN 'timeout_recovery' ELSE 'ownership_recovery_timeout' END,
                   updated_at = $2
               WHERE id = $1 AND status = 'pending'
               RETURNING *`,
              [jobId, observedAt],
            )
            if (expired.rowCount === 1) return { response: await storeResponse(client, expired.rows[0], 202) }
          }
          return { waitMs: Math.max(1, Math.min(pollIntervalMs, row.timeout_at.getTime() - observedAt.getTime())) }
        })
        if (observation.response) return observation.response
        await wait(observation.waitMs)
      }
    },

    async markDispatched({ jobId, ownerToken, dispatchedAt }) {
      return transaction(pool, async (client) => {
        const result = await client.query(
          `UPDATE generation_jobs
           SET dispatch_state = 'dispatched', dispatched_at = $3, attempts = attempts + 1, updated_at = $3
           WHERE id = $1 AND owner_token = $2 AND status = 'pending' AND dispatch_state = 'not_dispatched'
           RETURNING id`,
          [jobId, ownerToken, dispatchedAt],
        )
        return result.rowCount === 1
      })
    },

    async completeProviderResult({ jobId, ownerToken, status, safety, usage, actualCostMicrounits, resultMetadata, errorCode, completedAt }) {
      if (!['succeeded', 'failed', 'blocked'].includes(status)) throw new TypeError('Known provider results require a terminal status')
      safeMicrounits(actualCostMicrounits, 'actualCostMicrounits')
      return transaction(pool, async (client) => {
        // Match preparation's lock order: campaign, then generation job.
        const identity = await client.query('SELECT campaign_id FROM generation_jobs WHERE id = $1', [jobId])
        const campaigns = createCampaignRepository(client)
        const campaign = identity.rows[0] ? await campaigns.findByIdForUpdate(identity.rows[0].campaign_id) : null
        const locked = await client.query('SELECT * FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobId])
        const current = locked.rows[0]
        if (!current || current.owner_token !== ownerToken || current.status !== 'pending' || current.dispatch_state !== 'dispatched') {
          if (current?.response_status != null && current?.response_body != null) {
            return { status: current.response_status, body: current.response_body }
          }
          conflict('generation_owner_lost', 'Generation result ownership was lost')
        }
        if (BigInt(actualCostMicrounits) > BigInt(current.reserved_cost_microunits)) {
          conflict('generation_cost_exceeded_reservation', 'Provider cost exceeded its reservation')
        }

        let persistedResult = resultMetadata
        if (status === 'succeeded' && (!campaign || !editableStatuses.has(campaign.status)
          || hashCanonical(campaign.brief) !== hashCanonical(current.input_snapshot.brief))) {
          // Settle the paid job, but never publish a late result over newer edits.
          status = 'failed'; errorCode = 'brief_source_changed'; persistedResult = null
        }
        if (status === 'succeeded' && current.step === 'brief_analysis') {
          const analysis = resultMetadata.analysis
          const edit = applyArtifactEdit(campaign, 'brief')
          const previous = await client.query("SELECT id FROM generation_jobs WHERE campaign_id = $1 AND step = 'brief_analysis' AND status = 'succeeded' LIMIT 1", [campaign.id])
          const title = !previous.rowCount && analysis.title && campaign.title === current.input_snapshot.title ? analysis.title : campaign.title
          await campaigns.updateState({ ...mapCampaignUpdate(campaign, campaign.revision),
            title, brief: { ...campaign.brief, analysis }, status: edit.campaign.status,
            selectedCopyId: null, selectedDirectionId: null, compositionId: null })
          await campaigns.markArtifactsStale(campaign.id, { copy: true, directions: true, composition: true })
        } else if (status === 'succeeded' && current.step === 'copy') {
          const copySetId = idGenerator()
          const copies = resultMetadata.copies.slice(0, current.input_snapshot.copySlots ?? 5)
            .map((copy) => ({ ...copy, id: `${jobId}:${copy.id}` }))
          await client.query(
            `INSERT INTO copy_sets (id, campaign_id, generation_job_id, candidates)
             VALUES ($1, $2, $3, $4)`,
            [copySetId, current.campaign_id, jobId, JSON.stringify(copies)],
          )
          persistedResult = { copySetId, copies }
        } else if (status === 'succeeded' && current.step === 'directions') {
          const context = current.input_snapshot
          const ordered = context.mode === 'selected_copy' ? context.copies.map(copy => resultMetadata.directions.find(item => item.copyId === copy.id)) : resultMetadata.directions
          const directions = ordered.map((direction) => ({ ...direction, id: `${jobId}:${direction.id}` }))
          for (const [position, direction] of directions.entries()) {
            await client.query(
              `INSERT INTO visual_directions
                 (id, campaign_id, generation_job_id, title, prompt, status, preview_asset_id, scope, copy_snapshot, batch_id, batch_position)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $3, $10)`,
              [direction.id, current.campaign_id, jobId, direction.title, direction.prompt, direction.status, direction.previewAssetId,
                context.mode ?? 'legacy', context.mode === 'selected_copy' ? context.copies.find(copy => copy.id === direction.copyId) : null, position],
            )
          }
          persistedResult = { directions }
        }

        const updated = await client.query(
          `UPDATE generation_jobs
           SET status = $3, safety = $4, usage = $5, actual_cost_microunits = $6,
               result_metadata = $7, error_code = $8, completed_at = $9, updated_at = $9
           WHERE id = $1 AND owner_token = $2
           RETURNING *`,
          [jobId, ownerToken, status, safety, usage, actualCostMicrounits, persistedResult, errorCode, completedAt],
        )
        return storeResponse(client, updated.rows[0], 201)
      })
    },

    async completeGeneratedImage({ jobId, ownerToken, directionId, requestedWidth, requestedHeight, asset, safety, usage, actualCostMicrounits, completedAt }) {
      safeMicrounits(actualCostMicrounits, 'actualCostMicrounits')
      return transaction(pool, async (client) => {
        const deadlineResult = await client.query(
          `SELECT timeout_at, clock_timestamp() AS observed_at
           FROM generation_jobs WHERE id = $1`,
          [jobId],
        )
        const deadline = deadlineResult.rows[0]
        if (!deadline) conflict('generation_owner_lost', 'Generation result ownership was lost')
        await setTransactionDeadline(client, deadline.timeout_at, deadline.observed_at)

        const locked = await client.query('SELECT * FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobId])
        const current = locked.rows[0]
        if (!current || current.owner_token !== ownerToken || current.status !== 'pending' || current.dispatch_state !== 'dispatched') {
          if (current?.response_status != null && current?.response_body != null) {
            return { status: current.response_status, body: current.response_body }
          }
          conflict('generation_owner_lost', 'Generation result ownership was lost')
        }
        if (current.step !== 'image' || current.campaign_id !== asset.campaignId || current.id !== asset.generationJobId) {
          conflict('generation_asset_mismatch', 'Generated asset does not match its image job')
        }
        const imageInput = completionImageInput(current, { directionId, requestedWidth, requestedHeight })
        if (!imageInput || imageInput.direction.id !== directionId
          || imageInput.width !== asset.width || imageInput.height !== asset.height) {
          conflict('generation_direction_mismatch', 'Generated image direction does not match its job snapshot')
        }
        if (BigInt(actualCostMicrounits) > BigInt(current.reserved_cost_microunits)) {
          conflict('generation_cost_exceeded_reservation', 'Provider cost exceeded its reservation')
        }
        let observedAt = await databaseClock(client)
        if (current.timeout_at <= observedAt || current.timeout_at <= clock()) {
          throw persistenceDeadlineError()
        }
        await setTransactionDeadline(client, current.timeout_at, observedAt)
        const campaign = await client.query('SELECT id FROM campaigns WHERE id = $1 FOR UPDATE', [current.campaign_id])
        if (campaign.rowCount !== 1) conflict('not_found', 'Campaign was not found', 404)
        const direction = await client.query(
          `SELECT id FROM visual_directions
           WHERE id = $1 AND campaign_id = $2 AND stale = false AND status = 'pending' AND preview_asset_id IS NULL
           FOR UPDATE`,
          [directionId, current.campaign_id],
        )
        if (direction.rowCount !== 1) conflict('generation_direction_mismatch', 'Generated image direction is not pending for this campaign')
        await lockAssetObjectKey(client, asset.objectKey)
        observedAt = await databaseClock(client)
        if (current.timeout_at <= observedAt || current.timeout_at <= clock()) {
          throw persistenceDeadlineError()
        }
        await setTransactionDeadline(client, current.timeout_at, observedAt)
        await client.query(
          `INSERT INTO assets
             (id, campaign_id, kind, object_key, mime_type, byte_size, width, height, sha256, source, generation_job_id, version_id, created_at)
           VALUES ($1, $2, 'direction', $3, $4, $5, $6, $7, $8, 'generation', $9, NULL, $10)`,
          [asset.id, asset.campaignId, asset.objectKey, asset.mimeType, asset.byteSize, asset.width, asset.height, asset.sha256, jobId, completedAt],
        )
        await client.query(
          `UPDATE visual_directions SET status = 'ready', preview_asset_id = $2 WHERE id = $1`,
          [directionId, asset.id],
        )
        const persistedResult = {
          image: {
            asset: { id: asset.id, kind: 'direction', sha256: asset.sha256 },
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
            byteSize: asset.byteSize,
          },
        }
        observedAt = await databaseClock(client)
        if (current.timeout_at <= observedAt || current.timeout_at <= clock()) throw persistenceDeadlineError()
        await setTransactionDeadline(client, current.timeout_at, observedAt)
        const updated = await client.query(
          `UPDATE generation_jobs
           SET status = 'succeeded', safety = $3, usage = $4, actual_cost_microunits = $5,
               result_metadata = $6, input_snapshot = $7, error_code = NULL, completed_at = $8, updated_at = $8
           WHERE id = $1 AND owner_token = $2 AND clock_timestamp() < timeout_at
           RETURNING *`,
          [jobId, ownerToken, safety, usage, actualCostMicrounits, persistedResult, imageInput, completedAt],
        )
        if (updated.rowCount !== 1) throw persistenceDeadlineError()
        return storeResponse(client, updated.rows[0], 201)
      })
    },

    async cleanupOrphanUpload({ orphanId, getObjectMetadata, createObjectReadStream, deleteObject, cleanedAt }) {
      if (typeof deleteObject !== 'function') throw new TypeError('Orphan cleanup requires an object delete function')
      const cleanupDeadlineAt = Date.now() + recoveryTimeoutMs
      const maximumAttempts = 3
      let lastObjectKey

      class CleanupIdentityDriftError extends Error {
        constructor(objectKey) {
          super('Orphan cleanup identity changed before canonical locks')
          this.objectKey = objectKey
        }
      }

      const sameValue = (left, right) => {
        if (left instanceof Date || right instanceof Date) return new Date(left).getTime() === new Date(right).getTime()
        return left === right
      }
      const sameFields = (left, right, fields) => left != null && right != null
        && fields.every((field) => sameValue(left[field], right[field]))

      for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        const timeoutMs = Math.max(0, cleanupDeadlineAt - Date.now())
        if (timeoutMs < 1) throw recoveryDeadlineError()
        try {
          let phase = await recoveryTransaction(pool, async (client, deadline) => {
            const startedAt = await databaseClock(client)
            const attemptDeadline = new Date(startedAt.getTime() + deadline.remainingMs())
            await setTransactionDeadline(client, attemptDeadline, startedAt)
            const uploadIntentSupported = await hasUploadIntentColumns(client)
            const observed = await client.query(
              `SELECT o.id, o.object_key, o.status, o.object_generation, o.object_etag,
                      ${uploadIntentSupported
                        ? 'o.expected_sha256, o.expected_byte_size, o.expected_mime_type,'
                        : 'NULL::text AS expected_sha256, NULL::bigint AS expected_byte_size, NULL::text AS expected_mime_type,'}
                      o.cleanup_token, o.cleanup_lease_expires_at,
                      o.claimed_build_id, o.claimed_delivery_build_id,
                      vb.actor_id AS version_actor_id, vb.method AS version_method,
                      vb.campaign_id AS version_resource_id, vb.idempotency_key AS version_idempotency_key,
                      vb.request_fingerprint AS version_request_fingerprint,
                      vb.owner_token AS version_owner_token, vb.state AS version_state,
                      db.actor_id AS delivery_actor_id, db.method AS delivery_method,
                      db.version_id AS delivery_resource_id, db.idempotency_key AS delivery_idempotency_key,
                      db.request_fingerprint AS delivery_request_fingerprint,
                      db.owner_token AS delivery_owner_token, db.state AS delivery_state
               FROM orphaned_uploads o
               LEFT JOIN review_version_builds vb ON vb.id = o.claimed_build_id
               LEFT JOIN delivery_builds db ON db.id = o.claimed_delivery_build_id
               WHERE o.id = $1 AND o.status <> 'cleaned'`,
              [orphanId],
            )
            const candidate = observed.rows[0]
            if (!candidate) return { kind: 'missing' }
            lastObjectKey = candidate.object_key
            await refreshTransactionDeadline(client, attemptDeadline)

            let idempotency = null
            let build = null
            const claim = candidate.claimed_build_id
              ? {
                  id: candidate.claimed_build_id, type: 'version', table: 'review_version_builds',
                  actor_id: candidate.version_actor_id, method: candidate.version_method,
                  resource_id: candidate.version_resource_id, idempotency_key: candidate.version_idempotency_key,
                  request_fingerprint: candidate.version_request_fingerprint,
                  owner_token: candidate.version_owner_token, state: candidate.version_state,
                  failureCode: 'stale_version_intent_cleanup', column: 'claimed_build_id',
                  resourceColumn: 'campaign_id',
                }
              : candidate.claimed_delivery_build_id
                ? {
                    id: candidate.claimed_delivery_build_id, type: 'delivery', table: 'delivery_builds',
                    actor_id: candidate.delivery_actor_id, method: candidate.delivery_method,
                    resource_id: candidate.delivery_resource_id, idempotency_key: candidate.delivery_idempotency_key,
                    request_fingerprint: candidate.delivery_request_fingerprint,
                    owner_token: candidate.delivery_owner_token, state: candidate.delivery_state,
                    failureCode: 'stale_delivery_intent_cleanup', column: 'claimed_delivery_build_id',
                    resourceColumn: 'version_id',
                  }
                : null
            if ((candidate.claimed_build_id || candidate.claimed_delivery_build_id)
              && (!claim?.actor_id || !claim.method || !claim.resource_id || !claim.idempotency_key)) {
              return { kind: 'claimed', objectKey: candidate.object_key }
            }
            if (claim) {
              const idempotencyFields = [
                'actor_id', 'method', 'resource_id', 'key', 'state', 'owner_token', 'fingerprint', 'lease_expires_at',
              ]
              const observedIdempotency = (await client.query(
                `SELECT actor_id, method, resource_id, key, state, owner_token, fingerprint, lease_expires_at
                 FROM idempotency_records
                 WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4`,
                [claim.actor_id, claim.method, claim.resource_id, claim.idempotency_key],
              )).rows[0] ?? null
              await refreshTransactionDeadline(client, attemptDeadline)
              const lockedIdempotency = await client.query(
                `SELECT actor_id, method, resource_id, key, state, owner_token, fingerprint,
                        lease_expires_at, clock_timestamp() AS observed_at
                 FROM idempotency_records
                 WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4
                 FOR UPDATE`,
                [claim.actor_id, claim.method, claim.resource_id, claim.idempotency_key],
              )
              idempotency = lockedIdempotency.rows[0] ?? null
              await refreshTransactionDeadline(client, attemptDeadline)
              const lockedBuild = await client.query(
                `SELECT id, state, actor_id, method, ${claim.resourceColumn} AS resource_id,
                        idempotency_key, request_fingerprint, owner_token
                 FROM ${claim.table} WHERE id = $1 FOR UPDATE`,
                [claim.id],
              )
              build = lockedBuild.rows[0] ?? null
              await refreshTransactionDeadline(client, attemptDeadline)
              const buildFields = [
                'id', 'state', 'actor_id', 'method', 'resource_id', 'idempotency_key', 'request_fingerprint', 'owner_token',
              ]
              if (!sameFields(claim, build, buildFields)
                || observedIdempotency == null !== (idempotency == null)
                || observedIdempotency && !sameFields(observedIdempotency, idempotency, idempotencyFields)) {
                throw new CleanupIdentityDriftError(candidate.object_key)
              }
              if (!idempotency
                || idempotency.actor_id !== build.actor_id || idempotency.method !== build.method
                || idempotency.resource_id !== build.resource_id || idempotency.key !== build.idempotency_key
                || idempotency.fingerprint !== build.request_fingerprint
                || idempotency.owner_token !== build.owner_token) {
                return { kind: 'claimed', objectKey: candidate.object_key }
              }
            }

            await lockAssetObjectKey(client, candidate.object_key)
            await refreshTransactionDeadline(client, attemptDeadline)
            const selected = await client.query(
              `SELECT id, object_key, status, object_generation, object_etag,
                      ${uploadIntentSupported
                        ? 'expected_sha256, expected_byte_size, expected_mime_type,'
                        : 'NULL::text AS expected_sha256, NULL::bigint AS expected_byte_size, NULL::text AS expected_mime_type,'}
                      cleanup_token, cleanup_lease_expires_at,
                      claimed_build_id, claimed_delivery_build_id,
                      clock_timestamp() AS observed_at
               FROM orphaned_uploads
               WHERE id = $1 AND object_key = $2 AND status <> 'cleaned'
               FOR UPDATE`,
              [orphanId, candidate.object_key],
            )
            const orphan = selected.rows[0]
            if (!orphan) return { kind: 'missing' }
            if (orphan.claimed_build_id !== candidate.claimed_build_id
              || orphan.claimed_delivery_build_id !== candidate.claimed_delivery_build_id) {
              throw new CleanupIdentityDriftError(orphan.object_key)
            }
            const selectedClaimId = orphan.claimed_build_id ?? orphan.claimed_delivery_build_id
            if (selectedClaimId) {
              if (!claim || !build || build.id !== selectedClaimId
                || (claim.type === 'version' && orphan.claimed_delivery_build_id)
                || (claim.type === 'delivery' && orphan.claimed_build_id)) {
                return { kind: 'claimed', objectKey: orphan.object_key }
              }
              const activeLease = idempotency.state === 'in_progress'
                && idempotency.lease_expires_at > idempotency.observed_at
              if (activeLease || idempotency.state === 'completed' || build.state === 'completed') {
                return { kind: 'claimed', objectKey: orphan.object_key }
              }
              if (idempotency.state === 'in_progress') {
                const failedIdempotency = await client.query(
                  `UPDATE idempotency_records
                   SET state = 'failed', failed_at = clock_timestamp(), failure_code = $6
                   WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4
                     AND state = 'in_progress' AND owner_token = $5 AND fingerprint = $7
                     AND lease_expires_at <= clock_timestamp()`,
                  [claim.actor_id, claim.method, claim.resource_id, claim.idempotency_key,
                    idempotency.owner_token, claim.failureCode, idempotency.fingerprint],
                )
                if (failedIdempotency.rowCount !== 1) return { kind: 'claimed', objectKey: orphan.object_key }
              }
              if (build.state === 'in_progress') {
                const failedBuild = await client.query(
                  `UPDATE ${claim.table}
                   SET state = 'failed', updated_at = clock_timestamp()
                   WHERE id = $1 AND state = 'in_progress' AND actor_id = $2
                     AND method = $3 AND ${claim.resourceColumn} = $4 AND idempotency_key = $5
                     AND request_fingerprint = $6 AND owner_token = $7`,
                  [build.id, build.actor_id, build.method, build.resource_id, build.idempotency_key,
                    build.request_fingerprint, build.owner_token],
                )
                if (failedBuild.rowCount !== 1) return { kind: 'claimed', objectKey: orphan.object_key }
              }
              const cleared = await client.query(
                `UPDATE orphaned_uploads
                 SET ${claim.column} = NULL, reason = $3,
                     status = 'pending', last_error = NULL, cleaned_at = NULL
                 WHERE id = $1 AND ${claim.column} = $2`,
                [orphan.id, build.id, claim.failureCode],
              )
              if (cleared.rowCount !== 1) throw new CleanupIdentityDriftError(orphan.object_key)
            }
            const referenced = await client.query(
              `SELECT 1 FROM assets WHERE object_key = $1
               UNION ALL
               SELECT 1 FROM deliveries delivery JOIN assets asset ON asset.id = delivery.asset_id
                 WHERE asset.object_key = $1
               UNION ALL
               SELECT 1 FROM delivery_builds
                 WHERE state <> 'failed' AND plan->>'objectKey' = $1
               LIMIT 1`,
              [orphan.object_key],
            )
            if (referenced.rowCount > 0) return { kind: 'referenced', objectKey: orphan.object_key }
            await refreshTransactionDeadline(client, attemptDeadline)
            if (orphan.status === 'cleaning'
              && orphan.cleanup_lease_expires_at > orphan.observed_at) {
              return { kind: 'claimed', objectKey: orphan.object_key }
            }
            if (orphan.object_generation == null) {
              const expectedByteSize = Number(orphan.expected_byte_size)
              if (typeof getObjectMetadata === 'function'
                && typeof orphan.expected_sha256 === 'string' && /^[a-f0-9]{64}$/.test(orphan.expected_sha256)
                && Number.isSafeInteger(expectedByteSize) && expectedByteSize > 0
                && typeof orphan.expected_mime_type === 'string') {
                const cleanupToken = idGenerator()
                const cleanupLeaseExpiresAt = new Date(orphan.observed_at.getTime() + cleanupLeaseMs)
                const cleaning = await client.query(
                  `UPDATE orphaned_uploads
                   SET status = 'cleaning', cleanup_token = $3, cleanup_lease_expires_at = $4,
                       claimed_build_id = NULL, claimed_delivery_build_id = NULL,
                       object_etag = NULL, last_error = NULL, cleaned_at = NULL
                   WHERE id = $1 AND object_key = $2 AND object_generation IS NULL
                     AND expected_sha256 = $5 AND expected_byte_size = $6 AND expected_mime_type = $7
                     AND (
                       status IN ('pending', 'failed')
                       OR (status = 'cleaning' AND cleanup_token IS NOT DISTINCT FROM $8
                           AND cleanup_lease_expires_at <= clock_timestamp())
                     )
                   RETURNING object_key, cleanup_token`,
                  [orphan.id, orphan.object_key, cleanupToken, cleanupLeaseExpiresAt,
                    orphan.expected_sha256, expectedByteSize, orphan.expected_mime_type, orphan.cleanup_token],
                )
                if (cleaning.rowCount === 1) {
                  return {
                    kind: 'reconcile',
                    orphanId: orphan.id,
                    ...cleaning.rows[0],
                    expected_sha256: orphan.expected_sha256,
                    expected_byte_size: expectedByteSize,
                    expected_mime_type: orphan.expected_mime_type,
                  }
                }
              }
              return { kind: 'claimed', objectKey: orphan.object_key }
            }
            const cleanupToken = idGenerator()
            const cleanupLeaseExpiresAt = new Date(orphan.observed_at.getTime() + cleanupLeaseMs)
            const cleaning = await client.query(
              `UPDATE orphaned_uploads
               SET status = 'cleaning', cleanup_token = $3, cleanup_lease_expires_at = $4,
                   claimed_build_id = NULL, claimed_delivery_build_id = NULL,
                   last_error = NULL, cleaned_at = NULL
               WHERE id = $1 AND object_key = $2 AND object_generation = $5
                 AND (
                   status IN ('pending', 'failed')
                   OR (status = 'cleaning' AND cleanup_token IS NOT DISTINCT FROM $6
                       AND cleanup_lease_expires_at <= clock_timestamp())
                 )
               RETURNING object_key, object_generation, object_etag, cleanup_token`,
              [orphan.id, orphan.object_key, cleanupToken, cleanupLeaseExpiresAt,
                orphan.object_generation, orphan.cleanup_token],
            )
            if (cleaning.rowCount !== 1) return { kind: 'claimed', objectKey: orphan.object_key }
            return { kind: 'delete', orphanId: orphan.id, ...cleaning.rows[0] }
          }, { timeoutMs })
          if (phase.kind === 'reconcile') {
            const metadata = await settleWithin(
              () => getObjectMetadata({ objectKey: phase.object_key, timeoutMs: cleanupDeleteTimeoutMs }),
              cleanupDeleteTimeoutMs,
            )
            if (metadata.kind !== 'fulfilled') {
              return { kind: 'claimed', objectKey: phase.object_key }
            }
            const identity = metadata.value
            if (identity == null) {
              return { kind: 'claimed', objectKey: phase.object_key }
            }
            if (
              identity.objectKey !== phase.object_key
              || (identity.sha256 != null && identity.sha256 !== phase.expected_sha256)
              || identity.byteSize !== phase.expected_byte_size
              || identity.contentType !== phase.expected_mime_type
              || typeof identity.generation !== 'string' || !/^[!-~]{1,255}$/.test(identity.generation)
              || identity.etag != null && (typeof identity.etag !== 'string' || !/^[!-~]{1,1024}$/.test(identity.etag))
            ) {
              return { kind: 'claimed', objectKey: phase.object_key }
            }
            if (identity.sha256 == null && !await verifyObjectBytes({
              createObjectReadStream,
              objectKey: phase.object_key,
              generation: identity.generation,
              expectedByteSize: phase.expected_byte_size,
              expectedSha256: phase.expected_sha256,
              timeoutMs: cleanupDeleteTimeoutMs,
            })) {
              return { kind: 'claimed', objectKey: phase.object_key }
            }
            phase = await recoveryTransaction(pool, async (client, deadline) => {
              const startedAt = await databaseClock(client)
              const phaseDeadline = new Date(startedAt.getTime() + deadline.remainingMs())
              await setTransactionDeadline(client, phaseDeadline, startedAt)
              await lockAssetObjectKey(client, phase.object_key)
              await refreshTransactionDeadline(client, phaseDeadline)
              const orphan = (await client.query(
                `SELECT id, object_key FROM orphaned_uploads
                 WHERE id = $1 AND object_key = $2 AND status = 'cleaning'
                   AND cleanup_token = $6
                   AND claimed_build_id IS NULL AND claimed_delivery_build_id IS NULL
                   AND object_generation IS NULL
                   AND expected_sha256 = $3 AND expected_byte_size = $4 AND expected_mime_type = $5
                 FOR UPDATE`,
                [phase.orphanId, phase.object_key, phase.expected_sha256,
                  phase.expected_byte_size, phase.expected_mime_type, phase.cleanup_token],
              )).rows[0]
              if (!orphan) return { kind: 'claimed', objectKey: phase.object_key }
              const referenced = await client.query(
                `SELECT 1 FROM assets WHERE object_key = $1
                 UNION ALL
                 SELECT 1 FROM deliveries delivery JOIN assets asset ON asset.id = delivery.asset_id
                   WHERE asset.object_key = $1
                 UNION ALL
                 SELECT 1 FROM delivery_builds
                   WHERE state <> 'failed' AND plan->>'objectKey' = $1
                 LIMIT 1`,
                [phase.object_key],
              )
              if (referenced.rowCount > 0) return { kind: 'referenced', objectKey: phase.object_key }
              const cleaning = await client.query(
                `UPDATE orphaned_uploads
                 SET object_generation = $4, object_etag = $5,
                     last_error = NULL, cleaned_at = NULL
                 WHERE id = $1 AND object_key = $2 AND status = 'cleaning'
                   AND cleanup_token = $3 AND object_generation IS NULL
                 RETURNING object_key, object_generation, object_etag, cleanup_token`,
                [phase.orphanId, phase.object_key, phase.cleanup_token,
                  identity.generation, identity.etag ?? null],
              )
              return cleaning.rowCount === 1
                ? { kind: 'delete', orphanId: phase.orphanId, ...cleaning.rows[0] }
                : { kind: 'claimed', objectKey: phase.object_key }
            }, { timeoutMs: Math.max(1, cleanupDeadlineAt - Date.now()) })
          }
          if (phase.kind !== 'delete') return phase

          const deletion = await settleWithin(() => deleteObject({
              objectKey: phase.object_key,
              generation: phase.object_generation,
              etag: phase.object_etag,
              timeoutMs: cleanupDeleteTimeoutMs,
            }), cleanupDeleteTimeoutMs)
          if (deletion.kind === 'timeout') {
            return { kind: 'claimed', objectKey: phase.object_key }
          }
          if (deletion.kind === 'rejected') {
            const deleteError = deletion.error
            await recoveryTransaction(pool, async (client, deadline) => {
              const startedAt = await databaseClock(client)
              const phaseDeadline = new Date(startedAt.getTime() + deadline.remainingMs())
              await setTransactionDeadline(client, phaseDeadline, startedAt)
              await lockAssetObjectKey(client, phase.object_key)
              await refreshTransactionDeadline(client, phaseDeadline)
              await client.query(
                `UPDATE orphaned_uploads
                 SET attempts = attempts + 1, last_error = $4
                 WHERE id = $1 AND object_key = $2 AND status = 'cleaning'
                   AND cleanup_token = $3 AND object_generation = $5`,
                [phase.orphanId, phase.object_key, phase.cleanup_token,
                  typeof deleteError?.code === 'string' ? deleteError.code : 'cleanup_delete_failed',
                  phase.object_generation],
              )
            }, { timeoutMs: recoveryTimeoutMs })
            throw deleteError
          }

          return await recoveryTransaction(pool, async (client, deadline) => {
            const startedAt = await databaseClock(client)
            const phaseDeadline = new Date(startedAt.getTime() + deadline.remainingMs())
            await setTransactionDeadline(client, phaseDeadline, startedAt)
            await lockAssetObjectKey(client, phase.object_key)
            await refreshTransactionDeadline(client, phaseDeadline)
            const orphan = (await client.query(
              `SELECT id FROM orphaned_uploads
               WHERE id = $1 AND object_key = $2 AND status = 'cleaning'
                 AND cleanup_token = $3 AND object_generation = $4
               FOR UPDATE`,
              [phase.orphanId, phase.object_key, phase.cleanup_token, phase.object_generation],
            )).rows[0]
            if (!orphan) return { kind: 'claimed', objectKey: phase.object_key }
            const referenced = await client.query(
              `SELECT 1 FROM assets WHERE object_key = $1
               UNION ALL
               SELECT 1 FROM deliveries delivery JOIN assets asset ON asset.id = delivery.asset_id
                 WHERE asset.object_key = $1
               UNION ALL
               SELECT 1 FROM delivery_builds
                 WHERE state <> 'failed' AND plan->>'objectKey' = $1
               LIMIT 1`,
              [phase.object_key],
            )
            if (referenced.rowCount > 0) return { kind: 'referenced', objectKey: phase.object_key }
            await refreshTransactionDeadline(client, phaseDeadline)
            const cleaned = await client.query(
              `UPDATE orphaned_uploads
               SET status = 'cleaned', attempts = attempts + 1, last_error = NULL,
                   cleaned_at = $4, cleanup_token = NULL, cleanup_lease_expires_at = NULL
               WHERE id = $1 AND object_key = $2 AND status = 'cleaning' AND cleanup_token = $3
               RETURNING id`,
              [phase.orphanId, phase.object_key, phase.cleanup_token, cleanedAt ?? clock()],
            )
            return cleaned.rowCount === 1
              ? { kind: 'cleaned', objectKey: phase.object_key }
              : { kind: 'claimed', objectKey: phase.object_key }
          }, { timeoutMs: recoveryTimeoutMs })
        } catch (error) {
          if (error instanceof CleanupIdentityDriftError) {
            if (attempt + 1 === maximumAttempts || Date.now() >= cleanupDeadlineAt) {
              return { kind: 'claimed', objectKey: error.objectKey ?? lastObjectKey }
            }
            continue
          }
          if (error?.code === 'transaction_deadline_exceeded') throw recoveryDeadlineError()
          throw error
        }
      }
      return { kind: 'claimed', objectKey: lastObjectKey }
    },

    async markUnknown({ jobId, ownerToken, reason }) {
      return recoverGeneration({ jobId, ownerToken, reason })
    },

    async getJob({ jobId }) {
      return transaction(pool, async (client) => {
        let result = await client.query('SELECT * FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobId])
        let row = result.rows[0]
        if (!row) return null
        if (row.status === 'pending' && row.dispatch_state === 'dispatched' && row.timeout_at <= clock()) {
          result = await client.query(
            `UPDATE generation_jobs SET status = 'unknown', unknown_reason = 'timeout_recovery', updated_at = $2
             WHERE id = $1 AND status = 'pending' AND dispatch_state = 'dispatched' RETURNING *`,
            [jobId, clock()],
          )
          row = result.rows[0] ?? row
          if (result.rowCount === 1) await storeResponse(client, row, 202)
        }
        return mapJob(row)
      })
    },

    async selectCopy({ actor, campaignId, expectedRevision, input }) {
      validateExpectedRevision(expectedRevision)
      return transaction(pool, async (client) => {
        const campaigns = createCampaignRepository(client)
        const campaign = await campaigns.findByIdForUpdate(campaignId)
        if (!campaign) conflict('not_found', 'Campaign was not found', 404)
        if (campaign.revision !== expectedRevision) conflict('revision_conflict', 'The resource changed since it was loaded')
        const selected = await client.query(
          `SELECT * FROM copy_sets
           WHERE campaign_id = $1 AND candidates @> $2::jsonb
             AND NOT (deleted_candidate_ids ? $3)
           ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
          [campaignId, JSON.stringify([{ id: input.copyId }]), input.copyId],
        )
        const copySet = selected.rows[0]
        const copy = copySet?.candidates.find((candidate) => candidate.id === input.copyId)
        if (!copy) conflict('copy_not_found', 'The requested copy candidate was not found', 404)
        const transition = transitionCampaign({ campaign, action: 'select_copy', actor, input: { copy } })
        if (!transition.ok) conflict(transition.code, transition.message, transition.status)
        await client.query('UPDATE copy_sets SET selected_candidate_id = $2 WHERE id = $1', [copySet.id, copy.id])
        await client.query("UPDATE visual_directions SET stale = true WHERE campaign_id = $1 AND scope = 'legacy'", [campaignId])
        await client.query('UPDATE compositions SET stale = true WHERE campaign_id = $1', [campaignId])
        const updated = await campaigns.updateState(mapCampaignUpdate(campaign, expectedRevision, { status: transition.campaign.status, selectedCopyId: copySet.id }))
        await createAuditRepository(client).append({
          id: idGenerator(), actorId: actor.id, actorRole: actor.role, action: 'campaign.copy_selected',
          entityType: 'campaign', entityId: campaignId, beforeStatus: campaign.status, afterStatus: updated.status,
          payload: { copyId: copy.id, copySetId: copySet.id }, createdAt: clock(),
        })
        return updated
      })
    },

    async approveCopy({ actor, campaignId, expectedRevision, input }) {
      validateExpectedRevision(expectedRevision)
      return transaction(pool, async (client) => {
        const campaigns = createCampaignRepository(client)
        const campaign = await campaigns.findByIdForUpdate(campaignId)
        if (!campaign) conflict('not_found', 'Campaign was not found', 404)
        if (campaign.revision !== expectedRevision) conflict('revision_conflict', 'The resource changed since it was loaded')
        if (!editableStatuses.has(campaign.status) || campaign.openVersionId) conflict('campaign_locked', 'Campaign content is not editable in its current state')
        const running = await client.query("SELECT id FROM generation_jobs WHERE campaign_id = $1 AND status IN ('pending', 'unknown') LIMIT 1", [campaignId])
        if (running.rowCount) conflict('generation_pending', 'Wait for generation to finish before approving copy')
        const result = await client.query(
          `SELECT * FROM copy_sets WHERE campaign_id = $1 AND stale = false
           AND candidates @> $2::jsonb AND NOT (deleted_candidate_ids ? $3)
           ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
          [campaignId, JSON.stringify([{ id: input.copyId }]), input.copyId],
        )
        const copySet = result.rows[0]
        if (!copySet) conflict('copy_not_found', 'The requested copy candidate was not found', 404)
        const alreadyApproved = copySet.approved_candidate_ids.includes(input.copyId)
        if (alreadyApproved && campaign.selectedCopyId) return campaign
        const copy = copySet.candidates.find(candidate => candidate.id === input.copyId)
        const updates = {}
        // Until Banners supports choosing among approved cards, keep its existing
        // selection stable. Later approvals must not overwrite a user's design.
        if (!campaign.selectedCopyId) {
          const transition = transitionCampaign({ campaign, action: 'select_copy', actor, input: { copy } })
          if (!transition.ok) conflict(transition.code, transition.message, transition.status)
          updates.status = transition.campaign.status
          updates.selectedCopyId = copySet.id
          await client.query('UPDATE copy_sets SET selected_candidate_id = $2 WHERE id = $1', [copySet.id, copy.id])
          await client.query("UPDATE visual_directions SET stale = true WHERE campaign_id = $1 AND scope = 'legacy'", [campaignId])
          await campaigns.markArtifactsStale(campaignId, { composition: true })
        }
        if (!alreadyApproved) await client.query('UPDATE copy_sets SET approved_candidate_ids = approved_candidate_ids || $2::jsonb WHERE id = $1', [copySet.id, JSON.stringify([copy.id])])
        const updated = await campaigns.updateState(mapCampaignUpdate(campaign, expectedRevision, updates))
        await createAuditRepository(client).append({
          id: idGenerator(), actorId: actor.id, actorRole: actor.role, action: 'campaign.copy_approved',
          entityType: 'campaign', entityId: campaignId, beforeStatus: campaign.status, afterStatus: updated.status,
          payload: { copyId: copy.id, copySetId: copySet.id }, createdAt: clock(),
        })
        return updated
      })
    },

    async deleteCopy({ actor, campaignId, expectedRevision, input }) {
      validateExpectedRevision(expectedRevision)
      return transaction(pool, async (client) => {
        const campaigns = createCampaignRepository(client)
        const campaign = await campaigns.findByIdForUpdate(campaignId)
        if (!campaign) conflict('not_found', 'Campaign was not found', 404)
        if (campaign.revision !== expectedRevision) conflict('revision_conflict', 'The resource changed since it was loaded')
        if (!editableStatuses.has(campaign.status) || campaign.openVersionId) {
          conflict('campaign_locked', 'Campaign content is not editable in its current state')
        }
        const running = await client.query(
          "SELECT id FROM generation_jobs WHERE campaign_id = $1 AND status IN ('pending', 'unknown') LIMIT 1",
          [campaignId],
        )
        if (running.rowCount) conflict('generation_pending', 'Wait for generation to finish before deleting copy')
        const result = await client.query(
          `SELECT * FROM copy_sets WHERE campaign_id = $1 AND stale = false
             AND candidates @> $2::jsonb AND NOT (deleted_candidate_ids ? $3)
           ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
          [campaignId, JSON.stringify([{ id: input.copyId }]), input.copyId],
        )
        const copySet = result.rows[0]
        if (!copySet) conflict('copy_not_found', 'The requested copy candidate was not found', 404)
        const wasSelected = campaign.selectedCopyId === copySet.id && copySet.selected_candidate_id === input.copyId
        const activeComposition = campaign.compositionId ? await client.query(
          'SELECT designs FROM compositions WHERE campaign_id = $1 AND id = $2 AND stale = false FOR UPDATE',
          [campaignId, campaign.compositionId],
        ) : null
        const usedByBatch = activeComposition?.rows[0]?.designs?.some(design => design.copyId === input.copyId) ?? false
        const invalidatesComposition = wasSelected || usedByBatch
        await client.query(
          'UPDATE copy_sets SET deleted_candidate_ids = deleted_candidate_ids || $2::jsonb WHERE id = $1',
          [copySet.id, JSON.stringify([input.copyId])],
        )
        await client.query(`UPDATE visual_directions SET stale = true WHERE campaign_id = $1
          AND (copy_snapshot->>'id' = $2 OR ($3 AND scope = 'legacy'))`, [campaignId, input.copyId, wasSelected])
        if (invalidatesComposition) await client.query(
          'UPDATE compositions SET stale = true WHERE campaign_id = $1 AND id = $2 AND stale = false',
          [campaignId, campaign.compositionId],
        )
        const updated = await campaigns.updateState({ ...mapCampaignUpdate(campaign, expectedRevision), ...(wasSelected ? {
          status: 'draft', selectedCopyId: null, selectedDirectionId: null, compositionId: null,
        } : usedByBatch ? { status: 'direction_selected', compositionId: null } : {}) })
        await createAuditRepository(client).append({
          id: idGenerator(), actorId: actor.id, actorRole: actor.role, action: 'campaign.copy_deleted',
          entityType: 'campaign', entityId: campaignId, beforeStatus: campaign.status, afterStatus: updated.status,
          payload: { copyId: input.copyId, copySetId: copySet.id, wasSelected }, createdAt: clock(),
        })
        return updated
      })
    },

    async selectDirection({ actor, campaignId, expectedRevision, input }) {
      validateExpectedRevision(expectedRevision)
      return transaction(pool, async (client) => {
        const campaigns = createCampaignRepository(client)
        const campaign = await campaigns.findByIdForUpdate(campaignId)
        if (!campaign) conflict('not_found', 'Campaign was not found', 404)
        if (campaign.revision !== expectedRevision) conflict('revision_conflict', 'The resource changed since it was loaded')
        const selected = await client.query('SELECT * FROM visual_directions WHERE campaign_id = $1 AND id = $2 AND stale = false FOR UPDATE', [campaignId, input.directionId])
        const row = selected.rows[0]
        if (!row) conflict('direction_not_found', 'The requested visual direction was not found', 404)
        let selectedCopyId = campaign.selectedCopyId
        let transitionSource = campaign
        if (row.scope === 'selected_copy') {
          const linked = await client.query(`SELECT * FROM copy_sets WHERE campaign_id = $1 AND stale = false
            AND candidates @> $2::jsonb AND (approved_candidate_ids ? $3 OR (id = $4 AND selected_candidate_id = $3))
            AND NOT (deleted_candidate_ids ? $3) FOR UPDATE`,
          [campaignId, JSON.stringify([{ id: row.copy_snapshot.id }]), row.copy_snapshot.id, campaign.selectedCopyId])
          const copySet = linked.rows[0]
          if (!copySet) conflict('copy_not_approved', 'The linked copy is no longer available. Choose a current visual.')
          if (campaign.status === 'draft') {
            const copyTransition = transitionCampaign({ campaign, action: 'select_copy', actor, input: { copy: row.copy_snapshot } })
            if (!copyTransition.ok) conflict(copyTransition.code, copyTransition.message, copyTransition.status)
            transitionSource = copyTransition.campaign
          }
          selectedCopyId = copySet.id
          // Promote the exact legacy selection before moving the Banners bridge.
          // Its approval must not disappear when another linked visual is chosen.
          await client.query(`UPDATE copy_sets
            SET approved_candidate_ids = approved_candidate_ids || jsonb_build_array(selected_candidate_id)
            WHERE campaign_id = $1 AND id = $2 AND stale = false AND selected_candidate_id IS NOT NULL
              AND candidates @> jsonb_build_array(jsonb_build_object('id', selected_candidate_id))
              AND NOT (deleted_candidate_ids ? selected_candidate_id)
              AND NOT (approved_candidate_ids ? selected_candidate_id)`, [campaignId, campaign.selectedCopyId])
          await client.query('UPDATE copy_sets SET selected_candidate_id = $2 WHERE id = $1', [copySet.id, row.copy_snapshot.id])
        }
        const direction = visualDirectionSchema.parse({ id: row.id, title: row.title, prompt: row.prompt, status: row.status, previewAssetId: row.preview_asset_id })
        const transition = transitionCampaign({ campaign: transitionSource, action: 'select_direction', actor, input: { direction } })
        if (!transition.ok) conflict(transition.code, transition.message, transition.status)
        await client.query('UPDATE compositions SET stale = true WHERE campaign_id = $1', [campaignId])
        const updated = await campaigns.updateState(mapCampaignUpdate(campaign, expectedRevision, { status: transition.campaign.status, selectedDirectionId: direction.id, selectedCopyId }))
        await createAuditRepository(client).append({
          id: idGenerator(), actorId: actor.id, actorRole: actor.role, action: 'campaign.direction_selected',
          entityType: 'campaign', entityId: campaignId, beforeStatus: campaign.status, afterStatus: updated.status,
          payload: { directionId: direction.id }, createdAt: clock(),
        })
        return updated
      })
    },
  }
}
