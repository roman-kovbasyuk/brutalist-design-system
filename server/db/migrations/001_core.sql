CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) > 3),
  firebase_uid text UNIQUE,
  role text NOT NULL CHECK (role IN ('marketer', 'designer', 'admin')),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invitations (
  id text PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) > 3),
  role text NOT NULL CHECK (role IN ('marketer', 'designer', 'admin')),
  invited_by text NOT NULL REFERENCES users(id),
  accepted_user_id text UNIQUE REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((accepted_user_id IS NULL) = (accepted_at IS NULL))
);

CREATE UNIQUE INDEX invitations_active_email_idx
  ON invitations (email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  provider text NOT NULL DEFAULT 'mock' CHECK (provider IN ('mock', 'gemini')),
  model text NOT NULL DEFAULT 'mock-v1' CHECK (length(btrim(model)) > 0),
  region text NOT NULL DEFAULT 'europe-west6' CHECK (length(btrim(region)) > 0),
  daily_budget_microunits bigint NOT NULL DEFAULT 0 CHECK (daily_budget_microunits >= 0),
  per_step_regeneration_limit integer NOT NULL DEFAULT 3 CHECK (per_step_regeneration_limit >= 0),
  generation_disabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_by text REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (singleton) VALUES (true);

CREATE TABLE templates (
  id text NOT NULL,
  version text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE INDEX templates_created_at_idx ON templates (id, created_at DESC);

CREATE TABLE campaigns (
  id text PRIMARY KEY,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  brief jsonb NOT NULL CHECK (jsonb_typeof(brief) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'copy_ready', 'direction_selected', 'composed', 'in_review',
    'changes_requested', 'ready', 'approved', 'delivered'
  )),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  selected_copy_id text,
  selected_direction_id text,
  composition_id text,
  current_version_number integer NOT NULL DEFAULT 0 CHECK (current_version_number >= 0),
  open_version_id text,
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, open_version_id)
);

CREATE INDEX campaigns_status_idx ON campaigns (status);
CREATE INDEX campaigns_created_at_idx ON campaigns (created_at DESC);

CREATE TABLE generation_jobs (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  step text NOT NULL CHECK (step IN ('brief_analysis', 'copy', 'directions', 'image')),
  provider text NOT NULL CHECK (provider IN ('mock', 'gemini')),
  model text NOT NULL CHECK (length(btrim(model)) > 0),
  region text NOT NULL CHECK (length(btrim(region)) > 0),
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'blocked', 'unknown')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  safety jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safety) = 'object'),
  usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage) = 'object'),
  reserved_cost_microunits bigint NOT NULL CHECK (reserved_cost_microunits >= 0),
  actual_cost_microunits bigint CHECK (actual_cost_microunits >= 0),
  idempotency_key text NOT NULL,
  timeout_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, id),
  UNIQUE (campaign_id, step, idempotency_key)
);

CREATE INDEX generation_jobs_campaign_status_idx ON generation_jobs (campaign_id, status);
CREATE INDEX generation_jobs_timeout_idx ON generation_jobs (timeout_at) WHERE status = 'pending';

CREATE TABLE copy_sets (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  generation_job_id text REFERENCES generation_jobs(id),
  candidates jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'array'),
  selected_candidate_id text,
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, id),
  FOREIGN KEY (campaign_id, generation_job_id) REFERENCES generation_jobs(campaign_id, id)
);

CREATE INDEX copy_sets_campaign_idx ON copy_sets (campaign_id, created_at DESC);

CREATE TABLE assets (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  kind text NOT NULL CHECK (kind IN ('direction', 'final_image', 'review_png', 'manifest', 'delivery_zip')),
  object_key text NOT NULL UNIQUE CHECK (length(btrim(object_key)) > 0),
  mime_type text NOT NULL CHECK (length(btrim(mime_type)) > 0),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  source text NOT NULL CHECK (source IN ('upload', 'generation', 'render', 'review', 'delivery')),
  generation_job_id text REFERENCES generation_jobs(id),
  version_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((width IS NULL) = (height IS NULL)),
  UNIQUE (campaign_id, id),
  FOREIGN KEY (campaign_id, generation_job_id) REFERENCES generation_jobs(campaign_id, id)
);

CREATE INDEX assets_campaign_idx ON assets (campaign_id, created_at DESC);
CREATE INDEX assets_sha256_idx ON assets (sha256);

CREATE TABLE visual_directions (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  generation_job_id text REFERENCES generation_jobs(id),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  prompt text NOT NULL CHECK (length(btrim(prompt)) > 0),
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'blocked', 'failed')),
  preview_asset_id text REFERENCES assets(id),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, id),
  FOREIGN KEY (campaign_id, generation_job_id) REFERENCES generation_jobs(campaign_id, id),
  FOREIGN KEY (campaign_id, preview_asset_id) REFERENCES assets(campaign_id, id)
);

CREATE INDEX visual_directions_campaign_idx ON visual_directions (campaign_id, created_at DESC);

