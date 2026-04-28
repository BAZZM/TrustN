-- Test user John: 100 inner circle + 200 secondary circle connections
-- Requires 300 users total (005 creates 1-30; this adds 31-300)

INSERT INTO schema_version (version, description) VALUES
  ('007_test_user_100_inner_200_secondary', 'John: 100 inner, 200 secondary connections')
ON CONFLICT (version) DO NOTHING;

-- Create users 31-300 (270 users)
DO $$
DECLARE
  i INTEGER;
  ph TEXT;
  nm TEXT;
  roles TEXT[] := ARRAY['Engineer', 'Designer', 'Manager', 'Analyst', 'Lead', 'Specialist', 'Director', 'Coordinator'];
  industries TEXT[] := ARRAY['Technology', 'Finance', 'Healthcare', 'Design', 'Operations', 'Marketing'];
BEGIN
  FOR i IN 31..300 LOOP
    ph := '+1000000' || lpad(i::text, 3, '0');
    nm := 'User ' || i;
    INSERT INTO users (phone, name, job_role, industry, experience)
    VALUES (ph, nm, roles[1 + (i % array_length(roles, 1))], industries[1 + (i % array_length(industries, 1))], (2 + (i % 15)) || ' years')
    ON CONFLICT (phone) DO NOTHING;
  END LOOP;
END $$;

-- John: 100 inner circle (users 1-100), 200 secondary (users 101-300)
DO $$
DECLARE
  john_id INTEGER;
  other_id INTEGER;
  i INTEGER;
  ph TEXT;
BEGIN
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  IF john_id IS NULL THEN
    INSERT INTO users (phone, name, job_role, industry, experience)
    VALUES ('+1234567890', 'John Doe', 'Software Engineer', 'Technology', '5 years')
    ON CONFLICT (phone) DO NOTHING;
    SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  END IF;

  IF john_id IS NOT NULL THEN
    -- Remove John's existing connections so we can replace with 100 inner + 200 secondary
    DELETE FROM connections WHERE user1_id = john_id OR user2_id = john_id;

    -- 100 inner: connect John to users with phones +1000000001 .. +1000000100
    FOR i IN 1..100 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO other_id FROM users WHERE phone = ph;
      IF other_id IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(john_id, other_id), GREATEST(john_id, other_id), 1, 'inner')
        ON CONFLICT (user1_id, user2_id) DO NOTHING;
      END IF;
    END LOOP;

    -- 200 secondary: connect John to users with phones +1000000101 .. +1000000300
    FOR i IN 101..300 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO other_id FROM users WHERE phone = ph;
      IF other_id IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(john_id, other_id), GREATEST(john_id, other_id), 1, 'secondary')
        ON CONFLICT (user1_id, user2_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END $$;

-- Ensure John has contacts for all 300 users (for prospective/import)
DO $$
DECLARE
  john_id INTEGER;
BEGIN
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';
  IF john_id IS NOT NULL THEN
    INSERT INTO contacts (user_id, phone, name)
    SELECT john_id, u.phone, u.name
    FROM users u
    WHERE u.phone LIKE '+1000000%' AND length(u.phone) = 11
    ON CONFLICT (user_id, phone) DO NOTHING;
  END IF;
END $$;
