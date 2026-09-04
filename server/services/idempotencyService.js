import { randomUUID } from 'node:crypto'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { withTransaction } from '../db/pool.js'
import { createIdempotencyRepository } from '../repositories/idempotencyRepository.js'

export const externalOperationRecoveryBoundary = 'Paid-provider calls require the persisted generation-job recovery protocol from Task 9.'

export class IdempotencyServiceError extends Error {
  constructor(statusCode, code, message) {
    super(message)
    this.name = 'IdempotencyServiceError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.expose = true
  }
}

const defaultWait = (duration) => new Promise((resolve) => setTimeout(resolve, duration))

function instant(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value.getTime())
  if (Number.isFinite(value)) return new Date(value)
  throw new TypeError('The idempotency clock must return a Date or millisecond timestamp')
}

function validateKey(key) {
  if (typeof key !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(key)) {
    throw new IdempotencyServiceError(400, 'invalid_idempotency_key', 'Idempotency-Key must be 1-255 visible ASCII characters without whitespace')
  }
}

function validateScope({ actorId, method, resourceId }) {
  if (![actorId, method, resourceId].every((value) => typeof value === 'string' && value.trim().length > 0)) {
    throw new TypeError('Idempotency scope requires actorId, method, and resourceId')
  }
}

function validateOperationResult(result) {
  if (!result || !Number.isInteger(result.status) || result.status < 100 || result.status > 599 || result.body === undefined) {
    throw new TypeError('Idempotent database commands must return { status, body }')
  }
  hashCanonical(result.body)
  return result
}

export function createIdempotencyService({
  pool,
  repositoryFactory = createIdempotencyRepository,
  transaction = withTransaction,
  idGenerator = randomUUID,
  clock = () => new Date(),
  wait = defaultWait,
  leaseMs = 30_000,
  pollIntervalMs = 25,
  timeoutMs = 2_000,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  if (typeof repositoryFactory !== 'function' || typeof transaction !== 'function') throw new TypeError('Repository and transaction factories are required')
  if (![leaseMs, pollIntervalMs, timeoutMs].every((duration) => Number.isFinite(duration) && duration > 0)) {
    throw new TypeError('Lease and polling durations must be positive numbers')
  }

  const coordinator = repositoryFactory(pool)

  return {
    // This helper is intentionally limited to database-only work on the supplied transaction client.
    // External paid-provider calls use Task 9's persisted generation-job recovery protocol instead.
    async executeDatabaseCommand({ actorId, method, resourceId, key, payload, operation }) {
      validateScope({ actorId, method, resourceId })
      validateKey(key)
      if (typeof operation !== 'function') throw new TypeError('A database command operation is required')

      let fingerprint
      try {
        fingerprint = hashCanonical(payload)
      } catch {
        throw new IdempotencyServiceError(400, 'invalid_idempotency_payload', 'The request payload cannot be fingerprinted')
      }
      const scope = { actorId, method: method.toUpperCase(), resourceId, key }
      const deadline = instant(clock()).getTime() + timeoutMs

      while (true) {
        const ownerToken = idGenerator()
        const now = instant(clock())
        const claim = await coordinator.claim({
          ...scope,
          fingerprint,
          ownerToken,
          now,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        })
        if (claim.kind === 'conflict') {
          throw new IdempotencyServiceError(409, 'idempotency_conflict', 'This idempotency key was already used with a different request')
        }
        if (claim.kind === 'replay') {
          return { status: claim.responseStatus, body: claim.responseBody, replayed: true }
        }
        if (claim.kind === 'owner') {
          try {
            return await transaction(pool, async (client) => {
              const transactional = repositoryFactory(client)
              const locked = await transactional.lockOwner({ ...scope, fingerprint, ownerToken, now: instant(clock()) })
              if (!locked) {
                throw new IdempotencyServiceError(409, 'idempotency_owner_lost', 'Idempotency ownership expired or was reclaimed')
              }
              const result = validateOperationResult(await operation(client))
              await transactional.complete({
                ...scope,
                ownerToken,
                responseStatus: result.status,
                responseBody: result.body,
              })
              return { ...result, replayed: false }
            })
          } catch (error) {
            await coordinator.fail({ ...scope, ownerToken, failureCode: 'database_command_failed' }).catch(() => {})
            throw error
          }
        }
        if (claim.kind !== 'in_progress') throw new TypeError(`Unknown idempotency claim result: ${claim.kind}`)

        while (instant(clock()).getTime() < deadline) {
          await wait(pollIntervalMs)
          const record = await coordinator.find(scope)
          if (!record) break
          if (record.fingerprint !== fingerprint) {
            throw new IdempotencyServiceError(409, 'idempotency_conflict', 'This idempotency key was already used with a different request')
          }
          if (record.state === 'completed') {
            return { status: record.responseStatus, body: record.responseBody, replayed: true }
          }
          const observedAt = instant(clock())
          if (record.state === 'failed' || record.leaseExpiresAt <= observedAt) break
        }

        if (instant(clock()).getTime() >= deadline) {
          throw new IdempotencyServiceError(409, 'idempotency_in_progress', 'The original request is still in progress')
        }
      }
    },
  }
}
