'use strict';

const express = require('express');
const { pool } = require('../db');
const { refreshDashboardSummaries } = require('../services/dashboardRollup');

const router = express.Router();

function deltaFlow(curr, prev) {
  const window_current = curr;
  const window_previous = prev;
  const delta_abs = curr - prev;
  let delta_pct = null;
  if (prev !== 0) {
    delta_pct = Math.round((delta_abs / prev) * 1000) / 10;
  } else if (curr !== 0) {
    delta_pct = null;
  } else {
    delta_pct = 0;
  }
  return { window_current, window_previous, delta_abs, delta_pct };
}

function buildKpi(total, curr7, prev7) {
  return {
    total,
    comparison: deltaFlow(curr7, prev7),
  };
}

/** GET /api/me/dashboard — precomputed rollup row for authenticated user */
router.get('/dashboard', async (req, res) => {
  try {
    const userIdInt = parseInt(req.user.id, 10);
    if (Number.isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    let { rows } = await pool.query(
      `SELECT * FROM dashboard_user_summary WHERE user_id = $1`,
      [userIdInt]
    );

    if (rows.length === 0) {
      await refreshDashboardSummaries();
      rows = (
        await pool.query(`SELECT * FROM dashboard_user_summary WHERE user_id = $1`, [userIdInt])
      ).rows;
    }

    const row =
      rows[0] || {
        inner_total: 0,
        secondary_total: 0,
        acquired_inner_total: 0,
        inner_new_7d: 0,
        inner_new_prev_7d: 0,
        secondary_new_7d: 0,
        secondary_new_prev_7d: 0,
        acquired_inner_new_7d: 0,
        acquired_inner_new_prev_7d: 0,
        pending_inbox_count: 0,
        pending_sent_count: 0,
        computed_at: null,
      };

    const kpis = {
      inner: buildKpi(row.inner_total, row.inner_new_7d, row.inner_new_prev_7d),
      secondary: buildKpi(row.secondary_total, row.secondary_new_7d, row.secondary_new_prev_7d),
      acquired_inner: buildKpi(
        row.acquired_inner_total,
        row.acquired_inner_new_7d,
        row.acquired_inner_new_prev_7d
      ),
    };

    const actions = [];
    if (row.pending_inbox_count > 0) {
      actions.push({
        id: 'review_introductions',
        labelKey: 'dashboard.actionReviewIntroductions',
        href: '/connections',
        badge: row.pending_inbox_count,
      });
    }
    if (row.pending_sent_count > 0) {
      actions.push({
        id: 'pending_sent',
        labelKey: 'dashboard.actionPendingSent',
        href: '/connections',
        badge: row.pending_sent_count,
      });
    }

    res.json({
      computed_at: row.computed_at,
      kpis,
      context: {
        pending_inbox_count: row.pending_inbox_count,
        pending_sent_count: row.pending_sent_count,
      },
      actions,
    });
  } catch (err) {
    console.error('GET /api/me/dashboard', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
