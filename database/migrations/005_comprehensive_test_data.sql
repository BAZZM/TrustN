-- Comprehensive test data for radial UI testing
-- Creates many users, 10+ inner circle connections, many secondary connections, and pending requests

INSERT INTO schema_version (version, description) VALUES
  ('005_comprehensive_test_data', 'Comprehensive test data for radial UI')
ON CONFLICT (version) DO NOTHING;

-- Create 30+ test users with varied names and roles
INSERT INTO users (phone, name, job_role, industry, experience) VALUES
  ('+1000000001', 'Alice Anderson', 'Software Engineer', 'Technology', '8 years'),
  ('+1000000002', 'Bob Brown', 'Product Manager', 'Technology', '10 years'),
  ('+1000000003', 'Charlie Chen', 'UX Designer', 'Technology', '6 years'),
  ('+1000000004', 'Diana Davis', 'Data Scientist', 'Technology', '7 years'),
  ('+1000000005', 'Eve Evans', 'DevOps Engineer', 'Technology', '5 years'),
  ('+1000000006', 'Frank Foster', 'Marketing Director', 'Marketing', '12 years'),
  ('+1000000007', 'Grace Green', 'Sales Manager', 'Sales', '9 years'),
  ('+1000000008', 'Henry Harris', 'Finance Analyst', 'Finance', '4 years'),
  ('+1000000009', 'Ivy Irving', 'HR Specialist', 'HR', '6 years'),
  ('+1000000010', 'Jack Johnson', 'Operations Lead', 'Operations', '8 years'),
  ('+1000000011', 'Kate King', 'Content Writer', 'Marketing', '3 years'),
  ('+1000000012', 'Leo Lee', 'Backend Developer', 'Technology', '7 years'),
  ('+1000000013', 'Mia Martinez', 'Frontend Developer', 'Technology', '5 years'),
  ('+1000000014', 'Noah Nelson', 'QA Engineer', 'Technology', '4 years'),
  ('+1000000015', 'Olivia Owens', 'Business Analyst', 'Business', '6 years'),
  ('+1000000016', 'Paul Parker', 'Security Engineer', 'Technology', '9 years'),
  ('+1000000017', 'Quinn Quinn', 'Project Manager', 'Technology', '11 years'),
  ('+1000000018', 'Rachel Reed', 'Design Lead', 'Design', '8 years'),
  ('+1000000019', 'Sam Smith', 'Mobile Developer', 'Technology', '6 years'),
  ('+1000000020', 'Tina Taylor', 'Data Engineer', 'Technology', '7 years'),
  ('+1000000021', 'Uma Underwood', 'ML Engineer', 'Technology', '5 years'),
  ('+1000000022', 'Victor Vega', 'Cloud Architect', 'Technology', '10 years'),
  ('+1000000023', 'Wendy White', 'Scrum Master', 'Technology', '6 years'),
  ('+1000000024', 'Xavier Xiong', 'Full Stack Developer', 'Technology', '8 years'),
  ('+1000000025', 'Yara Young', 'UI Designer', 'Design', '4 years'),
  ('+1000000026', 'Zoe Zhang', 'Product Designer', 'Design', '7 years'),
  ('+1000000027', 'Adam Adams', 'Engineering Manager', 'Technology', '12 years'),
  ('+1000000028', 'Bella Bell', 'Customer Success', 'Support', '5 years'),
  ('+1000000029', 'Chris Cross', 'Technical Writer', 'Documentation', '4 years'),
  ('+1000000030', 'Dana Day', 'Recruiter', 'HR', '6 years')
ON CONFLICT (phone) DO NOTHING;

-- For user John (+1234567890): Create 12 inner circle connections
-- Connect John with users 1-12 (Alice through Leo)
DO $$
DECLARE
  john_id INTEGER;
BEGIN
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  IF john_id IS NOT NULL THEN
    INSERT INTO connections (user1_id, user2_id, strength, circle_type)
    SELECT LEAST(john_id, u.id), GREATEST(john_id, u.id), 1, 'inner'
    FROM users u
    WHERE u.phone IN (
      '+1000000001', '+1000000002', '+1000000003', '+1000000004', '+1000000005',
      '+1000000006', '+1000000007', '+1000000008', '+1000000009', '+1000000010',
      '+1000000011', '+1000000012'
    ) AND u.id IS NOT NULL
    ON CONFLICT (user1_id, user2_id) DO NOTHING;
  END IF;
END $$;

