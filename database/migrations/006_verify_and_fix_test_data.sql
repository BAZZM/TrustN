-- Verify and fix test data - ensure contacts exist for John
-- This migration checks and creates contacts if they're missing

INSERT INTO schema_version (version, description) VALUES
  ('006_verify_and_fix_test_data', 'Verify and ensure contacts exist for test users')
ON CONFLICT (version) DO NOTHING;

-- Ensure John exists
INSERT INTO users (phone, name, job_role, industry, experience) VALUES
  ('+1234567890', 'John Doe', 'Software Engineer', 'Technology', '5 years of experience in full-stack web development')
ON CONFLICT (phone) DO NOTHING;

-- Add ALL test users as contacts for John (comprehensive list)
DO $$
DECLARE
  john_id INTEGER;
BEGIN
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  
  IF john_id IS NOT NULL THEN
    -- Add all 30 test users (+1000000001 through +1000000030)
    INSERT INTO contacts (user_id, phone, name)
    SELECT john_id, u.phone, u.name
    FROM users u
    WHERE u.phone IN (
      '+1000000001', '+1000000002', '+1000000003', '+1000000004', '+1000000005',
      '+1000000006', '+1000000007', '+1000000008', '+1000000009', '+1000000010',
      '+1000000011', '+1000000012', '+1000000013', '+1000000014', '+1000000015',
      '+1000000016', '+1000000017', '+1000000018', '+1000000019', '+1000000020',
      '+1000000021', '+1000000022', '+1000000023', '+1000000024', '+1000000025',
      '+1000000026', '+1000000027', '+1000000028', '+1000000029', '+1000000030'
    )
    ON CONFLICT (user_id, phone) DO NOTHING;
    
    -- Also add existing seed users
    INSERT INTO contacts (user_id, phone, name)
    SELECT john_id, u.phone, u.name
    FROM users u
    WHERE u.phone IN ('+0987654321', '+1122334455', '+5544332211')
    ON CONFLICT (user_id, phone) DO NOTHING;
    
    -- Log how many contacts were created
    RAISE NOTICE 'Created contacts for John (user_id: %): % contacts', 
      john_id, 
      (SELECT COUNT(*) FROM contacts WHERE user_id = john_id);
  ELSE
    RAISE WARNING 'John (+1234567890) not found - cannot create contacts';
  END IF;
END $$;

-- Verify connections exist for John
DO $$
DECLARE
  john_id INTEGER;
  inner_count INTEGER;
  secondary_count INTEGER;
BEGIN
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  
  IF john_id IS NOT NULL THEN
    SELECT COUNT(*) INTO inner_count FROM connections 
    WHERE (user1_id = john_id OR user2_id = john_id) AND circle_type = 'inner';
    
    SELECT COUNT(*) INTO secondary_count FROM connections 
    WHERE (user1_id = john_id OR user2_id = john_id) AND circle_type = 'secondary';
    
    RAISE NOTICE 'John connections - Inner: %, Secondary: %', inner_count, secondary_count;
  END IF;
END $$;
