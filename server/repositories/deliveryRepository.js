import { createAuditRepository } from './auditRepository.js'
import { createCampaignRepository } from './campaignRepository.js'

function safeNumber(value, field) {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError(`${field} is invalid`)
  return result
}

function mapVersion(row) {
  return row && {
    id: row.id, campaignId: row.campaign_id, versionNumber: row.version_number,
    snapshot: row.snapshot, contentHash: row.content_hash, createdBy: row.created_by, createdAt: row.created_at,
  }
}

function mapAsset(row) {
  return row && {
    id: row.id, campaignId: row.campaign_id, kind: row.kind, objectKey: row.object_key,
    mimeType: row.mime_type, byteSize: safeNumber(row.byte_size, 'Asset byte size'),
    width: row.width, height: row.height, sha256: row.sha256, source: row.source,
    generationJobId: row.generation_job_id, versionId: row.version_id,
  }
}

function mapEvent(row) {
  if (!row) return null
  const payload = ['sent', 'ready', 'approved', 'delivered'].includes(row.event_type)
    && Array.isArray(row.immutable_asset_hashes)
    ? { ...row.payload, assetHashes: row.immutable_asset_hashes }
    : row.payload
  return {
    id: row.id, campaignId: row.campaign_id, versionId: row.version_id,
    actorId: row.actor_id, actorRole: row.actor_role, eventType: row.event_type,
    payload, createdAt: row.created_at,
  }
}

function mapDelivery(row) {
  if (!row) return null
  return {
    id: row.delivery_id, campaignId: row.campaign_id, versionId: row.version_id,
    contentHash: row.content_hash,
    asset: { id: row.delivery_asset_id, kind: 'delivery_zip', sha256: row.zip_sha256 },
    byteSize: safeNumber(row.delivery_byte_size, 'Delivery byte size'),
    createdBy: row.created_by, createdAt: row.delivery_created_at,
    storedAsset: mapAsset(row),
  }
}

function mapBuild(row) {
  return row && {
    id: row.id, campaignId: row.campaign_id, versionId: row.version_id,
    actorId: row.actor_id, key: row.idempotency_key, fingerprint: row.request_fingerprint,
    ownerToken: row.owner_token, state: row.state, plan: row.plan,
  }
}

function campaignUpdateInput(campaign, status) {
  return {
    id: campaign.id, expectedRevision: campaign.revision, title: campaign.title, brief: campaign.brief,
    status, selectedCopyId: campaign.selectedCopyId, selectedDirectionId: campaign.selectedDirectionId,
    compositionId: campaign.compositionId, currentVersionNumber: campaign.currentVersionNumber,
    openVersionId: campaign.openVersionId,
  }
}

