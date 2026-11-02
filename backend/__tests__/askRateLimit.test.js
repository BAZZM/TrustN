// The limiter reads its cap when the module loads, so set it before the app is required.
process.env.ASK_RATE_LIMIT_MAX = '2';

const request = require('supertest');
const app = require('../server');
const { signToken } = require('../middleware/auth');
const { pool } = require('../db');
const { resetDynamicData, createUser } = require('./helpers/fixtures');

const ask = (userId) =>
  request(app)
    .post('/api/connections/ask')
    .set({ Authorization: `Bearer ${signToken(userId)}` })
    .send({ question: 'designers' });

beforeEach(async () => {
  await resetDynamicData();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/connections/ask rate limit', () => {
  test('answers 429 once a user exceeds the cap, without affecting other users', async () => {
    const heavy = await createUser({ name: 'Heavy User' });
    const other = await createUser({ name: 'Other User' });

    expect((await ask(heavy.id)).status).toBe(200);
    expect((await ask(heavy.id)).status).toBe(200);
    const limited = await ask(heavy.id);
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/too many/i);

    expect((await ask(other.id)).status).toBe(200);
  });
});
