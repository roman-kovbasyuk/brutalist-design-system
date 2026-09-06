ALTER TABLE visual_directions ADD COLUMN upload_provenance jsonb;

ALTER TABLE visual_directions DROP CONSTRAINT visual_directions_prompt_check;
ALTER TABLE visual_directions ADD CONSTRAINT visual_directions_prompt_check CHECK (
  length(btrim(prompt)) > 0 OR
  (generation_job_id IS NULL AND status = 'ready' AND preview_asset_id IS NOT NULL AND upload_provenance IS NOT NULL)
);

-- Pre-provenance direct uploads cannot safely be attributed to a current brief.
-- Preserve the asset/history, but require a new explicit upload before reuse.
UPDATE visual_directions SET stale = true
WHERE generation_job_id IS NULL AND preview_asset_id IS NOT NULL AND upload_provenance IS NULL;
