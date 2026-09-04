function mapTemplate(row) {
  if (!row) return null
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    manifest: row.manifest,
    manifestHash: row.manifest_hash,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export function createTemplateRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')

  return {
    async createVersion({ id, version, name, manifest, manifestHash, createdBy }) {
      const result = await client.query(
        `INSERT INTO templates (id, version, name, manifest, manifest_hash, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, version, name, manifest, manifestHash, createdBy],
      )
      return mapTemplate(result.rows[0])
    },

    async findVersion(id, version) {
      const result = await client.query(
        'SELECT * FROM templates WHERE id = $1 AND version = $2',
        [id, version],
      )
      return mapTemplate(result.rows[0])
    },

    async listVersions(id) {
      const result = await client.query(
        'SELECT * FROM templates WHERE id = $1 ORDER BY publication_sequence DESC',
        [id],
      )
      return result.rows.map(mapTemplate)
    },

    async listLatest() {
      const result = await client.query(
        `SELECT DISTINCT ON (id) *
         FROM templates
         ORDER BY id, publication_sequence DESC`,
      )
      return result.rows.map(mapTemplate)
    },
  }
}
