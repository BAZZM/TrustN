const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Admin users: comma-separated user IDs or phones from env (e.g. ADMIN_USER_IDS=1,2,3 or ADMIN_PHONES=+1234567890)
function isAdmin(userId, userPhone) {
  const ids = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const phones = (process.env.ADMIN_PHONES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.includes(String(userId))) return true;
  if (phones && userPhone && phones.includes(userPhone)) return true;
  return false;
}

async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const userId = req.user.id;
  const { rows } = await pool.query('SELECT id, phone FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) return res.status(403).json({ error: 'Forbidden' });
  if (!isAdmin(rows[0].id, rows[0].phone)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// GET admin config (all toggles) - for admin screen
router.get('/config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT key, value, description, updated_at FROM admin_config ORDER BY key'
    );
    const config = rows.map((r) => ({
      key: r.key,
      value: r.value === true || (typeof r.value === 'string' && r.value === 'true'),
      description: r.description,
      updated_at: r.updated_at,
    }));
    res.json({ config });
  } catch (err) {
    console.error('admin/config GET error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH admin config - update a toggle
router.patch('/config/:key', requireAuth, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'value required' });
    }
    const boolVal = value === true || value === 'true' || value === '1' || value === 1;
    await pool.query(
      `UPDATE admin_config SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE key = $2`,
      [JSON.stringify(boolVal), key]
    );
    const { rows } = await pool.query('SELECT key, value, description, updated_at FROM admin_config WHERE key = $1', [key]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Config key not found' });
    }
    res.json({
      key: rows[0].key,
      value: rows[0].value === true || rows[0].value === 'true',
      description: rows[0].description,
      updated_at: rows[0].updated_at,
    });
  } catch (err) {
    console.error('admin/config PATCH error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Operational snapshot for admins (API reachability is implicit — caller got here)
router.get('/system-health', requireAuth, requireAdmin, async (req, res) => {
  try {
    let databaseReachable = false;
    try {
      await pool.query('SELECT 1');
      databaseReachable = true;
    } catch (_) {
      databaseReachable = false;
    }

    const rollupRows = await pool.query(
      `SELECT MAX(computed_at) AS last_computed_at FROM dashboard_user_summary`
    );
    const userRows = await pool.query(`SELECT COUNT(*)::INTEGER AS n FROM users`);

    res.json({
      api: { ok: true },
      database: { reachable: databaseReachable },
      rollup: {
        last_computed_at: rollupRows.rows[0]?.last_computed_at || null,
      },
      platform: {
        registered_users: userRows.rows[0]?.n ?? 0,
      },
    });
  } catch (err) {
    console.error('admin/system-health GET error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single config value (for auth flow - require_phone_verification)
router.get('/config/require_phone_verification/value', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM admin_config WHERE key = 'require_phone_verification'`
    );
    const val = rows.length > 0 ? rows[0].value : false;
    const bool = val === true || val === 'true' || (typeof val === 'object' && val !== null);
    res.json({ require_phone_verification: !!bool });
  } catch (err) {
    res.json({ require_phone_verification: false });
  }
});

module.exports = router;
