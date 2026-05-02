-- Migration 013: Introduction flow produces INNER edges with provenance; intermediary-first enforcement.
-- Secondary introduction requests still use circle_type='secondary' on access_requests until accepted;
-- finalized connections are circle_type='inner' with introduced_via_request_id set.

INSERT INTO schema_version (version, description) VALUES
  ('013_introduced_inner_connections', 'Introduced inner edges + introductions_completed_count + intermediary-first trigger')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS introductions_completed_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE connections ADD COLUMN IF NOT EXISTS introduced_via_request_id INTEGER REFERENCES access_requests(id) ON DELETE SET NULL;

ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_introduced_requires_inner;
ALTER TABLE connections ADD CONSTRAINT connections_introduced_requires_inner CHECK (
  introduced_via_request_id IS NULL OR circle_type = 'inner'
);

CREATE INDEX IF NOT EXISTS idx_connections_introduced_request ON connections(introduced_via_request_id)
  WHERE introduced_via_request_id IS NOT NULL;

-- Defense in depth: target cannot record approval before intermediary (secondary intros only).
CREATE OR REPLACE FUNCTION access_requests_enforce_intermediary_first()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.circle_type = 'secondary'
     AND NEW.intermediary_id IS NOT NULL
     AND NEW.approved_by_target_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.approved_by_target_at IS DISTINCT FROM NEW.approved_by_target_at)
     AND NEW.approved_by_intermediary_at IS NULL THEN
    RAISE EXCEPTION 'Intermediary must approve before target';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_access_requests_intermediary_first ON access_requests;
CREATE TRIGGER trg_access_requests_intermediary_first
  BEFORE INSERT OR UPDATE ON access_requests
  FOR EACH ROW
  EXECUTE FUNCTION access_requests_enforce_intermediary_first();

-- Finalize introduction: INNER edge + provenance; bump intermediary metric once per acceptance.
CREATE OR REPLACE FUNCTION app_finalize_secondary(
  p_request_id INTEGER
) RETURNS TABLE(ok BOOLEAN, request_id INTEGER, connection_created BOOLEAN) AS $$
DECLARE
  r RECORD;
  uid1 INTEGER;
  uid2 INTEGER;
  affected INTEGER := 0;
BEGIN
  SELECT id, requester_id, target_user_id, intermediary_id, status,
         approved_by_intermediary_at, approved_by_target_at, circle_type
    INTO r
    FROM access_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, p_request_id, FALSE;
    RETURN;
  END IF;

  IF r.status <> 'pending' THEN
    RETURN QUERY SELECT TRUE, p_request_id, FALSE;
    RETURN;
  END IF;

  IF r.circle_type <> 'secondary' OR r.intermediary_id IS NULL THEN
    RETURN QUERY SELECT FALSE, p_request_id, FALSE;
    RETURN;
  END IF;

  IF r.approved_by_intermediary_at IS NULL OR r.approved_by_target_at IS NULL THEN
    RETURN QUERY SELECT FALSE, p_request_id, FALSE;
    RETURN;
  END IF;

  UPDATE access_requests
    SET status = 'accepted', processed_at = CURRENT_TIMESTAMP
    WHERE id = p_request_id;

  uid1 := LEAST(r.requester_id, r.target_user_id);
  uid2 := GREATEST(r.requester_id, r.target_user_id);

  INSERT INTO connections (user1_id, user2_id, strength, circle_type, introduced_via_request_id)
  VALUES (uid1, uid2, 1, 'inner', p_request_id)
  ON CONFLICT (user1_id, user2_id) DO UPDATE SET
    circle_type = 'inner',
    introduced_via_request_id = COALESCE(connections.introduced_via_request_id, EXCLUDED.introduced_via_request_id);

  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected > 0 AND r.intermediary_id IS NOT NULL THEN
    UPDATE users
      SET introductions_completed_count = introductions_completed_count + 1
      WHERE id = r.intermediary_id;
  END IF;

  RETURN QUERY SELECT TRUE, p_request_id, (affected > 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Re-apply strength backfill for rows touched by finalize (trigger usually handles new inserts).
ALTER TABLE connections DISABLE ROW LEVEL SECURITY;
UPDATE connections c SET strength = compute_connection_strength(c.user1_id, c.user2_id, c.created_at)
WHERE introduced_via_request_id IS NOT NULL;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections FORCE ROW LEVEL SECURITY;
