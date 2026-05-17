const express = require('express');
const { pool } = require('../db');
const { emitAnalyticsEvent } = require('../services/analyticsEmit');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { rows } = await pool.query(
      'SELECT id, phone, name, job_role, industry, experience, theme_id, large_text, high_contrast, locale, notifications_connection_requests, created_at, updated_at FROM users WHERE id = $1',
      [userIdInt]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const allowed = ['name', 'job_role', 'industry', 'experience', 'theme_id', 'large_text', 'high_contrast', 'locale', 'notifications_connection_requests'];
    const updates = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(key + ' = $' + i);
        i++;
        values.push(req.body[key]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userIdInt);
    await pool.query('UPDATE users SET ' + updates.join(', ') + ' WHERE id = $' + i, values);
    const { rows } = await pool.query(
      'SELECT id, phone, name, job_role, industry, experience, theme_id, large_text, high_contrast, locale, notifications_connection_requests FROM users WHERE id = $1',
      [userIdInt]
    );
    emitAnalyticsEvent(pool, { userId: userIdInt, eventType: 'profile_updated', payload: {} });
    res.json(rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
