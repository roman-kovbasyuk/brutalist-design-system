ALTER TABLE idempotency_records
  DROP CONSTRAINT idempotency_records_state_check,
  DROP CONSTRAINT idempotency_records_check,
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN failure_code text,
  ADD CONSTRAINT idempotency_records_state_check
    CHECK (state IN ('in_progress', 'completed', 'failed')),
  ADD CONSTRAINT idempotency_records_lifecycle_check CHECK (
    (state = 'in_progress'
      AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL
      AND failed_at IS NULL AND failure_code IS NULL)
    OR
    (state = 'completed'
      AND response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL
      AND failed_at IS NULL AND failure_code IS NULL)
    OR
    (state = 'failed'
      AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL
      AND failed_at IS NOT NULL AND length(failure_code) > 0)
  );
