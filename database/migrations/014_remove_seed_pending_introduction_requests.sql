-- Drop synthetic pending introduction rows created for demo user John (+1234567890) in migration 005.
-- Without this, John's seeded requests appear in introduction queues for John (sent) and for intermediaries/targets (inbox).

INSERT INTO schema_version (version, description) VALUES
  ('014_remove_seed_pending_introduction_requests', 'Remove demo John pending access_requests')
ON CONFLICT (version) DO NOTHING;

DELETE FROM access_requests ar
USING users j
WHERE ar.requester_id = j.id
  AND j.phone = '+1234567890'
  AND ar.status = 'pending';
