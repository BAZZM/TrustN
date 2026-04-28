-- Contacts: imported contact list per user (matched to users by phone)
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

-- Dual approval for secondary-circle requests: intermediary and target both must approve
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS approved_by_intermediary_at TIMESTAMP;
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS approved_by_target_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_access_requests_target ON access_requests(target_user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_requester ON access_requests(requester_id);

INSERT INTO schema_version (version, description) VALUES ('003_contacts_and_dual_approval', 'Contacts table, dual approval, seed users and connections')
ON CONFLICT (version) DO NOTHING;

-- Seed: test users with first and second circle
-- Users (extend existing seed)
INSERT INTO users (phone, name, job_role, industry, experience) VALUES
  ('+1111111111', 'Alex Primary', 'Engineer', 'Tech', '10 years'),
  ('+2222222222', 'Blake Second', 'Designer', 'Tech', '6 years'),
  ('+3333333333', 'Charlie Link', 'PM', 'Tech', '8 years'),
  ('+4444444444', 'Drew Outer', 'Analyst', 'Finance', '5 years')
ON CONFLICT (phone) DO NOTHING;

-- Inner circle: Alex–Blake, Alex–Charlie, Charlie–Drew
INSERT INTO connections (user1_id, user2_id, strength, circle_type)
SELECT LEAST(u1.id, u2.id), GREATEST(u1.id, u2.id), 1, 'inner'
FROM users u1, users u2
WHERE u1.phone = '+1111111111' AND u2.phone = '+2222222222'
ON CONFLICT (user1_id, user2_id) DO NOTHING;

INSERT INTO connections (user1_id, user2_id, strength, circle_type)
SELECT LEAST(u1.id, u2.id), GREATEST(u1.id, u2.id), 1, 'inner'
FROM users u1, users u2
WHERE u1.phone = '+1111111111' AND u2.phone = '+3333333333'
ON CONFLICT (user1_id, user2_id) DO NOTHING;

INSERT INTO connections (user1_id, user2_id, strength, circle_type)
SELECT LEAST(u1.id, u2.id), GREATEST(u1.id, u2.id), 1, 'inner'
FROM users u1, users u2
WHERE u1.phone = '+3333333333' AND u2.phone = '+4444444444'
ON CONFLICT (user1_id, user2_id) DO NOTHING;

-- John (+1234567890) inner with Jane; Jane inner with Alice (John can request Alice via Jane)
INSERT INTO connections (user1_id, user2_id, strength, circle_type)
SELECT LEAST(u1.id, u2.id), GREATEST(u1.id, u2.id), 1, 'inner'
FROM users u1, users u2
WHERE u1.phone = '+1234567890' AND u2.phone = '+0987654321'
ON CONFLICT (user1_id, user2_id) DO NOTHING;

INSERT INTO connections (user1_id, user2_id, strength, circle_type)
SELECT LEAST(u1.id, u2.id), GREATEST(u1.id, u2.id), 1, 'inner'
FROM users u1, users u2
WHERE u1.phone = '+0987654321' AND u2.phone = '+1122334455'
ON CONFLICT (user1_id, user2_id) DO NOTHING;

-- Imported contacts for John: Jane, Alice, Bob (so we have matched users)
INSERT INTO contacts (user_id, phone, name)
SELECT u.id, '+0987654321', 'Jane Smith'
FROM users u WHERE u.phone = '+1234567890'
ON CONFLICT (user_id, phone) DO NOTHING;

INSERT INTO contacts (user_id, phone, name)
SELECT u.id, '+1122334455', 'Alice Johnson'
FROM users u WHERE u.phone = '+1234567890'
ON CONFLICT (user_id, phone) DO NOTHING;

INSERT INTO contacts (user_id, phone, name)
SELECT u.id, '+5544332211', 'Bob Wilson'
FROM users u WHERE u.phone = '+1234567890'
ON CONFLICT (user_id, phone) DO NOTHING;

-- One pending secondary request: John requests Alice via Jane (intermediary)
INSERT INTO access_requests (requester_id, target_user_id, intermediary_id, status, circle_type)
SELECT r.id, t.id, i.id, 'pending', 'secondary'
FROM users r, users t, users i
WHERE r.phone = '+1234567890' AND t.phone = '+1122334455' AND i.phone = '+0987654321'
  AND NOT EXISTS (
    SELECT 1 FROM access_requests ar
    WHERE ar.requester_id = r.id AND ar.target_user_id = t.id AND ar.intermediary_id = i.id AND ar.status = 'pending'
  );
