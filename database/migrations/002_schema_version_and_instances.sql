-- Schema versioning and optional multi-instance (tenant) support for customisation and scalability

-- Track applied migrations for clean upgrades
CREATE TABLE IF NOT EXISTS schema_version (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_version (version, description) VALUES
  ('001_user_preferences_and_themes', 'User prefs, themes, circle_type'),
  ('002_schema_version_and_instances', 'Schema version and optional instance_id')
ON CONFLICT (version) DO NOTHING;

-- Optional: instances (e.g. different trust network deployments / white-labels)
CREATE TABLE IF NOT EXISTS instances (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Link themes to an instance (NULL = global/default)
ALTER TABLE themes ADD COLUMN IF NOT EXISTS instance_id INTEGER REFERENCES instances(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_themes_instance_id ON themes(instance_id);

-- Link users to an instance (NULL = global)
ALTER TABLE users ADD COLUMN IF NOT EXISTS instance_id INTEGER REFERENCES instances(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_instance_id ON users(instance_id);

-- Locales table for scalable i18n (optional; app can still use static en.js)
CREATE TABLE IF NOT EXISTS locales (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE
);

INSERT INTO locales (code, name, is_default) VALUES
  ('en', 'English', TRUE)
ON CONFLICT (code) DO NOTHING;
