LOCK TABLE campaigns, campaign_versions, campaign_version_source_assets, assets,
  copy_sets, visual_directions, compositions, review_events, audit_events
  IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION canonical_review_asset_hashes(target_version_id text, include_sources boolean)
RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT source.sha256 ORDER BY source.sha256), ARRAY[]::text[])
  FROM (
    SELECT association.asset_sha256 AS sha256
    FROM campaign_version_source_assets association
    WHERE include_sources AND association.version_id = target_version_id
    UNION ALL
    SELECT asset.sha256
    FROM assets asset
    WHERE asset.version_id = target_version_id
      AND asset.kind IN ('review_png', 'manifest')
  ) source;
$$;

CREATE FUNCTION review_hash_payload_matches(
  payload_hashes jsonb,
  expected_hashes text[],
  require_canonical boolean
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  actual_hashes text[];
BEGIN
  IF jsonb_typeof(payload_hashes) <> 'array' THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(payload_hashes) item(value)
    WHERE item.value IS NULL OR item.value !~ '^[a-f0-9]{64}$'
  ) THEN
    RETURN false;
  END IF;
  SELECT COALESCE(array_agg(DISTINCT item.value ORDER BY item.value), ARRAY[]::text[])
  INTO actual_hashes
  FROM jsonb_array_elements_text(payload_hashes) item(value);
  RETURN actual_hashes = expected_hashes
    AND (NOT require_canonical OR payload_hashes = to_jsonb(expected_hashes));
END;
$$;

CREATE FUNCTION version_review_asset_set_is_valid(target_version_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  WITH version AS (
    SELECT id, campaign_id, snapshot FROM campaign_versions WHERE id = target_version_id
  ), snapshot_refs AS (
    SELECT reference->>'id' AS id, reference->>'kind' AS kind, reference->>'sha256' AS sha256
    FROM version
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(version.snapshot->'assets') = 'array'
        THEN version.snapshot->'assets' ELSE '[]'::jsonb END
    ) reference
    WHERE reference->>'kind' IN ('review_png', 'manifest')
  ), stored_assets AS (
    SELECT asset.id, asset.kind, asset.sha256
    FROM assets asset
    JOIN version ON version.id = asset.version_id AND version.campaign_id = asset.campaign_id
    WHERE asset.kind IN ('review_png', 'manifest')
  )
  SELECT EXISTS (SELECT 1 FROM version)
    AND (SELECT count(*) FROM snapshot_refs WHERE kind = 'review_png') >= 1
    AND (SELECT count(*) FROM snapshot_refs WHERE kind = 'manifest') = 1
    AND NOT EXISTS (
      SELECT 1 FROM snapshot_refs GROUP BY id HAVING count(*) <> 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM snapshot_refs reference
      FULL JOIN stored_assets asset
        ON asset.id = reference.id AND asset.kind = reference.kind AND asset.sha256 = reference.sha256
      WHERE reference.id IS NULL OR asset.id IS NULL
        OR reference.sha256 IS NULL OR reference.sha256 !~ '^[a-f0-9]{64}$'
    );
$$;

