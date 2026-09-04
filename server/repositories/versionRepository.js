import { createCampaignRepository } from './campaignRepository.js'
import { createAuditRepository } from './auditRepository.js'
import { createSettingsRepository } from './settingsRepository.js'

function safeNumber(value, field) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RangeError(`${field} is invalid`)
  return parsed
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

function mapComposition(row) {
  if (!row) return null
  return {
    id: row.id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    ratioIds: row.ratio_ids,
    slotValues: row.slot_values,
    validation: row.validation,
    stale: row.stale,
  }
}

function mapAsset(row) {
  if (!row) return null
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: row.kind,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    byteSize: safeNumber(row.byte_size, 'Asset byte size'),
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    source: row.source,
    generationJobId: row.generation_job_id,
    versionId: row.version_id,
    generationStatus: row.generation_status,
    generationStep: row.generation_step,
    generationSafety: row.generation_safety,
    generationInput: row.generation_input,
    generationResult: row.generation_result,
  }
}

function mapBuild(row) {
  if (!row) return null
  return {
    id: row.id,
    campaignId: row.campaign_id,
    actorId: row.actor_id,
    key: row.idempotency_key,
    fingerprint: row.request_fingerprint,
    ownerToken: row.owner_token,
    state: row.state,
    versionId: row.version_id,
    versionNumber: row.version_number,
    expectedRevision: row.expected_revision,
    plan: row.plan,
  }
}

function sortedObjectKeys(values) {
  return [...new Set(values)].sort()
}

function campaignUpdateInput(campaign, changes) {
  return {
    id: campaign.id,
    expectedRevision: campaign.revision,
    title: campaign.title,
    brief: campaign.brief,
    status: changes.status ?? campaign.status,
    selectedCopyId: campaign.selectedCopyId,
    selectedDirectionId: campaign.selectedDirectionId,
    compositionId: changes.compositionId ?? campaign.compositionId,
    currentVersionNumber: changes.currentVersionNumber ?? campaign.currentVersionNumber,
    openVersionId: changes.openVersionId ?? campaign.openVersionId,
  }
}

