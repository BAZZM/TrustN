/**
 * Jest config for the Trust Network backend.
 *
 * Tests run against a real PostgreSQL instance (the docker-compose `database`
 * service mapped to localhost:5433 by default). They create a dedicated test
 * database, apply migrations through `database/migrations/018_dashboard_user_summary.sql`, and drop it on teardown.
 *
 * Required env vars (with sensible defaults):
 *   TEST_PG_HOST     (default 127.0.0.1)
 *   TEST_PG_PORT     (default 5433)
 *   TEST_PG_USER     (default trustnetwork)
 *   TEST_PG_PASSWORD (default changeme123)
 *   TEST_DB_NAME     (default trustnetwork_test)
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  setupFiles: ['<rootDir>/__tests__/setupEnv.js'],
  globalSetup: '<rootDir>/__tests__/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/globalTeardown.js',
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
};
