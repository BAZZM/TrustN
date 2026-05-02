const { Pool } = require('pg');

const STATEMENT_TIMEOUT_MS = parseInt(process.env.STATEMENT_TIMEOUT_MS, 10) || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

/**
 * Run callback with a client that has app.user_id and statement_timeout set (for RLS and safety).
 * Uses session-level GUCs and RESET in `finally` so every query on this pooled connection sees the
 * same user identity. (Autocommitted SET LOCAL clears after each standalone statement — empty graph
 * on Fly — and wrapping the entire callback in BEGIN/COMMIT broke some UPDATE paths under test.)
 */
async function withUserContext(userId, fn) {
  const client = await pool.connect();
  try {
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      throw new Error(`Invalid user_id: ${userId}`);
    }
    await client.query(`SET app.user_id = '${userIdInt}'`);
    await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
    return await fn(client);
  } catch (err) {
    console.error('withUserContext error:', err.message, 'userId:', userId);
    throw err;
  } finally {
    try {
      await client.query('RESET app.user_id');
    } catch (_) {
      /* custom GUC may be unset */
    }
    try {
      await client.query('RESET statement_timeout');
    } catch (_) {
      /* ignore */
    }
    client.release();
  }
}

module.exports = { pool, withUserContext, STATEMENT_TIMEOUT_MS };
