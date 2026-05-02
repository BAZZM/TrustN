const request = require('supertest');
const app = require('../server');
const { signToken } = require('../middleware/auth');
const { pool } = require('../db');
const {
  resetDynamicData,
  createUser,
  createInnerConnection,
  createPendingRequest,
  getRequest,
  getConnectionBetween,
} = require('./helpers/fixtures');

function authHeader(userId) {
  return { Authorization: `Bearer ${signToken(userId)}` };
}

beforeEach(async () => {
  await resetDynamicData();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/connection-requests/:id/respond', () => {
  test('target can decline an inner request (regression: WITH CHECK rejected this)', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const req = await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      circleType: 'inner',
    });

    const res = await request(app)
      .post(`/api/connection-requests/${req.id}/respond`)
      .set(authHeader(target.id))
      .send({ action: 'decline' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, action: 'declined' });
    const after = await getRequest(req.id);
    expect(after.status).toBe('declined');
    expect(after.processed_at).not.toBeNull();
  });

  test('target can accept an inner request and a connection row is created', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const req = await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      circleType: 'inner',
    });

    const res = await request(app)
      .post(`/api/connection-requests/${req.id}/respond`)
      .set(authHeader(target.id))
      .send({ action: 'accept' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, action: 'accepted' });
    const conn = await getConnectionBetween(requester.id, target.id);
    expect(conn).not.toBeNull();
    expect(conn.circle_type).toBe('inner');
  });

  test('non-participant cannot respond', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const stranger = await createUser({ name: 'Stranger' });
    const req = await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      circleType: 'inner',
    });

    const res = await request(app)
      .post(`/api/connection-requests/${req.id}/respond`)
      .set(authHeader(stranger.id))
      .send({ action: 'decline' });

    // RLS hides the row from the stranger -> 404 "not found".
    expect([403, 404]).toContain(res.status);
    const after = await getRequest(req.id);
    expect(after.status).toBe('pending');
  });

  test('target cannot approve before intermediary (introduction queue)', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    await createInnerConnection(intermediary.id, target.id);
    const req = await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      intermediaryId: intermediary.id,
      circleType: 'secondary',
    });

    const r1 = await request(app)
      .post(`/api/connection-requests/${req.id}/respond`)
      .set(authHeader(target.id))
      .send({ action: 'approve_as_target' });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/Intermediary must approve/i);

    let after = await getRequest(req.id);
    expect(after.approved_by_target_at).toBeNull();
    expect(after.status).toBe('pending');
    expect(await getConnectionBetween(requester.id, target.id)).toBeNull();
  });

  test('approval order: intermediary then target -> INNER acquired edge created', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    await createInnerConnection(intermediary.id, target.id);
    const req = await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      intermediaryId: intermediary.id,
      circleType: 'secondary',
    });

    const r1 = await request(app)
      .post(`/api/connection-requests/${req.id}/respond`)
      .set(authHeader(intermediary.id))
      .send({ action: 'approve_as_intermediary' });
    expect(r1.status).toBe(200);
    let after = await getRequest(req.id);
    expect(after.approved_by_intermediary_at).not.toBeNull();
    expect(after.status).toBe('pending');
    expect(await getConnectionBetween(requester.id, target.id)).toBeNull();

    const r2 = await request(app)
      .post(`/api/connection-requests/${req.id}/respond`)
      .set(authHeader(target.id))
      .send({ action: 'approve_as_target' });
    expect(r2.status).toBe(200);

    after = await getRequest(req.id);
    expect(after.status).toBe('accepted');
    const conn = await getConnectionBetween(requester.id, target.id);
    expect(conn).not.toBeNull();
    expect(conn.circle_type).toBe('inner');
    expect(conn.introduced_via_request_id).toBe(req.id);
  });

  test('decline a secondary as intermediary marks declined (regression)', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    await createInnerConnection(intermediary.id, target.id);
    const req = await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      intermediaryId: intermediary.id,
      circleType: 'secondary',
    });

    const res = await request(app)
      .post(`/api/connection-requests/${req.id}/respond`)
      .set(authHeader(intermediary.id))
      .send({ action: 'decline' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('declined');
    const after = await getRequest(req.id);
    expect(after.status).toBe('declined');
  });

  test('approve_as_target rejected when caller is not the target', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    await createInnerConnection(intermediary.id, target.id);
    const req = await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      intermediaryId: intermediary.id,
      circleType: 'secondary',
    });

    const res = await request(app)
      .post(`/api/connection-requests/${req.id}/respond`)
      .set(authHeader(intermediary.id))
      .send({ action: 'approve_as_target' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/connection-requests', () => {
  test('target inbox hides secondary intro until intermediary approves', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    await createInnerConnection(intermediary.id, target.id);
    const reqRow = await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      intermediaryId: intermediary.id,
      circleType: 'secondary',
    });

    let res = await request(app).get('/api/connection-requests').set(authHeader(target.id));
    expect(res.status).toBe(200);
    expect(res.body.requests || []).toHaveLength(0);

    await request(app)
      .post(`/api/connection-requests/${reqRow.id}/respond`)
      .set(authHeader(intermediary.id))
      .send({ action: 'approve_as_intermediary' });

    res = await request(app).get('/api/connection-requests').set(authHeader(target.id));
    expect(res.body.requests.length).toBe(1);
  });

  test('intermediary sees pending secondary in inbox immediately', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    await createInnerConnection(intermediary.id, target.id);
    await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      intermediaryId: intermediary.id,
      circleType: 'secondary',
    });

    const res = await request(app).get('/api/connection-requests').set(authHeader(intermediary.id));
    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBe(1);
  });

  test('scope=all lists outbound pending for requester', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    await createInnerConnection(intermediary.id, target.id);
    await createPendingRequest({
      requesterId: requester.id,
      targetUserId: target.id,
      intermediaryId: intermediary.id,
      circleType: 'secondary',
    });

    const res = await request(app)
      .get('/api/connection-requests?scope=all')
      .set(authHeader(requester.id));

    expect(res.status).toBe(200);
    expect(res.body.inbox).toEqual([]);
    expect(res.body.sent.length).toBe(1);
  });
});

