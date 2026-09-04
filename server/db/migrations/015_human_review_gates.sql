CREATE UNIQUE INDEX review_events_one_changes_request_per_version_idx
  ON review_events (version_id) WHERE event_type = 'changes_requested';
CREATE UNIQUE INDEX review_events_one_ready_per_version_idx
  ON review_events (version_id) WHERE event_type = 'ready';
CREATE UNIQUE INDEX review_events_one_rejection_per_version_idx
  ON review_events (version_id) WHERE event_type = 'rejected';
CREATE UNIQUE INDEX review_events_one_approval_per_version_idx
  ON review_events (version_id) WHERE event_type = 'approved';
CREATE UNIQUE INDEX review_events_one_delivery_per_version_idx
  ON review_events (version_id) WHERE event_type = 'delivered';

CREATE FUNCTION validate_review_event_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  campaign_row campaigns%ROWTYPE;
  version_row campaign_versions%ROWTYPE;
  stored_actor_role text;
  stored_disabled_at timestamptz;
  prior_types text[];
  ready_actor_id text;
  ready_content_hash text;
BEGIN
  SELECT * INTO version_row FROM campaign_versions WHERE id = NEW.version_id;
  IF NOT FOUND OR version_row.campaign_id <> NEW.campaign_id THEN
    RAISE EXCEPTION 'review event version identity is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT role, disabled_at INTO stored_actor_role, stored_disabled_at FROM users WHERE id = NEW.actor_id;
  IF NOT FOUND OR stored_disabled_at IS NOT NULL OR stored_actor_role <> NEW.actor_role THEN
    RAISE EXCEPTION 'review event actor role is invalid' USING ERRCODE = '23514';
  END IF;

  IF NEW.event_type = 'sent' THEN
    IF NEW.actor_role NOT IN ('marketer', 'admin') THEN
      RAISE EXCEPTION 'only a marketer can send a version for review' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM review_events WHERE version_id = NEW.version_id)
       OR jsonb_typeof(NEW.payload) <> 'object'
       OR NEW.payload <> jsonb_build_object(
         'contentHash', NEW.payload->>'contentHash',
         'assetHashes', NEW.payload->'assetHashes'
       )
       OR NEW.payload->>'contentHash' <> version_row.content_hash
       OR jsonb_typeof(NEW.payload->'assetHashes') <> 'array'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(NEW.payload->'assetHashes') AS hash(value)
         WHERE hash.value !~ '^[a-f0-9]{64}$'
       ) THEN
      RAISE EXCEPTION 'sent payload is invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO campaign_row FROM campaigns WHERE id = NEW.campaign_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND
     OR campaign_row.current_version_number <> version_row.version_number
     OR (NEW.event_type <> 'delivered' AND campaign_row.open_version_id IS DISTINCT FROM version_row.id)
     OR (NEW.event_type = 'delivered' AND campaign_row.open_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'review command requires the exact current open version' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(array_agg(event_type ORDER BY created_at, id), ARRAY[]::text[])
  INTO prior_types
  FROM review_events
  WHERE version_id = NEW.version_id;

  CASE NEW.event_type
    WHEN 'changes_requested' THEN
      IF campaign_row.status <> 'in_review' OR NEW.actor_role <> 'designer' OR prior_types <> ARRAY['sent']::text[] THEN
        RAISE EXCEPTION 'request-changes review sequence is invalid' USING ERRCODE = '23514';
      END IF;
      IF jsonb_typeof(NEW.payload) <> 'object'
         OR NEW.payload <> jsonb_build_object('comment', NEW.payload->>'comment')
         OR jsonb_typeof(NEW.payload->'comment') <> 'string'
         OR NEW.payload->>'comment' <> btrim(NEW.payload->>'comment')
         OR length(btrim(NEW.payload->>'comment')) NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION 'request-changes payload is invalid' USING ERRCODE = '23514';
      END IF;
    WHEN 'ready' THEN
      IF campaign_row.status <> 'in_review' OR NEW.actor_role <> 'designer' OR prior_types <> ARRAY['sent']::text[] THEN
        RAISE EXCEPTION 'ready review sequence is invalid' USING ERRCODE = '23514';
      END IF;
      IF jsonb_typeof(NEW.payload) <> 'object'
         OR NEW.payload <> jsonb_build_object(
           'figmaUrl', NEW.payload->>'figmaUrl',
           'checklistAnswers', NEW.payload->'checklistAnswers',
           'readyActorId', NEW.payload->>'readyActorId',
           'contentHash', NEW.payload->>'contentHash'
         )
         OR jsonb_typeof(NEW.payload->'figmaUrl') <> 'string'
         OR length(NEW.payload->>'figmaUrl') > 2000
         OR (NEW.payload->>'figmaUrl') !~* '^https://([a-z0-9-]+\.)*figma\.com(?::443)?(?:[/#?].*)?$'
         OR NEW.payload->'checklistAnswers' <> '{"copyAccuracy":true,"layoutQuality":true,"exportReadiness":true}'::jsonb
         OR NEW.payload->>'readyActorId' <> NEW.actor_id
         OR NEW.payload->>'contentHash' <> version_row.content_hash THEN
        RAISE EXCEPTION 'ready payload is invalid' USING ERRCODE = '23514';
      END IF;
    WHEN 'rejected' THEN
      IF campaign_row.status <> 'ready' OR NEW.actor_role NOT IN ('marketer', 'admin') OR prior_types <> ARRAY['sent', 'ready']::text[] THEN
        RAISE EXCEPTION 'rejection review sequence is invalid' USING ERRCODE = '23514';
      END IF;
      IF jsonb_typeof(NEW.payload) <> 'object'
         OR NEW.payload <> jsonb_build_object('comment', NEW.payload->>'comment')
         OR jsonb_typeof(NEW.payload->'comment') <> 'string'
         OR NEW.payload->>'comment' <> btrim(NEW.payload->>'comment')
         OR length(btrim(NEW.payload->>'comment')) NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION 'rejection payload is invalid' USING ERRCODE = '23514';
      END IF;
    WHEN 'approved' THEN
      IF campaign_row.status <> 'ready' OR NEW.actor_role NOT IN ('marketer', 'admin') OR prior_types <> ARRAY['sent', 'ready']::text[] THEN
        RAISE EXCEPTION 'approval review sequence is invalid' USING ERRCODE = '23514';
      END IF;
      SELECT actor_id, payload->>'contentHash'
      INTO ready_actor_id, ready_content_hash
      FROM review_events
      WHERE version_id = NEW.version_id AND event_type = 'ready';
      IF ready_actor_id = NEW.actor_id
         OR ready_content_hash <> version_row.content_hash
         OR NEW.payload <> jsonb_build_object('contentHash', version_row.content_hash) THEN
        RAISE EXCEPTION 'approval identity or content hash is invalid' USING ERRCODE = '23514';
      END IF;
    WHEN 'delivered' THEN
      IF campaign_row.status <> 'approved' OR NEW.actor_role NOT IN ('marketer', 'admin') OR prior_types <> ARRAY['sent', 'ready', 'approved']::text[] THEN
        RAISE EXCEPTION 'delivery review sequence is invalid' USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'review event type is not command-safe' USING ERRCODE = '23514';
  END CASE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER review_events_validate_insert
  BEFORE INSERT ON review_events
  FOR EACH ROW EXECUTE FUNCTION validate_review_event_insert();

CREATE FUNCTION campaign_review_state_is_valid(target_campaign_id text) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  campaign_row campaigns%ROWTYPE;
  version_row campaign_versions%ROWTYPE;
  event_types text[];
BEGIN
  SELECT * INTO campaign_row FROM campaigns WHERE id = target_campaign_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF campaign_row.status NOT IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered') THEN
    RETURN true;
  END IF;
  SELECT * INTO version_row
  FROM campaign_versions
  WHERE campaign_id = campaign_row.id AND version_number = campaign_row.current_version_number;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT COALESCE(array_agg(event_type ORDER BY created_at, id), ARRAY[]::text[])
  INTO event_types FROM review_events WHERE version_id = version_row.id;

  RETURN CASE campaign_row.status
    WHEN 'in_review' THEN campaign_row.open_version_id = version_row.id AND event_types = ARRAY['sent']::text[]
    WHEN 'ready' THEN campaign_row.open_version_id = version_row.id AND event_types = ARRAY['sent', 'ready']::text[]
    WHEN 'changes_requested' THEN campaign_row.open_version_id IS NULL AND event_types IN (
      ARRAY['sent', 'changes_requested']::text[], ARRAY['sent', 'ready', 'rejected']::text[]
    )
    WHEN 'approved' THEN campaign_row.open_version_id IS NULL AND event_types = ARRAY['sent', 'ready', 'approved']::text[]
    WHEN 'delivered' THEN campaign_row.open_version_id IS NULL AND event_types = ARRAY['sent', 'ready', 'approved', 'delivered']::text[]
    ELSE false
  END;
END;
$$;

CREATE FUNCTION enforce_campaign_review_state() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_id text;
BEGIN
  target_id := COALESCE(to_jsonb(NEW)->>'campaign_id', to_jsonb(NEW)->>'id');
  IF NOT campaign_review_state_is_valid(target_id) THEN
    RAISE EXCEPTION 'campaign status does not match append-only review history' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_review_event_campaign_state() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  campaign_status text;
BEGIN
  SELECT status INTO campaign_status FROM campaigns WHERE id = NEW.campaign_id;
  IF campaign_status NOT IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
     OR NOT campaign_review_state_is_valid(NEW.campaign_id) THEN
    RAISE EXCEPTION 'review event was not committed with campaign state' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER review_events_campaign_state
  AFTER INSERT ON review_events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_review_event_campaign_state();

CREATE CONSTRAINT TRIGGER campaigns_review_state
  AFTER INSERT OR UPDATE OF status, current_version_number, open_version_id ON campaigns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_campaign_review_state();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM campaigns
    WHERE status IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
      AND NOT campaign_review_state_is_valid(id)
  ) THEN
    RAISE EXCEPTION 'historical campaign review state is invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM review_events e
    JOIN campaigns c ON c.id = e.campaign_id
    WHERE c.status NOT IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
  ) THEN
    RAISE EXCEPTION 'historical review event has no campaign review state' USING ERRCODE = '23514';
  END IF;
END;
$$;
