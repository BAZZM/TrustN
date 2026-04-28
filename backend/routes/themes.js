const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// List themes (configurable per instance)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, slug, config, created_at FROM themes ORDER BY id'
    );
    res.json({ themes: rows });
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ themes: [] });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
