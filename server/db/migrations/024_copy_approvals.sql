ALTER TABLE copy_sets ADD COLUMN approved_candidate_ids jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(approved_candidate_ids) = 'array');

-- Backfill editable campaigns only. Review-locked artifacts remain immutable;
-- the workspace projection includes their existing selection as an approval.
UPDATE copy_sets AS copies
SET approved_candidate_ids = jsonb_build_array(copies.selected_candidate_id)
FROM campaigns
WHERE campaigns.selected_copy_id = copies.id
  AND campaigns.status IN ('draft', 'copy_ready', 'direction_selected', 'composed')
  AND copies.stale = false AND copies.selected_candidate_id IS NOT NULL
  AND NOT (copies.deleted_candidate_ids ? copies.selected_candidate_id);
