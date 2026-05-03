const { pool } = require('../../db');

// Wipes the rows that the introduction-flow tests touch so each test gets a
// deterministic starting point. Schema/seed migrations leave a lot of test
// users behind; we keep the schema and seeded reference data but clear all
// user-generated rows below ids that we'll insert.
async function resetDynamicData() {
  // TRUNCATE access_requests + connections; reset their sequences so ids are predictable per test.
  await pool.query(`
    TRUNCATE TABLE access_requests RESTART IDENTITY CASCADE;
    TRUNCATE TABLE connections RESTART IDENTITY CASCADE;
    TRUNCATE TABLE contacts RESTART IDENTITY CASCADE;
  `);
  // Wipe any test-created users (phones starting with +1555 or +1666)
  await pool.query(
    `DELETE FROM users WHERE phone LIKE '+1555%' OR phone LIKE '+1666%'`
  );
}

let phoneCounter = 0;
function nextPhone() {
  phoneCounter += 1;
  // 10-digit body so libphonenumber treats it as a valid US number
  const seq = String(phoneCounter).padStart(7, '0');
  return `+1555${seq}`;
}

async function createUser(overrides = {}) {
  const phone = overrides.phone || nextPhone();
  const name = overrides.name || `User ${phone}`;
  const job_role = overrides.job_role || 'Engineer';
  const industry = overrides.industry || 'Technology';
  const experience = overrides.experience || '5 years';
  const { rows } = await pool.query(
    `INSERT INTO users (phone, name, job_role, industry, experience)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, phone, name, job_role, industry, experience`,
    [phone, name, job_role, industry, experience]
  );
  return rows[0];
}

async function createInnerConnection(userAId, userBId) {
  const u1 = Math.min(userAId, userBId);
  const u2 = Math.max(userAId, userBId);
  const { rows } = await pool.query(
    `INSERT INTO connections (user1_id, user2_id, circle_type, strength)
     VALUES ($1, $2, 'inner', 1)
     ON CONFLICT (user1_id, user2_id) DO UPDATE SET circle_type = 'inner'
     RETURNING id, user1_id, user2_id, circle_type, strength`,
    [u1, u2]
  );
  return rows[0];
}

async function createSecondaryConnection(userAId, userBId, strength = 1) {
  const u1 = Math.min(userAId, userBId);
  const u2 = Math.max(userAId, userBId);
  const { rows } = await pool.query(
    `INSERT INTO connections (user1_id, user2_id, circle_type, strength)
     VALUES ($1, $2, 'secondary', $3)
     ON CONFLICT (user1_id, user2_id) DO UPDATE SET circle_type = 'secondary', strength = EXCLUDED.strength
     RETURNING id, user1_id, user2_id, circle_type, strength`,
    [u1, u2, strength]
  );
  return rows[0];
}

async function createPendingRequest({ requesterId, targetUserId, intermediaryId = null, circleType = 'inner', note = null }) {
  const { rows } = await pool.query(
    `INSERT INTO access_requests (requester_id, target_user_id, intermediary_id, status, circle_type, note)
     VALUES ($1, $2, $3, 'pending', $4, $5)
     RETURNING id, requester_id, target_user_id, intermediary_id, status, circle_type, approved_by_intermediary_at, approved_by_target_at`,
    [requesterId, targetUserId, intermediaryId, circleType, note]
  );
  return rows[0];
}

async function getRequest(id) {
  const { rows } = await pool.query('SELECT * FROM access_requests WHERE id = $1', [id]);
  return rows[0];
}

async function getConnectionBetween(aId, bId) {
  const u1 = Math.min(aId, bId);
  const u2 = Math.max(aId, bId);
  const { rows } = await pool.query(
    'SELECT * FROM connections WHERE user1_id = $1 AND user2_id = $2',
    [u1, u2]
  );
  return rows[0] || null;
}

module.exports = {
  resetDynamicData,
  createUser,
  createInnerConnection,
  createSecondaryConnection,
  createPendingRequest,
  getRequest,
  getConnectionBetween,
};
