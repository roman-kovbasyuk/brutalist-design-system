LOCK TABLE generation_jobs, assets, visual_directions, campaigns, compositions
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE legacy_image_provenance_resolution ON COMMIT DROP AS
SELECT j.id AS job_id, a.width, a.height
FROM generation_jobs j
JOIN assets a
  ON a.campaign_id = j.campaign_id
 AND a.generation_job_id = j.id
 AND a.source = 'generation'
 AND a.kind IN ('direction', 'final_image')
JOIN visual_directions d
  ON d.campaign_id = j.campaign_id
 AND d.id = j.input_snapshot->'direction'->>'id'
 AND d.preview_asset_id = a.id
WHERE j.step = 'image'
  AND j.status = 'succeeded'
  AND j.safety->>'verdict' = 'safe'
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
  AND d.stale = false
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
  AND j.result_metadata ? 'image'
  AND jsonb_typeof(j.result_metadata->'image') = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(j.result_metadata->'image')) = 5
  AND (j.result_metadata->'image') ?& ARRAY['asset', 'mimeType', 'width', 'height', 'byteSize']
  AND jsonb_typeof(j.result_metadata->'image'->'asset') = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(j.result_metadata->'image'->'asset')) = 3
  AND (j.result_metadata->'image'->'asset') ?& ARRAY['id', 'kind', 'sha256']
  AND j.result_metadata->'image'->'asset'->>'id' = a.id
  AND j.result_metadata->'image'->'asset'->>'kind' = a.kind
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
  );

UPDATE generation_jobs j
SET input_snapshot = j.input_snapshot || jsonb_build_object('width', r.width, 'height', r.height),
    updated_at = clock_timestamp()
FROM legacy_image_provenance_resolution r
WHERE j.id = r.job_id;

CREATE TEMP TABLE legacy_image_jobs_to_fence ON COMMIT DROP AS
SELECT j.id AS job_id, j.campaign_id,
       COALESCE(
         j.input_snapshot->'direction'->>'id',
         (
           SELECT d.id
           FROM assets a
           JOIN visual_directions d ON d.campaign_id = a.campaign_id AND d.preview_asset_id = a.id
           WHERE a.campaign_id = j.campaign_id AND a.generation_job_id = j.id
           ORDER BY d.id
           LIMIT 1
         )
       ) AS direction_id,
       j.status AS previous_status
FROM generation_jobs j
WHERE j.step = 'image'
  AND j.status IN ('pending', 'succeeded')
  AND NOT CASE
    WHEN jsonb_typeof(j.input_snapshot) = 'object'
      AND j.input_snapshot ?& ARRAY['direction', 'width', 'height']
      AND j.input_snapshot = jsonb_build_object(
        'direction', j.input_snapshot->'direction',
        'width', j.input_snapshot->'width',
        'height', j.input_snapshot->'height'
      )
      AND jsonb_typeof(j.input_snapshot->'direction') = 'object'
      AND jsonb_typeof(j.input_snapshot->'width') = 'number'
      AND jsonb_typeof(j.input_snapshot->'height') = 'number'
    THEN (j.input_snapshot->>'width')::numeric = trunc((j.input_snapshot->>'width')::numeric)
      AND (j.input_snapshot->>'height')::numeric = trunc((j.input_snapshot->>'height')::numeric)
      AND (j.input_snapshot->>'width')::numeric BETWEEN 64 AND 4096
      AND (j.input_snapshot->>'height')::numeric BETWEEN 64 AND 4096
    ELSE false
  END;

UPDATE visual_directions d
SET stale = true
FROM legacy_image_jobs_to_fence f
WHERE d.campaign_id = f.campaign_id
  AND (
    d.id = f.direction_id
    OR EXISTS (
      SELECT 1 FROM assets a
      WHERE a.campaign_id = f.campaign_id
        AND a.generation_job_id = f.job_id
        AND a.id = d.preview_asset_id
    )
  )
  AND d.stale = false;

