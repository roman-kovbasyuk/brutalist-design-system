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
    generationRequestFingerprint: row.generation_request_fingerprint,
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

async function hasCleanupIdentityColumns(client) {
  const result = await client.query(
    `SELECT count(*)::int AS count FROM pg_attribute
     WHERE attrelid = 'orphaned_uploads'::regclass AND attname IN ('object_generation', 'cleanup_token')
       AND attnum > 0 AND NOT attisdropped`,
  )
  return result.rows[0]?.count === 2
}

async function hasCleanupIntentColumns(client) {
  const result = await client.query(
    `SELECT count(*)::int AS count FROM pg_attribute
     WHERE attrelid = 'orphaned_uploads'::regclass
       AND attname IN ('expected_sha256', 'expected_byte_size', 'expected_mime_type')
       AND attnum > 0 AND NOT attisdropped`,
  )
  return result.rows[0]?.count === 3
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

    async findLatestBriefAnalysis(campaignId) {
      const result = await client.query(
        `SELECT id, step, status, safety, input_snapshot, result_metadata
         FROM generation_jobs
         WHERE campaign_id = $1 AND step = 'brief_analysis' AND status = 'succeeded'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [campaignId],
      )
      const row = result.rows[0]
      return row ? {
        id: row.id,
        generationStep: row.step,
        generationStatus: row.status,
        generationSafety: row.safety,
        generationInput: row.input_snapshot,
        generationResult: row.result_metadata,
      } : null
    },

    async findSelectedCopy(campaignId, copySetId) {
      if (!copySetId) return null
      const result = await client.query(
        `SELECT cs.*, gj.step AS generation_step, gj.status AS generation_status,
                gj.safety AS generation_safety, gj.input_snapshot AS generation_input,
                gj.result_metadata AS generation_result
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
        generationInput: row.generation_input,
        generationResult: row.generation_result,
      }
    },

    async findSelectedDirection(campaignId, directionId) {
      if (!directionId) return null
      const result = await client.query(
        `SELECT vd.*, gj.step AS generation_step, gj.status AS generation_status,
                gj.safety AS generation_safety, gj.input_snapshot AS generation_input,
                gj.result_metadata AS generation_result
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
        generationSafety: row.generation_safety, generationInput: row.generation_input,
        generationResult: row.generation_result,
      }
    },

    async findAsset(campaignId, assetId) {
      if (!assetId) return null
      const result = await client.query(
        `SELECT a.*, gj.status AS generation_status, gj.step AS generation_step,
                gj.safety AS generation_safety, gj.request_fingerprint AS generation_request_fingerprint,
                gj.input_snapshot AS generation_input,
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
                gj.safety AS generation_safety, gj.request_fingerprint AS generation_request_fingerprint,
                gj.input_snapshot AS generation_input,
                gj.result_metadata AS generation_result
         FROM assets a
         LEFT JOIN generation_jobs gj ON gj.id = a.generation_job_id AND gj.campaign_id = a.campaign_id
         WHERE a.campaign_id = $1 AND a.id = ANY($2::text[])
         ORDER BY a.id`,
        [campaignId, assetIds],
      )
      return result.rows.map(mapAsset)
    },

    async findAssetsForUpdate(campaignId, assetIds) {
      if (!Array.isArray(assetIds) || assetIds.length === 0) return []
      const result = await client.query(
        `SELECT a.*, gj.status AS generation_status, gj.step AS generation_step,
                gj.safety AS generation_safety, gj.request_fingerprint AS generation_request_fingerprint,
                gj.input_snapshot AS generation_input,
                gj.result_metadata AS generation_result
         FROM assets a
         LEFT JOIN generation_jobs gj ON gj.id = a.generation_job_id AND gj.campaign_id = a.campaign_id
         WHERE a.campaign_id = $1 AND a.id = ANY($2::text[])
         ORDER BY a.id
         FOR UPDATE OF a`,
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
      if (campaign.compositionId) {
        await client.query(
          'UPDATE compositions SET stale = true WHERE campaign_id = $1 AND id = $2 AND stale = false',
          [campaign.id, campaign.compositionId],
        )
      }
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
      // The caller already holds the campaign row. A second build-row lock here can
      // deadlock with the active build's orphan FK check while it finishes adoption.
      const result = await client.query(
        `SELECT * FROM review_version_builds
         WHERE campaign_id = $1 AND state = 'in_progress'`,
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
           AND NOT EXISTS (
             SELECT 1 FROM orphaned_uploads orphan
             WHERE orphan.status = 'cleaning'
               AND (orphan.object_key = review_version_builds.plan->'manifestAsset'->>'objectKey'
                 OR EXISTS (
                   SELECT 1 FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(review_version_builds.plan->'ratioAssets') = 'array'
                          THEN review_version_builds.plan->'ratioAssets' ELSE '[]'::jsonb END
                   ) ratio_asset WHERE ratio_asset->>'objectKey' = orphan.object_key
                 ))
           )
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
           AND NOT EXISTS (
             SELECT 1 FROM orphaned_uploads orphan
             WHERE orphan.status = 'cleaning'
               AND (orphan.object_key = review_version_builds.plan->'manifestAsset'->>'objectKey'
                 OR EXISTS (
                   SELECT 1 FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(review_version_builds.plan->'ratioAssets') = 'array'
                          THEN review_version_builds.plan->'ratioAssets' ELSE '[]'::jsonb END
                   ) ratio_asset WHERE ratio_asset->>'objectKey' = orphan.object_key
                 ))
           )
         RETURNING *`,
        [id, ownerToken],
      )
      return mapBuild(result.rows[0])
    },

    async adoptBuildObjects({ buildId, ownerToken, campaignId, objectKeys, orphanIds, adoptedAt }) {
      const ownership = await client.query(
        'SELECT owner_token, state, campaign_id FROM review_version_builds WHERE id = $1 FOR UPDATE',
        [buildId],
      )
      const build = ownership.rows[0]
      if (!build || build.owner_token !== ownerToken || build.state !== 'in_progress' || build.campaign_id !== campaignId) return false
      const cleanupIdentitySupported = await hasCleanupIdentityColumns(client)
      const cleanupIntentSupported = await hasCleanupIntentColumns(client)
      const identifiers = new Map(objectKeys.map((objectKey, index) => [objectKey, orphanIds[index]]))
      for (const objectKey of sortedObjectKeys(objectKeys)) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
        const claimed = await client.query(
          `INSERT INTO orphaned_uploads
             (id, object_key, campaign_id, reason, status, last_error, cleaned_at, claimed_build_id, created_at)
           VALUES ($1, $2, $3, 'review_version_in_progress', 'pending', NULL, NULL, $4, $5)
           ON CONFLICT (object_key) DO UPDATE
           SET campaign_id = EXCLUDED.campaign_id,
               reason = EXCLUDED.reason,
               status = 'pending',
               attempts = CASE WHEN orphaned_uploads.status = 'cleaned' THEN 0 ELSE orphaned_uploads.attempts END,
               last_error = NULL,
               cleaned_at = NULL,
               claimed_build_id = EXCLUDED.claimed_build_id
               ${cleanupIdentitySupported ? `,
               object_generation = CASE WHEN orphaned_uploads.status = 'cleaned' THEN NULL ELSE orphaned_uploads.object_generation END,
               object_etag = CASE WHEN orphaned_uploads.status = 'cleaned' THEN NULL ELSE orphaned_uploads.object_etag END,
               cleanup_token = NULL,
               cleanup_lease_expires_at = NULL` : ''}
               ${cleanupIntentSupported ? `,
               expected_sha256 = CASE WHEN orphaned_uploads.status = 'cleaned' THEN NULL ELSE orphaned_uploads.expected_sha256 END,
               expected_byte_size = CASE WHEN orphaned_uploads.status = 'cleaned' THEN NULL ELSE orphaned_uploads.expected_byte_size END,
               expected_mime_type = CASE WHEN orphaned_uploads.status = 'cleaned' THEN NULL ELSE orphaned_uploads.expected_mime_type END` : ''}
           WHERE (orphaned_uploads.claimed_build_id IS NULL
                  OR orphaned_uploads.claimed_build_id = EXCLUDED.claimed_build_id)
             AND orphaned_uploads.status <> 'cleaning'
           RETURNING claimed_build_id`,
          [identifiers.get(objectKey), objectKey, campaignId, buildId, adoptedAt],
        )
        if (claimed.rows[0]?.claimed_build_id !== buildId) return false
      }
      return true
    },

    async recordBuildObjectIntent({ buildId, ownerToken, objectKey, sha256, byteSize, mimeType }) {
      if (!await hasCleanupIntentColumns(client)) {
        const legacy = await client.query(
          `SELECT orphan.id FROM orphaned_uploads orphan
           JOIN review_version_builds build ON build.id = orphan.claimed_build_id
           WHERE orphan.object_key = $3 AND orphan.claimed_build_id = $1
             AND orphan.status = 'pending' AND build.owner_token = $2 AND build.state = 'in_progress'`,
          [buildId, ownerToken, objectKey],
        )
        return legacy.rowCount === 1
      }
      const ownership = await client.query(
        'SELECT id FROM review_version_builds WHERE id = $1 AND owner_token = $2 AND state = \'in_progress\' FOR UPDATE',
        [buildId, ownerToken],
      )
      if (ownership.rowCount !== 1) return false
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
      const result = await client.query(
        `UPDATE orphaned_uploads
         SET expected_sha256 = $3, expected_byte_size = $4, expected_mime_type = $5
         WHERE object_key = $2 AND claimed_build_id = $1 AND status = 'pending'
           AND (
             expected_sha256 IS NULL AND expected_byte_size IS NULL AND expected_mime_type IS NULL
             OR expected_sha256 = $3 AND expected_byte_size = $4 AND expected_mime_type = $5
           )
         RETURNING id`,
        [buildId, objectKey, sha256, byteSize, mimeType],
      )
      return result.rowCount === 1
    },

    async recordBuildObjectIdentity({ buildId, ownerToken, objectKey, generation, etag, sha256, byteSize, mimeType }) {
      if (await hasCleanupIdentityColumns(client)) {
        const ownership = await client.query(
          'SELECT id FROM review_version_builds WHERE id = $1 AND owner_token = $2 AND state = \'in_progress\' FOR UPDATE',
          [buildId, ownerToken],
        )
        if (ownership.rowCount !== 1) return false
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
        const hasIntent = await hasCleanupIntentColumns(client)
        const result = await client.query(
           `UPDATE orphaned_uploads orphan
           SET object_generation = $3, object_etag = $4
           WHERE orphan.object_key = $2 AND orphan.claimed_build_id = $1
             AND orphan.status = 'pending'
             AND (orphan.object_generation IS NULL OR orphan.object_generation = $3)
             ${hasIntent ? `AND orphan.expected_sha256 = $5
               AND orphan.expected_byte_size = $6 AND orphan.expected_mime_type = $7` : ''}
           RETURNING orphan.id`,
          hasIntent
            ? [buildId, objectKey, generation, etag ?? null, sha256, byteSize, mimeType]
            : [buildId, objectKey, generation, etag ?? null],
        )
        return result.rowCount === 1
      }
      const legacy = await client.query(
        `SELECT orphan.id FROM orphaned_uploads orphan
         JOIN review_version_builds build ON build.id = orphan.claimed_build_id
         WHERE orphan.object_key = $3 AND orphan.claimed_build_id = $1
           AND orphan.status = 'pending' AND build.owner_token = $2 AND build.state = 'in_progress'`,
        [buildId, ownerToken, objectKey],
      )
      return legacy.rowCount === 1
    },

    async finalizeBuild({ build, campaign, actor, snapshot, contentHash, sourceAssets, assets, reviewEventId, auditId, createdAt }) {
      const objectKeys = sortedObjectKeys(assets.map((asset) => asset.objectKey))
      for (const objectKey of objectKeys) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
      }
      let claims
      if (await hasCleanupIntentColumns(client)) {
        claims = await client.query(
          `SELECT object_key, expected_sha256, expected_byte_size, expected_mime_type
           FROM orphaned_uploads
           WHERE claimed_build_id = $1 AND status = 'pending'
             AND object_generation IS NOT NULL
             AND expected_sha256 IS NOT NULL AND expected_byte_size IS NOT NULL
             AND expected_mime_type IS NOT NULL AND object_key = ANY($2::text[])
           FOR UPDATE`,
          [build.id, objectKeys],
        )
      } else if (await hasCleanupIdentityColumns(client)) {
        claims = await client.query(
          `SELECT object_key FROM orphaned_uploads
           WHERE claimed_build_id = $1 AND status = 'pending'
             AND object_generation IS NOT NULL AND object_key = ANY($2::text[])
           FOR UPDATE`,
          [build.id, objectKeys],
        )
      } else {
        claims = await client.query(
          `SELECT object_key FROM orphaned_uploads
           WHERE claimed_build_id = $1 AND status = 'pending' AND object_key = ANY($2::text[])
           FOR UPDATE`,
          [build.id, objectKeys],
        )
      }
      if (claims.rowCount !== objectKeys.length) {
        throw Object.assign(new Error('Version build object ownership was lost'), { code: 'version_build_owner_lost' })
      }
      const expectedAssets = new Map(assets.map((asset) => [asset.objectKey, asset]))
      if (claims.rows.some((claim) => claim.expected_sha256 != null && (
        claim.expected_sha256 !== expectedAssets.get(claim.object_key)?.sha256
        || safeNumber(claim.expected_byte_size, 'Expected object byte size') !== expectedAssets.get(claim.object_key)?.byteSize
        || claim.expected_mime_type !== expectedAssets.get(claim.object_key)?.mimeType
      ))) {
        throw Object.assign(new Error('Version build object identity changed'), { code: 'version_build_owner_lost' })
      }
      const versionResult = await client.query(
        `INSERT INTO campaign_versions
           (id, campaign_id, version_number, snapshot, content_hash, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [build.versionId, campaign.id, build.versionNumber, snapshot, contentHash, actor.id, createdAt],
      )
      for (const sourceAsset of sourceAssets) {
        const associated = await client.query(
          `INSERT INTO campaign_version_source_assets
             (campaign_id, version_id, asset_id, asset_sha256, created_at)
           SELECT $1, $2, a.id, $4, $5
           FROM assets a
           WHERE a.campaign_id = $1 AND a.id = $3 AND a.sha256 = $4
           RETURNING asset_id`,
          [campaign.id, build.versionId, sourceAsset.id, sourceAsset.sha256, createdAt],
        )
        if (associated.rowCount !== 1) {
          const error = new Error('Version source asset changed before provenance commit')
          error.code = 'version_source_changed'
          throw error
        }
      }
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
      const updated = await campaigns.updateState(campaignUpdateInput(campaign, {
        status: 'in_review', currentVersionNumber: build.versionNumber, openVersionId: build.versionId,
      }))
      const reviewAssetHashes = [...new Set(assets.map((asset) => asset.sha256))].sort()
      await client.query(
        `INSERT INTO review_events
           (id, campaign_id, version_id, actor_id, actor_role, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, 'sent', $6, $7)`,
        [reviewEventId, campaign.id, build.versionId, actor.id, actor.role,
          { contentHash, assetHashes: reviewAssetHashes }, createdAt],
      )
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
        payload: { reviewEventId, versionNumber: build.versionNumber, contentHash, assetHashes: reviewAssetHashes },
        createdAt,
      })
      await client.query(
        `UPDATE review_version_builds
         SET state = 'completed', completed_at = $2, updated_at = $2
         WHERE id = $1 AND owner_token = $3 AND state = 'in_progress'`,
        [build.id, createdAt, build.ownerToken],
      )
      for (const objectKey of objectKeys) {
        await client.query(
          'DELETE FROM orphaned_uploads WHERE object_key = $1 AND claimed_build_id = $2',
          [objectKey, build.id],
        )
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
          `INSERT INTO orphaned_uploads
             (id, object_key, campaign_id, reason, status, last_error, cleaned_at, claimed_build_id, created_at)
           SELECT $1, $2, $3, $4, 'pending', NULL, NULL, NULL, $5
           WHERE NOT EXISTS (SELECT 1 FROM assets WHERE object_key = $2)
           ON CONFLICT (object_key) DO UPDATE
           SET campaign_id = EXCLUDED.campaign_id,
               reason = EXCLUDED.reason,
               status = 'pending',
               last_error = NULL,
               cleaned_at = NULL,
               claimed_build_id = NULL
           WHERE (orphaned_uploads.claimed_build_id IS NULL
                  OR orphaned_uploads.claimed_build_id = $6)
             AND orphaned_uploads.status <> 'cleaning'`,
          [orphanId, objectKey, campaignId, reason, failedAt, buildId],
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
