'use strict';

const { pool } = require('../db');

const FIVE_MIN_MS = 5 * 60 * 1000;
const ONE_YEAR_DAYS = 365;

async function refreshDashboardSummaries() {
  await pool.query('SELECT app_refresh_dashboard_summaries()');
}

async function purgeOldAnalyticsEvents() {
  await pool.query(
    `DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '${ONE_YEAR_DAYS} days'`
  );
}

/**
 * Idempotent rollup + optional analytics retention trim.
 */
async function runDashboardRollupCycle() {
  await refreshDashboardSummaries();
  try {
    await purgeOldAnalyticsEvents();
  } catch (err) {
    console.warn('dashboardRollup: purge analytics_events', err.message);
  }
}

function startDashboardRollupScheduler() {
  if (process.env.DISABLE_DASHBOARD_ROLLUP === '1') return null;
  if (process.env.NODE_ENV === 'test') return null;

  const ms = parseInt(process.env.DASHBOARD_ROLLUP_INTERVAL_MS, 10) || FIVE_MIN_MS;

  runDashboardRollupCycle().catch((err) =>
    console.warn('dashboardRollup: initial cycle', err.message)
  );

  const id = setInterval(() => {
    runDashboardRollupCycle().catch((err) =>
      console.warn('dashboardRollup: scheduled cycle', err.message)
    );
  }, ms);

  if (typeof id.unref === 'function') id.unref();
  return id;
}

module.exports = {
  refreshDashboardSummaries,
  runDashboardRollupCycle,
  startDashboardRollupScheduler,
};
