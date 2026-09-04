LOCK TABLE campaigns, campaign_versions, campaign_version_source_assets, assets,
  review_events, audit_events IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE review_events ADD COLUMN immutable_asset_hashes text[];
ALTER TABLE audit_events ADD COLUMN transaction_id xid8;

ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only;
UPDATE audit_events SET transaction_id = xmin::text::xid8;
ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only;

CREATE FUNCTION bind_audit_event_transaction() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.transaction_id := pg_current_xact_id();
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_events_bind_transaction
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION bind_audit_event_transaction();

ALTER TABLE audit_events
  ALTER COLUMN transaction_id SET DEFAULT pg_current_xact_id(),
  ALTER COLUMN transaction_id SET NOT NULL;

INSERT INTO audit_events
  (id, actor_id, actor_role, action, entity_type, entity_id, before_status,
   after_status, version_id, payload, created_at)
SELECT 'migration-017-review-hashes:' || event.id,
       event.actor_id,
       event.actor_role,
       'migration.review_asset_hash_fact_extracted',
       'campaign',
       event.campaign_id,
       NULL,
       NULL,
       event.version_id,
       jsonb_build_object(
         'reviewEventId', event.id,
         'eventType', event.event_type,
         'assetHashes', to_jsonb(canonical_review_asset_hashes(event.version_id, true)),
         'removedPayloadField', event.payload ? 'assetHashes'
       ),
       now()
FROM review_events event
WHERE event.event_type IN ('ready', 'approved');

ALTER TABLE review_events DISABLE TRIGGER review_events_append_only;
UPDATE review_events
SET immutable_asset_hashes = CASE event_type
      WHEN 'sent' THEN canonical_review_asset_hashes(version_id, false)
      WHEN 'ready' THEN canonical_review_asset_hashes(version_id, true)
      WHEN 'approved' THEN canonical_review_asset_hashes(version_id, true)
      ELSE ARRAY[]::text[]
    END,
    payload = CASE
      WHEN event_type IN ('ready', 'approved') THEN payload - 'assetHashes'
      ELSE payload
    END;
ALTER TABLE review_events ENABLE TRIGGER review_events_append_only;

CREATE FUNCTION immutable_review_hash_array_is_valid(hash_values text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT hash_values IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM unnest(hash_values) item(hash) WHERE hash !~ '^[a-f0-9]{64}$')
    AND hash_values = ARRAY(SELECT DISTINCT hash FROM unnest(hash_values) item(hash) ORDER BY hash);
$$;

ALTER TABLE review_events
  ALTER COLUMN immutable_asset_hashes SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN immutable_asset_hashes SET NOT NULL,
  ADD CONSTRAINT review_events_immutable_asset_hashes_check
    CHECK (immutable_review_hash_array_is_valid(immutable_asset_hashes));

CREATE OR REPLACE FUNCTION validate_review_event_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  campaign_row campaigns%ROWTYPE;
  version_row campaign_versions%ROWTYPE;
  stored_actor_role text;
  stored_disabled_at timestamptz;
  prior_types text[];
  ready_actor_id text;
  ready_content_hash text;
  expected_review_hashes text[];
  expected_version_hashes text[];
