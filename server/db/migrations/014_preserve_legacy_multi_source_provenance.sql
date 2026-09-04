LOCK TABLE generation_jobs, assets, visual_directions, compositions, campaigns, audit_events
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE migration_013_fenced_image_jobs ON COMMIT DROP AS
SELECT j.id AS job_id,
       j.campaign_id,
       j.actor_id,
       j.input_snapshot->'direction'->>'id' AS direction_id,
       j.status AS fenced_job_status,
       CASE
         WHEN j.status = 'unknown' THEN 'legacy_image_dimensions_unavailable'
         ELSE 'legacy_image_provenance_unresolved'
       END AS reason,
       j.response_status,
       j.updated_at AS fenced_at,
       c.status AS campaign_status,
       c.revision AS campaign_revision
FROM generation_jobs j
JOIN campaigns c ON c.id = j.campaign_id
WHERE j.step = 'image'
  AND (
    (j.status = 'unknown'
      AND j.unknown_reason = 'legacy_image_dimensions_unavailable'
      AND j.response_status = 202
      AND j.response_body->'job'->>'status' = 'unknown')
    OR
    (j.status = 'failed'
      AND j.error_code = 'legacy_image_provenance_unresolved'
      AND j.response_status = 201
      AND j.response_body->'job'->>'status' = 'failed')
  );

INSERT INTO audit_events
  (id, actor_id, actor_role, action, entity_type, entity_id,
   before_status, after_status, payload, created_at)
SELECT 'migration-013-image-fence:' || fenced.job_id,
       COALESCE(fenced.actor_id, campaign.created_by),
       actor.role,
       'migration.legacy_image_provenance_fenced',
       'campaign',
       fenced.campaign_id,
       CASE
         WHEN fenced.campaign_status IN ('draft', 'copy_ready')
          AND EXISTS (
            SELECT 1
            FROM compositions composition
            JOIN audit_events saved
              ON saved.action = 'campaign.composition_saved'
             AND saved.entity_type = 'campaign'
             AND saved.entity_id = fenced.campaign_id
             AND saved.payload->>'compositionId' = composition.id
            WHERE composition.campaign_id = fenced.campaign_id
              AND composition.stale = true
              AND EXISTS (
                SELECT 1 FROM visual_directions direction
                WHERE direction.campaign_id = fenced.campaign_id
                  AND direction.id = fenced.direction_id
                  AND direction.stale = true
              )
          )
         THEN 'composed'
         WHEN fenced.campaign_status = 'copy_ready'
          AND EXISTS (
            SELECT 1 FROM visual_directions direction
            WHERE direction.campaign_id = fenced.campaign_id
              AND direction.id = fenced.direction_id
              AND direction.stale = true
          )
         THEN 'direction_selected'
         ELSE NULL
       END,
       fenced.campaign_status,
       jsonb_build_object(
         'jobId', fenced.job_id,
         'campaignId', fenced.campaign_id,
         'directionId', fenced.direction_id,
         'reason', fenced.reason,
         'jobStatus', fenced.fenced_job_status,
         'responseStatus', fenced.response_status,
         'campaignStatus', fenced.campaign_status,
         'campaignRevision', fenced.campaign_revision,
         'staleDirectionIds', COALESCE((
           SELECT jsonb_agg(direction.id ORDER BY direction.id)
           FROM visual_directions direction
           WHERE direction.campaign_id = fenced.campaign_id
             AND direction.stale = true
             AND direction.id = fenced.direction_id
         ), '[]'::jsonb),
         'staleCompositionIds', COALESCE((
           SELECT jsonb_agg(composition.id ORDER BY composition.id)
           FROM compositions composition
           WHERE composition.campaign_id = fenced.campaign_id
             AND composition.stale = true
         ), '[]'::jsonb)
       ),
       fenced.fenced_at
FROM migration_013_fenced_image_jobs fenced
JOIN campaigns campaign ON campaign.id = fenced.campaign_id
JOIN users actor ON actor.id = COALESCE(fenced.actor_id, campaign.created_by)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE provable_legacy_final_images ON COMMIT DROP AS
SELECT j.id AS job_id,
       j.campaign_id,
       a.id AS asset_id,
       a.width,
       a.height,
       d.id AS direction_id,
       fenced.campaign_status AS fenced_campaign_status,
       fenced.campaign_revision AS fenced_campaign_revision
