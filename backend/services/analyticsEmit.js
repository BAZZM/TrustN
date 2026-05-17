'use strict';

const crypto = require('crypto');

function hashRef(id, salt) {
  if (id == null) return null;
  return crypto.createHash('sha256').update(`${salt}:${String(id)}`).digest('hex').slice(0, 32);
}

/**
 * Fire-and-forget server-side analytics row (fine-grained events).
 * Payload must never include raw phone / email — only enums, counts, hashed refs.
 */
function emitAnalyticsEvent(pool, { userId, eventType, payload = {} }) {
  const salt =
    process.env.ANALYTICS_HASH_SALT || process.env.JWT_SECRET || 'trustn-analytics-salt';
  const safe = { ...payload };
  if (safe.target_user_id != null) {
    safe.target_ref = hashRef(safe.target_user_id, salt);
    delete safe.target_user_id;
  }
  if (safe.intermediary_id != null) {
    safe.intermediary_ref = hashRef(safe.intermediary_id, salt);
    delete safe.intermediary_id;
  }
  return pool
    .query(
      `INSERT INTO analytics_events (user_id, event_type, event_data)
       VALUES ($1::integer, $2, $3::jsonb)`,
      [userId, eventType, JSON.stringify(safe)]
    )
    .catch((err) => {
      console.warn('analyticsEmit:', eventType, err.message);
    });
}

module.exports = { emitAnalyticsEvent, hashRef };
