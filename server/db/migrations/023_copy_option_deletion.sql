-- Retain original generated copy for provenance and prior review snapshots.
ALTER TABLE copy_sets ADD COLUMN deleted_candidate_ids jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(deleted_candidate_ids) = 'array');
