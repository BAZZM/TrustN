const request = require('supertest');
const app = require('../server');
const { signToken } = require('../middleware/auth');
const { pool } = require('../db');
const {
  resetDynamicData,
  createUser,
  createInnerConnection,
  createSecondaryConnection,
  createPendingRequest,
} = require('./helpers/fixtures');
const { refreshDashboardSummaries } = require('../services/dashboardRollup');

function authHeader(userId) {
  return { Authorization: `Bearer ${signToken(userId)}` };
}

beforeEach(async () => {
  await resetDynamicData();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/me/dashboard', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/me/dashboard');
    expect(res.status).toBe(401);
  });

  test('returns KPI totals and window comparisons after rollup', async () => {
    const u = await createUser({ name: 'DashUser' });
    const a = await createUser({ name: 'PeerA' });
    const b = await createUser({ name: 'PeerB' });
    await createInnerConnection(u.id, a.id);
    await createSecondaryConnection(u.id, b.id);

    await refreshDashboardSummaries();

    const res = await request(app).get('/api/me/dashboard').set(authHeader(u.id));
    expect(res.status).toBe(200);
    expect(res.body.kpis.inner.total).toBe(1);
    expect(res.body.kpis.secondary.total).toBe(1);
    expect(res.body.kpis.acquired_inner.total).toBe(0);
    expect(res.body.computed_at).toBeTruthy();
    expect(res.body.actions).toEqual([]);
  });

  test('contextual action when pending inbox', async () => {
    const target = await createUser({ name: 'Target' });
    const requester = await createUser({ name: 'Requester' });
    await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      circleType: 'inner',
    });

    await refreshDashboardSummaries();

    const res = await request(app).get('/api/me/dashboard').set(authHeader(target.id));
    expect(res.status).toBe(200);
    expect(res.body.context.pending_inbox_count).toBeGreaterThanOrEqual(1);
    expect(res.body.actions.some((a) => a.id === 'review_introductions')).toBe(true);
  });
});

describe('GET /api/admin/system-health', () => {
  test('403 for non-admin', async () => {
    const u = await createUser({ name: 'NonAdmin' });
    const res = await request(app).get('/api/admin/system-health').set(authHeader(u.id));
    expect(res.status).toBe(403);
  });
});
