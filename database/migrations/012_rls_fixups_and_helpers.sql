-- Migration 012: RLS fixups + SECURITY DEFINER helpers
-- Fixes the secondary-introduction flow under FORCE ROW LEVEL SECURITY:
--   * access_requests WITH CHECK was too narrow (only requester could write),
--     so target/intermediary UPDATEs (decline / accept / approve_*) all failed.
--   * connections WITH CHECK rejected the cross-user INSERT performed by
--     the intermediary when finalising a secondary request.
--   * connections USING hid the intermediary<->target edge from the requester,
--     so the "intermediary must be in target inner circle" check always failed.
--   * compute_connection_strength queries connections inside the function,
--     subject to RLS, producing inaccurate shared-peer counts.
--
-- Strategy: keep strict participant USING/WITH CHECK on both tables, then
-- gate the few legitimate cross-user code paths through narrow SECURITY
-- DEFINER helpers whose preconditions are enforced inside the function.

-- ============================================================================
-- 1. Relax WITH CHECK to participant for access_requests
-- ============================================================================
DROP POLICY IF EXISTS access_requests_participant ON access_requests;
CREATE POLICY access_requests_participant ON access_requests
  FOR ALL
  USING (
    requester_id = current_setting('app.user_id', true)::integer
    OR target_user_id = current_setting('app.user_id', true)::integer
    OR (intermediary_id IS NOT NULL AND intermediary_id = current_setting('app.user_id', true)::integer)
  )
  WITH CHECK (
    requester_id = current_setting('app.user_id', true)::integer
    OR target_user_id = current_setting('app.user_id', true)::integer
    OR (intermediary_id IS NOT NULL AND intermediary_id = current_setting('app.user_id', true)::integer)
  );

-- ============================================================================
-- 2. Relax WITH CHECK to participant for connections (still strict).
--    Cross-user inserts (e.g. intermediary finalising a secondary request)
--    go through app_finalize_secondary which is SECURITY DEFINER and
--    therefore bypasses RLS by running as the function owner.
-- ============================================================================
DROP POLICY IF EXISTS connections_participant ON connections;
CREATE POLICY connections_participant ON connections
  FOR ALL
  USING (
    user1_id = current_setting('app.user_id', true)::integer
    OR user2_id = current_setting('app.user_id', true)::integer
  )
  WITH CHECK (
    user1_id = current_setting('app.user_id', true)::integer
    OR user2_id = current_setting('app.user_id', true)::integer
  );

-- ============================================================================
-- 3. Recreate compute_connection_strength as SECURITY DEFINER so its inner
--    subqueries see the full graph regardless of caller's app.user_id RLS
--    context. Also widen p_created_at to TIMESTAMPTZ; the trigger in 011
--    invoked the old TIMESTAMP-typed function with COALESCE(NEW.created_at,
--    CURRENT_TIMESTAMP) whose result is TIMESTAMPTZ, which failed function
--    resolution and rejected every INSERT into connections.
--    Drop the old TIMESTAMP-typed signature first so we don't accumulate
--    overloads that would make trigger calls ambiguous.
-- ============================================================================
DROP FUNCTION IF EXISTS compute_connection_strength(INTEGER, INTEGER, TIMESTAMP);

CREATE OR REPLACE FUNCTION compute_connection_strength(
  p_user1_id INTEGER,
  p_user2_id INTEGER,
  p_created_at TIMESTAMPTZ DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  shared_count INTEGER := 0;
  age_years NUMERIC;
  age_bonus INTEGER := 0;
  base_strength INTEGER := 1;
BEGIN
  SELECT COUNT(*)::INTEGER INTO shared_count
  FROM (
    SELECT peer_id FROM (
      SELECT CASE WHEN c.user1_id = p_user1_id THEN c.user2_id ELSE c.user1_id END AS peer_id
      FROM connections c
      WHERE c.circle_type = 'inner' AND (c.user1_id = p_user1_id OR c.user2_id = p_user1_id)
    ) a
    INTERSECT
    SELECT peer_id FROM (
      SELECT CASE WHEN c.user1_id = p_user2_id THEN c.user2_id ELSE c.user1_id END AS peer_id
      FROM connections c
      WHERE c.circle_type = 'inner' AND (c.user1_id = p_user2_id OR c.user2_id = p_user2_id)
    ) b
  ) shared;

  age_years := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(p_created_at, CURRENT_TIMESTAMP))) / (365.25 * 24 * 3600);
  age_bonus := LEAST(2, GREATEST(0, FLOOR(age_years)::INTEGER));
  RETURN base_strength + LEAST(COALESCE(shared_count, 0), 10) + age_bonus;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 4. app_can_intermediate(requester, target, intermediary)
--    Returns true iff the intermediary shares an inner edge with BOTH the
--    requester and the target. Bypasses RLS so the requester can verify the
--    intermediary<->target edge they are not a participant of.
-- ============================================================================
CREATE OR REPLACE FUNCTION app_can_intermediate(
  p_requester INTEGER,
  p_target INTEGER,
  p_intermediary INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  has_req_int BOOLEAN;
  has_int_tgt BOOLEAN;
BEGIN
  IF p_requester IS NULL OR p_target IS NULL OR p_intermediary IS NULL THEN
    RETURN FALSE;
  END IF;
  IF p_requester = p_target OR p_requester = p_intermediary OR p_target = p_intermediary THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM connections c WHERE c.circle_type = 'inner'
      AND ((c.user1_id = p_requester AND c.user2_id = p_intermediary)
        OR (c.user2_id = p_requester AND c.user1_id = p_intermediary))
  ) INTO has_req_int;
  IF NOT has_req_int THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM connections c WHERE c.circle_type = 'inner'
      AND ((c.user1_id = p_target AND c.user2_id = p_intermediary)
        OR (c.user2_id = p_target AND c.user1_id = p_intermediary))
  ) INTO has_int_tgt;

  RETURN has_int_tgt;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 5. app_finalize_secondary(request_id)
