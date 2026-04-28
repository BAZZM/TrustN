const request = require('supertest');
const app = require('../server');
const { signToken } = require('../middleware/auth');
const { pool } = require('../db');
const {
  resetDynamicData,
  createUser,
  createInnerConnection,
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

describe('GET /api/connections/secondary-for/:id', () => {
  test('returns peer\'s other inner connections excluding viewer (regression: ReferenceError)', async () => {
    // viewer -- innerPeer -- candidateA, candidateB
    // viewer also has its own inner connection to "shared" (excluded from result)
    const viewer = await createUser({ name: 'Viewer' });
    const innerPeer = await createUser({ name: 'InnerPeer' });
    const candidateA = await createUser({ name: 'CandidateA', job_role: 'Data Scientist', industry: 'Healthcare' });
    const candidateB = await createUser({ name: 'CandidateB', job_role: 'Engineer', industry: 'Technology' });
    const shared = await createUser({ name: 'Shared' });

    await createInnerConnection(viewer.id, innerPeer.id);
    await createInnerConnection(innerPeer.id, candidateA.id);
    await createInnerConnection(innerPeer.id, candidateB.id);
    await createInnerConnection(viewer.id, shared.id);
    await createInnerConnection(innerPeer.id, shared.id); // shared is in BOTH viewer's and innerPeer's inner circles

    const res = await request(app)
      .get(`/api/connections/secondary-for/${innerPeer.id}`)
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.secondaryConnections)).toBe(true);
    const ids = res.body.secondaryConnections.map((r) => r.peer_id).sort();
    expect(ids).toEqual([candidateA.id, candidateB.id].sort());
    // shared is in viewer's inner circle already, so it MUST NOT appear
    expect(ids).not.toContain(shared.id);
  });

  test('job_role filter narrows results', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const innerPeer = await createUser({ name: 'InnerPeer' });
    const ds = await createUser({ name: 'DS', job_role: 'Data Scientist', industry: 'Healthcare' });
    const eng = await createUser({ name: 'Eng', job_role: 'Engineer', industry: 'Technology' });
    await createInnerConnection(viewer.id, innerPeer.id);
    await createInnerConnection(innerPeer.id, ds.id);
    await createInnerConnection(innerPeer.id, eng.id);

    const res = await request(app)
      .get(`/api/connections/secondary-for/${innerPeer.id}`)
      .query({ job_role: 'data' })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    const ids = res.body.secondaryConnections.map((r) => r.peer_id);
    expect(ids).toEqual([ds.id]);
    expect(res.body.filters).toEqual({ job_role: 'data', industry: null });
  });

  test('industry filter narrows results', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const innerPeer = await createUser({ name: 'InnerPeer' });
    const ds = await createUser({ name: 'DS', job_role: 'Data Scientist', industry: 'Healthcare' });
    const eng = await createUser({ name: 'Eng', job_role: 'Engineer', industry: 'Technology' });
    await createInnerConnection(viewer.id, innerPeer.id);
    await createInnerConnection(innerPeer.id, ds.id);
    await createInnerConnection(innerPeer.id, eng.id);

    const res = await request(app)
      .get(`/api/connections/secondary-for/${innerPeer.id}`)
      .query({ industry: 'tech' })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    const ids = res.body.secondaryConnections.map((r) => r.peer_id);
    expect(ids).toEqual([eng.id]);
  });

  test('non-inner peer returns 403', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const stranger = await createUser({ name: 'Stranger' });
    // No connection between viewer and stranger.

    const res = await request(app)
      .get(`/api/connections/secondary-for/${stranger.id}`)
      .set(authHeader(viewer.id));

    expect(res.status).toBe(403);
  });

  test('inner peer with no other connections returns empty list', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const innerPeer = await createUser({ name: 'InnerPeer' });
    await createInnerConnection(viewer.id, innerPeer.id);

    const res = await request(app)
      .get(`/api/connections/secondary-for/${innerPeer.id}`)
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    expect(res.body.secondaryConnections).toEqual([]);
  });

  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/connections/secondary-for/1');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/connections', () => {
  test('returns inner and secondary connections for the caller', async () => {
    const me = await createUser({ name: 'Me' });
    const inner = await createUser({ name: 'InnerFriend' });
    const stranger = await createUser({ name: 'Stranger' });
    await createInnerConnection(me.id, inner.id);
    await createInnerConnection(stranger.id, inner.id);

    const res = await request(app)
      .get('/api/connections')
      .set(authHeader(me.id));

    expect(res.status).toBe(200);
    const peerIds = res.body.connections.map((c) => c.peer_id).sort();
    expect(peerIds).toEqual([inner.id]);
  });
});
