import { randomUUID } from 'node:crypto'
import {
  approveVersionRequestSchema,
  campaignRecordSchema,
  campaignVersionRecordSchema,
  markVersionReadyRequestSchema,
  rejectVersionRequestSchema,
  reopenCampaignRequestSchema,
  requestVersionChangesRequestSchema,
  reviewEventRecordSchema,
} from '../../shared/contracts.js'
import { deriveReviewStatus, InvalidReviewHistoryError, orderReviewEvents } from '../../shared/reviewHistory.js'
import { transitionCampaign } from '../../shared/workflowRules.js'
import { createReviewRepository } from '../repositories/reviewRepository.js'
import { createIdempotencyService } from './idempotencyService.js'

const allRoles = ['marketer', 'designer', 'admin']

export class ReviewServiceError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'ReviewServiceError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.details = details
    this.expose = true
  }
}

function fail(statusCode, code, message, details) {
  throw new ReviewServiceError(statusCode, code, message, details)
}

function requireActor(actor, roles = allRoles) {
  if (!actor || actor.disabled || !roles.includes(actor.role)) fail(403, 'forbidden', 'This actor cannot perform the requested operation')
}

function validate(schema, value) {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  fail(400, 'invalid_request', 'Request validation failed', parsed.error.issues.map((issue) => ({
    path: issue.path.join('.'), message: issue.message,
  })))
}

function validRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(400, 'invalid_revision', 'Expected revision must be a non-negative integer')
  return value
}

function workflowError(result) {
  fail(result.status, result.code, result.message)
}

function strictVersion(value) {
  const parsed = campaignVersionRecordSchema.safeParse(value)
  if (!parsed.success) throw new Error('Persistence returned an invalid immutable version')
  return parsed.data
}

function strictCampaign(value) {
  const parsed = campaignRecordSchema.safeParse(value)
  if (!parsed.success) throw new Error('Persistence returned an invalid campaign')
  return parsed.data
}

function strictEvents(events, version) {
  if (!Array.isArray(events)) throw new Error('Persistence returned invalid review history')
  const parsed = events.map((event) => reviewEventRecordSchema.safeParse(event))
  if (parsed.some((result) => !result.success)) throw new Error('Persistence returned invalid review history')
  const values = parsed.map((result) => result.data)
  if (values.some((event) => event.versionId !== version.id || event.campaignId !== version.campaignId)) {
    throw new Error('Persistence returned review history for another version')
  }
  return orderReviewEvents(values)
}

function canonicalHashes(values) {
  if (!Array.isArray(values) || values.some((value) => !/^[a-f0-9]{64}$/.test(value))) {
    fail(409, 'invalid_review_history', 'Review asset history is invalid')
  }
  return [...new Set(values)].sort()
}

function sameHashes(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function trustedVersionAssetHashes(records, version) {
  if (!records || !Array.isArray(records.source) || !Array.isArray(records.review)) {
    throw new Error('Persistence returned invalid immutable asset hashes')
  }
  const source = canonicalHashes(records.source)
  const review = canonicalHashes(records.review)
  const snapshotSourceReferences = version.snapshot.assets
    .filter((asset) => ['direction', 'final_image'].includes(asset.kind))
  const snapshotReviewReferences = version.snapshot.assets
    .filter((asset) => ['review_png', 'manifest'].includes(asset.kind))
  const snapshotSource = canonicalHashes(snapshotSourceReferences.map((asset) => asset.sha256))
  const snapshotReview = canonicalHashes(snapshotReviewReferences.map((asset) => asset.sha256))
  if (!sameHashes(source, snapshotSource)
    || !sameHashes(review, snapshotReview)
    || !snapshotReviewReferences.some((asset) => asset.kind === 'review_png')
    || snapshotReviewReferences.filter((asset) => asset.kind === 'manifest').length !== 1) {
    fail(409, 'invalid_review_history', 'Review assets do not match the immutable version')
  }
  return { review, all: canonicalHashes([...source, ...review]) }
}

function verifiedStatus(events, version, assetHashes) {
  const sent = events[0]
  if (sent?.eventType !== 'sent'
    || sent.payload.contentHash !== version.contentHash
    || !sameHashes(canonicalHashes(sent.payload.assetHashes), assetHashes.review)) {
    fail(409, 'invalid_review_history', 'Review history does not match the immutable version')
  }
  const ready = events.find((event) => event.eventType === 'ready')
  if (ready && (ready.payload.contentHash !== version.contentHash
    || ready.payload.readyActorId !== ready.actorId
    || (ready.payload.assetHashes
      && !sameHashes(canonicalHashes(ready.payload.assetHashes), assetHashes.all)))) {
    fail(409, 'invalid_review_history', 'Ready history does not match the immutable version')
  }
  const approved = events.find((event) => event.eventType === 'approved')
  if (approved && (approved.payload.contentHash !== version.contentHash
    || (approved.payload.assetHashes
      && !sameHashes(canonicalHashes(approved.payload.assetHashes), assetHashes.all)))) {
    fail(409, 'invalid_review_history', 'Approval history does not match the immutable version')
  }
  try {
    return deriveReviewStatus(events)
  } catch (error) {
    if (error instanceof InvalidReviewHistoryError) {
      fail(409, 'invalid_review_history', 'Review history contains an impossible sequence')
    }
    throw error
  }
}

function currentVersionForRules(version, events) {
  const ready = events.find((event) => event.eventType === 'ready')
  return {
    id: version.id,
    number: version.versionNumber,
    contentHash: version.contentHash,
    readyActorId: ready?.actorId ?? null,
  }
}

function nextEventTime(value, events) {
  const requested = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(requested.getTime())) throw new TypeError('Review clock must return a valid date')
  const latest = events.reduce((maximum, event) => Math.max(maximum, Date.parse(event.createdAt)), Number.NEGATIVE_INFINITY)
  return Number.isFinite(latest) && requested.getTime() <= latest ? new Date(latest + 1) : requested
}

