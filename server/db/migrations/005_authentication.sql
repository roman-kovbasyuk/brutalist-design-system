ALTER TABLE users
  ADD COLUMN disabled_at timestamptz;

UPDATE users
SET disabled_at = updated_at
WHERE disabled = true;

ALTER TABLE users
  DROP COLUMN disabled;

CREATE INDEX users_active_firebase_uid_idx
  ON users (firebase_uid)
  WHERE disabled_at IS NULL AND firebase_uid IS NOT NULL;
