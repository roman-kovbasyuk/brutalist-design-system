ALTER TABLE generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_campaign_id_step_idempotency_key_key,
  ADD COLUMN actor_id text REFERENCES users(id),
  ADD COLUMN method text NOT NULL DEFAULT 'POST' CHECK (method = upper(method) AND length(method) > 0),
  ADD COLUMN request_fingerprint text CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$'),
  ADD COLUMN owner_token text,
  ADD COLUMN dispatch_state text NOT NULL DEFAULT 'not_dispatched' CHECK (dispatch_state IN ('not_dispatched', 'dispatched')),
  ADD COLUMN dispatched_at timestamptz,
  ADD COLUMN budget_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  ADD COLUMN input_snapshot jsonb CHECK (input_snapshot IS NULL OR jsonb_typeof(input_snapshot) = 'object'),
  ADD COLUMN result_metadata jsonb CHECK (result_metadata IS NULL OR jsonb_typeof(result_metadata) = 'object'),
  ADD COLUMN error_code text,
  ADD COLUMN unknown_reason text,
  ADD COLUMN response_status integer CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  ADD COLUMN response_body jsonb,
  ADD COLUMN completed_at timestamptz,
  ADD CONSTRAINT generation_jobs_dispatch_check CHECK (
    (dispatch_state = 'not_dispatched' AND dispatched_at IS NULL)
    OR (dispatch_state = 'dispatched' AND dispatched_at IS NOT NULL)
  ),
  ADD CONSTRAINT generation_jobs_reserved_safe_check CHECK (reserved_cost_microunits <= 9007199254740991),
  ADD CONSTRAINT generation_jobs_actual_safe_check CHECK (actual_cost_microunits IS NULL OR actual_cost_microunits <= 9007199254740991);

CREATE UNIQUE INDEX generation_jobs_idempotency_scope_idx
  ON generation_jobs (actor_id, method, campaign_id, step, idempotency_key)
  WHERE actor_id IS NOT NULL;

CREATE INDEX generation_jobs_budget_day_idx
  ON generation_jobs (budget_day, status);

CREATE INDEX generation_jobs_actor_idx
  ON generation_jobs (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;