const commands = {
  request_changes: {
    roles: ['designer'], schema: requestVersionChangesRequestSchema, eventType: 'changes_requested', close: true,
    payload: ({ input }) => ({ comment: input.comment }),
  },
  mark_ready: {
    roles: ['designer'], schema: markVersionReadyRequestSchema, eventType: 'ready', close: false,
    payload: ({ input, actor, version }) => ({
      ...input, readyActorId: actor.id, contentHash: version.contentHash,
    }),
  },
  reject: {
    roles: ['marketer', 'admin'], schema: rejectVersionRequestSchema, eventType: 'rejected', close: true,
    payload: ({ input }) => ({ comment: input.comment }),
  },
  approve: {
    roles: ['marketer', 'admin'], schema: approveVersionRequestSchema, eventType: 'approved', close: true,
    payload: ({ version }) => ({ contentHash: version.contentHash }),
  },
}

export function createReviewService({
  pool,
  repositoryFactory = createReviewRepository,
  idempotencyService,
  idGenerator = randomUUID,
  clock = () => new Date(),
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  if (typeof repositoryFactory !== 'function') throw new TypeError('A review repository factory is required')
  const idempotency = idempotencyService ?? createIdempotencyService({ pool })

  async function executeVersionCommand({ action, actor, versionId, expectedRevision, idempotencyKey, input }) {
    const command = commands[action]
    if (!command) throw new TypeError(`Unknown review command ${action}`)
    requireActor(actor, command.roles)
    validRevision(expectedRevision)
    const parsedInput = validate(command.schema, input)

    return idempotency.executeDatabaseCommand({
      actorId: actor.id,
      method: 'POST',
      resourceId: versionId,
      key: idempotencyKey,
      payload: { action, expectedRevision, input: parsedInput },
      operation: async (client) => {
        const repository = repositoryFactory(client)
        const version = strictVersion(await repository.findVersionById(versionId) ?? fail(404, 'not_found', 'Version was not found'))
        const campaign = strictCampaign(await repository.lockCampaign(version.campaignId) ?? fail(404, 'not_found', 'Campaign was not found'))
        if (campaign.revision !== expectedRevision) fail(409, 'revision_conflict', 'The resource changed since it was loaded')
        if (version.campaignId !== campaign.id
          || version.versionNumber !== campaign.currentVersionNumber
          || campaign.openVersionId !== version.id) {
          fail(409, 'version_not_current', 'Review commands require the exact current open version')
        }
        const events = strictEvents(await repository.listEvents(version.id, { forUpdate: true }), version)
        const assetHashes = trustedVersionAssetHashes(await repository.listVersionAssetHashes(version.id), version)
        const status = verifiedStatus(events, version, assetHashes)
        if (status !== campaign.status) fail(409, 'invalid_review_history', 'Campaign status does not match review history')

        const transition = transitionCampaign({
          campaign: { ...campaign, currentVersion: currentVersionForRules(version, events) },
          action,
          actor,
          input: parsedInput,
        })
        if (!transition.ok) workflowError(transition)

        const createdAt = nextEventTime(clock(), events)
        const event = reviewEventRecordSchema.parse(await repository.appendEvent({
          id: idGenerator(),
          campaignId: campaign.id,
          versionId: version.id,
          actorId: actor.id,
          actorRole: actor.role,
          eventType: command.eventType,
          payload: command.payload({ input: parsedInput, actor, version, assetHashes }),
          createdAt,
        }))
        const updated = strictCampaign(await repository.updateCampaignReviewState({
          campaign,
          status: transition.campaign.status,
          openVersionId: command.close ? null : version.id,
        }))
        await repository.appendAudit({
          id: idGenerator(), actorId: actor.id, actorRole: actor.role,
          action: `campaign.${action}`, entityType: 'campaign', entityId: campaign.id,
          beforeStatus: campaign.status, afterStatus: updated.status, versionId: version.id,
          payload: { reviewEventId: event.id, contentHash: version.contentHash, assetHashes: assetHashes.all }, createdAt,
        })
        return {
          status: 200,
          body: { version, campaign: updated, reviewStatus: deriveReviewStatus([...events, event]), event },
        }
      },
    })
  }

  return {
    requestChanges: (input) => executeVersionCommand({ ...input, action: 'request_changes' }),
    markReady: (input) => executeVersionCommand({ ...input, action: 'mark_ready' }),
    reject: (input) => executeVersionCommand({ ...input, action: 'reject' }),
    approve: (input) => executeVersionCommand({ ...input, action: 'approve' }),

    async reopen({ actor, campaignId, expectedRevision, idempotencyKey, input }) {
      requireActor(actor, ['marketer', 'admin'])
      validRevision(expectedRevision)
      const parsedInput = validate(reopenCampaignRequestSchema, input)
      return idempotency.executeDatabaseCommand({
        actorId: actor.id, method: 'POST', resourceId: campaignId, key: idempotencyKey,
        payload: { action: 'reopen', expectedRevision, input: parsedInput },
        operation: async (client) => {
          const repository = repositoryFactory(client)
          const campaign = strictCampaign(await repository.lockCampaign(campaignId) ?? fail(404, 'not_found', 'Campaign was not found'))
          if (campaign.revision !== expectedRevision) fail(409, 'revision_conflict', 'The resource changed since it was loaded')
          if (campaign.openVersionId !== null || campaign.currentVersionNumber < 1) {
            fail(409, 'version_not_current', 'Reopen requires a closed current review version')
          }
          const version = strictVersion(await repository.findCurrentVersion(campaign.id, campaign.currentVersionNumber)
            ?? fail(409, 'version_not_current', 'Current review version was not found'))
          const events = strictEvents(await repository.listEvents(version.id, { forUpdate: true }), version)
          const assetHashes = trustedVersionAssetHashes(await repository.listVersionAssetHashes(version.id), version)
          const status = verifiedStatus(events, version, assetHashes)
          if (campaign.status !== 'changes_requested' || status !== 'changes_requested') {
            fail(409, 'invalid_review_history', 'Only a closed changes-requested review can be reopened')
          }
          const transition = transitionCampaign({
            campaign: { ...campaign, currentVersion: currentVersionForRules(version, events) },
            action: 'reopen', actor, input: parsedInput,
          })
          if (!transition.ok) workflowError(transition)
          const createdAt = clock()
          const updated = strictCampaign(await repository.updateCampaignReviewState({
            campaign, status: transition.campaign.status, openVersionId: null,
          }))
          await repository.appendAudit({
            id: idGenerator(), actorId: actor.id, actorRole: actor.role,
            action: 'campaign.reopened', entityType: 'campaign', entityId: campaign.id,
            beforeStatus: campaign.status, afterStatus: updated.status, versionId: version.id,
            payload: { versionNumber: version.versionNumber }, createdAt,
          })
          return { status: 200, body: { campaign: updated } }
        },
      })
    },

    async getReview({ actor, versionId }) {
      requireActor(actor)
      const repository = repositoryFactory(pool)
      const version = strictVersion(await repository.findVersionById(versionId) ?? fail(404, 'not_found', 'Version was not found'))
      const events = strictEvents(await repository.listEvents(version.id), version)
      const assetHashes = trustedVersionAssetHashes(await repository.listVersionAssetHashes(version.id), version)
      return { version, status: verifiedStatus(events, version, assetHashes), events }
    },
  }
}
