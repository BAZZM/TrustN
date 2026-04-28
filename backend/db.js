const { Pool } = require('pg');

const STATEMENT_TIMEOUT_MS = parseInt(process.env.STATEMENT_TIMEOUT_MS, 10) || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

/**
 * Run callback with a client that has app.user_id and statement_timeout set (for RLS and safety).
 */
async function withUserContext(userId, fn) {
  const client = await pool.connect();
  try {
    // Convert userId to integer for RLS policy (user_id is INTEGER in DB)
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      throw new Error(`Invalid user_id: ${userId}`);
    }
    // SET LOCAL doesn't support parameterized queries in all PostgreSQL versions
    // Use pg_escape_literal or direct string interpolation (safe since we validated userIdInt)
    await client.query(`SET LOCAL app.user_id = '${userIdInt}'`);
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
    return await fn(client);
  } catch (err) {
    console.error('withUserContext error:', err.message, 'userId:', userId);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withUserContext, STATEMENT_TIMEOUT_MS };