BEGIN
  SELECT * INTO version_row FROM campaign_versions WHERE id = NEW.version_id;
  IF NOT FOUND OR version_row.campaign_id <> NEW.campaign_id THEN
    RAISE EXCEPTION 'review event version identity is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT role, disabled_at INTO stored_actor_role, stored_disabled_at FROM users WHERE id = NEW.actor_id;
  IF NOT FOUND OR stored_disabled_at IS NOT NULL OR stored_actor_role <> NEW.actor_role THEN
    RAISE EXCEPTION 'review event actor role is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO campaign_row FROM campaigns
  WHERE id = NEW.campaign_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review event campaign is invalid' USING ERRCODE = '23514';
  END IF;

  expected_review_hashes := canonical_review_asset_hashes(NEW.version_id, false);
  expected_version_hashes := canonical_review_asset_hashes(NEW.version_id, true);
  NEW.immutable_asset_hashes := ARRAY[]::text[];

  IF NEW.event_type = 'sent' THEN
    IF NEW.actor_role NOT IN ('marketer', 'admin')
       OR EXISTS (SELECT 1 FROM review_events WHERE version_id = NEW.version_id)
       OR NOT version_review_asset_set_is_valid(NEW.version_id)
       OR NOT (
         (campaign_row.status = 'in_review'
           AND campaign_row.current_version_number = version_row.version_number
           AND campaign_row.open_version_id = version_row.id)
         OR
         (campaign_row.status = 'composed'
           AND campaign_row.current_version_number + 1 = version_row.version_number
           AND campaign_row.open_version_id IS NULL)
       )
       OR jsonb_typeof(NEW.payload) <> 'object'
       OR NEW.payload <> jsonb_build_object(
         'contentHash', NEW.payload->>'contentHash',
         'assetHashes', NEW.payload->'assetHashes'
       )
       OR NEW.payload->>'contentHash' <> version_row.content_hash
       OR NOT review_hash_payload_matches(NEW.payload->'assetHashes', expected_review_hashes, false) THEN
      RAISE EXCEPTION 'sent payload or campaign binding is invalid' USING ERRCODE = '23514';
    END IF;
    NEW.payload := jsonb_set(NEW.payload, '{assetHashes}', to_jsonb(expected_review_hashes));
    NEW.immutable_asset_hashes := expected_review_hashes;
    RETURN NEW;
  END IF;

  IF campaign_row.current_version_number <> version_row.version_number
     OR (NEW.event_type <> 'delivered' AND campaign_row.open_version_id IS DISTINCT FROM version_row.id)
     OR (NEW.event_type = 'delivered' AND campaign_row.open_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'review command requires the exact current version' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(array_agg(event_type ORDER BY created_at, id), ARRAY[]::text[])
  INTO prior_types FROM review_events WHERE version_id = NEW.version_id;

  CASE NEW.event_type
    WHEN 'changes_requested' THEN
      IF campaign_row.status <> 'in_review' OR NEW.actor_role <> 'designer'
         OR prior_types <> ARRAY['sent']::text[]
         OR NEW.payload <> jsonb_build_object('comment', NEW.payload->>'comment')
         OR jsonb_typeof(NEW.payload->'comment') <> 'string'
         OR NOT review_comment_is_valid(NEW.payload->>'comment') THEN
        RAISE EXCEPTION 'request-changes review event is invalid' USING ERRCODE = '23514';
      END IF;
    WHEN 'ready' THEN
      IF campaign_row.status <> 'in_review' OR NEW.actor_role <> 'designer'
         OR prior_types <> ARRAY['sent']::text[]
         OR NEW.payload - 'assetHashes' <> jsonb_build_object(
           'figmaUrl', NEW.payload->>'figmaUrl',
           'checklistAnswers', NEW.payload->'checklistAnswers',
           'readyActorId', NEW.payload->>'readyActorId',
           'contentHash', NEW.payload->>'contentHash'
         )
         OR NOT is_valid_figma_https_url(NEW.payload->>'figmaUrl')
         OR NEW.payload->'checklistAnswers' <> '{"copyAccuracy":true,"layoutQuality":true,"exportReadiness":true}'::jsonb
         OR NEW.payload->>'readyActorId' <> NEW.actor_id
         OR NEW.payload->>'contentHash' <> version_row.content_hash
         OR (NEW.payload ? 'assetHashes'
           AND NOT review_hash_payload_matches(NEW.payload->'assetHashes', expected_version_hashes, false)) THEN
        RAISE EXCEPTION 'ready review event is invalid' USING ERRCODE = '23514';
      END IF;
      NEW.payload := NEW.payload - 'assetHashes';
      NEW.immutable_asset_hashes := expected_version_hashes;
    WHEN 'rejected' THEN
      IF campaign_row.status <> 'ready' OR NEW.actor_role NOT IN ('marketer', 'admin')
         OR prior_types <> ARRAY['sent', 'ready']::text[]
         OR NEW.payload <> jsonb_build_object('comment', NEW.payload->>'comment')
         OR jsonb_typeof(NEW.payload->'comment') <> 'string'
         OR NOT review_comment_is_valid(NEW.payload->>'comment') THEN
        RAISE EXCEPTION 'rejection review event is invalid' USING ERRCODE = '23514';
      END IF;
    WHEN 'approved' THEN
      IF campaign_row.status <> 'ready' OR NEW.actor_role NOT IN ('marketer', 'admin')
         OR prior_types <> ARRAY['sent', 'ready']::text[] THEN
        RAISE EXCEPTION 'approval review sequence is invalid' USING ERRCODE = '23514';
      END IF;
      SELECT actor_id, payload->>'contentHash'
      INTO ready_actor_id, ready_content_hash
      FROM review_events WHERE version_id = NEW.version_id AND event_type = 'ready';
      IF ready_actor_id = NEW.actor_id
         OR ready_content_hash <> version_row.content_hash
         OR NEW.payload - 'assetHashes' <> jsonb_build_object('contentHash', version_row.content_hash)
         OR (NEW.payload ? 'assetHashes'
           AND NOT review_hash_payload_matches(NEW.payload->'assetHashes', expected_version_hashes, false)) THEN
        RAISE EXCEPTION 'approval identity, content, or assets are invalid' USING ERRCODE = '23514';
      END IF;
      NEW.payload := NEW.payload - 'assetHashes';
      NEW.immutable_asset_hashes := expected_version_hashes;
    WHEN 'delivered' THEN
      IF campaign_row.status <> 'approved' OR NEW.actor_role NOT IN ('marketer', 'admin')
         OR prior_types <> ARRAY['sent', 'ready', 'approved']::text[]
         OR NEW.payload->>'contentHash' <> version_row.content_hash
         OR jsonb_typeof(NEW.payload->'assetHashes') <> 'array'
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(NEW.payload->'assetHashes') item(value)
           WHERE item.value IS NULL OR item.value !~ '^[a-f0-9]{64}$'
         ) THEN
        RAISE EXCEPTION 'delivery review event is invalid' USING ERRCODE = '23514';
      END IF;
      SELECT COALESCE(array_agg(DISTINCT item.value ORDER BY item.value), ARRAY[]::text[])
      INTO NEW.immutable_asset_hashes
      FROM jsonb_array_elements_text(NEW.payload->'assetHashes') item(value);
    ELSE
      RAISE EXCEPTION 'review event type is not command-safe' USING ERRCODE = '23514';
  END CASE;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_campaign_review_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  version_row campaign_versions%ROWTYPE;
  event_row review_events%ROWTYPE;
  expected_action text;
  audit_found boolean;
