-- Visual + analytics demo for Connections graph (run after migrations, especially 005 + 012).
-- Login: +1234567890 (John Doe). If require_phone_verification is false, identify logs you in without OTP.
--
-- Design goals:
-- * John has exactly 8 INNER peers (+1000000001..+1000000008) — matches MAX_VISIBLE_INNER on first ring.
-- * Many DIRECT SECONDARY edges from John to pool users (+1000000009..+1000000040) — strong "secondary" counts.
-- * Each inner peer has INNER ties to overlapping subsets of the pool so /connections/secondary-for/:id
--   returns rich rings (relationship-based discovery via app_secondary_for).
-- * Inner-clique mesh among the 8 for realism.
--
-- Idempotent: safe to re-run; clears only John's edges then rebuilds John-centric links.

INSERT INTO schema_version (version, description) VALUES
  ('seed_connections_graph_demo', 'Graph demo: John 8-inner + dense secondaries via inner subset')
ON CONFLICT (version) DO NOTHING;

DO $seed$
DECLARE
  john_id INTEGER;
  aid INTEGER;
  oid INTEGER;
  inner_phones TEXT[] := ARRAY[
    '+1000000001', '+1000000002', '+1000000003', '+1000000004',
    '+1000000005', '+1000000006', '+1000000007', '+1000000008'
  ];
  ph TEXT;
  ph2 TEXT;
  i INTEGER;
