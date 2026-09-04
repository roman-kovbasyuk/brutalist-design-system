import { createAuditRepository } from './auditRepository.js'
import { createCampaignRepository } from './campaignRepository.js'

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

function mapEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    campaignId: row.campaign_id,
    versionId: row.version_id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    eventType: row.event_type,
    payload: row.payload,
    createdAt: row.created_at,
  }
}

function campaignUpdateInput(campaign, { status, openVersionId }) {
  return {
    id: campaign.id,
    expectedRevision: campaign.revision,
    title: campaign.title,
    brief: campaign.brief,
    status,
    selectedCopyId: campaign.selectedCopyId,
    selectedDirectionId: campaign.selectedDirectionId,
    compositionId: campaign.compositionId,
    currentVersionNumber: campaign.currentVersionNumber,
    openVersionId,
  }
}

export function createReviewRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')
  const campaigns = createCampaignRepository(client)

  return {
    lockCampaign: (campaignId) => campaigns.findByIdForUpdate(campaignId),

    async findVersionById(versionId) {
      const result = await client.query(
        `SELECT v.* FROM campaign_versions v
         JOIN campaigns c ON c.id = v.campaign_id
         WHERE v.id = $1 AND c.archived_at IS NULL`,
        [versionId],
      )
      return mapVersion(result.rows[0])
    },

    async findCurrentVersion(campaignId, versionNumber) {
      const result = await client.query(
        `SELECT v.* FROM campaign_versions v
         JOIN campaigns c ON c.id = v.campaign_id
         WHERE v.campaign_id = $1 AND v.version_number = $2 AND c.archived_at IS NULL`,
        [campaignId, versionNumber],
      )
      return mapVersion(result.rows[0])
    },

    async listEvents(versionId, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT * FROM review_events
         WHERE version_id = $1
         ORDER BY created_at, id${forUpdate ? ' FOR UPDATE' : ''}`,
        [versionId],
      )
      return result.rows.map(mapEvent)
    },

    async appendEvent(event) {
      const result = await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [event.id, event.campaignId, event.versionId, event.actorId, event.actorRole,
          event.eventType, event.payload, event.createdAt],
      )
      return mapEvent(result.rows[0])
    },

    updateCampaignReviewState({ campaign, status, openVersionId }) {
      return campaigns.updateState(campaignUpdateInput(campaign, { status, openVersionId }))
    },

    appendAudit(event) {
      return createAuditRepository(client).append(event)
    },
  }
}
