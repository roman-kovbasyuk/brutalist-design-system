ALTER TABLE assets
  ADD CONSTRAINT assets_generated_shape_check CHECK (
    source <> 'generation'
    OR (
      generation_job_id IS NOT NULL
      AND version_id IS NULL
      AND kind IN ('direction', 'final_image')
      AND width IS NOT NULL
      AND height IS NOT NULL
    )
  );

CREATE UNIQUE INDEX assets_generation_job_unique_idx
  ON assets (generation_job_id)
  WHERE source = 'generation';
