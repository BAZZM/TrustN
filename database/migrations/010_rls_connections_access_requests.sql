-- Migration 010: RLS on connections and access_requests
-- Ensures users can only access rows where they are a participant

-- Connections: user can see rows where they are user1 or user2
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections FORCE ROW LEVEL SECURITY;

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

-- Access requests: user can see rows where they are requester, target, or intermediary
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests FORCE ROW LEVEL SECURITY;

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
  );

INSERT INTO schema_version (version, description) VALUES
  ('010_rls_connections_access_requests', 'RLS on connections and access_requests')
ON CONFLICT (version) DO NOTHING;
