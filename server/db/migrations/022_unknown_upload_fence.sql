LOCK TABLE orphaned_uploads IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE orphaned_uploads
  DROP CONSTRAINT orphaned_uploads_cleanup_state_check,
  ADD CONSTRAINT orphaned_uploads_cleanup_state_check CHECK (
    (status = 'cleaned') = (cleaned_at IS NOT NULL)
    AND (
      (status = 'cleaning'
       AND cleaned_at IS NULL
       AND claimed_build_id IS NULL
       AND claimed_delivery_build_id IS NULL
       AND cleanup_token ~ '^[!-~]{1,255}$'
       AND cleanup_lease_expires_at IS NOT NULL
       AND (
         object_generation IS NOT NULL
         OR (
           object_etag IS NULL
           AND expected_sha256 IS NOT NULL
           AND expected_byte_size IS NOT NULL
           AND expected_mime_type IS NOT NULL
         )
       ))
      OR
      (status <> 'cleaning'
       AND cleanup_token IS NULL
       AND cleanup_lease_expires_at IS NULL)
    )
  );
