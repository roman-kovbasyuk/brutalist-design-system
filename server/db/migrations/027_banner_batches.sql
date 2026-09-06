ALTER TABLE compositions ADD COLUMN designs jsonb
  CHECK (designs IS NULL OR (jsonb_typeof(designs) = 'array' AND jsonb_array_length(designs) > 0));

CREATE FUNCTION protect_banner_batch_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.designs IS DISTINCT FROM OLD.designs THEN
    RAISE EXCEPTION 'composition design selection is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER compositions_protect_banner_batch
  BEFORE UPDATE ON compositions
  FOR EACH ROW EXECUTE FUNCTION protect_banner_batch_history();
