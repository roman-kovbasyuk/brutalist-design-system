LOCK TABLE campaigns, campaign_versions, campaign_version_source_assets, assets,
  deliveries, review_events, audit_events, idempotency_records, orphaned_uploads
  IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION immutable_review_hash_array_is_valid(hash_values text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT hash_values IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM unnest(hash_values) item(hash)
      WHERE hash IS NULL OR hash !~ '^[a-f0-9]{64}$'
    )
    AND hash_values = ARRAY(
      SELECT DISTINCT hash FROM unnest(hash_values) item(hash) ORDER BY hash
    );
$$;

ALTER TABLE review_events VALIDATE CONSTRAINT review_events_immutable_asset_hashes_check;

ALTER TABLE deliveries
  ADD COLUMN content_hash text,
  ADD COLUMN zip_sha256 text,
  ADD COLUMN byte_size bigint;

UPDATE assets asset
SET version_id = delivery.version_id
FROM deliveries delivery
WHERE delivery.asset_id = asset.id AND asset.version_id IS NULL;

UPDATE deliveries delivery
SET content_hash = version.content_hash,
    zip_sha256 = asset.sha256,
    byte_size = asset.byte_size
FROM campaign_versions version, assets asset
WHERE version.id = delivery.version_id
  AND asset.id = delivery.asset_id
  AND asset.campaign_id = delivery.campaign_id;

-- Task 13 admitted the narrow approved -> delivered transition before the ZIP
-- facts had their final columns. Preserve an exact legacy transition while
-- enriching its one audit row from the already-immutable delivery/version/asset
-- records. Suspicious legacy rows are not repaired and fail the historical gate
-- at the end of this migration.
INSERT INTO audit_events
  (id, actor_id, actor_role, action, entity_type, entity_id, before_status,
   after_status, version_id, payload, created_at)
SELECT 'migration-018-delivery-facts:' || delivery.id,
       event.actor_id,
       event.actor_role,
       'migration.delivery_fact_upgraded',
       'campaign',
       delivery.campaign_id,
       NULL,
       NULL,
       delivery.version_id,
       jsonb_build_object(
         'priorAuditId', audit.id,
         'reviewEventId', event.id,
         'deliveryId', delivery.id,
         'contentHash', delivery.content_hash,
         'zipAssetId', asset.id,
         'zipSha256', delivery.zip_sha256,
         'byteSize', delivery.byte_size
       ),
       now()
FROM deliveries delivery
JOIN assets asset ON asset.id = delivery.asset_id AND asset.campaign_id = delivery.campaign_id
JOIN review_events event
  ON event.version_id = delivery.version_id
 AND event.campaign_id = delivery.campaign_id
 AND event.event_type = 'delivered'
JOIN audit_events audit
  ON audit.entity_type = 'campaign'
 AND audit.entity_id = delivery.campaign_id
 AND audit.version_id = delivery.version_id
 AND audit.action IN ('campaign.delivered', 'campaign.deliver')
 AND audit.before_status = 'approved'
 AND audit.after_status = 'delivered'
 AND audit.actor_id = event.actor_id
 AND audit.actor_role = event.actor_role
 AND audit.payload->>'reviewEventId' = event.id
WHERE event.actor_id = delivery.created_by
  AND event.created_at = delivery.created_at
  AND event.payload = jsonb_build_object(
    'deliveryId', delivery.id,
    'contentHash', delivery.content_hash,
    'assetHashes', jsonb_build_array(delivery.zip_sha256)
  )
  AND event.immutable_asset_hashes = ARRAY[delivery.zip_sha256]::text[];

ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only;
UPDATE audit_events audit
SET action = 'campaign.delivered',
    payload = jsonb_build_object(
      'reviewEventId', event.id,
      'deliveryId', delivery.id,
      'contentHash', delivery.content_hash,
      'zipAssetId', asset.id,
      'zipSha256', delivery.zip_sha256,
      'byteSize', delivery.byte_size
    )
FROM deliveries delivery
JOIN assets asset ON asset.id = delivery.asset_id AND asset.campaign_id = delivery.campaign_id
JOIN review_events event
  ON event.version_id = delivery.version_id
 AND event.campaign_id = delivery.campaign_id
 AND event.event_type = 'delivered'
