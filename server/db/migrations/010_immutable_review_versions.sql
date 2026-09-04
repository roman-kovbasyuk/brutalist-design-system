CREATE TABLE review_version_builds (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  actor_id text NOT NULL REFERENCES users(id),
  method text NOT NULL DEFAULT 'POST' CHECK (method = 'POST'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) > 0),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  owner_token text NOT NULL CHECK (length(owner_token) > 0),
  state text NOT NULL DEFAULT 'in_progress' CHECK (state IN ('in_progress', 'failed', 'completed')),
  version_id text NOT NULL UNIQUE,
  version_number integer NOT NULL CHECK (version_number > 0),
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (actor_id, method, campaign_id, idempotency_key),
  CHECK ((state = 'completed') = (completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX review_version_builds_open_campaign_idx
  ON review_version_builds (campaign_id)
  WHERE state = 'in_progress';

CREATE FUNCTION protect_composition_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'compositions are append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.template_version IS DISTINCT FROM OLD.template_version
     OR NEW.ratio_ids IS DISTINCT FROM OLD.ratio_ids
     OR NEW.slot_values IS DISTINCT FROM OLD.slot_values
     OR NEW.validation IS DISTINCT FROM OLD.validation
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.stale AND NOT NEW.stale) THEN
    RAISE EXCEPTION 'composition content is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER compositions_protect_history
  BEFORE UPDATE OR DELETE ON compositions
  FOR EACH ROW EXECUTE FUNCTION protect_composition_history();

CREATE FUNCTION protect_committed_asset_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.version_id IS NOT NULL THEN
    RAISE EXCEPTION 'version assets are append-only' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER assets_protect_committed_history
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION protect_committed_asset_history();

ALTER TABLE assets
  ADD CONSTRAINT assets_render_shape_check CHECK (
    integrity_version = 0
    OR source <> 'render'
    OR (
      generation_job_id IS NULL
      AND version_id IS NOT NULL
      AND (
        (kind = 'review_png' AND mime_type = 'image/png' AND width IS NOT NULL AND height IS NOT NULL)
        OR
        (kind = 'manifest' AND mime_type = 'application/json' AND width IS NULL AND height IS NULL)
      )
    )
  ) NOT VALID;

CREATE UNIQUE INDEX review_events_one_sent_per_version_idx
  ON review_events (version_id)
  WHERE event_type = 'sent';