BEGIN
  -- John
  INSERT INTO users (phone, name, job_role, industry, experience) VALUES
    ('+1234567890', 'John Doe', 'Software Engineer', 'Technology',
     '10 years — principal engineer; graph-heavy trust network demo')
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name,
    job_role = EXCLUDED.job_role,
    industry = EXCLUDED.industry,
    experience = EXCLUDED.experience;
  SELECT id INTO john_id FROM users WHERE phone = '+1234567890';

  -- Core demo roster (+1000000001 .. +1000000025)
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

  -- Extended pool (+1000000026 .. +1000000040) for wider secondary discovery
  INSERT INTO users (phone, name, job_role, industry, experience) VALUES
    ('+1000000026', 'Zoe Zimmer', 'Research Scientist', 'Healthcare', '7 years'),
    ('+1000000027', 'Aaron Ash', 'Account Executive', 'Sales', '5 years'),
    ('+1000000028', 'Blake Brooks', 'Legal Counsel', 'Legal', '12 years'),
    ('+1000000029', 'Casey Cole', 'Customer Success', 'Technology', '4 years'),
    ('+1000000030', 'Drew Diaz', 'Growth Lead', 'Marketing', '6 years'),
    ('+1000000031', 'Ellis Edwards', 'Solutions Architect', 'Technology', '9 years'),
    ('+1000000032', 'Finn Fox', 'Support Engineer', 'Technology', '3 years'),
    ('+1000000033', 'Gia Gray', 'Product Designer', 'Design', '5 years'),
    ('+1000000034', 'Hayden Hart', 'Finance Manager', 'Finance', '8 years'),
    ('+1000000035', 'Jules Jordan', 'People Ops', 'HR', '5 years'),
    ('+1000000036', 'Kai Kim', 'Site Reliability', 'Technology', '7 years'),
    ('+1000000037', 'Lane Lopez', 'BizDev Director', 'Business', '11 years'),
    ('+1000000038', 'Morgan Moore', 'Technical Writer', 'Technology', '4 years'),
    ('+1000000039', 'Nico Nash', 'Brand Strategist', 'Marketing', '6 years'),
    ('+1000000040', 'Parker Patel', 'Infrastructure Lead', 'Technology', '10 years')
  ON CONFLICT (phone) DO NOTHING;

  IF john_id IS NULL THEN
    RAISE NOTICE 'Could not resolve John; abort';
    RETURN;
  END IF;

  -- Reset only John's edges so re-seeding is predictable
  DELETE FROM connections WHERE user1_id = john_id OR user2_id = john_id;

  -- John INNER: exactly the eight peers shown on the primary ring when sorted by strength
  INSERT INTO connections (user1_id, user2_id, strength, circle_type)
  SELECT LEAST(john_id, u.id), GREATEST(john_id, u.id), m.st, 'inner'
  FROM users u
  JOIN (VALUES
    ('+1000000001', 5), ('+1000000002', 5), ('+1000000003', 5), ('+1000000004', 5),
    ('+1000000005', 4), ('+1000000006', 4), ('+1000000007', 3), ('+1000000008', 3)
  ) AS m(phone, st) ON u.phone = m.phone
  ON CONFLICT (user1_id, user2_id) DO UPDATE SET
    circle_type = 'inner',
    strength = GREATEST(connections.strength, EXCLUDED.strength);

  -- John DIRECT SECONDARY: pool 009–040 (not inner to John — all qualify)
  FOR i IN 9..40 LOOP
    ph := '+1000000' || lpad(i::TEXT, 3, '0');
    SELECT id INTO oid FROM users WHERE phone = ph;
    IF oid IS NOT NULL THEN
      INSERT INTO connections (user1_id, user2_id, strength, circle_type)
      VALUES (
        LEAST(john_id, oid),
        GREATEST(john_id, oid),
        2 + (i % 4),
        'secondary'
      )
      ON CONFLICT (user1_id, user2_id) DO UPDATE SET
        circle_type = 'secondary',
        strength = GREATEST(connections.strength, EXCLUDED.strength);
    END IF;
  END LOOP;

  -- Inner-clique: full mesh among the eight (strength 3)
  FOR i IN 1..array_length(inner_phones, 1) LOOP
    FOR j IN i + 1..array_length(inner_phones, 1) LOOP
      SELECT id INTO aid FROM users WHERE phone = inner_phones[i];
      SELECT id INTO oid FROM users WHERE phone = inner_phones[j];
      IF aid IS NOT NULL AND oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 3, 'inner')
        ON CONFLICT (user1_id, user2_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  -- Per inner peer: INNER edges into overlapping pool bands (for secondary-for discovery)
  -- Alice 001 → 009–015
  SELECT id INTO aid FROM users WHERE phone = '+1000000001';
  IF aid IS NOT NULL THEN
    FOR i IN 9..15 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO oid FROM users WHERE phone = ph;
      IF oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 4, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET
          circle_type = EXCLUDED.circle_type,
          strength = GREATEST(connections.strength, EXCLUDED.strength);
      END IF;
    END LOOP;
  END IF;

  -- Bob 002 → 011–017
  SELECT id INTO aid FROM users WHERE phone = '+1000000002';
  IF aid IS NOT NULL THEN
    FOR i IN 11..17 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO oid FROM users WHERE phone = ph;
      IF oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 4, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET
          circle_type = EXCLUDED.circle_type,
          strength = GREATEST(connections.strength, EXCLUDED.strength);
      END IF;
    END LOOP;
  END IF;

  -- Charlie 003 → 013–019
  SELECT id INTO aid FROM users WHERE phone = '+1000000003';
  IF aid IS NOT NULL THEN
    FOR i IN 13..19 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO oid FROM users WHERE phone = ph;
      IF oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 4, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET
          circle_type = EXCLUDED.circle_type,
          strength = GREATEST(connections.strength, EXCLUDED.strength);
      END IF;
    END LOOP;
  END IF;

  -- Diana 004 → 015–022
  SELECT id INTO aid FROM users WHERE phone = '+1000000004';
  IF aid IS NOT NULL THEN
    FOR i IN 15..22 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO oid FROM users WHERE phone = ph;
      IF oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 4, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET
          circle_type = EXCLUDED.circle_type,
          strength = GREATEST(connections.strength, EXCLUDED.strength);
      END IF;
    END LOOP;
  END IF;

  -- Eve 005 → 017–024
  SELECT id INTO aid FROM users WHERE phone = '+1000000005';
  IF aid IS NOT NULL THEN
    FOR i IN 17..24 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO oid FROM users WHERE phone = ph;
      IF oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 4, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET
          circle_type = EXCLUDED.circle_type,
          strength = GREATEST(connections.strength, EXCLUDED.strength);
      END IF;
    END LOOP;
  END IF;

  -- Frank 006 → 019–028
  SELECT id INTO aid FROM users WHERE phone = '+1000000006';
  IF aid IS NOT NULL THEN
    FOR i IN 19..28 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO oid FROM users WHERE phone = ph;
      IF oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 3, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET
          circle_type = EXCLUDED.circle_type,
          strength = GREATEST(connections.strength, EXCLUDED.strength);
      END IF;
    END LOOP;
  END IF;

  -- Grace 007 → 022–032
  SELECT id INTO aid FROM users WHERE phone = '+1000000007';
  IF aid IS NOT NULL THEN
    FOR i IN 22..32 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO oid FROM users WHERE phone = ph;
      IF oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 3, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET
          circle_type = EXCLUDED.circle_type,
          strength = GREATEST(connections.strength, EXCLUDED.strength);
      END IF;
    END LOOP;
  END IF;

  -- Henry 008 → 025–035
  SELECT id INTO aid FROM users WHERE phone = '+1000000008';
  IF aid IS NOT NULL THEN
    FOR i IN 25..35 LOOP
      ph := '+1000000' || lpad(i::TEXT, 3, '0');
      SELECT id INTO oid FROM users WHERE phone = ph;
      IF oid IS NOT NULL THEN
        INSERT INTO connections (user1_id, user2_id, strength, circle_type)
        VALUES (LEAST(aid, oid), GREATEST(aid, oid), 4, 'inner')
        ON CONFLICT (user1_id, user2_id) DO UPDATE SET
          circle_type = EXCLUDED.circle_type,
          strength = GREATEST(connections.strength, EXCLUDED.strength);
      END IF;
    END LOOP;
  END IF;

  -- Cross-pool mesh (inner inner): tie pool members so strengths/triggers stay realistic
  FOR i IN 9..39 LOOP
    ph := '+1000000' || lpad(i::TEXT, 3, '0');
    ph2 := '+1000000' || lpad((i + 1)::TEXT, 3, '0');
    SELECT id INTO aid FROM users WHERE phone = ph;
    SELECT id INTO oid FROM users WHERE phone = ph2;
    IF aid IS NOT NULL AND oid IS NOT NULL THEN
      INSERT INTO connections (user1_id, user2_id, strength, circle_type)
      VALUES (LEAST(aid, oid), GREATEST(aid, oid), 2, 'inner')
      ON CONFLICT (user1_id, user2_id) DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Graph seed complete for John id % — inner 8, direct secondaries 009–040, peer pools wired.', john_id;
END
$seed$;
