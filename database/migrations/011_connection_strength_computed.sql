-- Migration 011: Connection strength based on shared connections + account age
-- strength is computed: base 1 + shared_connections_bonus + account_age_bonus
-- We add a function to compute/update strength and a trigger or we update on read.
-- For simplicity: add shared_connections_count column, update via function.

-- Function to compute connection strength for a given connection
-- Formula: 1 (base) + shared_connections_bonus (0-5) + account_age_bonus (0-2)
CREATE OR REPLACE FUNCTION compute_connection_strength(
  p_user1_id INTEGER,
  p_user2_id INTEGER,
  p_created_at TIMESTAMP DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  shared_count INTEGER := 0;
  age_years NUMERIC;
  age_bonus INTEGER := 0;
  base_strength INTEGER := 1;
BEGIN
  -- Count shared inner-circle connections (mutual friends: users who are inner to both user1 and user2)
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

  -- Account age: years since connection created (0-2 bonus for longevity)
  age_years := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(p_created_at, CURRENT_TIMESTAMP))) / (365.25 * 24 * 3600);
  age_bonus := LEAST(2, GREATEST(0, FLOOR(age_years)::INTEGER));

  RETURN base_strength + LEAST(COALESCE(shared_count, 0), 10) + age_bonus;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update existing connections with computed strength
UPDATE connections c
SET strength = compute_connection_strength(c.user1_id, c.user2_id, c.created_at);

-- Trigger to compute strength on insert/update
CREATE OR REPLACE FUNCTION trigger_compute_connection_strength()
RETURNS TRIGGER AS $$
BEGIN
  NEW.strength := compute_connection_strength(NEW.user1_id, NEW.user2_id, COALESCE(NEW.created_at, CURRENT_TIMESTAMP));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connections_strength ON connections;
CREATE TRIGGER trg_connections_strength
  BEFORE INSERT OR UPDATE OF user1_id, user2_id, created_at
  ON connections
  FOR EACH ROW
  EXECUTE FUNCTION trigger_compute_connection_strength();

INSERT INTO schema_version (version, description) VALUES
  ('011_connection_strength_computed', 'Connection strength from shared connections and account age')
ON CONFLICT (version) DO NOTHING;