-- Create many secondary circle connections for John (via inner circle intermediaries)
-- John -> (via Alice) -> users 13-20 (Mia through Tina)
DO $$
DECLARE
  john_id INTEGER;
  alice_id INTEGER;
BEGIN
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  SELECT id INTO alice_id FROM users WHERE phone = '+1000000001';
  IF john_id IS NOT NULL AND alice_id IS NOT NULL THEN
    INSERT INTO connections (user1_id, user2_id, strength, circle_type)
    SELECT LEAST(john_id, u.id), GREATEST(john_id, u.id), 1, 'secondary'
    FROM users u
    WHERE u.phone IN (
      '+1000000013', '+1000000014', '+1000000015', '+1000000016', '+1000000017',
      '+1000000018', '+1000000019', '+1000000020'
    ) AND u.id IS NOT NULL
    ON CONFLICT (user1_id, user2_id) DO NOTHING;
  END IF;
END $$;

-- John -> (via Bob) -> users 21-25 (Uma through Zoe)
DO $$
DECLARE
  john_id INTEGER;
  bob_id INTEGER;
BEGIN
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  SELECT id INTO bob_id FROM users WHERE phone = '+1000000002';
  IF john_id IS NOT NULL AND bob_id IS NOT NULL THEN
    INSERT INTO connections (user1_id, user2_id, strength, circle_type)
    SELECT LEAST(john_id, u.id), GREATEST(john_id, u.id), 1, 'secondary'
    FROM users u
    WHERE u.phone IN (
      '+1000000021', '+1000000022', '+1000000023', '+1000000024', '+1000000025'
    ) AND u.id IS NOT NULL
    ON CONFLICT (user1_id, user2_id) DO NOTHING;
  END IF;
END $$;

-- Pending introduction fixtures for John were removed: they polluted real introduction queues.
-- Use migration 014_remove_seed_pending_introduction_requests.sql on existing DBs to delete legacy rows.

-- Ensure John exists (create if not present from schema.sql seed)
INSERT INTO users (phone, name, job_role, industry, experience) VALUES
  ('+1234567890', 'John Doe', 'Software Engineer', 'Technology', '5 years of experience in full-stack web development')
ON CONFLICT (phone) DO NOTHING;

-- Add contacts for John: include all users as contacts (so we have prospective connections)
DO $$
DECLARE
  john_id INTEGER;
BEGIN
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  IF john_id IS NOT NULL THEN
    -- Insert contacts for all test users (30 users)
    INSERT INTO contacts (user_id, phone, name)
    SELECT john_id, u.phone, u.name
    FROM users u
    WHERE u.phone LIKE '+1000000%' AND u.phone IS NOT NULL
    ON CONFLICT (user_id, phone) DO NOTHING;
    
    -- Also add contacts for existing seed users (Jane, Alice, Bob)
    INSERT INTO contacts (user_id, phone, name)
    SELECT john_id, u.phone, u.name
    FROM users u
    WHERE u.phone IN ('+0987654321', '+1122334455', '+5544332211')
    ON CONFLICT (user_id, phone) DO NOTHING;
  END IF;
END $$;

-- Create some inner circle connections between the test users (so they can be intermediaries)
-- Alice-Bob, Bob-Charlie, Charlie-Diana, Diana-Eve (chain)
DO $$
DECLARE
  alice_id INTEGER; bob_id INTEGER; charlie_id INTEGER; diana_id INTEGER; eve_id INTEGER;
BEGIN
  SELECT id INTO alice_id FROM users WHERE phone = '+1000000001';
  SELECT id INTO bob_id FROM users WHERE phone = '+1000000002';
  SELECT id INTO charlie_id FROM users WHERE phone = '+1000000003';
  SELECT id INTO diana_id FROM users WHERE phone = '+1000000004';
  SELECT id INTO eve_id FROM users WHERE phone = '+1000000005';
  
  INSERT INTO connections (user1_id, user2_id, strength, circle_type)
  VALUES
    (LEAST(alice_id, bob_id), GREATEST(alice_id, bob_id), 1, 'inner'),
    (LEAST(bob_id, charlie_id), GREATEST(bob_id, charlie_id), 1, 'inner'),
    (LEAST(charlie_id, diana_id), GREATEST(charlie_id, diana_id), 1, 'inner'),
    (LEAST(diana_id, eve_id), GREATEST(diana_id, eve_id), 1, 'inner')
  ON CONFLICT (user1_id, user2_id) DO NOTHING;
END $$;