describe('POST /api/connection-requests', () => {
  test('secondary request via valid intermediary succeeds (regression: app_can_intermediate)', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    await createInnerConnection(intermediary.id, target.id);

    const res = await request(app)
      .post('/api/connection-requests')
      .set(authHeader(requester.id))
      .send({
        target_user_id: target.id,
        intermediary_id: intermediary.id,
        circle_type: 'secondary',
      });

    expect(res.status).toBe(201);
    expect(res.body.requester_id).toBe(requester.id);
    expect(res.body.target_user_id).toBe(target.id);
    expect(res.body.intermediary_id).toBe(intermediary.id);
    expect(res.body.circle_type).toBe('secondary');
  });

  test('secondary request rejected if intermediary not connected to requester', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    // Only intermediary <-> target exists, NOT requester <-> intermediary.
    await createInnerConnection(intermediary.id, target.id);

    const res = await request(app)
      .post('/api/connection-requests')
      .set(authHeader(requester.id))
      .send({
        target_user_id: target.id,
        intermediary_id: intermediary.id,
        circle_type: 'secondary',
      });

    expect(res.status).toBe(400);
  });

  test('secondary request rejected if intermediary not connected to target', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });
    const intermediary = await createUser({ name: 'Intermediary' });
    await createInnerConnection(requester.id, intermediary.id);
    // NO intermediary <-> target edge.

    const res = await request(app)
      .post('/api/connection-requests')
      .set(authHeader(requester.id))
      .send({
        target_user_id: target.id,
        intermediary_id: intermediary.id,
        circle_type: 'secondary',
      });

    expect(res.status).toBe(400);
  });

  test('inner request without intermediary succeeds', async () => {
    const requester = await createUser({ name: 'Requester' });
    const target = await createUser({ name: 'Target' });

    const res = await request(app)
      .post('/api/connection-requests')
      .set(authHeader(requester.id))
      .send({
        target_user_id: target.id,
        circle_type: 'inner',
      });

    expect(res.status).toBe(201);
    expect(res.body.circle_type).toBe('inner');
    expect(res.body.intermediary_id).toBeNull();
  });
});