FROM migration_013_fenced_image_jobs fenced
JOIN generation_jobs j ON j.id = fenced.job_id
JOIN assets a
  ON a.campaign_id = j.campaign_id
 AND a.generation_job_id = j.id
 AND a.source = 'generation'
 AND a.kind = 'final_image'
JOIN visual_directions d
  ON d.campaign_id = j.campaign_id
 AND d.id = j.input_snapshot->'direction'->>'id'
WHERE fenced.reason = 'legacy_image_provenance_unresolved'
  AND j.safety->>'verdict' = 'safe'
  AND j.dispatch_state = 'dispatched'
  AND j.dispatched_at IS NOT NULL
  AND j.completed_at IS NOT NULL
  AND j.actual_cost_microunits IS NOT NULL
  AND jsonb_typeof(j.input_snapshot) = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(j.input_snapshot)) = 1
  AND j.input_snapshot ? 'direction'
  AND jsonb_typeof(j.input_snapshot->'direction') = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(j.input_snapshot->'direction')) = 5
  AND (j.input_snapshot->'direction') ?& ARRAY['id', 'title', 'prompt', 'status', 'previewAssetId']
  AND j.input_snapshot->'direction'->>'id' = d.id
  AND j.input_snapshot->'direction'->>'title' = d.title
  AND j.input_snapshot->'direction'->>'prompt' = d.prompt
  AND j.input_snapshot->'direction'->>'status' = 'pending'
  AND j.input_snapshot->'direction'->'previewAssetId' = 'null'::jsonb
  AND d.status = 'ready'
  AND a.integrity_version = 1
  AND a.mime_type IN ('image/png', 'image/jpeg', 'image/webp')
  AND a.width BETWEEN 64 AND 4096
  AND a.height BETWEEN 64 AND 4096
  AND j.request_fingerprint = encode(sha256(convert_to(format(
    '{"input":{"directionId":%s,"height":%s,"width":%s},"step":"image"}',
    to_json(d.id)::text, a.height, a.width
  ), 'UTF8')), 'hex')
  AND jsonb_typeof(j.result_metadata) = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(j.result_metadata)) = 1
  AND jsonb_typeof(j.result_metadata->'image') = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(j.result_metadata->'image')) = 5
  AND (j.result_metadata->'image') ?& ARRAY['asset', 'mimeType', 'width', 'height', 'byteSize']
  AND jsonb_typeof(j.result_metadata->'image'->'asset') = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(j.result_metadata->'image'->'asset')) = 3
  AND (j.result_metadata->'image'->'asset') ?& ARRAY['id', 'kind', 'sha256']
  AND j.result_metadata->'image'->'asset'->>'id' = a.id
  AND j.result_metadata->'image'->'asset'->>'kind' = 'final_image'
  AND j.result_metadata->'image'->'asset'->>'sha256' = a.sha256
  AND j.result_metadata->'image'->>'mimeType' = a.mime_type
  AND jsonb_typeof(j.result_metadata->'image'->'width') = 'number'
  AND jsonb_typeof(j.result_metadata->'image'->'height') = 'number'
  AND jsonb_typeof(j.result_metadata->'image'->'byteSize') = 'number'
  AND (j.result_metadata->'image'->>'width')::numeric = a.width
  AND (j.result_metadata->'image'->>'height')::numeric = a.height
  AND (j.result_metadata->'image'->>'byteSize')::numeric = a.byte_size
  AND NOT EXISTS (
    SELECT 1 FROM assets other
    WHERE other.generation_job_id = j.id AND other.id <> a.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM visual_directions preview
    WHERE preview.campaign_id = j.campaign_id AND preview.preview_asset_id = a.id
  )
  AND (
    EXISTS (
      SELECT 1
      FROM compositions composition
      CROSS JOIN LATERAL jsonb_each_text(composition.slot_values) slot_value
      WHERE composition.campaign_id = j.campaign_id
        AND slot_value.value = a.id
    )
    OR EXISTS (
      SELECT 1 FROM campaign_version_source_assets source
      WHERE source.campaign_id = j.campaign_id
        AND source.asset_id = a.id
        AND source.asset_sha256 = a.sha256
    )
  );

UPDATE generation_jobs job
SET input_snapshot = job.input_snapshot || jsonb_build_object('width', proven.width, 'height', proven.height),
    status = 'succeeded',
    unknown_reason = NULL,
    error_code = NULL,
    response_status = 201,
    updated_at = COALESCE(job.completed_at, job.updated_at)
