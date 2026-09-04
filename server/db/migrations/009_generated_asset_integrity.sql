ALTER TABLE assets
  ADD COLUMN integrity_version smallint;

UPDATE assets SET integrity_version = 0;

ALTER TABLE assets
  ALTER COLUMN integrity_version SET DEFAULT 1,
  ALTER COLUMN integrity_version SET NOT NULL,
  ADD CONSTRAINT assets_integrity_version_check CHECK (integrity_version IN (0, 1)) NOT VALID,
  ADD CONSTRAINT assets_generated_shape_check CHECK (
    integrity_version = 0
    OR source <> 'generation'
    OR (
      generation_job_id IS NOT NULL
      AND version_id IS NULL
      AND kind IN ('direction', 'final_image')
      AND width IS NOT NULL
      AND height IS NOT NULL
    )
  ) NOT VALID;

CREATE FUNCTION enforce_current_asset_integrity_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.integrity_version <> 1 THEN
    RAISE EXCEPTION 'new assets require current integrity checks' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.integrity_version = 1 AND NEW.integrity_version <> 1 THEN
    RAISE EXCEPTION 'current asset integrity cannot be downgraded' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assets_enforce_current_integrity_version
  BEFORE INSERT OR UPDATE OF integrity_version ON assets
  FOR EACH ROW EXECUTE FUNCTION enforce_current_asset_integrity_version();

CREATE UNIQUE INDEX assets_generation_job_unique_idx
  ON assets (generation_job_id)
  WHERE source = 'generation' AND integrity_version = 1;