UPDATE compositions c
SET stale = true
FROM legacy_image_jobs_to_fence f
WHERE c.campaign_id = f.campaign_id
  AND c.stale = false
  AND (
    EXISTS (
      SELECT 1 FROM assets a
      WHERE a.campaign_id = c.campaign_id
        AND a.generation_job_id = f.job_id
        AND EXISTS (
          SELECT 1 FROM jsonb_each_text(c.slot_values) slot_value
          WHERE slot_value.value = a.id
        )
    )
    OR EXISTS (
      SELECT 1 FROM campaigns campaign
      WHERE campaign.id = c.campaign_id
        AND campaign.selected_direction_id = f.direction_id
        AND campaign.composition_id = c.id
    )
  );

UPDATE campaigns c
SET status = CASE WHEN c.selected_copy_id IS NULL THEN 'draft' ELSE 'copy_ready' END,
    selected_direction_id = NULL,
    composition_id = NULL,
    revision = c.revision + 1,
    updated_at = clock_timestamp()
FROM legacy_image_jobs_to_fence f
WHERE c.id = f.campaign_id
  AND (
    c.selected_direction_id = f.direction_id
    OR EXISTS (
      SELECT 1
      FROM visual_directions d
      JOIN assets a ON a.campaign_id = d.campaign_id AND a.id = d.preview_asset_id
      WHERE d.campaign_id = f.campaign_id
        AND d.id = c.selected_direction_id
        AND a.generation_job_id = f.job_id
    )
  )
  AND c.status IN ('draft', 'copy_ready', 'direction_selected', 'composed');

UPDATE generation_jobs j
SET status = CASE WHEN f.previous_status = 'pending' THEN 'unknown' ELSE 'failed' END,
    unknown_reason = CASE WHEN f.previous_status = 'pending' THEN 'legacy_image_dimensions_unavailable' ELSE NULL END,
    error_code = CASE WHEN f.previous_status = 'succeeded' THEN 'legacy_image_provenance_unresolved' ELSE NULL END,
    response_status = CASE WHEN f.previous_status = 'pending' THEN 202 ELSE 201 END,
    updated_at = clock_timestamp()
FROM legacy_image_jobs_to_fence f
WHERE j.id = f.job_id;

UPDATE generation_jobs j
SET response_body = jsonb_build_object(
  'job', jsonb_build_object(
    'id', j.id,
    'campaignId', j.campaign_id,
    'step', j.step,
    'provider', j.provider,
    'model', j.model,
    'region', j.region,
    'status', j.status,
    'attempts', j.attempts,
    'safety', j.safety,
    'usage', j.usage,
    'reservedCostMicrounits', j.reserved_cost_microunits,
    'actualCostMicrounits', j.actual_cost_microunits,
    'timeoutAt', j.timeout_at,
    'result', j.result_metadata,
    'errorCode', j.error_code,
    'createdAt', j.created_at,
    'updatedAt', j.updated_at
  )
)
FROM legacy_image_jobs_to_fence f
WHERE j.id = f.job_id;

ALTER TABLE generation_jobs
  ADD CONSTRAINT generation_jobs_image_input_dimensions_check CHECK (
    step <> 'image'
    OR status NOT IN ('pending', 'succeeded')
    OR CASE
      WHEN jsonb_typeof(input_snapshot) = 'object'
        AND input_snapshot ?& ARRAY['direction', 'width', 'height']
        AND input_snapshot = jsonb_build_object(
          'direction', input_snapshot->'direction',
          'width', input_snapshot->'width',
          'height', input_snapshot->'height'
        )
        AND jsonb_typeof(input_snapshot->'direction') = 'object'
        AND jsonb_typeof(input_snapshot->'width') = 'number'
        AND jsonb_typeof(input_snapshot->'height') = 'number'
      THEN (input_snapshot->>'width')::numeric = trunc((input_snapshot->>'width')::numeric)
        AND (input_snapshot->>'height')::numeric = trunc((input_snapshot->>'height')::numeric)
        AND (input_snapshot->>'width')::numeric BETWEEN 64 AND 4096
        AND (input_snapshot->>'height')::numeric BETWEEN 64 AND 4096
      ELSE false
    END
  ) NOT VALID;

ALTER TABLE generation_jobs
  VALIDATE CONSTRAINT generation_jobs_image_input_dimensions_check;