FROM provable_legacy_final_images proven
WHERE job.id = proven.job_id;

UPDATE generation_jobs job
SET response_body = jsonb_build_object(
  'job', jsonb_build_object(
    'id', job.id,
    'campaignId', job.campaign_id,
    'step', job.step,
    'provider', job.provider,
    'model', job.model,
    'region', job.region,
    'status', job.status,
    'attempts', job.attempts,
    'safety', job.safety,
    'usage', job.usage,
    'reservedCostMicrounits', job.reserved_cost_microunits,
    'actualCostMicrounits', job.actual_cost_microunits,
    'timeoutAt', job.timeout_at,
    'result', job.result_metadata,
    'errorCode', job.error_code,
    'createdAt', job.created_at,
    'updatedAt', job.updated_at
  )
)
FROM provable_legacy_final_images proven
WHERE job.id = proven.job_id;

CREATE TEMP TABLE legacy_campaign_restore_options ON COMMIT DROP AS
SELECT DISTINCT campaign.id AS campaign_id,
       direction.id AS direction_id,
       composition.id AS composition_id
FROM campaigns campaign
JOIN copy_sets copy_set
  ON copy_set.campaign_id = campaign.id
 AND copy_set.id = campaign.selected_copy_id
 AND copy_set.stale = false
JOIN generation_jobs copy_job
  ON copy_job.id = copy_set.generation_job_id
 AND copy_job.campaign_id = copy_set.campaign_id
 AND copy_job.step = 'copy'
 AND copy_job.status = 'succeeded'
 AND copy_job.safety->>'verdict' = 'safe'
JOIN provable_legacy_final_images proven ON proven.campaign_id = campaign.id
JOIN visual_directions direction
  ON direction.campaign_id = campaign.id
 AND direction.id = proven.direction_id
 AND direction.status = 'ready'
 AND direction.stale = true
JOIN generation_jobs direction_job
  ON direction_job.id = direction.generation_job_id
 AND direction_job.campaign_id = direction.campaign_id
 AND direction_job.step = 'directions'
 AND direction_job.status = 'succeeded'
 AND direction_job.safety->>'verdict' = 'safe'
JOIN assets preview_asset
  ON preview_asset.campaign_id = campaign.id
 AND preview_asset.id = direction.preview_asset_id
 AND preview_asset.kind = 'direction'
 AND preview_asset.source = 'generation'
 AND preview_asset.integrity_version = 1
JOIN generation_jobs preview_job
  ON preview_job.id = preview_asset.generation_job_id
 AND preview_job.campaign_id = campaign.id
 AND preview_job.step = 'image'
 AND preview_job.status = 'succeeded'
 AND preview_job.safety->>'verdict' = 'safe'
JOIN compositions composition
  ON composition.campaign_id = campaign.id
 AND composition.stale = true
 AND composition.validation->>'valid' = 'true'
JOIN templates template
  ON template.id = composition.template_id
 AND template.version = composition.template_version
