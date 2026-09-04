INSERT INTO campaign_version_source_assets
  (campaign_id, version_id, asset_id, asset_sha256, created_at)
SELECT v.campaign_id, v.id, a.id, source_ref->>'sha256', v.created_at
FROM campaign_versions v
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(v.snapshot->'assets') = 'array' THEN v.snapshot->'assets' ELSE '[]'::jsonb END
) AS source_ref
JOIN assets a
  ON a.campaign_id = v.campaign_id
 AND a.id = source_ref->>'id'
 AND a.sha256 = source_ref->>'sha256'
WHERE source_ref->>'kind' IN ('direction', 'final_image')
ON CONFLICT (version_id, asset_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    WITH source_refs AS (
      SELECT v.id AS version_id, v.campaign_id,
             source_ref->>'id' AS asset_id, source_ref->>'sha256' AS asset_sha256
      FROM campaign_versions v
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(v.snapshot->'assets') = 'array' THEN v.snapshot->'assets' ELSE '[]'::jsonb END
      ) AS source_ref
      WHERE source_ref->>'kind' IN ('direction', 'final_image')
    )
    SELECT 1
    FROM source_refs
    GROUP BY version_id, campaign_id, asset_id
    HAVING count(*) <> 1
  ) OR EXISTS (
    WITH source_refs AS (
      SELECT v.id AS version_id, v.campaign_id,
             source_ref->>'id' AS asset_id, source_ref->>'sha256' AS asset_sha256
      FROM campaign_versions v
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(v.snapshot->'assets') = 'array' THEN v.snapshot->'assets' ELSE '[]'::jsonb END
      ) AS source_ref
      WHERE source_ref->>'kind' IN ('direction', 'final_image')
    )
    SELECT 1
    FROM source_refs r
    FULL JOIN campaign_version_source_assets a
      ON a.version_id = r.version_id
     AND a.campaign_id = r.campaign_id
     AND a.asset_id = r.asset_id
    WHERE r.asset_id IS NULL OR a.asset_id IS NULL
       OR r.asset_sha256 IS NULL
       OR r.asset_sha256 !~ '^[a-f0-9]{64}$'
       OR a.asset_sha256 IS DISTINCT FROM r.asset_sha256
  ) THEN
    RAISE EXCEPTION 'historical version source provenance is unresolved' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM campaign_versions v
    WHERE v.snapshot #>> '{selectedDirection,previewAssetId}' IS NOT NULL
      AND (
        SELECT count(*)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v.snapshot->'assets') = 'array'
            THEN v.snapshot->'assets' ELSE '[]'::jsonb END
        ) AS source_ref
        WHERE source_ref->>'kind' IN ('direction', 'final_image')
          AND source_ref->>'id' = v.snapshot #>> '{selectedDirection,previewAssetId}'
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'historical version preview provenance is unresolved' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION enforce_exact_version_source_set() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_version_id text;
  target_campaign_id text;
  version_snapshot jsonb;
BEGIN
  IF TG_TABLE_NAME = 'campaign_versions' THEN
    target_version_id := NEW.id;
    target_campaign_id := NEW.campaign_id;
    version_snapshot := NEW.snapshot;
  ELSE
    target_version_id := NEW.version_id;
    target_campaign_id := NEW.campaign_id;
    SELECT snapshot INTO version_snapshot
    FROM campaign_versions
    WHERE id = target_version_id AND campaign_id = target_campaign_id;
  END IF;

  IF version_snapshot IS NULL THEN
    RETURN NEW;
  END IF;

  IF version_snapshot #>> '{selectedDirection,previewAssetId}' IS NOT NULL AND (
    SELECT count(*)
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(version_snapshot->'assets') = 'array'
        THEN version_snapshot->'assets' ELSE '[]'::jsonb END
    ) AS source_ref
    WHERE source_ref->>'kind' IN ('direction', 'final_image')
      AND source_ref->>'id' = version_snapshot #>> '{selectedDirection,previewAssetId}'
  ) <> 1 THEN
    RAISE EXCEPTION 'selected direction preview must have exact immutable source provenance' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(version_snapshot->'assets') = 'array'
        THEN version_snapshot->'assets' ELSE '[]'::jsonb END
    ) AS source_ref
    WHERE source_ref->>'kind' IN ('direction', 'final_image')
    GROUP BY source_ref->>'id'
    HAVING count(*) <> 1
  ) OR EXISTS (
    WITH source_refs AS (
      SELECT source_ref->>'id' AS asset_id, source_ref->>'sha256' AS asset_sha256
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(version_snapshot->'assets') = 'array'
          THEN version_snapshot->'assets' ELSE '[]'::jsonb END
      ) AS source_ref
      WHERE source_ref->>'kind' IN ('direction', 'final_image')
    ), associations AS (
      SELECT asset_id, asset_sha256
      FROM campaign_version_source_assets
      WHERE version_id = target_version_id AND campaign_id = target_campaign_id
    )
    SELECT 1
    FROM source_refs r
    FULL JOIN associations a ON a.asset_id = r.asset_id
    WHERE r.asset_id IS NULL OR a.asset_id IS NULL
       OR r.asset_sha256 IS NULL
       OR r.asset_sha256 !~ '^[a-f0-9]{64}$'
       OR a.asset_sha256 IS DISTINCT FROM r.asset_sha256
  ) THEN
    RAISE EXCEPTION 'version source associations must exactly match the immutable snapshot' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER campaign_versions_exact_source_set
  AFTER INSERT ON campaign_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_exact_version_source_set();

CREATE CONSTRAINT TRIGGER campaign_version_source_assets_exact_set
  AFTER INSERT ON campaign_version_source_assets
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_exact_version_source_set();
