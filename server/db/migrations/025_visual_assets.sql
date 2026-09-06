ALTER TABLE visual_directions
  ADD COLUMN scope text NOT NULL DEFAULT 'legacy' CHECK (scope IN ('legacy', 'campaign', 'selected_copy')),
  ADD COLUMN copy_snapshot jsonb,
  ADD COLUMN batch_id text,
  ADD COLUMN batch_position integer NOT NULL DEFAULT 0 CHECK (batch_position >= 0),
  ADD CONSTRAINT visual_copy_link_check CHECK (
    (scope = 'selected_copy' AND jsonb_typeof(copy_snapshot) = 'object' AND copy_snapshot->>'id' IS NOT NULL)
    OR (scope <> 'selected_copy' AND copy_snapshot IS NULL)
  );

CREATE INDEX generation_image_direction_idx ON generation_jobs (campaign_id, (input_snapshot->'direction'->>'id'), created_at DESC)
  WHERE step = 'image';