WHERE campaign.status = 'copy_ready'
  AND campaign.selected_copy_id IS NOT NULL
  AND campaign.selected_direction_id IS NULL
  AND campaign.composition_id IS NULL
  AND campaign.open_version_id IS NULL
  AND campaign.current_version_number = 0
  AND direction_job.input_snapshot = jsonb_build_object(
    'brief', campaign.brief,
    'copy', (
      SELECT candidate
      FROM jsonb_array_elements(copy_set.candidates) candidate
      WHERE candidate->>'id' = copy_set.selected_candidate_id
      LIMIT 1
    )
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(direction_job.result_metadata->'directions') = 'array'
        THEN direction_job.result_metadata->'directions' ELSE '[]'::jsonb END
    ) generated_direction
    WHERE generated_direction = jsonb_build_object(
      'id', direction.id,
      'title', direction.title,
      'prompt', direction.prompt,
      'status', 'pending',
      'previewAssetId', NULL
    )
  )
  AND EXISTS (
    SELECT 1 FROM jsonb_each_text(composition.slot_values) slot_value
    WHERE slot_value.value = proven.asset_id
  )
  AND EXISTS (
    SELECT 1 FROM audit_events saved
    WHERE saved.action = 'campaign.composition_saved'
      AND saved.entity_type = 'campaign'
      AND saved.entity_id = campaign.id
      AND saved.payload->>'compositionId' = composition.id
  )
  AND jsonb_typeof(preview_job.input_snapshot) = 'object'
  AND preview_job.input_snapshot ?& ARRAY['direction', 'width', 'height']
  AND preview_job.input_snapshot = jsonb_build_object(
    'direction', preview_job.input_snapshot->'direction',
    'width', preview_job.input_snapshot->'width',
    'height', preview_job.input_snapshot->'height'
  )
  AND preview_job.input_snapshot->'direction' = jsonb_build_object(
    'id', direction.id,
    'title', direction.title,
    'prompt', direction.prompt,
    'status', 'pending',
    'previewAssetId', NULL
  )
  AND (preview_job.input_snapshot->>'width')::numeric = preview_asset.width
  AND (preview_job.input_snapshot->>'height')::numeric = preview_asset.height
  AND preview_job.request_fingerprint = encode(sha256(convert_to(format(
    '{"input":{"directionId":%s,"height":%s,"width":%s},"step":"image"}',
    to_json(direction.id)::text, preview_asset.height, preview_asset.width
  ), 'UTF8')), 'hex')
  AND preview_job.result_metadata = jsonb_build_object(
    'image', jsonb_build_object(
      'asset', jsonb_build_object('id', preview_asset.id, 'kind', 'direction', 'sha256', preview_asset.sha256),
      'mimeType', preview_asset.mime_type,
      'width', preview_asset.width,
      'height', preview_asset.height,
      'byteSize', preview_asset.byte_size
    )
  );

CREATE TEMP TABLE legacy_campaign_restores ON COMMIT DROP AS
SELECT campaign_id,
       min(direction_id) AS direction_id,
       min(composition_id) AS source_composition_id,
       'migration-014-composition:' || encode(sha256(convert_to(min(composition_id), 'UTF8')), 'hex') AS composition_id
FROM legacy_campaign_restore_options
GROUP BY campaign_id
HAVING count(*) = 1;

INSERT INTO compositions
  (id, campaign_id, template_id, template_version, ratio_ids, slot_values,
   validation, stale, created_at)
SELECT restore.composition_id,
       source.campaign_id,
       source.template_id,
       source.template_version,
       source.ratio_ids,
       source.slot_values,
       source.validation,
       false,
       clock_timestamp()
FROM legacy_campaign_restores restore
JOIN compositions source
  ON source.campaign_id = restore.campaign_id
 AND source.id = restore.source_composition_id
ON CONFLICT (id) DO NOTHING;

UPDATE visual_directions direction
SET stale = false
FROM legacy_campaign_restores restore
WHERE direction.campaign_id = restore.campaign_id
  AND direction.id = restore.direction_id
  AND direction.stale = true;

UPDATE campaigns campaign
SET status = 'composed',
    selected_direction_id = restore.direction_id,
    composition_id = restore.composition_id,
    revision = campaign.revision + 1,
    updated_at = clock_timestamp()
FROM legacy_campaign_restores restore
WHERE campaign.id = restore.campaign_id;

INSERT INTO audit_events
  (id, actor_id, actor_role, action, entity_type, entity_id,
   before_status, after_status, payload, created_at)
SELECT 'migration-014-image-restore:' || proven.job_id,
       COALESCE(job.actor_id, campaign.created_by),
       actor.role,
       'migration.legacy_image_provenance_restored',
       'campaign',
       proven.campaign_id,
       proven.fenced_campaign_status,
       campaign.status,
       jsonb_build_object(
         'jobId', proven.job_id,
         'campaignId', proven.campaign_id,
         'assetId', proven.asset_id,
         'directionId', proven.direction_id,
         'compositionId', restore.composition_id,
         'sourceCompositionId', restore.source_composition_id,
         'reason', 'provable_legacy_final_image',
         'jobStatus', 'succeeded',
         'responseStatus', job.response_status,
         'campaignStatus', campaign.status,
         'campaignRevision', campaign.revision
       ),
       clock_timestamp()
FROM provable_legacy_final_images proven
JOIN generation_jobs job ON job.id = proven.job_id
JOIN campaigns campaign ON campaign.id = proven.campaign_id
JOIN users actor ON actor.id = COALESCE(job.actor_id, campaign.created_by)
LEFT JOIN legacy_campaign_restores restore ON restore.campaign_id = proven.campaign_id
ON CONFLICT (id) DO NOTHING;