CREATE TABLE compositions (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  template_id text NOT NULL,
  template_version text NOT NULL,
  ratio_ids jsonb NOT NULL CHECK (jsonb_typeof(ratio_ids) = 'array'),
  slot_values jsonb NOT NULL CHECK (jsonb_typeof(slot_values) = 'object'),
  validation jsonb NOT NULL CHECK (jsonb_typeof(validation) = 'object'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, id),
  FOREIGN KEY (template_id, template_version) REFERENCES templates(id, version)
);

CREATE INDEX compositions_campaign_idx ON compositions (campaign_id, created_at DESC);

CREATE TABLE campaign_versions (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, version_number),
  UNIQUE (campaign_id, id)
);

CREATE INDEX campaign_versions_campaign_idx ON campaign_versions (campaign_id, version_number DESC);

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_selected_copy_fk FOREIGN KEY (id, selected_copy_id) REFERENCES copy_sets(campaign_id, id),
  ADD CONSTRAINT campaigns_selected_direction_fk FOREIGN KEY (id, selected_direction_id) REFERENCES visual_directions(campaign_id, id),
  ADD CONSTRAINT campaigns_composition_fk FOREIGN KEY (id, composition_id) REFERENCES compositions(campaign_id, id),
  ADD CONSTRAINT campaigns_open_version_fk FOREIGN KEY (id, open_version_id)
    REFERENCES campaign_versions(campaign_id, id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE assets
  ADD CONSTRAINT assets_version_fk FOREIGN KEY (campaign_id, version_id)
    REFERENCES campaign_versions(campaign_id, id);

CREATE UNIQUE INDEX campaigns_open_version_idx ON campaigns (open_version_id) WHERE open_version_id IS NOT NULL;

CREATE TABLE review_events (
  id text PRIMARY KEY,
  campaign_id text NOT NULL,
  version_id text NOT NULL,
  actor_id text NOT NULL REFERENCES users(id),
  actor_role text NOT NULL CHECK (actor_role IN ('marketer', 'designer', 'admin')),
  event_type text NOT NULL CHECK (event_type IN ('sent', 'changes_requested', 'ready', 'rejected', 'approved', 'delivered')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (campaign_id, version_id) REFERENCES campaign_versions(campaign_id, id)
);

CREATE INDEX review_events_version_idx ON review_events (version_id, created_at);
CREATE INDEX review_events_campaign_idx ON review_events (campaign_id, created_at DESC);

CREATE TABLE deliveries (
  id text PRIMARY KEY,
  campaign_id text NOT NULL,
  version_id text NOT NULL UNIQUE,
  asset_id text NOT NULL UNIQUE REFERENCES assets(id),
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (campaign_id, version_id) REFERENCES campaign_versions(campaign_id, id),
  FOREIGN KEY (campaign_id, asset_id) REFERENCES assets(campaign_id, id)
);

CREATE INDEX deliveries_campaign_idx ON deliveries (campaign_id, created_at DESC);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  actor_id text NOT NULL REFERENCES users(id),
  actor_role text NOT NULL CHECK (actor_role IN ('marketer', 'designer', 'admin')),
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  entity_type text NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  before_status text CHECK (before_status IS NULL OR before_status IN (
    'draft', 'copy_ready', 'direction_selected', 'composed', 'in_review',
    'changes_requested', 'ready', 'approved', 'delivered'
  )),
  after_status text CHECK (after_status IS NULL OR after_status IN (
    'draft', 'copy_ready', 'direction_selected', 'composed', 'in_review',
    'changes_requested', 'ready', 'approved', 'delivered'
  )),
  version_id text REFERENCES campaign_versions(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_id, created_at DESC);

CREATE TABLE idempotency_records (
  actor_id text NOT NULL REFERENCES users(id),
  method text NOT NULL CHECK (method = upper(method) AND length(method) > 0),
  resource_id text NOT NULL,
  key text NOT NULL CHECK (length(key) > 0),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'in_progress' CHECK (state IN ('in_progress', 'completed')),
  owner_token text NOT NULL CHECK (length(owner_token) > 0),
  response_status integer CHECK (response_status BETWEEN 100 AND 599),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (actor_id, method, resource_id, key),
  CHECK (
    (state = 'in_progress' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (state = 'completed' AND response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idempotency_records_in_progress_idx
  ON idempotency_records (created_at)
  WHERE state = 'in_progress';

CREATE TABLE orphaned_uploads (
  id text PRIMARY KEY,
  object_key text NOT NULL UNIQUE CHECK (length(btrim(object_key)) > 0),
  campaign_id text REFERENCES campaigns(id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cleaned', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  cleaned_at timestamptz,
  CHECK ((status = 'cleaned') = (cleaned_at IS NOT NULL))
);

CREATE INDEX orphaned_uploads_pending_idx ON orphaned_uploads (created_at) WHERE status <> 'cleaned';

CREATE FUNCTION reject_append_only_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER campaign_versions_append_only
  BEFORE UPDATE OR DELETE ON campaign_versions
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE TRIGGER review_events_append_only
  BEFORE UPDATE OR DELETE ON review_events
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE TRIGGER templates_append_only
  BEFORE UPDATE OR DELETE ON templates
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();