CREATE FUNCTION trim_review_whitespace(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT btrim(
    value,
    E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
  );
$$;

CREATE FUNCTION review_comment_is_valid(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL
    AND value = trim_review_whitespace(value)
    AND length(trim_review_whitespace(value)) BETWEEN 1 AND 2000;
$$;

CREATE FUNCTION is_valid_figma_https_url(value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  authority text;
  hostname text;
  label text;
BEGIN
  IF value IS NULL OR length(value) > 2000 THEN RETURN false; END IF;
  authority := substring(value from '(?i)^https://([^/?#]+)');
  IF authority IS NULL OR authority !~ '^[ -~]+$' OR position('@' in authority) > 0 THEN RETURN false; END IF;
  IF authority ~* ':443$' THEN
    hostname := left(authority, length(authority) - 4);
  ELSE
    hostname := authority;
  END IF;
  hostname := lower(hostname);
  IF position(':' in hostname) > 0 OR length(hostname) > 253
     OR (hostname <> 'figma.com' AND right(hostname, 10) <> '.figma.com') THEN
    RETURN false;
  END IF;
  FOREACH label IN ARRAY string_to_array(hostname, '.') LOOP
    IF label !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

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
      NEW.payload := jsonb_set(NEW.payload, '{assetHashes}', to_jsonb(expected_version_hashes), true);
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
      NEW.payload := jsonb_set(NEW.payload, '{assetHashes}', to_jsonb(expected_version_hashes), true);
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
    ELSE
      RAISE EXCEPTION 'review event type is not command-safe' USING ERRCODE = '23514';
  END CASE;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_composition_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  campaign_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'compositions are append-only' USING ERRCODE = '55000';
  END IF;
  SELECT status INTO campaign_status FROM campaigns WHERE id = OLD.campaign_id;
  IF campaign_status IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
     AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'campaign composition is review-locked' USING ERRCODE = '23514';
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

CREATE FUNCTION protect_review_locked_artifact() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  campaign_status text;
BEGIN
  SELECT status INTO campaign_status FROM campaigns WHERE id = OLD.campaign_id;
  IF campaign_status IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered') THEN
    RAISE EXCEPTION 'campaign artifact is review-locked' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER copy_sets_review_lock
  BEFORE UPDATE OR DELETE ON copy_sets
  FOR EACH ROW EXECUTE FUNCTION protect_review_locked_artifact();

CREATE TRIGGER visual_directions_review_lock
  BEFORE UPDATE OR DELETE ON visual_directions
  FOR EACH ROW EXECUTE FUNCTION protect_review_locked_artifact();

CREATE FUNCTION protect_review_locked_campaign_content() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered') THEN
    IF NEW.brief IS DISTINCT FROM OLD.brief
       OR NEW.selected_copy_id IS DISTINCT FROM OLD.selected_copy_id
       OR NEW.selected_direction_id IS DISTINCT FROM OLD.selected_direction_id
       OR NEW.composition_id IS DISTINCT FROM OLD.composition_id
       OR NEW.current_version_number IS DISTINCT FROM OLD.current_version_number
       OR (NEW.status = OLD.status AND NEW.open_version_id IS DISTINCT FROM OLD.open_version_id) THEN
      RAISE EXCEPTION 'campaign content is review-locked' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
     AND OLD.status NOT IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered') THEN
    IF OLD.status <> 'composed' OR NEW.status <> 'in_review'
       OR NEW.brief IS DISTINCT FROM OLD.brief
       OR NEW.selected_copy_id IS DISTINCT FROM OLD.selected_copy_id
       OR NEW.selected_direction_id IS DISTINCT FROM OLD.selected_direction_id
       OR NEW.composition_id IS DISTINCT FROM OLD.composition_id
       OR NEW.current_version_number <> OLD.current_version_number + 1
       OR NEW.open_version_id IS NULL THEN
      RAISE EXCEPTION 'campaign cannot enter review through a generic state update' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER campaigns_review_content_lock
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION protect_review_locked_campaign_content();

CREATE FUNCTION enforce_campaign_review_transition() RETURNS trigger
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
    SELECT * INTO event_row FROM review_events
    WHERE version_id = version_row.id AND event_type = 'sent';
  ELSIF OLD.status = 'in_review' AND NEW.status = 'changes_requested'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id = version_row.id AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.request_changes';
    SELECT * INTO event_row FROM review_events
    WHERE version_id = version_row.id AND event_type = 'changes_requested';
  ELSIF OLD.status = 'in_review' AND NEW.status = 'ready'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id = version_row.id AND NEW.open_version_id = version_row.id THEN
    expected_action := 'campaign.mark_ready';
    SELECT * INTO event_row FROM review_events
    WHERE version_id = version_row.id AND event_type = 'ready';
  ELSIF OLD.status = 'ready' AND NEW.status = 'changes_requested'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id = version_row.id AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.reject';
    SELECT * INTO event_row FROM review_events
    WHERE version_id = version_row.id AND event_type = 'rejected';
  ELSIF OLD.status = 'ready' AND NEW.status = 'approved'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id = version_row.id AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.approve';
    SELECT * INTO event_row FROM review_events
    WHERE version_id = version_row.id AND event_type = 'approved';
  ELSIF OLD.status = 'changes_requested' AND NEW.status = 'composed'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id IS NULL AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.reopened';
  ELSIF OLD.status = 'approved' AND NEW.status = 'delivered'
     AND NEW.current_version_number = OLD.current_version_number
     AND OLD.open_version_id IS NULL AND NEW.open_version_id IS NULL THEN
    expected_action := 'campaign.delivered';
    SELECT * INTO event_row FROM review_events
    WHERE version_id = version_row.id AND event_type = 'delivered';
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
        AND audit.payload->>'versionNumber' = version_row.version_number::text;
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
        );
  END IF;
  IF NOT audit_found THEN
    RAISE EXCEPTION 'review transition audit evidence is missing' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER campaigns_review_transition
  AFTER UPDATE ON campaigns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_campaign_review_transition();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM review_events event
    WHERE event.event_type = 'sent'
      AND (
        NOT version_review_asset_set_is_valid(event.version_id)
        OR event.payload->>'contentHash' IS DISTINCT FROM (
          SELECT content_hash FROM campaign_versions WHERE id = event.version_id
        )
        OR NOT review_hash_payload_matches(
          event.payload->'assetHashes', canonical_review_asset_hashes(event.version_id, false), false
        )
      )
  ) THEN
    RAISE EXCEPTION 'historical sent review assets are invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM review_events event
    WHERE event.event_type IN ('ready', 'approved')
      AND event.payload ? 'assetHashes'
      AND NOT review_hash_payload_matches(
        event.payload->'assetHashes', canonical_review_asset_hashes(event.version_id, true), false
      )
  ) THEN
    RAISE EXCEPTION 'historical ready or approval assets are invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM review_events event
    WHERE (event.event_type = 'ready' AND NOT is_valid_figma_https_url(event.payload->>'figmaUrl'))
       OR (event.event_type IN ('changes_requested', 'rejected')
         AND NOT review_comment_is_valid(event.payload->>'comment'))
  ) THEN
    RAISE EXCEPTION 'historical review text or Figma URL is invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM review_events event
    JOIN campaign_versions version ON version.id = event.version_id
    WHERE (
      SELECT count(*)
      FROM audit_events audit
      WHERE audit.entity_type = 'campaign' AND audit.entity_id = event.campaign_id
        AND audit.version_id = event.version_id
        AND audit.actor_id = event.actor_id AND audit.actor_role = event.actor_role
        AND audit.before_status = CASE event.event_type
          WHEN 'sent' THEN 'composed'
          WHEN 'changes_requested' THEN 'in_review'
          WHEN 'ready' THEN 'in_review'
          WHEN 'rejected' THEN 'ready'
          WHEN 'approved' THEN 'ready'
          WHEN 'delivered' THEN 'approved'
        END
        AND audit.after_status = CASE event.event_type
          WHEN 'sent' THEN 'in_review'
          WHEN 'changes_requested' THEN 'changes_requested'
          WHEN 'ready' THEN 'ready'
          WHEN 'rejected' THEN 'changes_requested'
          WHEN 'approved' THEN 'approved'
          WHEN 'delivered' THEN 'delivered'
        END
        AND audit.action = ANY (CASE event.event_type
          WHEN 'sent' THEN ARRAY['campaign.sent_for_review']::text[]
          WHEN 'changes_requested' THEN ARRAY['campaign.request_changes']::text[]
          WHEN 'ready' THEN ARRAY['campaign.mark_ready']::text[]
          WHEN 'rejected' THEN ARRAY['campaign.reject']::text[]
          WHEN 'approved' THEN ARRAY['campaign.approve']::text[]
          WHEN 'delivered' THEN ARRAY['campaign.deliver', 'campaign.delivered']::text[]
        END)
        AND (
          audit.payload->>'reviewEventId' = event.id
          OR (event.event_type = 'sent'
            AND audit.payload->>'versionNumber' = version.version_number::text
            AND audit.payload->>'contentHash' = version.content_hash)
        )
    ) <> 1
  ) THEN
    RAISE EXCEPTION 'historical review audit evidence is invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM campaigns campaign
    WHERE campaign.status IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
      AND NOT campaign_review_state_is_valid(campaign.id)
  ) THEN
    RAISE EXCEPTION 'historical campaign review state is invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM campaigns campaign
    WHERE campaign.status NOT IN ('in_review', 'changes_requested', 'ready', 'approved', 'delivered')
      AND EXISTS (SELECT 1 FROM review_events event WHERE event.campaign_id = campaign.id)
      AND NOT EXISTS (
        SELECT 1 FROM campaign_versions version
        JOIN review_events terminal ON terminal.version_id = version.id
          AND terminal.event_type IN ('changes_requested', 'rejected')
        JOIN audit_events audit ON audit.version_id = version.id
          AND audit.entity_type = 'campaign' AND audit.entity_id = campaign.id
          AND audit.action = 'campaign.reopened'
        WHERE version.campaign_id = campaign.id
          AND version.version_number = campaign.current_version_number
      )
  ) THEN
    RAISE EXCEPTION 'historical review escaped without reopen evidence' USING ERRCODE = '23514';
  END IF;
END;
$$;
