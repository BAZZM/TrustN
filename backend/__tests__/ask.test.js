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

const ask = (userId, question) =>
  request(app).post('/api/connections/ask').set(authHeader(userId)).send({ question });

beforeEach(async () => {
  await resetDynamicData();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/connections/ask', () => {
  test('unauthenticated returns 401', async () => {
    const res = await request(app).post('/api/connections/ask').send({ question: 'design' });
    expect(res.status).toBe(401);
  });

  test('rejects an empty or over-long question', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    expect((await ask(viewer.id, '   ')).status).toBe(400);
    expect((await request(app).post('/api/connections/ask').set(authHeader(viewer.id)).send({})).status).toBe(400);
    expect((await ask(viewer.id, 'a'.repeat(301))).status).toBe(400);
  });

  test('a question with no usable words returns no results', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const res = await ask(viewer.id, 'who do you know?');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.interpretation.terms).toEqual([]);
  });

  test('finds a secondary through an inner peer and names the introducer', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const henry = await createUser({ name: 'Henry Harris', job_role: 'Accountant', industry: 'Finance' });
    const paul = await createUser({
      name: 'Paul Parker',
      job_role: 'Design Lead',
      industry: 'Healthcare',
      experience: 'private hospital design bio',
    });
    await createInnerConnection(viewer.id, henry.id);
    await createInnerConnection(henry.id, paul.id);

    const res = await ask(viewer.id, 'Who works in healthcare and has led a design team?');

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('rules');
    expect(res.body.interpretation.terms).toEqual(expect.arrayContaining(['healthcare', 'design']));

    const hit = res.body.results.find((r) => r.id === paul.id);
    expect(hit).toBeTruthy();
    expect(hit.kind).toBe('secondary');
    expect(hit.path).toEqual({ kind: 'via_inner', via: { id: henry.id, name: 'Henry Harris' } });
    expect(hit.reason).toMatch(/Introduced through Henry Harris/);

    // No phone numbers or bio text, only field names.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('private hospital design bio');
    expect(body).not.toContain(paul.phone);
    expect(body).not.toContain(henry.phone);
    expect(Object.keys(hit)).not.toContain('experience');
    expect(Object.keys(hit)).not.toContain('phone');
  });

  test('finds an inner peer and ranks the fuller match first', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Ivy Inner', job_role: 'Designer', industry: 'Retail' });
    const viaPeer = await createUser({ name: 'Wide Match', job_role: 'Design Lead', industry: 'Healthcare' });
    const bridge = await createUser({ name: 'Bridge', job_role: 'Clerk', industry: 'Admin' });
    await createInnerConnection(viewer.id, inner.id);
    await createInnerConnection(viewer.id, bridge.id);
    await createInnerConnection(bridge.id, viaPeer.id);

    const res = await ask(viewer.id, 'healthcare design');

    expect(res.status).toBe(200);
    const ids = res.body.results.map((r) => r.id);
    expect(ids).toContain(inner.id);
    expect(ids).toContain(viaPeer.id);
    expect(ids.indexOf(viaPeer.id)).toBeLessThan(ids.indexOf(inner.id));
    expect(res.body.results.find((r) => r.id === inner.id).path).toEqual({ kind: 'direct_inner', via: null });
  });

  test('flags a direct secondary link that has no introducer', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const edgePal = await createUser({ name: 'Edge Pal', job_role: 'Painter', industry: 'Art' });
    await createSecondaryConnection(viewer.id, edgePal.id);

    const res = await ask(viewer.id, 'painter');

    const hit = res.body.results.find((r) => r.id === edgePal.id);
    expect(hit).toBeTruthy();
    expect(hit.path).toEqual({ kind: 'direct_edge_only', via: null });
  });

  test('never surfaces people outside the viewer\'s own network', async () => {
    const viewer = await createUser({ name: 'Viewer' });
    const inner = await createUser({ name: 'Inner', job_role: 'Clerk' });
    const stranger = await createUser({ name: 'Far Away', job_role: 'Design Lead', industry: 'Healthcare' });
    const strangersFriend = await createUser({ name: 'Strangers Friend' });
    await createInnerConnection(viewer.id, inner.id);
    await createInnerConnection(stranger.id, strangersFriend.id);

    const res = await ask(viewer.id, 'healthcare design');

    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.id)).not.toContain(stranger.id);
  });
});
