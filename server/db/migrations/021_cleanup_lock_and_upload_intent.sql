LOCK TABLE orphaned_uploads, assets IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE orphaned_uploads
  ADD COLUMN expected_sha256 text,
  ADD COLUMN expected_byte_size bigint,
  ADD COLUMN expected_mime_type text,
  ADD CONSTRAINT orphaned_uploads_expected_object_check CHECK (
    (expected_sha256 IS NULL AND expected_byte_size IS NULL AND expected_mime_type IS NULL)
    OR (
      expected_sha256 ~ '^[a-f0-9]{64}$'
      AND expected_byte_size > 0
      AND length(expected_mime_type) BETWEEN 3 AND 255
      AND expected_mime_type ~ '^[!-~]+$'
    )
  );

CREATE OR REPLACE FUNCTION reject_asset_insert_during_object_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.object_key, 0));
  IF EXISTS (
    SELECT 1 FROM orphaned_uploads
    WHERE object_key = NEW.object_key AND status = 'cleaning'
  ) THEN
    RAISE EXCEPTION 'asset object is fenced for durable cleanup' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
