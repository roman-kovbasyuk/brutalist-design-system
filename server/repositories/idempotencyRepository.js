function scopeValues({ actorId, method, resourceId, key }) {
  return [actorId, method.toUpperCase(), resourceId, key]
}

export function createIdempotencyRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')

  return {
    async claim({ actorId, method, resourceId, key, fingerprint, ownerToken }) {
      const scope = scopeValues({ actorId, method, resourceId, key })
      const inserted = await client.query(
        `INSERT INTO idempotency_records
           (actor_id, method, resource_id, key, fingerprint, owner_token)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (actor_id, method, resource_id, key) DO NOTHING
         RETURNING actor_id`,
        [...scope, fingerprint, ownerToken],
      )
      if (inserted.rowCount > 0) return { kind: 'owner' }

      const existing = await client.query(
        `SELECT fingerprint, state, response_status, response_body
         FROM idempotency_records
         WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4`,
        scope,
      )
      const record = existing.rows[0]
      if (!record || record.fingerprint !== fingerprint) return { kind: 'conflict' }
      if (record.state === 'completed') {
        return { kind: 'replay', responseStatus: record.response_status, responseBody: record.response_body }
      }
      return { kind: 'in_progress' }
    },

    async complete({ actorId, method, resourceId, key, ownerToken, responseStatus, responseBody }) {
      const result = await client.query(
        `UPDATE idempotency_records
         SET state = 'completed', response_status = $6, response_body = $7, completed_at = now()
         WHERE actor_id = $1
           AND method = $2
           AND resource_id = $3
           AND key = $4
           AND owner_token = $5
           AND state = 'in_progress'
         RETURNING response_status, response_body`,
        [...scopeValues({ actorId, method, resourceId, key }), ownerToken, responseStatus, responseBody],
      )
      if (result.rowCount === 0) {
        const error = new Error('Idempotency record is not owned by this operation')
        error.code = 'idempotency_owner_conflict'
        throw error
      }
      return { responseStatus: result.rows[0].response_status, responseBody: result.rows[0].response_body }
    },

    async find({ actorId, method, resourceId, key }) {
      const result = await client.query(
        `SELECT fingerprint, state, response_status, response_body, owner_token, created_at, completed_at
         FROM idempotency_records
         WHERE actor_id = $1 AND method = $2 AND resource_id = $3 AND key = $4`,
        scopeValues({ actorId, method, resourceId, key }),
      )
      if (result.rowCount === 0) return null
      const row = result.rows[0]
      return {
        fingerprint: row.fingerprint,
        state: row.state,
        responseStatus: row.response_status,
        responseBody: row.response_body,
        ownerToken: row.owner_token,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      }
    },
  }
}
