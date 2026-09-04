ALTER TABLE orphaned_uploads
  ADD COLUMN claimed_build_id text REFERENCES review_version_builds(id);

ALTER TABLE orphaned_uploads
  ADD CONSTRAINT orphaned_uploads_claimed_pending_check CHECK (
    claimed_build_id IS NULL OR (status = 'pending' AND cleaned_at IS NULL)
  ) NOT VALID;

CREATE INDEX orphaned_uploads_claimed_build_idx
  ON orphaned_uploads (claimed_build_id)
  WHERE claimed_build_id IS NOT NULL;

CREATE TABLE campaign_version_source_assets (
  campaign_id text NOT NULL,
  version_id text NOT NULL,
  asset_id text NOT NULL,
  asset_sha256 text NOT NULL CHECK (asset_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, asset_id),
  FOREIGN KEY (campaign_id, version_id) REFERENCES campaign_versions(campaign_id, id),
  FOREIGN KEY (campaign_id, asset_id) REFERENCES assets(campaign_id, id)
);

CREATE INDEX campaign_version_source_assets_asset_idx
  ON campaign_version_source_assets (asset_id, version_id);

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
WHERE source_ref->>'kind' IN ('direction', 'final_image')
  AND source_ref->>'sha256' ~ '^[a-f0-9]{64}$'
  AND a.sha256 = source_ref->>'sha256'
ON CONFLICT (version_id, asset_id) DO NOTHING;

CREATE FUNCTION enforce_version_source_asset_hash() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  persisted_hash text;
BEGIN
  SELECT sha256 INTO persisted_hash
  FROM assets
  WHERE campaign_id = NEW.campaign_id AND id = NEW.asset_id
  FOR UPDATE;
  IF persisted_hash IS NULL OR persisted_hash IS DISTINCT FROM NEW.asset_sha256 THEN
    RAISE EXCEPTION 'version source hash must match the persisted asset' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER campaign_version_source_assets_hash_check
  BEFORE INSERT ON campaign_version_source_assets
  FOR EACH ROW EXECUTE FUNCTION enforce_version_source_asset_hash();

CREATE TRIGGER campaign_version_source_assets_append_only
  BEFORE UPDATE OR DELETE ON campaign_version_source_assets
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE OR REPLACE FUNCTION protect_committed_asset_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.version_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM campaign_version_source_assets
    WHERE campaign_id = OLD.campaign_id AND asset_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'version assets and sources are append-only' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
