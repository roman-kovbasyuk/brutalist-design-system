ALTER TABLE settings
  DROP CONSTRAINT settings_daily_budget_microunits_check,
  ADD CONSTRAINT settings_daily_budget_microunits_safe_check
    CHECK (daily_budget_microunits BETWEEN 0 AND 9007199254740991);

ALTER TABLE templates
  ADD COLUMN publication_sequence bigint GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE;

DROP INDEX templates_created_at_idx;

CREATE INDEX templates_publication_sequence_idx
  ON templates (id, publication_sequence DESC);
