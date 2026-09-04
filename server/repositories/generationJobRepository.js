import { randomUUID } from 'node:crypto'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { transitionCampaign } from '../../shared/workflowRules.js'
import { copyVariantSchema, visualDirectionSchema } from '../../shared/contracts.js'
import { withTransaction } from '../db/pool.js'
import { createAuditRepository } from './auditRepository.js'
import { createCampaignRepository } from './campaignRepository.js'
import { createSettingsRepository } from './settingsRepository.js'

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

function validateExpectedRevision(expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new GenerationControlPlaneError(400, 'invalid_revision', 'Expected revision must be a non-negative integer')
  }
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
  if (step === 'brief_analysis') return { brief: campaign.brief }
  if (step === 'copy') {
    const analysis = await client.query(
      `SELECT result_metadata->'analysis' AS analysis
       FROM generation_jobs
       WHERE campaign_id = $1 AND step = 'brief_analysis' AND status = 'succeeded'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [campaign.id],
    )
    if (!analysis.rows[0]?.analysis) throw providerContextError(step)
    return { brief: campaign.brief, analysis: analysis.rows[0].analysis }
  }
  if (step === 'directions') {
    if (!campaign.selectedCopyId) throw providerContextError(step)
    const selected = await client.query('SELECT candidates, selected_candidate_id FROM copy_sets WHERE campaign_id = $1 AND id = $2', [campaign.id, campaign.selectedCopyId])
    const copy = selected.rows[0]?.candidates?.find((candidate) => candidate.id === selected.rows[0].selected_candidate_id)
    if (!copy) throw providerContextError(step)
    return { brief: campaign.brief, copy: copyVariantSchema.parse(copy) }
  }
  if (step === 'image') {
    const selected = await client.query('SELECT * FROM visual_directions WHERE campaign_id = $1 AND id = $2 AND stale = false', [campaign.id, input.directionId])
    if (!selected.rows[0]) throw providerContextError(step)
    return {
      direction: visualDirectionSchema.parse({
        id: selected.rows[0].id,
        title: selected.rows[0].title,
        prompt: selected.rows[0].prompt,
        status: selected.rows[0].status,
        previewAssetId: selected.rows[0].preview_asset_id,
      }),
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
  providerNames = ['mock'],
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  pollIntervalMs = 10,
  waitTimeoutMs = 2_000,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  const allowedProviders = new Set(providerNames)

  return {
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
        if (!allowedProviders.has(settings.provider)) conflict('provider_unavailable', 'The configured generation provider is unavailable', 503)
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
          [jobId, campaignId, actor.id, step, settings.provider, settings.model, settings.region,
            maxCostMicrounits, idempotencyKey, fingerprint, ownerToken, budgetDay, context, timeoutAt, startedAt],
        )
        return { kind: 'owner', ownerToken, job: mapJob(created.rows[0]), context }
      })
    },

    async waitForResult({ jobId }) {
      const deadline = Date.now() + waitTimeoutMs
      while (Date.now() < deadline) {
        const result = await pool.query('SELECT * FROM generation_jobs WHERE id = $1', [jobId])
        const row = result.rows[0]
        if (!row) conflict('not_found', 'Generation job was not found', 404)
        if (row.response_status != null && row.response_body != null) {
          return { status: row.response_status, body: row.response_body }
        }
        await wait(pollIntervalMs)
      }
      const result = await pool.query('SELECT * FROM generation_jobs WHERE id = $1', [jobId])
      if (!result.rows[0]) conflict('not_found', 'Generation job was not found', 404)
      return { status: 202, body: { job: mapJob(result.rows[0]) } }
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
        const locked = await client.query('SELECT * FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobId])
        const current = locked.rows[0]
        if (!current || current.owner_token !== ownerToken || current.status !== 'pending' || current.dispatch_state !== 'dispatched') {
          conflict('generation_owner_lost', 'Generation result ownership was lost')
        }
        if (BigInt(actualCostMicrounits) > BigInt(current.reserved_cost_microunits)) {
          conflict('generation_cost_exceeded_reservation', 'Provider cost exceeded its reservation')
        }

        let persistedResult = resultMetadata
        if (status === 'succeeded' && current.step === 'copy') {
          const copySetId = idGenerator()
          const copies = resultMetadata.copies.map((copy) => ({ ...copy, id: `${jobId}:${copy.id}` }))
          await client.query(
            `INSERT INTO copy_sets (id, campaign_id, generation_job_id, candidates)
             VALUES ($1, $2, $3, $4)`,
            [copySetId, current.campaign_id, jobId, JSON.stringify(copies)],
          )
          persistedResult = { copySetId, copies }
        } else if (status === 'succeeded' && current.step === 'directions') {
          const directions = resultMetadata.directions.map((direction) => ({ ...direction, id: `${jobId}:${direction.id}` }))
          for (const direction of directions) {
            await client.query(
              `INSERT INTO visual_directions
                 (id, campaign_id, generation_job_id, title, prompt, status, preview_asset_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [direction.id, current.campaign_id, jobId, direction.title, direction.prompt, direction.status, direction.previewAssetId],
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

    async markUnknown({ jobId, ownerToken, reason }) {
      return transaction(pool, async (client) => {
        const updated = await client.query(
          `UPDATE generation_jobs
           SET status = 'unknown', unknown_reason = $3, updated_at = $4
           WHERE id = $1 AND owner_token = $2 AND status = 'pending' AND dispatch_state = 'dispatched'
           RETURNING *`,
          [jobId, ownerToken, reason, clock()],
        )
        if (updated.rowCount === 0) conflict('generation_owner_lost', 'Generation result ownership was lost')
        return storeResponse(client, updated.rows[0], 202)
      })
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
           ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
          [campaignId, JSON.stringify([{ id: input.copyId }])],
        )
        const copySet = selected.rows[0]
        const copy = copySet?.candidates.find((candidate) => candidate.id === input.copyId)
        if (!copy) conflict('copy_not_found', 'The requested copy candidate was not found', 404)
        const transition = transitionCampaign({ campaign, action: 'select_copy', actor, input: { copy } })
        if (!transition.ok) conflict(transition.code, transition.message, transition.status)
        await client.query('UPDATE copy_sets SET selected_candidate_id = $2 WHERE id = $1', [copySet.id, copy.id])
        await client.query('UPDATE visual_directions SET stale = true WHERE campaign_id = $1', [campaignId])
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
        const direction = visualDirectionSchema.parse({ id: row.id, title: row.title, prompt: row.prompt, status: row.status, previewAssetId: row.preview_asset_id })
        const transition = transitionCampaign({ campaign, action: 'select_direction', actor, input: { direction } })
        if (!transition.ok) conflict(transition.code, transition.message, transition.status)
        await client.query('UPDATE compositions SET stale = true WHERE campaign_id = $1', [campaignId])
        const updated = await campaigns.updateState(mapCampaignUpdate(campaign, expectedRevision, { status: transition.campaign.status, selectedDirectionId: direction.id }))
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
