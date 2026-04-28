-- Questionnaire-driven: profile preferences, themes, circle type, notification prefs
-- Phone is already unique on users; we add preferences and theme support.

-- Themes: configurable per instance (e.g. different trust network instances)
CREATE TABLE IF NOT EXISTS themes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  -- CSS-like values for login gradient and app (stored as JSON for flexibility)
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences (profile-level, stored at DB; phone = username/primary key)
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_id INTEGER REFERENCES themes(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS large_text BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS high_contrast BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'en';
-- Minimal, time-sensitive: only connection request notifications; user-configurable
ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_connection_requests BOOLEAN DEFAULT TRUE;

-- Circle type: inner (1st circle) vs secondary (2nd circle) for connections
ALTER TABLE connections ADD COLUMN IF NOT EXISTS circle_type VARCHAR(20) DEFAULT 'inner'
  CHECK (circle_type IN ('inner', 'secondary'));

-- access_requests: already exists; ensure we can track inner vs secondary circle
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS circle_type VARCHAR(20) DEFAULT 'inner'
  CHECK (circle_type IN ('inner', 'secondary'));

-- Index for fast lookups by user preferences
CREATE INDEX IF NOT EXISTS idx_users_theme_id ON users(theme_id);
CREATE INDEX IF NOT EXISTS idx_connections_circle_type ON connections(circle_type);

-- Default theme: dark steely gradient (login), black app background
INSERT INTO themes (name, slug, config) VALUES
  ('Default (Dark)', 'default', '{"loginGradient":"linear-gradient(145deg, #1a1d23 0%, #252a33 50%, #1e2128 100%)","appBackground":"#000000","fontFamily":"\"Share Tech Mono\", monospace","accent":"#4a5568"}'),
  ('Matrix', 'matrix', '{"loginGradient":"linear-gradient(145deg, #0d0d0d 0%, #1a1a1a 50%, #0a0a0a 100%)","appBackground":"#000000","fontFamily":"\"Share Tech Mono\", monospace","accent":"#00ff41"}')
ON CONFLICT (slug) DO NOTHING;
