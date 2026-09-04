import { randomUUID } from 'node:crypto'
import { hashCanonical } from '../../shared/canonicalJson.js'

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

function epoch(value) {
  if (value instanceof Date) return value.getTime()
  if (Number.isFinite(value)) return value
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
    throw new TypeError('Idempotent operations must return { status, body }')
  }
  hashCanonical(result.body)
  return result
}

export function createIdempotencyService({
  repository,
  idGenerator = randomUUID,
  clock = () => Date.now(),
  wait = defaultWait,
  pollIntervalMs = 25,
  timeoutMs = 2_000,
} = {}) {
  if (!repository || !['claim', 'complete', 'fail', 'find'].every((method) => typeof repository[method] === 'function')) {
    throw new TypeError('An idempotency repository with claim, complete, fail, and find is required')
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('Polling durations must be positive numbers')
  }

  return {
    async execute({ actorId, method, resourceId, key, payload, operation }) {
      validateScope({ actorId, method, resourceId })
      validateKey(key)
      if (typeof operation !== 'function') throw new TypeError('An idempotent operation is required')

      let fingerprint
      try {
        fingerprint = hashCanonical(payload)
      } catch {
        throw new IdempotencyServiceError(400, 'invalid_idempotency_payload', 'The request payload cannot be fingerprinted')
      }
      const scope = { actorId, method: method.toUpperCase(), resourceId, key }
      const deadline = epoch(clock()) + timeoutMs

      while (true) {
        const ownerToken = idGenerator()
        const claim = await repository.claim({ ...scope, fingerprint, ownerToken })
        if (claim.kind === 'conflict') {
          throw new IdempotencyServiceError(409, 'idempotency_conflict', 'This idempotency key was already used with a different request')
        }
        if (claim.kind === 'replay') {
          return { status: claim.responseStatus, body: claim.responseBody, replayed: true }
        }
        if (claim.kind === 'owner') {
          try {
            const result = validateOperationResult(await operation())
            await repository.complete({
              ...scope,
              ownerToken,
              responseStatus: result.status,
              responseBody: result.body,
            })
            return { ...result, replayed: false }
          } catch (error) {
            await repository.fail({ ...scope, ownerToken, failureCode: 'operation_failed' })
            throw error
          }
        }
        if (claim.kind !== 'in_progress') throw new TypeError(`Unknown idempotency claim result: ${claim.kind}`)

        while (epoch(clock()) < deadline) {
          await wait(pollIntervalMs)
          const record = await repository.find(scope)
          if (!record) break
          if (record.fingerprint !== fingerprint) {
            throw new IdempotencyServiceError(409, 'idempotency_conflict', 'This idempotency key was already used with a different request')
          }
          if (record.state === 'completed') {
            return { status: record.responseStatus, body: record.responseBody, replayed: true }
          }
          if (record.state === 'failed') break
        }

        if (epoch(clock()) >= deadline) {
          throw new IdempotencyServiceError(409, 'idempotency_in_progress', 'The original request is still in progress')
        }
      }
    },
  }
}
