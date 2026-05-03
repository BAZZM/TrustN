-- Combined FTS vector on users + unified hybrid secondary discovery/search (SECURITY DEFINER).
INSERT INTO schema_version (version, description) VALUES
  ('016_unified_secondary_fts', 'Users FTS vector; app_unified_secondary_search hybrid discovery + edges')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_search_vector tsvector;

CREATE OR REPLACE FUNCTION users_refresh_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_search_vector :=
    to_tsvector(
      'english',
      COALESCE(NEW.name, '') || ' ' ||
      COALESCE(NEW.job_role, '') || ' ' ||
      COALESCE(NEW.industry, '') || ' ' ||
      COALESCE(NEW.experience, '')
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_search_vector ON users;
CREATE TRIGGER trg_users_search_vector
  BEFORE INSERT OR UPDATE OF name, job_role, industry, experience
  ON users
  FOR EACH ROW
  EXECUTE FUNCTION users_refresh_search_vector();

UPDATE users SET name = COALESCE(name, '') WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_users_search_vector_gin ON users USING GIN (user_search_vector);

DROP FUNCTION IF EXISTS app_unified_secondary_search(INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION app_unified_secondary_search(
  p_viewer INTEGER,
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0,
  p_instance_id INTEGER DEFAULT NULL,
  p_focus_inner_peer INTEGER DEFAULT NULL
) RETURNS TABLE(
  res_peer_id INTEGER,
  res_peer_phone VARCHAR,
  res_peer_name VARCHAR,
  res_peer_job_role VARCHAR,
  res_peer_industry VARCHAR,
  res_peer_experience TEXT,
  res_source_edge BOOLEAN,
  res_via_inner_peer_ids INTEGER[],
  res_search_rank REAL
) AS $$
DECLARE
  v_tsquery tsquery;
  lim INTEGER;
  off INTEGER;
BEGIN
  IF p_viewer IS NULL THEN
    RETURN;
  END IF;

  lim := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  off := GREATEST(COALESCE(p_offset, 0), 0);

  IF trim(COALESCE(p_query, '')) = '' THEN
    v_tsquery := NULL;
  ELSE
    v_tsquery := plainto_tsquery('english', trim(p_query));
  END IF;

  IF p_focus_inner_peer IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM connections c
      WHERE c.circle_type = 'inner'
        AND ((c.user1_id = p_viewer AND c.user2_id = p_focus_inner_peer)
          OR (c.user2_id = p_viewer AND c.user1_id = p_focus_inner_peer))
    ) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH inner_scope AS (
    SELECT CASE WHEN c.user1_id = p_viewer THEN c.user2_id ELSE c.user1_id END AS inner_id
    FROM connections c
    WHERE c.circle_type = 'inner'
      AND (c.user1_id = p_viewer OR c.user2_id = p_viewer)
      AND (
        p_focus_inner_peer IS NULL
        OR (CASE WHEN c.user1_id = p_viewer THEN c.user2_id ELSE c.user1_id END) = p_focus_inner_peer
      )
  ),
  discovery_raw AS (
    SELECT sf.peer_id AS peer_id, isc.inner_id AS via_inner
    FROM inner_scope isc
    CROSS JOIN LATERAL app_secondary_for(p_viewer, isc.inner_id, NULL::TEXT, NULL::TEXT) sf
  ),
  edge_peers AS (
    SELECT DISTINCT CASE WHEN c.user1_id = p_viewer THEN c.user2_id ELSE c.user1_id END AS peer_id
    FROM connections c
    WHERE c.circle_type = 'secondary'
      AND (c.user1_id = p_viewer OR c.user2_id = p_viewer)
  ),
  candidates AS (
    SELECT DISTINCT x.peer_id
    FROM (
      SELECT peer_id FROM edge_peers
      UNION
      SELECT peer_id FROM discovery_raw
    ) x
  ),
  flagged AS (
    SELECT
      can.peer_id AS peer_id,
      EXISTS (SELECT 1 FROM edge_peers e WHERE e.peer_id = can.peer_id) AS source_edge,
      COALESCE(
        (
          SELECT ARRAY_AGG(sub.v ORDER BY sub.v)
          FROM (
            SELECT DISTINCT dr.via_inner AS v
            FROM discovery_raw dr
            WHERE dr.peer_id = can.peer_id
              AND dr.via_inner IS NOT NULL
          ) sub
        ),
        ARRAY[]::INTEGER[]
      ) AS via_inner_peer_ids
    FROM candidates can
  )
  SELECT
    u.id AS res_peer_id,
    u.phone::VARCHAR AS res_peer_phone,
    u.name::VARCHAR AS res_peer_name,
    u.job_role::VARCHAR AS res_peer_job_role,
    u.industry::VARCHAR AS res_peer_industry,
    u.experience AS res_peer_experience,
    fg.source_edge AS res_source_edge,
    fg.via_inner_peer_ids AS res_via_inner_peer_ids,
    CASE
      WHEN v_tsquery IS NULL THEN 0::REAL
      ELSE COALESCE(ts_rank_cd(u.user_search_vector, v_tsquery), 0)::REAL
    END AS res_search_rank
  FROM flagged fg
  JOIN users u ON u.id = fg.peer_id
  WHERE (
      p_instance_id IS NULL
      OR u.instance_id IS NULL
      OR u.instance_id = p_instance_id
    )
    AND (v_tsquery IS NULL OR u.user_search_vector @@ v_tsquery)
  ORDER BY
    CASE WHEN v_tsquery IS NOT NULL THEN ts_rank_cd(u.user_search_vector, v_tsquery) END DESC NULLS LAST,
    u.name ASC
  LIMIT lim
  OFFSET off;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION app_unified_secondary_search(INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO PUBLIC;
