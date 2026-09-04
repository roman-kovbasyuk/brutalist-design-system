ALTER TABLE campaigns
  ADD COLUMN archived_at timestamptz;

CREATE INDEX campaigns_active_created_at_idx
  ON campaigns (created_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE idempotency_records
  ADD COLUMN lease_expires_at timestamptz;

UPDATE idempotency_records
SET lease_expires_at = COALESCE(completed_at, failed_at, created_at);

ALTER TABLE idempotency_records
  ALTER COLUMN lease_expires_at SET NOT NULL;

CREATE INDEX idempotency_records_lease_idx
  ON idempotency_records (lease_expires_at)
  WHERE state = 'in_progress';

CREATE UNIQUE INDEX idempotency_records_owner_token_idx
  ON idempotency_records (owner_token);
