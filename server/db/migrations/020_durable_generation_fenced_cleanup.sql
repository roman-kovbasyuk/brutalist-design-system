LOCK TABLE orphaned_uploads, review_version_builds, delivery_builds, assets
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE orphaned_uploads
  ADD COLUMN object_generation text,
  ADD COLUMN object_etag text,
  ADD COLUMN cleanup_token text,
  ADD COLUMN cleanup_lease_expires_at timestamptz;

ALTER TABLE orphaned_uploads
  DROP CONSTRAINT orphaned_uploads_status_check,
  DROP CONSTRAINT orphaned_uploads_check,
  DROP CONSTRAINT orphaned_uploads_claimed_pending_check,
  ADD CONSTRAINT orphaned_uploads_status_check
    CHECK (status IN ('pending', 'cleaning', 'cleaned', 'failed')),
  ADD CONSTRAINT orphaned_uploads_object_identity_check CHECK (
    (object_generation IS NULL OR (length(object_generation) BETWEEN 1 AND 255 AND object_generation ~ '^[!-~]+$'))
    AND (object_etag IS NULL OR (object_generation IS NOT NULL
      AND length(object_etag) BETWEEN 1 AND 1024 AND object_etag ~ '^[!-~]+$'))
  ),
  ADD CONSTRAINT orphaned_uploads_cleanup_state_check CHECK (
    (status = 'cleaned') = (cleaned_at IS NOT NULL)
    AND (
      (status = 'cleaning'
       AND cleaned_at IS NULL
       AND claimed_build_id IS NULL
       AND claimed_delivery_build_id IS NULL
       AND object_generation IS NOT NULL
       AND cleanup_token ~ '^[!-~]{1,255}$'
       AND cleanup_lease_expires_at IS NOT NULL)
      OR
      (status <> 'cleaning'
       AND cleanup_token IS NULL
       AND cleanup_lease_expires_at IS NULL)
    )
  ),
  ADD CONSTRAINT orphaned_uploads_claimed_pending_check CHECK (
    NOT (claimed_build_id IS NOT NULL AND claimed_delivery_build_id IS NOT NULL)
    AND (
      (claimed_build_id IS NULL AND claimed_delivery_build_id IS NULL)
      OR (status = 'pending' AND cleaned_at IS NULL AND cleanup_token IS NULL)
    )
  );

CREATE INDEX orphaned_uploads_cleaning_lease_idx
  ON orphaned_uploads (cleanup_lease_expires_at, id)
  WHERE status = 'cleaning';

CREATE FUNCTION reject_asset_insert_during_object_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM orphaned_uploads
    WHERE object_key = NEW.object_key AND status = 'cleaning'
  ) THEN
    RAISE EXCEPTION 'asset object is fenced for durable cleanup' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assets_reject_cleaning_object
  BEFORE INSERT OR UPDATE OF object_key ON assets
  FOR EACH ROW EXECUTE FUNCTION reject_asset_insert_during_object_cleanup();

CREATE FUNCTION reject_delivery_build_recovery_during_object_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.state, NEW.actor_id, NEW.idempotency_key, NEW.request_fingerprint, NEW.owner_token)
       IS DISTINCT FROM
     (OLD.state, OLD.actor_id, OLD.idempotency_key, OLD.request_fingerprint, OLD.owner_token)
     AND EXISTS (
       SELECT 1 FROM orphaned_uploads
       WHERE status = 'cleaning' AND object_key = OLD.plan->>'objectKey'
     ) THEN
    RAISE EXCEPTION 'delivery build object is fenced for durable cleanup' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_builds_reject_cleaning_recovery
  BEFORE UPDATE ON delivery_builds
  FOR EACH ROW EXECUTE FUNCTION reject_delivery_build_recovery_during_object_cleanup();

CREATE FUNCTION reject_version_build_recovery_during_object_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.state, NEW.owner_token) IS DISTINCT FROM (OLD.state, OLD.owner_token)
     AND EXISTS (
       SELECT 1 FROM orphaned_uploads orphan
       WHERE orphan.status = 'cleaning'
         AND (
           orphan.object_key = OLD.plan->'manifestAsset'->>'objectKey'
           OR EXISTS (
             SELECT 1
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(OLD.plan->'ratioAssets') = 'array'
                    THEN OLD.plan->'ratioAssets' ELSE '[]'::jsonb END
             ) ratio_asset
             WHERE ratio_asset->>'objectKey' = orphan.object_key
           )
         )
     ) THEN
    RAISE EXCEPTION 'version build object is fenced for durable cleanup' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER review_version_builds_reject_cleaning_recovery
  BEFORE UPDATE ON review_version_builds
  FOR EACH ROW EXECUTE FUNCTION reject_version_build_recovery_during_object_cleanup();