BEGIN
  IF OLD.status = NEW.status THEN
    IF OLD.status IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
       AND (NEW.current_version_number IS DISTINCT FROM OLD.current_version_number
         OR NEW.open_version_id IS DISTINCT FROM OLD.open_version_id) THEN
      RAISE EXCEPTION 'active review identity is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
     AND NEW.status NOT IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered') THEN
    RETURN NEW;
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'review transition must advance revision exactly once' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO version_row FROM campaign_versions
  WHERE campaign_id = NEW.id AND version_number = NEW.current_version_number;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review transition version is missing' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'composed' AND NEW.status = 'in_review'
     AND NEW.current_version_number = OLD.current_version_number + 1
     AND NEW.open_version_id = version_row.id THEN
    expected_action := 'campaign.sent_for_review';
    SELECT * INTO event_row FROM review_events WHERE version_id = version_row.id AND event_type = 'sent';
  ELSIF OLD.status = 'in_review' AND NEW.status = 'changes_requested'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id = version_row.id AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.request_changes';
    SELECT * INTO event_row FROM review_events WHERE version_id = version_row.id AND event_type = 'changes_requested';
  ELSIF OLD.status = 'in_review' AND NEW.status = 'ready'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id = version_row.id AND NEW.open_version_id = version_row.id THEN
    expected_action := 'campaign.mark_ready';
    SELECT * INTO event_row FROM review_events WHERE version_id = version_row.id AND event_type = 'ready';
  ELSIF OLD.status = 'ready' AND NEW.status = 'changes_requested'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id = version_row.id AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.reject';
    SELECT * INTO event_row FROM review_events WHERE version_id = version_row.id AND event_type = 'rejected';
  ELSIF OLD.status = 'ready' AND NEW.status = 'approved'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id = version_row.id AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.approve';
    SELECT * INTO event_row FROM review_events WHERE version_id = version_row.id AND event_type = 'approved';
  ELSIF OLD.status = 'changes_requested' AND NEW.status = 'composed'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id IS NULL AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.reopened';
  ELSIF OLD.status = 'approved' AND NEW.status = 'delivered'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id IS NULL AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.delivered';
    SELECT * INTO event_row FROM review_events WHERE version_id = version_row.id AND event_type = 'delivered';
  ELSE
    RAISE EXCEPTION 'illegal campaign review transition' USING ERRCODE = '23514';
  END IF;

  IF expected_action = 'campaign.reopened' THEN
    SELECT count(*) = 1 INTO audit_found
    FROM audit_events audit
    JOIN users actor ON actor.id = audit.actor_id
    WHERE audit.action = expected_action
      AND audit.entity_type = 'campaign' AND audit.entity_id = NEW.id
      AND audit.before_status = OLD.status AND audit.after_status = NEW.status
      AND audit.version_id = version_row.id
      AND audit.actor_role IN ('marketer', 'admin')
      AND actor.role = audit.actor_role AND actor.disabled_at IS NULL
      AND audit.payload->>'versionNumber' = version_row.version_number::text
      AND audit.transaction_id = pg_current_xact_id();
  ELSE
    IF event_row.id IS NULL THEN
      RAISE EXCEPTION 'review transition event evidence is missing' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) = 1 INTO audit_found
    FROM audit_events audit
    WHERE audit.entity_type = 'campaign' AND audit.entity_id = NEW.id
      AND audit.before_status = OLD.status AND audit.after_status = NEW.status
      AND audit.version_id = version_row.id
      AND audit.actor_id = event_row.actor_id AND audit.actor_role = event_row.actor_role
      AND (
        (expected_action = 'campaign.delivered' AND audit.action IN ('campaign.delivered', 'campaign.deliver'))
        OR audit.action = expected_action
      )
      AND (
        audit.payload->>'reviewEventId' = event_row.id
        OR (event_row.event_type = 'sent'
          AND audit.payload->>'versionNumber' = version_row.version_number::text
          AND audit.payload->>'contentHash' = version_row.content_hash)
      )
      AND audit.transaction_id = pg_current_xact_id();
  END IF;
  IF NOT audit_found THEN
    RAISE EXCEPTION 'current-transaction review audit evidence is missing' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM review_events event
    WHERE (event.event_type = 'sent' AND event.immutable_asset_hashes
      <> canonical_review_asset_hashes(event.version_id, false))
      OR (event.event_type IN ('ready', 'approved') AND event.immutable_asset_hashes
        <> canonical_review_asset_hashes(event.version_id, true))
      OR (event.event_type NOT IN ('sent', 'ready', 'approved')
        AND event.immutable_asset_hashes <> ARRAY[]::text[])
      OR (event.event_type IN ('ready', 'approved') AND event.payload ? 'assetHashes')
  ) THEN
    RAISE EXCEPTION 'review event immutable hash backfill is invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_events WHERE transaction_id IS NULL) THEN
    RAISE EXCEPTION 'audit transaction binding backfill is invalid' USING ERRCODE = '23514';
  END IF;
END;
$$;
