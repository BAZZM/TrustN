-- Migration 009: Admin config for testing toggles (e.g. phone verification bypass)
-- Used by admin screen to control feature flags during development/testing

CREATE TABLE IF NOT EXISTS admin_config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'true',
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default: require_phone_verification OFF for testing (value false = bypass OTP)
INSERT INTO admin_config (key, value, description) VALUES
  ('require_phone_verification', 'false', 'When true, login requires OTP via Twilio. When false (testing), phone lookup alone grants access.')
ON CONFLICT (key) DO NOTHING;

-- OTP verification codes (short-lived, for phone verification flow)
CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes(expires_at);

INSERT INTO schema_version (version, description) VALUES
  ('009_admin_config_and_otp', 'Admin config table, OTP codes table for phone verification')
ON CONFLICT (version) DO NOTHING;