--    Atomically:
--      - Locks the access_request row.
--      - Verifies status='pending' AND both approvals are present.
--      - Marks the request accepted.
--      - Inserts the secondary connection (idempotent via ON CONFLICT).
--    Returns one row { ok, request_id, connection_created }.
--    Bypasses RLS so the intermediary can complete the cross-user insert.
-- ============================================================================
CREATE OR REPLACE FUNCTION app_finalize_secondary(
  p_request_id INTEGER
) RETURNS TABLE(ok BOOLEAN, request_id INTEGER, connection_created BOOLEAN) AS $$
DECLARE
  r RECORD;
  uid1 INTEGER;
  uid2 INTEGER;
  inserted INTEGER := 0;
BEGIN
  SELECT id, requester_id, target_user_id, intermediary_id, status,
         approved_by_intermediary_at, approved_by_target_at
    INTO r
    FROM access_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, p_request_id, FALSE;
    RETURN;
  END IF;

  IF r.status <> 'pending' THEN
    -- Already finalised; idempotent no-op.
    RETURN QUERY SELECT TRUE, p_request_id, FALSE;
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

  INSERT INTO connections (user1_id, user2_id, strength, circle_type)
  VALUES (uid1, uid2, 1, 'secondary')
  ON CONFLICT (user1_id, user2_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN QUERY SELECT TRUE, p_request_id, (inserted > 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 6. app_secondary_for(viewer, inner_peer, job_role, industry)
--    Returns the inner peers of inner_peer that are NOT already in viewer's
--    inner circle and are not the viewer or the inner_peer themself.
--    Authorisation: viewer must already be in inner circle of inner_peer;
--    otherwise returns an empty set.
--    Bypasses RLS so viewer can read inner_peer's other connections.
-- ============================================================================
CREATE OR REPLACE FUNCTION app_secondary_for(
  p_viewer INTEGER,
  p_inner_peer INTEGER,
  p_job_role TEXT DEFAULT NULL,
  p_industry TEXT DEFAULT NULL
) RETURNS TABLE(
  peer_id INTEGER,
  peer_phone VARCHAR,
  peer_name VARCHAR,
  peer_job_role VARCHAR,
  peer_industry VARCHAR,
  peer_experience TEXT,
  created_at TIMESTAMP
) AS $$
BEGIN
  IF p_viewer IS NULL OR p_inner_peer IS NULL OR p_viewer = p_inner_peer THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM connections c
    WHERE c.circle_type = 'inner'
      AND ((c.user1_id = p_viewer AND c.user2_id = p_inner_peer)
        OR (c.user2_id = p_viewer AND c.user1_id = p_inner_peer))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    u.id AS peer_id,
    u.phone AS peer_phone,
    u.name AS peer_name,
    u.job_role AS peer_job_role,
    u.industry AS peer_industry,
    u.experience AS peer_experience,
    c1.created_at
  FROM connections c1
  JOIN users u ON (
    u.id = CASE
      WHEN c1.user1_id = p_inner_peer THEN c1.user2_id
      ELSE c1.user1_id
    END
  )
  LEFT JOIN connections c2 ON (
    c2.circle_type = 'inner'
    AND ((c2.user1_id = p_viewer AND c2.user2_id = u.id)
      OR (c2.user2_id = p_viewer AND c2.user1_id = u.id))
  )
  WHERE c1.circle_type = 'inner'
    AND ((c1.user1_id = p_inner_peer AND c1.user2_id <> p_viewer)
      OR (c1.user2_id = p_inner_peer AND c1.user1_id <> p_viewer))
    AND c2.id IS NULL
    AND u.id <> p_viewer
    AND u.id <> p_inner_peer
    AND (p_job_role IS NULL OR p_job_role = '' OR LOWER(u.job_role) LIKE LOWER('%' || p_job_role || '%'))
    AND (p_industry IS NULL OR p_industry = '' OR LOWER(u.industry) LIKE LOWER('%' || p_industry || '%'))
  ORDER BY u.name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 7. Re-run strength backfill now that compute_connection_strength bypasses RLS.
--    Temporarily disable RLS on connections so the UPDATE statement itself sees
--    every row (the SET LOCAL row_security = off variant raises errors instead
--    of bypassing FORCE'd policies).
-- ============================================================================
ALTER TABLE connections DISABLE ROW LEVEL SECURITY;
UPDATE connections c SET strength = compute_connection_strength(c.user1_id, c.user2_id, c.created_at);
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. Grants for the SECURITY DEFINER helpers.
-- ============================================================================
GRANT EXECUTE ON FUNCTION app_can_intermediate(INTEGER, INTEGER, INTEGER) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app_finalize_secondary(INTEGER) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app_secondary_for(INTEGER, INTEGER, TEXT, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION compute_connection_strength(INTEGER, INTEGER, TIMESTAMPTZ) TO PUBLIC;

INSERT INTO schema_version (version, description) VALUES
  ('012_rls_fixups_and_helpers', 'Relax WITH CHECK to participant; SECURITY DEFINER helpers for cross-user introduction flows')
ON CONFLICT (version) DO NOTHING;
