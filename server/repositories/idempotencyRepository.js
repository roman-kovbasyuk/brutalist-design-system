function scopeValues({ actorId, method, resourceId, key }) {
  return [actorId, method.toUpperCase(), resourceId, key]
}

const defaultLeaseMs = 30_000

function claimTimes(now, leaseExpiresAt) {
  const claimedAt = now ?? new Date()
  return {
    now: claimedAt,
    leaseExpiresAt: leaseExpiresAt ?? new Date(claimedAt.getTime() + defaultLeaseMs),
  }
}

function mapRecord(row) {
  if (!row) return null
  return {
    fingerprint: row.fingerprint,
    state: row.state,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    ownerToken: row.owner_token,
    leaseExpiresAt: row.lease_expires_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    failureCode: row.failure_code,
  }
}

export function createIdempotencyRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')

  return {
    async claim({ actorId, method, resourceId, key, fingerprint, ownerToken, now, leaseExpiresAt }) {
      const scope = scopeValues({ actorId, method, resourceId, key })
      const times = claimTimes(now, leaseExpiresAt)
      const inserted = await client.query(
        `INSERT INTO idempotency_records
           (actor_id, method, resource_id, key, fingerprint, owner_token, lease_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (actor_id, method, resource_id, key) DO NOTHING
         RETURNING actor_id`,
        [...scope, fingerprint, ownerToken, times.leaseExpiresAt],
      )
      if (inserted.rowCount > 0) return { kind: 'owner' }

      const existing = await client.query(
        `SELECT fingerprint, state, response_status, response_body, lease_expires_at
         FROM idempotency_records
         WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4`,
        scope,
      )
      const record = existing.rows[0]
      if (!record || record.fingerprint !== fingerprint) return { kind: 'conflict' }
      if (record.state === 'completed') {
        return { kind: 'replay', responseStatus: record.response_status, responseBody: record.response_body }
      }
      const reclaimable = record.state === 'failed' || record.lease_expires_at <= times.now
      if (!reclaimable) return { kind: 'in_progress' }

      const reclaimed = await client.query(
        `WITH candidate AS (
           SELECT actor_id, method, resource_id, key
           FROM idempotency_records
           WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4
             AND fingerprint = $5
             AND (state = 'failed' OR (state = 'in_progress' AND lease_expires_at <= $8))
           FOR UPDATE SKIP LOCKED
         )
         UPDATE idempotency_records AS records
         SET state = 'in_progress', owner_token = $6, lease_expires_at = $7,
             failed_at = NULL, failure_code = NULL
         FROM candidate
         WHERE records.actor_id = candidate.actor_id
           AND records.method = candidate.method
           AND records.resource_id = candidate.resource_id
           AND records.key = candidate.key
         RETURNING records.actor_id`,
        [...scope, fingerprint, ownerToken, times.leaseExpiresAt, times.now],
      )
      if (reclaimed.rowCount > 0) return { kind: 'owner' }

      const latest = await client.query(
        `SELECT fingerprint, state, response_status, response_body
         FROM idempotency_records
         WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4`,
        scope,
      )
      const latestRecord = latest.rows[0]
      if (!latestRecord || latestRecord.fingerprint !== fingerprint) return { kind: 'conflict' }
      if (latestRecord.state === 'completed') {
        return { kind: 'replay', responseStatus: latestRecord.response_status, responseBody: latestRecord.response_body }
      }
      return { kind: 'in_progress' }
    },

    async lockOwner({ actorId, method, resourceId, key, fingerprint, ownerToken, now = new Date() }) {
      const result = await client.query(
        `SELECT fingerprint, state, response_status, response_body, owner_token, lease_expires_at,
                created_at, completed_at, failed_at, failure_code
         FROM idempotency_records
         WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4
         FOR UPDATE`,
        scopeValues({ actorId, method, resourceId, key }),
      )
      const row = result.rows[0]
      if (!row || row.fingerprint !== fingerprint || row.owner_token !== ownerToken || row.state !== 'in_progress' || row.lease_expires_at <= now) {
        return null
      }
      return mapRecord(row)
    },

    async complete({ actorId, method, resourceId, key, ownerToken, responseStatus, responseBody }) {
      const result = await client.query(
        `UPDATE idempotency_records
         SET state = 'completed', response_status = $6, response_body = $7::jsonb, completed_at = now()
         WHERE actor_id = $1
           AND method = $2
           AND resource_id = $3
           AND key = $4
           AND owner_token = $5
           AND state = 'in_progress'
         RETURNING response_status, response_body`,
        [...scopeValues({ actorId, method, resourceId, key }), ownerToken, responseStatus, JSON.stringify(responseBody)],
      )
      if (result.rowCount === 0) {
        const error = new Error('Idempotency record is not owned by this operation')
        error.code = 'idempotency_owner_conflict'
        throw error
      }
      return { responseStatus: result.rows[0].response_status, responseBody: result.rows[0].response_body }
    },

    async fail({ actorId, method, resourceId, key, ownerToken, failureCode }) {
      if (typeof failureCode !== 'string' || failureCode.trim().length === 0) {
        throw new TypeError('A failure code is required')
      }
      const result = await client.query(
        `UPDATE idempotency_records
         SET state = 'failed', failed_at = now(), failure_code = $6
         WHERE actor_id = $1
           AND method = $2
           AND resource_id = $3
           AND key = $4
           AND owner_token = $5
           AND state = 'in_progress'
         RETURNING state, failure_code`,
        [...scopeValues({ actorId, method, resourceId, key }), ownerToken, failureCode],
      )
      if (result.rowCount === 0) {
        const error = new Error('Idempotency record is not owned by this operation')
        error.code = 'idempotency_owner_conflict'
        throw error
      }
      return { state: result.rows[0].state, failureCode: result.rows[0].failure_code }
    },

    async find({ actorId, method, resourceId, key }) {
      const result = await client.query(
        `SELECT fingerprint, state, response_status, response_body, owner_token, lease_expires_at,
                created_at, completed_at, failed_at, failure_code
         FROM idempotency_records
         WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4`,
        scopeValues({ actorId, method, resourceId, key }),
      )
      if (result.rowCount === 0) return null
      return mapRecord(result.rows[0])
    },
  }
}
