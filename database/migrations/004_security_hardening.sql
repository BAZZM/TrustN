-- Security hardening: RLS, constraints, indexes, least-privilege roles, statement_timeout usage (app-side).
-- Phone PII: optional phone_hash for future encrypted storage; keep phone as E.164 for now (app normalizes).

-- Row Level Security on user-owned tables (app sets app.user_id per request)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contacts_isolation ON contacts;
CREATE POLICY contacts_isolation ON contacts
  USING (user_id = current_setting('app.user_id', true)::integer);

-- Allow INSERT/UPDATE/DELETE only for own user_id (same predicate)
DROP POLICY IF EXISTS contacts_isolation_insert ON contacts;
CREATE POLICY contacts_isolation_insert ON contacts
  FOR INSERT WITH CHECK (user_id = current_setting('app.user_id', true)::integer);
DROP POLICY IF EXISTS contacts_isolation_update ON contacts;
CREATE POLICY contacts_isolation_update ON contacts
  FOR UPDATE USING (user_id = current_setting('app.user_id', true)::integer);
DROP POLICY IF EXISTS contacts_isolation_delete ON contacts;
CREATE POLICY contacts_isolation_delete ON contacts
  FOR DELETE USING (user_id = current_setting('app.user_id', true)::integer);

-- Constraints: phone NOT NULL already; add length check (E.164 >= 8 digits)
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_length;
ALTER TABLE contacts ADD CONSTRAINT contacts_phone_length CHECK (length(trim(phone)) >= 8);

-- Index for (user_id, phone) lookups and UNNEST upsert
CREATE INDEX IF NOT EXISTS idx_contacts_user_phone ON contacts(user_id, phone);

-- Optional: phone_hash column for future PII protection (lookup by hash; app can backfill)
-- ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_hash BYTEA;
-- CREATE INDEX IF NOT EXISTS idx_contacts_user_phone_hash ON contacts(user_id, phone_hash);

-- Least-privilege roles (run as superuser or migration role)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_reader') THEN
    CREATE ROLE app_reader NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_writer') THEN
    CREATE ROLE app_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrations_role') THEN
    CREATE ROLE migrations_role NOLOGIN;
  END IF;
END $$;
-- Grant usage on schema and table; app_writer gets SELECT/INSERT/UPDATE/DELETE; app_reader SELECT only
GRANT USAGE ON SCHEMA public TO app_reader, app_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_writer;
-- Default: application continues to use the same DB user; switch to app_writer for production for least privilege

INSERT INTO schema_version (version, description) VALUES
  ('004_security_hardening', 'RLS on contacts, constraints, indexes, DB roles')
ON CONFLICT (version) DO NOTHING;
