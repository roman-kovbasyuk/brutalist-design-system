function mapCampaign(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    brief: row.brief,
    status: row.status,
    revision: row.revision,
    selectedCopyId: row.selected_copy_id,
    selectedDirectionId: row.selected_direction_id,
    compositionId: row.composition_id,
    currentVersionNumber: row.current_version_number,
    openVersionId: row.open_version_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapVersion(row) {
  if (!row) return null
  return {
    id: row.id,
    campaignId: row.campaign_id,
    versionNumber: row.version_number,
    snapshot: row.snapshot,
    contentHash: row.content_hash,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export class RevisionConflictError extends Error {
  constructor(campaignId, expectedRevision) {
    super(`Campaign ${campaignId} is not at revision ${expectedRevision}`)
    this.name = 'RevisionConflictError'
    this.code = 'revision_conflict'
  }
}

export function createCampaignRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')

  return {
    async create({ id, title, brief, createdBy }) {
      const result = await client.query(
        `INSERT INTO campaigns (id, title, brief, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, title, brief, createdBy],
      )
      return mapCampaign(result.rows[0])
    },

    async findById(id) {
      const result = await client.query('SELECT * FROM campaigns WHERE id = $1', [id])
      return mapCampaign(result.rows[0])
    },

    async findByIdForUpdate(id) {
      const result = await client.query('SELECT * FROM campaigns WHERE id = $1 FOR UPDATE', [id])
      return mapCampaign(result.rows[0])
    },

    async list({ limit = 50, offset = 0 } = {}) {
      const result = await client.query(
        'SELECT * FROM campaigns ORDER BY created_at DESC, id LIMIT $1 OFFSET $2',
        [limit, offset],
      )
      return result.rows.map(mapCampaign)
    },

    async updateState({
      id,
      expectedRevision,
      title,
      brief,
      status,
      selectedCopyId,
      selectedDirectionId,
      compositionId,
      currentVersionNumber,
      openVersionId,
    }) {
      const result = await client.query(
        `UPDATE campaigns
         SET title = $3,
             brief = $4,
             status = $5,
             selected_copy_id = $6,
             selected_direction_id = $7,
             composition_id = $8,
             current_version_number = $9,
             open_version_id = $10,
             revision = revision + 1,
             updated_at = now()
         WHERE id = $1 AND revision = $2
         RETURNING *`,
        [id, expectedRevision, title, brief, status, selectedCopyId, selectedDirectionId, compositionId, currentVersionNumber, openVersionId],
      )
      if (result.rowCount > 0) return mapCampaign(result.rows[0])

      const existing = await client.query('SELECT revision FROM campaigns WHERE id = $1', [id])
      if (existing.rowCount === 0) {
        const error = new Error(`Campaign ${id} was not found`)
        error.code = 'not_found'
        throw error
      }
      throw new RevisionConflictError(id, expectedRevision)
    },

    async createVersion({ id, campaignId, versionNumber, snapshot, contentHash, createdBy }) {
      const result = await client.query(
        `INSERT INTO campaign_versions
           (id, campaign_id, version_number, snapshot, content_hash, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, campaignId, versionNumber, snapshot, contentHash, createdBy],
      )
      return mapVersion(result.rows[0])
    },

    async findVersion(campaignId, versionNumber) {
      const result = await client.query(
        'SELECT * FROM campaign_versions WHERE campaign_id = $1 AND version_number = $2',
        [campaignId, versionNumber],
      )
      return mapVersion(result.rows[0])
    },

    async listVersions(campaignId) {
      const result = await client.query(
        'SELECT * FROM campaign_versions WHERE campaign_id = $1 ORDER BY version_number DESC',
        [campaignId],
      )
      return result.rows.map(mapVersion)
    },

    async setOpenVersion({ campaignId, versionId }) {
      const result = await client.query(
        `UPDATE campaigns
         SET open_version_id = $2, updated_at = now()
         WHERE id = $1 AND open_version_id IS NULL
         RETURNING *`,
        [campaignId, versionId],
      )
      if (result.rowCount === 0) {
        const error = new Error(`Campaign ${campaignId} already has an open version or does not exist`)
        error.code = 'open_version_conflict'
        throw error
      }
      return mapCampaign(result.rows[0])
    },

    async clearOpenVersion({ campaignId, versionId }) {
      const result = await client.query(
        `UPDATE campaigns
         SET open_version_id = NULL, updated_at = now()
         WHERE id = $1 AND open_version_id = $2
         RETURNING *`,
        [campaignId, versionId],
      )
      return mapCampaign(result.rows[0])
    },
  }
}