export function createDeliveryRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')
  const campaigns = createCampaignRepository(client)
  return {
    lockCampaign: (campaignId) => campaigns.findByIdForUpdate(campaignId),

    async findVersionById(versionId) {
      const result = await client.query(
        `SELECT version.* FROM campaign_versions version
         JOIN campaigns campaign ON campaign.id = version.campaign_id
         WHERE version.id = $1 AND campaign.archived_at IS NULL`,
        [versionId],
      )
      return mapVersion(result.rows[0])
    },

    async listEvents(versionId, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT * FROM review_events WHERE version_id = $1
         ORDER BY created_at, id${forUpdate ? ' FOR UPDATE' : ''}`,
        [versionId],
      )
      return result.rows.map(mapEvent)
    },

    async listVersionAssetHashes(versionId) {
      const result = await client.query(
        `SELECT 'source' AS asset_class, source.asset_sha256 AS sha256
         FROM campaign_version_source_assets source WHERE source.version_id = $1
         UNION ALL
         SELECT 'review' AS asset_class, asset.sha256
         FROM assets asset WHERE asset.version_id = $1 AND asset.kind IN ('review_png', 'manifest')
         ORDER BY asset_class, sha256`,
        [versionId],
      )
      return {
        source: result.rows.filter((row) => row.asset_class === 'source').map((row) => row.sha256),
        review: result.rows.filter((row) => row.asset_class === 'review').map((row) => row.sha256),
      }
    },

    async listReviewAssets(versionId, { forUpdate = false } = {}) {
      const result = await client.query(
        `SELECT asset.* FROM assets asset
         WHERE asset.version_id = $1 AND asset.kind IN ('review_png', 'manifest')
         ORDER BY asset.id${forUpdate ? ' FOR UPDATE' : ''}`,
        [versionId],
      )
      return result.rows.map(mapAsset)
    },

    async findDeliveryByVersion(versionId) {
      const result = await client.query(
        `SELECT delivery.id AS delivery_id, delivery.campaign_id, delivery.version_id,
                delivery.content_hash, delivery.zip_sha256, delivery.byte_size AS delivery_byte_size,
                delivery.created_by, delivery.created_at AS delivery_created_at,
                delivery.asset_id AS delivery_asset_id, asset.*
         FROM deliveries delivery
         JOIN assets asset ON asset.id = delivery.asset_id AND asset.campaign_id = delivery.campaign_id
         WHERE delivery.version_id = $1`,
        [versionId],
      )
      return mapDelivery(result.rows[0])
    },

    async findBuildForUpdate(versionId) {
      const result = await client.query('SELECT * FROM delivery_builds WHERE version_id = $1 FOR UPDATE', [versionId])
      return mapBuild(result.rows[0])
    },

    async createBuild(build) {
      const result = await client.query(
        `INSERT INTO delivery_builds
           (id, campaign_id, version_id, actor_id, idempotency_key, request_fingerprint, owner_token, plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [build.id, build.campaignId, build.versionId, build.actorId, build.key,
          build.fingerprint, build.ownerToken, build.plan],
      )
      return mapBuild(result.rows[0])
    },

    async takeOverBuild({ id, actorId, key, fingerprint, ownerToken }) {
      const result = await client.query(
        `UPDATE delivery_builds
         SET actor_id = $2, idempotency_key = $3, request_fingerprint = $4,
             owner_token = $5, state = 'in_progress', updated_at = now(), completed_at = NULL
         WHERE id = $1 AND state IN ('in_progress', 'failed')
         RETURNING *`,
        [id, actorId, key, fingerprint, ownerToken],
      )
      return mapBuild(result.rows[0])
    },

    async adoptBuildObject({ buildId, ownerToken, campaignId, objectKey, orphanId, adoptedAt }) {
      const ownership = await client.query(
        'SELECT owner_token, state, campaign_id FROM delivery_builds WHERE id = $1 FOR UPDATE', [buildId],
      )
      const build = ownership.rows[0]
      if (!build || build.owner_token !== ownerToken || build.state !== 'in_progress' || build.campaign_id !== campaignId) return false
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
      const claimed = await client.query(
        `INSERT INTO orphaned_uploads
           (id, object_key, campaign_id, reason, status, last_error, cleaned_at,
            claimed_build_id, claimed_delivery_build_id, created_at)
         VALUES ($1, $2, $3, 'delivery_in_progress', 'pending', NULL, NULL, NULL, $4, $5)
         ON CONFLICT (object_key) DO UPDATE
         SET campaign_id = EXCLUDED.campaign_id, reason = EXCLUDED.reason, status = 'pending',
             last_error = NULL, cleaned_at = NULL, claimed_build_id = NULL,
             claimed_delivery_build_id = EXCLUDED.claimed_delivery_build_id
         WHERE (orphaned_uploads.claimed_build_id IS NULL
                AND orphaned_uploads.claimed_delivery_build_id IS NULL)
            OR orphaned_uploads.claimed_delivery_build_id = EXCLUDED.claimed_delivery_build_id
         RETURNING claimed_delivery_build_id`,
        [orphanId, objectKey, campaignId, buildId, adoptedAt],
      )
      return claimed.rows[0]?.claimed_delivery_build_id === buildId
    },

    async finalizeBuild({ build, campaign, version, actor, zipAsset, deliveryId, reviewEventId, auditId, createdAt }) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [zipAsset.objectKey])
      await client.query(
        `INSERT INTO assets
           (id, campaign_id, kind, object_key, mime_type, byte_size, width, height,
            sha256, source, generation_job_id, version_id, created_at)
         VALUES ($1, $2, 'delivery_zip', $3, 'application/zip', $4, NULL, NULL,
                 $5, 'delivery', NULL, $6, $7)`,
        [zipAsset.id, campaign.id, zipAsset.objectKey, zipAsset.byteSize, zipAsset.sha256, version.id, createdAt],
      )
      await client.query(
        `INSERT INTO deliveries
           (id, campaign_id, version_id, asset_id, created_by, content_hash, zip_sha256, byte_size, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [deliveryId, campaign.id, version.id, zipAsset.id, actor.id,
          version.contentHash, zipAsset.sha256, zipAsset.byteSize, createdAt],
      )
      const eventResult = await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, 'delivered', $6, $7)
         RETURNING *`,
        [reviewEventId, campaign.id, version.id, actor.id, actor.role, {
          deliveryId, contentHash: version.contentHash, assetHashes: [zipAsset.sha256],
        }, createdAt],
      )
      await createAuditRepository(client).append({
        id: auditId, actorId: actor.id, actorRole: actor.role,
        action: 'campaign.delivered', entityType: 'campaign', entityId: campaign.id,
        beforeStatus: campaign.status, afterStatus: 'delivered', versionId: version.id,
        payload: {
          reviewEventId, deliveryId, contentHash: version.contentHash,
          zipAssetId: zipAsset.id, zipSha256: zipAsset.sha256, byteSize: zipAsset.byteSize,
        },
        createdAt,
      })
      const updated = await campaigns.updateState(campaignUpdateInput(campaign, 'delivered'))
      const completed = await client.query(
        `UPDATE delivery_builds SET state = 'completed', completed_at = $2, updated_at = $2
         WHERE id = $1 AND owner_token = $3 AND state = 'in_progress'`,
        [build.id, createdAt, build.ownerToken],
      )
      if (completed.rowCount !== 1) throw Object.assign(new Error('Delivery build ownership was lost'), { code: 'delivery_build_owner_lost' })
      await client.query(
        'DELETE FROM orphaned_uploads WHERE object_key = $1 AND claimed_delivery_build_id = $2',
        [zipAsset.objectKey, build.id],
      )
      return {
        campaign: updated,
        delivery: await this.findDeliveryByVersion(version.id),
        event: mapEvent(eventResult.rows[0]),
      }
    },

    async failBuild({ buildId, ownerToken, campaignId, objectKey, orphanId, reason, failedAt }) {
      if (!buildId) return { owned: false }
      const ownership = await client.query('SELECT owner_token, state FROM delivery_builds WHERE id = $1 FOR UPDATE', [buildId])
      if (!ownership.rows[0] || ownership.rows[0].owner_token !== ownerToken || ownership.rows[0].state !== 'in_progress') {
        return { owned: false }
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
      await client.query(
        `INSERT INTO orphaned_uploads
           (id, object_key, campaign_id, reason, status, last_error, cleaned_at,
            claimed_build_id, claimed_delivery_build_id, created_at)
         SELECT $1, $2, $3, $4, 'pending', NULL, NULL, NULL, NULL, $5
         WHERE NOT EXISTS (SELECT 1 FROM assets WHERE object_key = $2)
         ON CONFLICT (object_key) DO UPDATE
         SET campaign_id = EXCLUDED.campaign_id, reason = EXCLUDED.reason, status = 'pending',
             last_error = NULL, cleaned_at = NULL, claimed_build_id = NULL,
             claimed_delivery_build_id = NULL
         WHERE orphaned_uploads.claimed_delivery_build_id = $6
            OR (orphaned_uploads.claimed_delivery_build_id IS NULL AND orphaned_uploads.claimed_build_id IS NULL)`,
        [orphanId, objectKey, campaignId, reason, failedAt, buildId],
      )
      await client.query(
        `UPDATE delivery_builds SET state = 'failed', updated_at = $3
         WHERE id = $1 AND owner_token = $2 AND state = 'in_progress'`,
        [buildId, ownerToken, failedAt],
      )
      return { owned: true }
    },
  }
}
