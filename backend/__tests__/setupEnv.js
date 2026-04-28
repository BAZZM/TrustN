// Runs before db.js or app code is loaded. Sets DATABASE_URL to point at the
// dedicated test database that globalSetup will have just created.
const host = process.env.TEST_PG_HOST || '127.0.0.1';
const port = process.env.TEST_PG_PORT || '5433';
const user = process.env.TEST_PG_USER || 'trustnetwork';
const password = process.env.TEST_PG_PASSWORD || 'changeme123';
const dbName = process.env.TEST_DB_NAME || 'trustnetwork_test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
// Disable phone verification for the auth tests; OTP path is exercised separately.
process.env.STATEMENT_TIMEOUT_MS = process.env.STATEMENT_TIMEOUT_MS || '15000';
