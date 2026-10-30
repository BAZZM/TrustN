const request = require('supertest');
const app = require('../server');
const { signToken } = require('../middleware/auth');
const { pool } = require('../db');
const {
  resetDynamicData,
  createUser,
  createInnerConnection,
  createSecondaryConnection,
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

describe('GET /api/connections/graph', () => {
  test('unauthenticated returns 401', async () => {
    const res = await request(app).get('/api/connections/graph');
    expect(res.status).toBe(401);
  });

  test('returns inner peers and secondaries with direct / via / primary_via and no phone or bio', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner' });
    const discovered = await createUser({
      name: 'Discovered',
      job_role: 'Nuclear Llama Groomer',
      industry: 'Agriculture',
      experience: 'private herding bio',
    });
    const edgeOnly = await createUser({ name: 'Edge Pal', job_role: 'Painter', industry: 'Art' });

    await createInnerConnection(viewer.id, inner.id);
    await createInnerConnection(inner.id, discovered.id);
    await createSecondaryConnection(viewer.id, edgeOnly.id);

    const res = await request(app).get('/api/connections/graph').set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    expect(res.body.viewer_id).toBe(viewer.id);
    expect(res.body.inner.map((p) => p.id)).toEqual([inner.id]);
    expect(res.body.meta.inner_total).toBe(1);

    const disc = res.body.secondary.find((p) => p.id === discovered.id);
    expect(disc).toMatchObject({ direct: false, via: [inner.id], primary_via: inner.id });

    const edge = res.body.secondary.find((p) => p.id === edgeOnly.id);
    expect(edge).toMatchObject({ direct: true, via: [], primary_via: null });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('private herding bio');
    expect(body).not.toContain(discovered.phone);
    expect(body).not.toContain(inner.phone);
    expect(body).not.toMatch(/phone|experience/);
  });

  test('a person reachable through two inner peers lists both and picks the strongest, lowest id on ties', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const innerA = await createUser({ name: 'InnerA' });
    const innerB = await createUser({ name: 'InnerB' });
    const shared = await createUser({ name: 'Shared Contact' });

    await createInnerConnection(viewer.id, innerA.id);
    await createInnerConnection(viewer.id, innerB.id);
    await createInnerConnection(innerA.id, shared.id);
    await createInnerConnection(innerB.id, shared.id);

    const res = await request(app).get('/api/connections/graph').set(authHeader(viewer.id));
    expect(res.status).toBe(200);

    const row = res.body.secondary.find((p) => p.id === shared.id);
    expect(row.via).toEqual([innerA.id, innerB.id].sort((a, b) => a - b));

    // primary_via must be the strongest via peer as reported in `inner`, lowest id on ties.
    const strengthOf = new Map(res.body.inner.map((p) => [p.id, p.strength]));
    const expected = [...row.via].sort((a, b) => strengthOf.get(b) - strengthOf.get(a) || a - b)[0];
    expect(row.primary_via).toBe(expected);
  });

  test('focus restricts secondaries to that branch', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner1 = await createUser({ name: 'Inner1' });
    const inner2 = await createUser({ name: 'Inner2' });
    const onlyVia1 = await createUser({ name: 'Only Via One' });
    const onlyVia2 = await createUser({ name: 'Only Via Two' });

    await createInnerConnection(viewer.id, inner1.id);
    await createInnerConnection(viewer.id, inner2.id);
    await createInnerConnection(inner1.id, onlyVia1.id);
    await createInnerConnection(inner2.id, onlyVia2.id);

    const res = await request(app)
      .get('/api/connections/graph')
      .query({ focus: inner1.id })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    const ids = res.body.secondary.map((p) => p.id);
    expect(ids).toContain(onlyVia1.id);
    expect(ids).not.toContain(onlyVia2.id);
    expect(res.body.meta.focus).toBe(inner1.id);
    expect(res.body.inner).toHaveLength(2);
  });

  test('focus on someone who is not an inner peer returns no secondaries and no focus', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner' });
    const stranger = await createUser({ name: 'Stranger' });
    const behindInner = await createUser({ name: 'Behind Inner' });

    await createInnerConnection(viewer.id, inner.id);
    await createInnerConnection(inner.id, behindInner.id);

    const res = await request(app)
      .get('/api/connections/graph')
      .query({ focus: stranger.id })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    expect(res.body.secondary).toEqual([]);
    expect(res.body.meta.focus).toBeNull();
  });

  test('q filters secondaries by profile text', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner' });
    const match = await createUser({ name: 'Jane', job_role: 'Nuclear Llama Groomer', industry: 'Healthcare' });
    const other = await createUser({ name: 'Bob', job_role: 'Engineer', industry: 'Software' });

    await createInnerConnection(viewer.id, inner.id);
    await createInnerConnection(inner.id, match.id);
    await createInnerConnection(inner.id, other.id);

    const res = await request(app)
      .get('/api/connections/graph')
      .query({ q: 'llama' })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    const ids = res.body.secondary.map((p) => p.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(other.id);
    expect(res.body.meta.q).toBe('llama');
  });

  test('secondary=0 returns the inner ring only', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner' });
    const behind = await createUser({ name: 'Behind' });

    await createInnerConnection(viewer.id, inner.id);
    await createInnerConnection(inner.id, behind.id);

    const res = await request(app)
      .get('/api/connections/graph')
      .query({ secondary: 0 })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    expect(res.body.inner).toHaveLength(1);
    expect(res.body.secondary).toEqual([]);
  });

  test('invalid focus returns 400', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const res = await request(app)
      .get('/api/connections/graph')
      .query({ focus: 'abc' })
      .set(authHeader(viewer.id));
    expect(res.status).toBe(400);
  });
});
