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

describe('GET /api/connections/secondary-search', () => {
  test('unauthenticated returns 401', async () => {
    const res = await request(app).get('/api/connections/secondary-search');
    expect(res.status).toBe(401);
  });

  test('returns union of discovery and stored secondary edges with source metadata', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner' });
    const viaDiscovery = await createUser({
      name: 'Discovered Peer',
      job_role: 'Nuclear Llama Groomer',
      industry: 'Agriculture',
      experience: '10 years herding',
    });
    const viaEdgeOnly = await createUser({
      name: 'Edge Pal',
      job_role: 'Painter',
      industry: 'Art',
      experience: '',
    });

    await createInnerConnection(viewer.id, inner.id);
    await createInnerConnection(inner.id, viaDiscovery.id);
    await createSecondaryConnection(viewer.id, viaEdgeOnly.id);

    const res = await request(app).get('/api/connections/secondary-search').set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    const ids = res.body.results.map((r) => r.peer_id);
    expect(ids).toContain(viaDiscovery.id);
    expect(ids).toContain(viaEdgeOnly.id);

    const disc = res.body.results.find((r) => r.peer_id === viaDiscovery.id);
    expect(disc.sources).toContain('discovery');

    const edge = res.body.results.find((r) => r.peer_id === viaEdgeOnly.id);
    expect(edge.sources).toContain('edge');
    expect(ids).not.toContain(viewer.id);
  });

  test('FTS q filters to matching profile fields', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner' });
    const matchUser = await createUser({
      name: 'Jane',
      job_role: 'Nuclear Llama Groomer',
      industry: 'Healthcare',
      experience: 'Short',
    });
    const nomatch = await createUser({
      name: 'Bob',
      job_role: 'Engineer',
      industry: 'Software',
      experience: '',
    });

    await createInnerConnection(viewer.id, inner.id);
    await createInnerConnection(inner.id, matchUser.id);
    await createInnerConnection(inner.id, nomatch.id);

    const res = await request(app)
      .get('/api/connections/secondary-search')
      .query({ q: 'llama' })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    const ids = res.body.results.map((r) => r.peer_id);
    expect(ids).toContain(matchUser.id);
    expect(ids).not.toContain(nomatch.id);
  });

  test('focused_inner_peer_id restricts discovery but keeps secondary edges', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner1 = await createUser({ name: 'Inner1' });
    const inner2 = await createUser({ name: 'Inner2' });
    const onlyViaInner1 = await createUser({
      name: 'I1Cand',
      job_role: 'A',
      industry: 'B',
      experience: '',
    });
    const onlyViaInner2 = await createUser({
      name: 'I2Cand',
      job_role: 'C',
      industry: 'D',
      experience: '',
    });
    const edgeBuddy = await createUser({
      name: 'EdgeBuddy',
      job_role: 'E',
      industry: 'F',
      experience: '',
    });

    await createInnerConnection(viewer.id, inner1.id);
    await createInnerConnection(viewer.id, inner2.id);
    await createInnerConnection(inner1.id, onlyViaInner1.id);
    await createInnerConnection(inner2.id, onlyViaInner2.id);
    await createSecondaryConnection(viewer.id, edgeBuddy.id);

    const res = await request(app)
      .get('/api/connections/secondary-search')
      .query({ focused_inner_peer_id: inner1.id })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    const ids = res.body.results.map((r) => r.peer_id);
    expect(ids).toContain(onlyViaInner1.id);
    expect(ids).not.toContain(onlyViaInner2.id);
    expect(ids).toContain(edgeBuddy.id);
  });

  test('focus on non-inner peer returns empty candidates', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const stranger = await createUser({ name: 'Stranger' });

    const res = await request(app)
      .get('/api/connections/secondary-search')
      .query({ focused_inner_peer_id: stranger.id })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  test('never returns users outside trust paths', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner' });
    const outsider = await createUser({
      name: 'Outsider Zombie',
      job_role: 'X',
      industry: 'Y',
      experience: '',
    });

    await createInnerConnection(viewer.id, inner.id);

    const res = await request(app).get('/api/connections/secondary-search').set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    const ids = res.body.results.map((r) => r.peer_id);
    expect(ids).not.toContain(outsider.id);
  });

  test('respects pagination limit', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner' });
    await createInnerConnection(viewer.id, inner.id);

    for (let i = 0; i < 5; i += 1) {
      const u = await createUser({
        name: `Cand ${i}`,
        job_role: 'Role',
        industry: 'Industry',
        experience: `${i}`,
      });
      await createInnerConnection(inner.id, u.id);
    }

    const res = await request(app)
      .get('/api/connections/secondary-search')
      .query({ limit: 3 })
      .set(authHeader(viewer.id));

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeLessThanOrEqual(3);
    expect(res.body.limit).toBe(3);
  });
});
