-- Visual demo data for the Connections graph (run after migrations, especially 005 + 012).
-- Test user: +1234567890  (John Doe) — use the same phone in the login screen.
-- Auth: if require_phone_verification is false, /api/auth/identify logs you in with no code.
--       If true, use an OTP from the otp_codes table (dev: insert 123456 manually).
--
-- This seed:
-- 1) Ensures users from +1000000001–+1000000030 and John exist (minimal inserts).
-- 2) Gives John 12 inner + secondary rows like migration 005 (idempotent where possible).
-- 3) Adds extra INNER edges from Alice to people NOT in John’s inner circle so
--    GET /api/connections/secondary-for/<alice> returns a visible secondary ring.
-- 4) Sets varied connection strengths for John’s inner ring (sorting / emphasis in UI).

-- Idempotency tag (optional; ignore if table missing in older DBs)
INSERT INTO schema_version (version, description) VALUES
  ('seed_connections_graph_demo', 'Graph demo: inner ring + secondary-for discovery')
ON CONFLICT (version) DO NOTHING;

DO $seed$
DECLARE
  john_id INTEGER;
  alice_id INTEGER;
  bob_id INTEGER;
  other_id INTEGER;
  phones TEXT[];
  p TEXT;
  s INTEGER;
BEGIN
  -- Ensure John
  INSERT INTO users (phone, name, job_role, industry, experience) VALUES
    ('+1234567890', 'John Doe', 'Software Engineer', 'Technology', '5 years in full-stack development')
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name,
    job_role = EXCLUDED.job_role,
    industry = EXCLUDED.industry,
    experience = EXCLUDED.experience;
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';

  -- Ensure demo peers (+1000000001 .. +1000000030) – subset of 005
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
    ('+1000000025', 'Yara Young', 'UI Designer', 'Design', '4 years')
  ON CONFLICT (phone) DO NOTHING;

  IF john_id IS NULL THEN
    RAISE NOTICE 'Could not resolve John; abort';
    RETURN;
  END IF;

  SELECT id INTO alice_id FROM users WHERE phone = '+1000000001';
  SELECT id INTO bob_id FROM users WHERE phone = '+1000000002';

  -- John inner with users 1–12
  INSERT INTO connections (user1_id, user2_id, strength, circle_type)
  SELECT LEAST(john_id, u.id), GREATEST(john_id, u.id), 1, 'inner'
  FROM users u
  WHERE u.phone IN (
    '+1000000001', '+1000000002', '+1000000003', '+1000000004', '+1000000005',
    '+1000000006', '+1000000007', '+1000000008', '+1000000009', '+1000000010',
    '+1000000011', '+1000000012'
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING;

  -- Stagger strengths on John’s existing inner edges (peer phone -> strength 2–5)
  UPDATE connections c
  SET strength = m.st
  FROM users u
  JOIN (VALUES
    ('+1000000001', 5), ('+1000000002', 5), ('+1000000003', 4), ('+1000000004', 4),
    ('+1000000005', 3), ('+1000000006', 3), ('+1000000007', 2), ('+1000000008', 2),
    ('+1000000009', 4), ('+1000000010', 3), ('+1000000011', 2), ('+1000000012', 2)
  ) AS m(phone, st) ON u.phone = m.phone
  WHERE c.circle_type = 'inner'
    AND (c.user1_id = john_id OR c.user2_id = john_id)
    AND (u.id = c.user1_id OR u.id = c.user2_id)
    AND u.id <> john_id;

  -- John secondary 13–20 (same as 005)
  INSERT INTO connections (user1_id, user2_id, strength, circle_type)
  SELECT LEAST(john_id, u.id), GREATEST(john_id, u.id), 1, 'secondary'
  FROM users u
  WHERE u.phone IN (
    '+1000000013', '+1000000014', '+1000000015', '+1000000016', '+1000000017',
    '+1000000018', '+1000000019', '+1000000020'
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING;

  -- John secondary 21–25
  INSERT INTO connections (user1_id, user2_id, strength, circle_type)
  SELECT LEAST(john_id, u.id), GREATEST(john_id, u.id), 1, 'secondary'
  FROM users u
  WHERE u.phone IN (
    '+1000000021', '+1000000022', '+1000000023', '+1000000024', '+1000000025'
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING;

  -- Inter-peer chain (optional intermediaries)
  IF alice_id IS NOT NULL AND bob_id IS NOT NULL THEN
    INSERT INTO connections (user1_id, user2_id, strength, circle_type) VALUES
      (LEAST(alice_id, bob_id), GREATEST(alice_id, bob_id), 1, 'inner')
    ON CONFLICT (user1_id, user2_id) DO NOTHING;
  END IF;

  -- Alice inner with 18–23: they are not in John’s *inner* set (1–12) so
  -- app_secondary_for(John, Alice) can return them (John has secondary, not inner, to 13–20).
  s := 5;
  phones := ARRAY[
    '+1000000018', '+1000000019', '+1000000020', '+1000000021', '+1000000022', '+1000000023'
  ];
  IF alice_id IS NOT NULL THEN
    FOREACH p IN ARRAY phones LOOP
      SELECT id INTO other_id FROM users WHERE users.phone = p;
      IF other_id IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(alice_id, other_id), GREATEST(alice_id, other_id), s, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET strength = GREATEST(connections.strength, EXCLUDED.strength);
        s := GREATEST(2, s - 1);
      END IF;
    END LOOP;
  END IF;

  -- Bob inner with 24–25 for a second good branch
  IF bob_id IS NOT NULL THEN
    FOREACH p IN ARRAY ARRAY['+1000000024', '+1000000025']::text[] LOOP
      SELECT id INTO other_id FROM users WHERE users.phone = p;
      IF other_id IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(bob_id, other_id), GREATEST(bob_id, other_id), 4, 'inner')
        ON CONFLICT (user1_id, user2_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RAISE NOTICE 'Graph seed complete for user id % (John)', john_id;
END
$seed$;
