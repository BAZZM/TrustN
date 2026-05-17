-- Rollup snapshot for dashboard KPIs (refreshed periodically by app_refresh_dashboard_summaries).

INSERT INTO schema_version (version, description) VALUES
  ('018_dashboard_user_summary', 'dashboard_user_summary rollup + app_refresh_dashboard_summaries')
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS dashboard_user_summary (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  instance_id INTEGER REFERENCES instances(id) ON DELETE SET NULL,
  inner_total INTEGER NOT NULL DEFAULT 0,
  secondary_total INTEGER NOT NULL DEFAULT 0,
  acquired_inner_total INTEGER NOT NULL DEFAULT 0,
  inner_new_7d INTEGER NOT NULL DEFAULT 0,
  inner_new_prev_7d INTEGER NOT NULL DEFAULT 0,
  secondary_new_7d INTEGER NOT NULL DEFAULT 0,
  secondary_new_prev_7d INTEGER NOT NULL DEFAULT 0,
  acquired_inner_new_7d INTEGER NOT NULL DEFAULT 0,
  acquired_inner_new_prev_7d INTEGER NOT NULL DEFAULT 0,
  pending_inbox_count INTEGER NOT NULL DEFAULT 0,
  pending_sent_count INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_summary_computed_at ON dashboard_user_summary (computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_user_summary_instance ON dashboard_user_summary (instance_id);

CREATE OR REPLACE FUNCTION app_refresh_dashboard_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(87204501);

  DELETE FROM dashboard_user_summary;

  INSERT INTO dashboard_user_summary (
    user_id,
    instance_id,
    inner_total,
    secondary_total,
    acquired_inner_total,
    inner_new_7d,
    inner_new_prev_7d,
    secondary_new_7d,
    secondary_new_prev_7d,
    acquired_inner_new_7d,
    acquired_inner_new_prev_7d,
    pending_inbox_count,
    pending_sent_count,
    computed_at
  )
  SELECT
    u.id,
    u.instance_id,
    COALESCE(conn.inner_total, 0)::INTEGER,
    COALESCE(conn.secondary_total, 0)::INTEGER,
    COALESCE(conn.acquired_inner_total, 0)::INTEGER,
    COALESCE(conn.inner_new_7d, 0)::INTEGER,
    COALESCE(conn.inner_new_prev_7d, 0)::INTEGER,
    COALESCE(conn.secondary_new_7d, 0)::INTEGER,
    COALESCE(conn.secondary_new_prev_7d, 0)::INTEGER,
    COALESCE(conn.acquired_inner_new_7d, 0)::INTEGER,
    COALESCE(conn.acquired_inner_new_prev_7d, 0)::INTEGER,
    COALESCE(ib.pending_inbox_count, 0)::INTEGER,
    COALESCE(ps.pending_sent_count, 0)::INTEGER,
    NOW()
  FROM users u
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE c.circle_type = 'inner') AS inner_total,
      COUNT(*) FILTER (WHERE c.circle_type = 'secondary') AS secondary_total,
      COUNT(*) FILTER (
        WHERE c.circle_type = 'inner' AND c.introduced_via_request_id IS NOT NULL
      ) AS acquired_inner_total,
      COUNT(*) FILTER (
        WHERE c.circle_type = 'inner' AND c.created_at >= NOW() - INTERVAL '7 days'
      ) AS inner_new_7d,
      COUNT(*) FILTER (
        WHERE c.circle_type = 'inner'
          AND c.created_at >= NOW() - INTERVAL '14 days'
          AND c.created_at < NOW() - INTERVAL '7 days'
      ) AS inner_new_prev_7d,
      COUNT(*) FILTER (
        WHERE c.circle_type = 'secondary' AND c.created_at >= NOW() - INTERVAL '7 days'
      ) AS secondary_new_7d,
      COUNT(*) FILTER (
        WHERE c.circle_type = 'secondary'
          AND c.created_at >= NOW() - INTERVAL '14 days'
          AND c.created_at < NOW() - INTERVAL '7 days'
      ) AS secondary_new_prev_7d,
      COUNT(*) FILTER (
        WHERE c.circle_type = 'inner'
          AND c.introduced_via_request_id IS NOT NULL
          AND c.created_at >= NOW() - INTERVAL '7 days'
      ) AS acquired_inner_new_7d,
      COUNT(*) FILTER (
        WHERE c.circle_type = 'inner'
          AND c.introduced_via_request_id IS NOT NULL
          AND c.created_at >= NOW() - INTERVAL '14 days'
          AND c.created_at < NOW() - INTERVAL '7 days'
      ) AS acquired_inner_new_prev_7d
    FROM connections c
    WHERE c.user1_id = u.id OR c.user2_id = u.id
  ) conn ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS pending_inbox_count
    FROM access_requests ar
    WHERE ar.status = 'pending'
      AND (
        (ar.intermediary_id = u.id AND ar.circle_type = 'secondary')
        OR (ar.target_user_id = u.id AND ar.circle_type = 'inner')
        OR (
          ar.target_user_id = u.id
          AND ar.circle_type = 'secondary'
          AND ar.approved_by_intermediary_at IS NOT NULL
        )
      )
  ) ib ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS pending_sent_count
    FROM access_requests ar
    WHERE ar.status = 'pending' AND ar.requester_id = u.id
  ) ps ON TRUE;
END;
$$;