export function createVersionRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')
  const campaigns = createCampaignRepository(client)

  return {
    lockCampaign: (campaignId) => campaigns.findByIdForUpdate(campaignId),

    async findTemplate(templateId, templateVersion) {
      const result = await client.query(
        'SELECT * FROM templates WHERE id = $1 AND version = $2',
        [templateId, templateVersion],
      )
      const row = result.rows[0]
      return row ? {
        id: row.id, version: row.version, name: row.name, manifest: row.manifest,
        manifestHash: row.manifest_hash, createdBy: row.created_by, createdAt: row.created_at,
      } : null
    },

    async findSelectedCopy(campaignId, copySetId) {
      if (!copySetId) return null
      const result = await client.query(
        `SELECT cs.*, gj.step AS generation_step, gj.status AS generation_status,
                gj.safety AS generation_safety, gj.result_metadata AS generation_result
         FROM copy_sets cs
         LEFT JOIN generation_jobs gj ON gj.id = cs.generation_job_id AND gj.campaign_id = cs.campaign_id
         WHERE cs.campaign_id = $1 AND cs.id = $2`,
        [campaignId, copySetId],
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        id: row.id,
        selectedCandidateId: row.selected_candidate_id,
        selectedCopy: row.candidates?.find((candidate) => candidate.id === row.selected_candidate_id) ?? null,
        candidates: row.candidates,
        stale: row.stale,
        generationStep: row.generation_step,
        generationStatus: row.generation_status,
        generationSafety: row.generation_safety,
        generationResult: row.generation_result,
      }
    },

    async findSelectedDirection(campaignId, directionId) {
      if (!directionId) return null
      const result = await client.query(
        `SELECT vd.*, gj.step AS generation_step, gj.status AS generation_status,
                gj.safety AS generation_safety, gj.result_metadata AS generation_result
         FROM visual_directions vd
         LEFT JOIN generation_jobs gj ON gj.id = vd.generation_job_id AND gj.campaign_id = vd.campaign_id
         WHERE vd.campaign_id = $1 AND vd.id = $2`,
        [campaignId, directionId],
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        id: row.id, title: row.title, prompt: row.prompt, status: row.status,
        previewAssetId: row.preview_asset_id, stale: row.stale,
        generationStep: row.generation_step, generationStatus: row.generation_status,
        generationSafety: row.generation_safety, generationResult: row.generation_result,
      }
    },

    async findAsset(campaignId, assetId) {
      if (!assetId) return null
      const result = await client.query(
        `SELECT a.*, gj.status AS generation_status, gj.step AS generation_step,
                gj.safety AS generation_safety, gj.input_snapshot AS generation_input,
                gj.result_metadata AS generation_result
         FROM assets a
         LEFT JOIN generation_jobs gj ON gj.id = a.generation_job_id AND gj.campaign_id = a.campaign_id
         WHERE a.campaign_id = $1 AND a.id = $2`,
        [campaignId, assetId],
      )
      return mapAsset(result.rows[0])
    },

    async findAssets(campaignId, assetIds) {
      if (!Array.isArray(assetIds) || assetIds.length === 0) return []
      const result = await client.query(
        `SELECT a.*, gj.status AS generation_status, gj.step AS generation_step,
                gj.safety AS generation_safety, gj.input_snapshot AS generation_input,
                gj.result_metadata AS generation_result
         FROM assets a
         LEFT JOIN generation_jobs gj ON gj.id = a.generation_job_id AND gj.campaign_id = a.campaign_id
         WHERE a.campaign_id = $1 AND a.id = ANY($2::text[])
         ORDER BY a.id`,
        [campaignId, assetIds],
      )
      return result.rows.map(mapAsset)
    },

    async findComposition(campaignId, compositionId) {
      if (!compositionId) return null
      const result = await client.query(
        'SELECT * FROM compositions WHERE campaign_id = $1 AND id = $2',
        [campaignId, compositionId],
      )
      return mapComposition(result.rows[0])
    },

    async generationSafetyAvailable() {
      const settings = await createSettingsRepository(client).getForUpdate()
      if (!settings || settings.generationDisabled) return false
      const spent = await client.query(
        `SELECT COALESCE(sum(CASE WHEN status IN ('pending', 'unknown')
                  THEN reserved_cost_microunits ELSE COALESCE(actual_cost_microunits, reserved_cost_microunits) END), 0)::text AS used
         FROM generation_jobs WHERE budget_day = ((clock_timestamp() AT TIME ZONE 'UTC')::date)`,
      )
      return BigInt(spent.rows[0].used) <= BigInt(settings.dailyBudgetMicrounits)
    },

    async insertComposition({ composition, campaign, actor, createdAt }) {
      const inserted = await client.query(
        `INSERT INTO compositions
           (id, campaign_id, template_id, template_version, ratio_ids, slot_values, validation, stale, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
         RETURNING *`,
        [composition.id, campaign.id, composition.templateId, composition.templateVersion,
          JSON.stringify(composition.ratioIds), composition.slotValues, composition.validation, createdAt],
      )
      const updated = await campaigns.updateState(campaignUpdateInput(campaign, {
        status: 'composed', compositionId: composition.id,
      }))
      await createAuditRepository(client).append({
        id: actor.auditId,
        actorId: actor.id,
        actorRole: actor.role,
        action: 'campaign.composition_saved',
        entityType: 'campaign',
        entityId: campaign.id,
        beforeStatus: campaign.status,
        afterStatus: updated.status,
        payload: { compositionId: composition.id, templateId: composition.templateId, templateVersion: composition.templateVersion },
        createdAt,
      })
      return { composition: mapComposition(inserted.rows[0]), campaign: updated }
    },

    async findBuildForUpdate({ actorId, campaignId, key }) {
      const result = await client.query(
        `SELECT * FROM review_version_builds
         WHERE actor_id = $1 AND method = 'POST' AND campaign_id = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [actorId, campaignId, key],
      )
      return mapBuild(result.rows[0])
    },

    async findActiveBuildForUpdate(campaignId) {
      const result = await client.query(
        `SELECT * FROM review_version_builds
         WHERE campaign_id = $1 AND state = 'in_progress'
         FOR UPDATE`,
        [campaignId],
      )
      return mapBuild(result.rows[0])
    },

    async createBuild(build) {
      const result = await client.query(
        `INSERT INTO review_version_builds
           (id, campaign_id, actor_id, idempotency_key, request_fingerprint, owner_token,
            version_id, version_number, expected_revision, plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [build.id, build.campaignId, build.actorId, build.key, build.fingerprint, build.ownerToken,
          build.versionId, build.versionNumber, build.expectedRevision, build.plan],
      )
      return mapBuild(result.rows[0])
    },

    async reactivateBuild({ id, ownerToken }) {
      const result = await client.query(
        `UPDATE review_version_builds
         SET state = 'in_progress', owner_token = $2, updated_at = now(), completed_at = NULL
         WHERE id = $1 AND state = 'failed'
         RETURNING *`,
        [id, ownerToken],
      )
      return mapBuild(result.rows[0])
    },

    async takeOverBuild({ id, ownerToken }) {
      const result = await client.query(
        `UPDATE review_version_builds
         SET owner_token = $2, updated_at = now()
         WHERE id = $1 AND state = 'in_progress'
         RETURNING *`,
        [id, ownerToken],
      )
      return mapBuild(result.rows[0])
    },

    async adoptBuildObjects({ buildId, ownerToken, objectKeys }) {
      const ownership = await client.query(
        'SELECT owner_token, state FROM review_version_builds WHERE id = $1 FOR UPDATE',
        [buildId],
      )
      const build = ownership.rows[0]
      if (!build || build.owner_token !== ownerToken || build.state !== 'in_progress') return false
      for (const objectKey of sortedObjectKeys(objectKeys)) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
        await client.query('DELETE FROM orphaned_uploads WHERE object_key = $1', [objectKey])
      }
      return true
    },

    async finalizeBuild({ build, campaign, actor, snapshot, contentHash, assets, reviewEventId, auditId, createdAt }) {
      const objectKeys = sortedObjectKeys(assets.map((asset) => asset.objectKey))
      for (const objectKey of objectKeys) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
      }
      const versionResult = await client.query(
        `INSERT INTO campaign_versions
           (id, campaign_id, version_number, snapshot, content_hash, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [build.versionId, campaign.id, build.versionNumber, snapshot, contentHash, actor.id, createdAt],
      )
      for (const asset of assets) {
        await client.query(
          `INSERT INTO assets
             (id, campaign_id, kind, object_key, mime_type, byte_size, width, height,
              sha256, source, generation_job_id, version_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'render', NULL, $10, $11)`,
          [asset.id, campaign.id, asset.kind, asset.objectKey, asset.mimeType, asset.byteSize,
            asset.width, asset.height, asset.sha256, build.versionId, createdAt],
        )
      }
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, 'sent', $6, $7)`,
        [reviewEventId, campaign.id, build.versionId, actor.id, actor.role,
          { contentHash, assetHashes: assets.map((asset) => asset.sha256) }, createdAt],
      )
      const updated = await campaigns.updateState(campaignUpdateInput(campaign, {
        status: 'in_review', currentVersionNumber: build.versionNumber, openVersionId: build.versionId,
      }))
      await createAuditRepository(client).append({
        id: auditId,
        actorId: actor.id,
        actorRole: actor.role,
        action: 'campaign.sent_for_review',
        entityType: 'campaign',
        entityId: campaign.id,
        beforeStatus: campaign.status,
        afterStatus: updated.status,
        versionId: build.versionId,
        payload: { versionNumber: build.versionNumber, contentHash },
        createdAt,
      })
      await client.query(
        `UPDATE review_version_builds
         SET state = 'completed', completed_at = $2, updated_at = $2
         WHERE id = $1 AND owner_token = $3 AND state = 'in_progress'`,
        [build.id, createdAt, build.ownerToken],
      )
      for (const objectKey of objectKeys) {
        await client.query('DELETE FROM orphaned_uploads WHERE object_key = $1', [objectKey])
      }
      return { version: mapVersion(versionResult.rows[0]), campaign: updated }
    },

    async failBuild({ buildId, ownerToken, campaignId, objectKeys, reason, orphanIds, failedAt }) {
      if (buildId) {
        const ownership = await client.query(
          `SELECT owner_token, state FROM review_version_builds WHERE id = $1 FOR UPDATE`,
          [buildId],
        )
        const row = ownership.rows[0]
        if (!row || row.owner_token !== ownerToken || row.state !== 'in_progress') return { owned: false }
      }
      const recoveries = objectKeys.map((objectKey, index) => ({ objectKey, orphanId: orphanIds[index] }))
        .sort((left, right) => left.objectKey.localeCompare(right.objectKey))
      for (const { objectKey, orphanId } of recoveries) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
        await client.query(
          `INSERT INTO orphaned_uploads (id, object_key, campaign_id, reason, created_at)
           SELECT $1, $2, $3, $4, $5
           WHERE NOT EXISTS (SELECT 1 FROM assets WHERE object_key = $2)
           ON CONFLICT (object_key) DO NOTHING`,
          [orphanId, objectKey, campaignId, reason, failedAt],
        )
      }
      if (buildId) {
        await client.query(
          `UPDATE review_version_builds SET state = 'failed', updated_at = $3
           WHERE id = $1 AND owner_token = $2 AND state = 'in_progress'`,
          [buildId, ownerToken, failedAt],
        )
      }
      return { owned: true }
    },

    async findVersion(campaignId, versionNumber) {
      const result = await client.query(
        `SELECT v.* FROM campaign_versions v
         JOIN campaigns c ON c.id = v.campaign_id
         WHERE v.campaign_id = $1 AND v.version_number = $2 AND c.archived_at IS NULL`,
        [campaignId, versionNumber],
      )
      return mapVersion(result.rows[0])
    },

    async listVersions(campaignId) {
      const result = await client.query(
        `SELECT v.* FROM campaign_versions v
         JOIN campaigns c ON c.id = v.campaign_id
         WHERE v.campaign_id = $1 AND c.archived_at IS NULL
         ORDER BY v.version_number DESC`,
        [campaignId],
      )
      return result.rows.map(mapVersion)
    },
  }
}
