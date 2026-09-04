function mapAuditEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    beforeStatus: row.before_status,
    afterStatus: row.after_status,
    versionId: row.version_id,
    payload: row.payload,
    createdAt: row.created_at,
  }
}

export function createAuditRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')

  return {
    async append({ id, actorId, actorRole, action, entityType, entityId, beforeStatus = null, afterStatus = null, versionId = null, payload = {}, createdAt = new Date() }) {
      const result = await client.query(
        `INSERT INTO audit_events
           (id, actor_id, actor_role, action, entity_type, entity_id, before_status, after_status, version_id, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [id, actorId, actorRole, action, entityType, entityId, beforeStatus, afterStatus, versionId, payload, createdAt],
      )
      return mapAuditEvent(result.rows[0])
    },

    async listForEntity({ entityType, entityId, limit = 100 }) {
      const result = await client.query(
        `SELECT * FROM audit_events
         WHERE entity_type = $1 AND entity_id = $2
         ORDER BY created_at DESC, id DESC
         LIMIT $3`,
        [entityType, entityId, limit],
      )
      return result.rows.map(mapAuditEvent)
    },
  }
}
