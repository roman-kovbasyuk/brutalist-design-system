ALTER TABLE users
  ADD COLUMN disabled boolean NOT NULL DEFAULT false;

UPDATE users
SET disabled = (disabled_at IS NOT NULL);

CREATE FUNCTION synchronize_user_disabled_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.disabled_at IS NOT NULL THEN
      NEW.disabled := true;
    ELSIF NEW.disabled THEN
      NEW.disabled_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.disabled IS DISTINCT FROM OLD.disabled
     AND NEW.disabled_at IS NOT DISTINCT FROM OLD.disabled_at THEN
    NEW.disabled_at := CASE WHEN NEW.disabled THEN now() ELSE NULL END;
  ELSIF NEW.disabled_at IS DISTINCT FROM OLD.disabled_at
        AND NEW.disabled IS NOT DISTINCT FROM OLD.disabled THEN
    NEW.disabled := (NEW.disabled_at IS NOT NULL);
  ELSIF NEW.disabled IS DISTINCT FROM (NEW.disabled_at IS NOT NULL) THEN
    NEW.disabled := NEW.disabled OR NEW.disabled_at IS NOT NULL;
    NEW.disabled_at := CASE
      WHEN NEW.disabled THEN COALESCE(NEW.disabled_at, now())
      ELSE NULL
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER users_disabled_state_compatibility
BEFORE INSERT OR UPDATE OF disabled, disabled_at ON users
FOR EACH ROW
EXECUTE FUNCTION synchronize_user_disabled_state();
