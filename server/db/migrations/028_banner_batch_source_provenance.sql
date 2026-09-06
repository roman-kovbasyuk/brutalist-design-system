-- Supplement 012's exact snapshot/association set with every batch design's
-- required source. Published migration 027 and legacy version shapes stay intact.
LOCK TABLE campaign_versions IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION assert_banner_batch_source_snapshot(version_snapshot jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  design jsonb;
  selection jsonb;
  image_slot jsonb;
  preview_id text;
  source_ref jsonb;
  source_count integer;
  design_index integer;
BEGIN
  IF version_snapshot->'designs' IS NULL AND version_snapshot #> '{composition,designs}' IS NULL THEN
    RETURN;
  END IF;
  IF jsonb_typeof(version_snapshot->'designs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(version_snapshot #> '{composition,designs}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'batch designs require complete immutable snapshots' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(version_snapshot->'designs') = 0
    OR jsonb_array_length(version_snapshot->'designs') <> jsonb_array_length(version_snapshot #> '{composition,designs}') THEN
    RAISE EXCEPTION 'batch designs require complete immutable snapshots' USING ERRCODE = '23514';
  END IF;
  FOR design, design_index IN
    SELECT value, (ordinality - 1)::integer FROM jsonb_array_elements(version_snapshot->'designs') WITH ORDINALITY
  LOOP
    selection := version_snapshot #> ARRAY['composition', 'designs', design_index::text];
    preview_id := design #>> '{selectedDirection,previewAssetId}';
    IF design->>'id' IS NULL OR design->>'id' IS DISTINCT FROM selection->>'id'
      OR design #>> '{selectedDirection,id}' IS DISTINCT FROM selection->>'directionId'
      OR design #>> '{selectedCopy,id}' IS DISTINCT FROM selection->>'copyId'
      OR preview_id IS NULL OR preview_id = '' THEN
      RAISE EXCEPTION 'batch design source identity is invalid' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO source_count
    FROM jsonb_array_elements(COALESCE(version_snapshot->'assets', '[]'::jsonb)) item
    WHERE item->>'id' = preview_id;
    SELECT item INTO source_ref
    FROM jsonb_array_elements(COALESCE(version_snapshot->'assets', '[]'::jsonb)) item
    WHERE item->>'id' = preview_id LIMIT 1;
    IF source_count <> 1 OR COALESCE(source_ref->>'kind', '') NOT IN ('direction', 'final_image')
      OR source_ref->>'sha256' IS NULL OR source_ref->>'sha256' !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'every batch preview requires exact immutable source provenance' USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(design #> '{templateManifest,slots}') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'batch design image slots are unavailable' USING ERRCODE = '23514';
    END IF;
    FOR image_slot IN SELECT value FROM jsonb_array_elements(design #> '{templateManifest,slots}') WHERE value->>'type' = 'image'
    LOOP
      IF (image_slot->>'required' = 'true' OR COALESCE(selection #>> ARRAY['slotValues', image_slot->>'id'], '') <> '')
        AND selection #>> ARRAY['slotValues', image_slot->>'id'] IS DISTINCT FROM preview_id THEN
        RAISE EXCEPTION 'batch image slot must match its direction preview' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Existing versions are immutable: fail closed if batch source coverage cannot
-- be verified, rather than silently rewriting a reviewed snapshot.
DO $$
DECLARE version_snapshot jsonb;
BEGIN
  FOR version_snapshot IN SELECT snapshot FROM campaign_versions
  LOOP
    PERFORM assert_banner_batch_source_snapshot(version_snapshot);
  END LOOP;
END;
$$;

CREATE FUNCTION enforce_banner_batch_source_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE design jsonb;
BEGIN
  PERFORM assert_banner_batch_source_snapshot(NEW.snapshot);
  IF jsonb_typeof(NEW.snapshot->'designs') = 'array' THEN
    FOR design IN SELECT value FROM jsonb_array_elements(NEW.snapshot->'designs')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM visual_directions direction
        WHERE direction.campaign_id = NEW.campaign_id
          AND direction.id = design #>> '{selectedDirection,id}'
          AND direction.preview_asset_id = design #>> '{selectedDirection,previewAssetId}'
      ) THEN
        RAISE EXCEPTION 'batch preview must match its campaign direction' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER campaign_versions_banner_sources
  AFTER INSERT ON campaign_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_banner_batch_source_snapshot();