WHERE audit.entity_type = 'campaign'
  AND audit.entity_id = delivery.campaign_id
  AND audit.version_id = delivery.version_id
  AND audit.action IN ('campaign.delivered', 'campaign.deliver')
  AND audit.before_status = 'approved'
  AND audit.after_status = 'delivered'
  AND audit.actor_id = event.actor_id
  AND audit.actor_role = event.actor_role
  AND audit.payload->>'reviewEventId' = event.id
  AND event.actor_id = delivery.created_by
  AND event.created_at = delivery.created_at
  AND event.payload = jsonb_build_object(
    'deliveryId', delivery.id,
    'contentHash', delivery.content_hash,
    'assetHashes', jsonb_build_array(delivery.zip_sha256)
  )
  AND event.immutable_asset_hashes = ARRAY[delivery.zip_sha256]::text[];
ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only;

ALTER TABLE deliveries
  ALTER COLUMN content_hash SET NOT NULL,
  ALTER COLUMN zip_sha256 SET NOT NULL,
  ALTER COLUMN byte_size SET NOT NULL,
  ADD CONSTRAINT deliveries_content_hash_check CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT deliveries_zip_sha256_check CHECK (zip_sha256 ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT deliveries_byte_size_check CHECK (byte_size > 0);

CREATE TABLE delivery_builds (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  version_id text NOT NULL UNIQUE REFERENCES campaign_versions(id),
  actor_id text NOT NULL REFERENCES users(id),
  method text NOT NULL DEFAULT 'POST' CHECK (method = 'POST'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[!-~]{1,255}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  owner_token text NOT NULL CHECK (length(owner_token) > 0),
  state text NOT NULL DEFAULT 'in_progress' CHECK (state IN ('in_progress', 'failed', 'completed')),
  plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((state = 'completed') = (completed_at IS NOT NULL))
);

CREATE FUNCTION protect_delivery_build_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.version_id IS DISTINCT FROM OLD.version_id
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.state = 'completed' THEN
    RAISE EXCEPTION 'delivery build identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_builds_protect_identity
  BEFORE UPDATE OR DELETE ON delivery_builds
  FOR EACH ROW EXECUTE FUNCTION protect_delivery_build_identity();

ALTER TABLE orphaned_uploads
  ADD COLUMN claimed_delivery_build_id text REFERENCES delivery_builds(id);

ALTER TABLE orphaned_uploads
  DROP CONSTRAINT orphaned_uploads_claimed_pending_check,
  ADD CONSTRAINT orphaned_uploads_claimed_pending_check CHECK (
    (claimed_build_id IS NULL OR claimed_delivery_build_id IS NULL)
    AND NOT (claimed_build_id IS NOT NULL AND claimed_delivery_build_id IS NOT NULL)
    AND (
      (claimed_build_id IS NULL AND claimed_delivery_build_id IS NULL)
      OR (status = 'pending' AND cleaned_at IS NULL)
    )
  );

CREATE INDEX orphaned_uploads_claimed_delivery_build_idx
  ON orphaned_uploads (claimed_delivery_build_id)
  WHERE claimed_delivery_build_id IS NOT NULL;

ALTER TABLE assets
  ADD CONSTRAINT assets_delivery_shape_check CHECK (
    integrity_version = 0
    OR source <> 'delivery'
    OR (
      kind = 'delivery_zip'
      AND mime_type = 'application/zip'
      AND byte_size > 0
      AND width IS NULL AND height IS NULL
      AND generation_job_id IS NULL
      AND object_key ~ '^campaigns/[a-f0-9]{64}/versions/[a-f0-9]{64}/delivery/package[.]zip$'
    )
  ) NOT VALID;

CREATE UNIQUE INDEX assets_one_delivery_zip_per_version_idx
  ON assets (version_id)
  WHERE source = 'delivery' AND kind = 'delivery_zip' AND integrity_version = 1;

CREATE FUNCTION normalize_delivery_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  version_row campaign_versions%ROWTYPE;
  campaign_row campaigns%ROWTYPE;
  asset_row assets%ROWTYPE;
  stored_actor_role text;
  stored_disabled_at timestamptz;
  event_types text[];
  full_hashes text[];
BEGIN
  SELECT * INTO version_row FROM campaign_versions WHERE id = NEW.version_id;
  SELECT * INTO campaign_row FROM campaigns WHERE id = NEW.campaign_id AND archived_at IS NULL FOR UPDATE;
  SELECT role, disabled_at INTO stored_actor_role, stored_disabled_at FROM users WHERE id = NEW.created_by;
  IF version_row.id IS NULL OR campaign_row.id IS NULL
     OR version_row.campaign_id <> NEW.campaign_id
     OR campaign_row.status <> 'approved'
     OR campaign_row.current_version_number <> version_row.version_number
     OR campaign_row.open_version_id IS NOT NULL
     OR stored_actor_role NOT IN ('marketer', 'admin') OR stored_disabled_at IS NOT NULL THEN
    RAISE EXCEPTION 'delivery requires the exact current approved version and actor' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(array_agg(event_type ORDER BY created_at, id), ARRAY[]::text[])
  INTO event_types FROM review_events WHERE version_id = NEW.version_id;
  full_hashes := canonical_review_asset_hashes(NEW.version_id, true);
  IF event_types <> ARRAY['sent', 'ready', 'approved']::text[]
     OR EXISTS (
       SELECT 1 FROM review_events event
       WHERE event.version_id = NEW.version_id
         AND ((event.event_type = 'sent' AND (
                event.payload->>'contentHash' IS DISTINCT FROM version_row.content_hash
                OR event.immutable_asset_hashes <> canonical_review_asset_hashes(NEW.version_id, false)))
           OR (event.event_type IN ('ready', 'approved') AND (
                event.payload->>'contentHash' IS DISTINCT FROM version_row.content_hash
                OR event.immutable_asset_hashes <> full_hashes)))
     ) THEN
    RAISE EXCEPTION 'delivery approval chain is invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE assets SET version_id = NEW.version_id
  WHERE id = NEW.asset_id AND campaign_id = NEW.campaign_id AND version_id IS NULL;
  SELECT * INTO asset_row FROM assets
  WHERE id = NEW.asset_id AND campaign_id = NEW.campaign_id FOR UPDATE;
  IF asset_row.id IS NULL OR asset_row.version_id <> NEW.version_id
     OR asset_row.kind <> 'delivery_zip' OR asset_row.source <> 'delivery'
     OR asset_row.mime_type <> 'application/zip' OR asset_row.byte_size <= 0
     OR asset_row.width IS NOT NULL OR asset_row.height IS NOT NULL
     OR asset_row.generation_job_id IS NOT NULL THEN
    RAISE EXCEPTION 'delivery ZIP asset metadata is invalid' USING ERRCODE = '23514';
  END IF;
  NEW.content_hash := version_row.content_hash;
  NEW.zip_sha256 := asset_row.sha256;
  NEW.byte_size := asset_row.byte_size;
  RETURN NEW;
END;
$$;

CREATE TRIGGER deliveries_normalize_insert
  BEFORE INSERT ON deliveries
  FOR EACH ROW EXECUTE FUNCTION normalize_delivery_insert();

CREATE TRIGGER deliveries_append_only
  BEFORE UPDATE OR DELETE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE FUNCTION delivery_state_is_valid(target_version_id text, require_current_transaction boolean)
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  version_row campaign_versions%ROWTYPE;
  campaign_row campaigns%ROWTYPE;
  delivery_row deliveries%ROWTYPE;
  asset_row assets%ROWTYPE;
  delivered_event review_events%ROWTYPE;
  event_types text[];
  expected_review_hashes text[];
  expected_full_hashes text[];
  valid_audits integer;
BEGIN
  SELECT * INTO version_row FROM campaign_versions WHERE id = target_version_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO campaign_row FROM campaigns WHERE id = version_row.campaign_id;
  SELECT * INTO delivery_row FROM deliveries WHERE version_id = version_row.id;
  IF delivery_row.id IS NULL THEN RETURN false; END IF;
  SELECT * INTO asset_row FROM assets WHERE id = delivery_row.asset_id;
  SELECT * INTO delivered_event FROM review_events
  WHERE version_id = version_row.id AND event_type = 'delivered';
  SELECT COALESCE(array_agg(event_type ORDER BY created_at, id), ARRAY[]::text[])
  INTO event_types FROM review_events WHERE version_id = version_row.id;
  expected_review_hashes := canonical_review_asset_hashes(version_row.id, false);
  expected_full_hashes := canonical_review_asset_hashes(version_row.id, true);

  IF campaign_row.id IS NULL OR campaign_row.status <> 'delivered'
     OR campaign_row.current_version_number <> version_row.version_number
     OR campaign_row.open_version_id IS NOT NULL
     OR delivery_row.campaign_id <> version_row.campaign_id
     OR delivery_row.content_hash <> version_row.content_hash
     OR asset_row.id IS NULL OR asset_row.campaign_id <> version_row.campaign_id
     OR asset_row.version_id <> version_row.id OR asset_row.kind <> 'delivery_zip'
     OR asset_row.source <> 'delivery' OR asset_row.mime_type <> 'application/zip'
     OR asset_row.width IS NOT NULL OR asset_row.height IS NOT NULL
     OR asset_row.generation_job_id IS NOT NULL
     OR delivery_row.zip_sha256 <> asset_row.sha256
     OR delivery_row.byte_size <> asset_row.byte_size
     OR event_types <> ARRAY['sent', 'ready', 'approved', 'delivered']::text[]
     OR delivered_event.id IS NULL OR delivered_event.actor_id <> delivery_row.created_by
     OR delivered_event.actor_role NOT IN ('marketer', 'admin')
     OR delivered_event.created_at <> delivery_row.created_at
     OR delivered_event.payload <> jsonb_build_object(
          'deliveryId', delivery_row.id,
          'contentHash', version_row.content_hash,
          'assetHashes', jsonb_build_array(asset_row.sha256)
        )
     OR delivered_event.immutable_asset_hashes <> ARRAY[asset_row.sha256]::text[]
     OR EXISTS (
       SELECT 1 FROM review_events event
       WHERE event.version_id = version_row.id
         AND ((event.event_type = 'sent' AND (
                event.payload->>'contentHash' IS DISTINCT FROM version_row.content_hash
                OR event.immutable_asset_hashes <> expected_review_hashes))
           OR (event.event_type IN ('ready', 'approved') AND (
                event.payload->>'contentHash' IS DISTINCT FROM version_row.content_hash
                OR event.immutable_asset_hashes <> expected_full_hashes)))
     ) THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO valid_audits
  FROM audit_events audit
  WHERE audit.action = 'campaign.delivered'
    AND audit.entity_type = 'campaign' AND audit.entity_id = version_row.campaign_id
    AND audit.before_status = 'approved' AND audit.after_status = 'delivered'
    AND audit.version_id = version_row.id
    AND audit.actor_id = delivered_event.actor_id AND audit.actor_role = delivered_event.actor_role
    AND audit.payload = jsonb_build_object(
      'reviewEventId', delivered_event.id,
      'deliveryId', delivery_row.id,
      'contentHash', version_row.content_hash,
      'zipAssetId', asset_row.id,
      'zipSha256', asset_row.sha256,
      'byteSize', asset_row.byte_size
    )
    AND (NOT require_current_transaction OR audit.transaction_id = pg_current_xact_id());
  RETURN valid_audits = 1;
END;
$$;

CREATE FUNCTION enforce_delivery_state() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_version_id text;
BEGIN
  target_version_id := CASE TG_TABLE_NAME
    WHEN 'campaigns' THEN (
      SELECT id FROM campaign_versions
      WHERE campaign_id = to_jsonb(NEW)->>'id'
        AND version_number = (to_jsonb(NEW)->>'current_version_number')::integer
    )
    WHEN 'assets' THEN (
      SELECT version_id FROM assets WHERE id = to_jsonb(NEW)->>'id'
    )
    ELSE to_jsonb(NEW)->>'version_id'
  END;
  IF TG_TABLE_NAME = 'assets'
     AND to_jsonb(NEW)->>'source' = 'delivery'
     AND target_version_id IS NULL THEN
    RAISE EXCEPTION 'delivery asset must be bound atomically' USING ERRCODE = '23514';
  END IF;
  IF target_version_id IS NOT NULL
     AND (TG_TABLE_NAME <> 'assets' OR to_jsonb(NEW)->>'source' = 'delivery')
     AND (TG_TABLE_NAME <> 'review_events' OR to_jsonb(NEW)->>'event_type' = 'delivered')
     AND (TG_TABLE_NAME <> 'campaigns' OR to_jsonb(NEW)->>'status' = 'delivered')
     AND NOT delivery_state_is_valid(target_version_id, true) THEN
    RAISE EXCEPTION 'delivery facts are not an exact atomic chain' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER delivery_assets_exact_chain
  AFTER INSERT ON assets DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_delivery_state();
CREATE CONSTRAINT TRIGGER deliveries_exact_chain
  AFTER INSERT ON deliveries DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_delivery_state();
CREATE CONSTRAINT TRIGGER delivered_review_events_exact_chain
  AFTER INSERT ON review_events DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_delivery_state();
CREATE CONSTRAINT TRIGGER delivered_campaigns_exact_chain
  AFTER UPDATE OF status ON campaigns DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_delivery_state();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM review_events
    WHERE NOT immutable_review_hash_array_is_valid(immutable_asset_hashes)
  ) THEN
    RAISE EXCEPTION 'review hash facts contain invalid or null values' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM deliveries delivery
    WHERE NOT delivery_state_is_valid(delivery.version_id, false)
  ) THEN
    RAISE EXCEPTION 'historical delivery facts are invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM assets asset
    WHERE asset.source = 'delivery'
      AND NOT EXISTS (SELECT 1 FROM deliveries delivery WHERE delivery.asset_id = asset.id)
  ) THEN
    RAISE EXCEPTION 'historical delivery asset is unbound' USING ERRCODE = '23514';
  END IF;
END;
$$;
