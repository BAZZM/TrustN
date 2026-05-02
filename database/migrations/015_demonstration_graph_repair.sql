-- When Fly/production bootstrapped partially, demo login +1234567890 sees zero peers.
-- Add a minimal INNER graph from seed phones only if John has no connections yet.
INSERT INTO schema_version (version, description) VALUES
  ('015_demonstration_graph_repair', 'Idempotent demo inner edges for empty John (+1234567890) graph')
ON CONFLICT (version) DO NOTHING;

DO $$
DECLARE
  john INTEGER;
BEGIN
  SELECT id INTO john FROM users WHERE phone = '+1234567890' LIMIT 1;
  IF john IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM connections WHERE user1_id = john OR user2_id = john LIMIT 1) THEN
    RETURN;
  END IF;

  ALTER TABLE connections DISABLE ROW LEVEL SECURITY;

  INSERT INTO connections (user1_id, user2_id, strength, circle_type)
  SELECT pairs.u1, pairs.u2, 1, 'inner'
  FROM (
    SELECT DISTINCT LEAST(john, p.peer_id)::INTEGER AS u1, GREATEST(john, p.peer_id)::INTEGER AS u2
    FROM unnest(
           ARRAY (
             SELECT id
             FROM users
             WHERE phone IN (
                              '+0987654321',
                              '+1122334455',
                              '+5544332211',
                              '+1000000002'
               )
           )
         ) AS p(peer_id)
  ) pairs
  WHERE pairs.u1 < pairs.u2
  ON CONFLICT (user1_id, user2_id) DO NOTHING;

  ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
  ALTER TABLE connections FORCE ROW LEVEL SECURITY;
END $$;
