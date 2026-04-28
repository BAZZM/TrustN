-- Migration 008: Relationship-based secondary connections
-- This migration adds support for viewing secondary connections based on inner circle relationships
-- and enhances profile data visibility for inner circle contacts

-- Add index for faster lookups of inner circle connections
CREATE INDEX IF NOT EXISTS idx_connections_circle_type_user1 ON connections(circle_type, user1_id) WHERE circle_type = 'inner';
CREATE INDEX IF NOT EXISTS idx_connections_circle_type_user2 ON connections(circle_type, user2_id) WHERE circle_type = 'inner';

-- Add index for job_role and industry filtering
CREATE INDEX IF NOT EXISTS idx_users_job_role ON users(job_role);
CREATE INDEX IF NOT EXISTS idx_users_industry ON users(industry);

-- Ensure users table has all necessary fields for rich profile display
-- (These should already exist, but we'll verify)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
    ALTER TABLE users ADD COLUMN phone VARCHAR(20) UNIQUE NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'job_role') THEN
    ALTER TABLE users ADD COLUMN job_role VARCHAR(255) NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'industry') THEN
    ALTER TABLE users ADD COLUMN industry VARCHAR(255) NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'experience') THEN
    ALTER TABLE users ADD COLUMN experience TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- Insert migration record
INSERT INTO schema_version (version, description) 
VALUES ('008_relationship_based_secondary_connections', 'Relationship-based secondary connections with filtering support')
ON CONFLICT (version) DO NOTHING;
