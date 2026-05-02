const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const HOST = process.env.TEST_PG_HOST || '127.0.0.1';
const PORT = process.env.TEST_PG_PORT || '5433';
const USER = process.env.TEST_PG_USER || 'trustnetwork';
const PASSWORD = process.env.TEST_PG_PASSWORD || 'changeme123';
const DB_NAME = process.env.TEST_DB_NAME || 'trustnetwork_test';

const ADMIN_URL = `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/postgres`;
const TEST_URL = `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${DB_NAME}`;

// Order matches docker-compose mounting; schema.sql first then numbered migrations.
const MIGRATION_ORDER = [
  'database/schema.sql',
  'database/migrations/001_user_preferences_and_themes.sql',
  'database/migrations/002_schema_version_and_instances.sql',
  'database/migrations/003_contacts_and_dual_approval.sql',
  'database/migrations/004_security_hardening.sql',
  'database/migrations/005_comprehensive_test_data.sql',
  'database/migrations/006_verify_and_fix_test_data.sql',
  'database/migrations/007_test_user_100_inner_200_secondary.sql',
  'database/migrations/008_relationship_based_secondary_connections.sql',
  'database/migrations/009_admin_config_and_otp.sql',
  'database/migrations/010_rls_connections_access_requests.sql',
  'database/migrations/011_connection_strength_computed.sql',
  'database/migrations/012_rls_fixups_and_helpers.sql',
  'database/migrations/013_introduced_inner_connections.sql',
  'database/migrations/014_remove_seed_pending_introduction_requests.sql',
];

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

async function withAdminClient(fn) {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function dropTestDb() {
  await withAdminClient(async (client) => {
    // Terminate any lingering backends to allow DROP.
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [DB_NAME]
    );
    await client.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
  });
}

async function createTestDb() {
  await withAdminClient(async (client) => {
    await client.query(`CREATE DATABASE "${DB_NAME}"`);
  });
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

async function applyMigrations() {
  const dbClient = new Client({ connectionString: TEST_URL });
  await dbClient.connect();
  try {
    for (const rel of MIGRATION_ORDER) {
      const abs = path.join(REPO_ROOT, rel);
      const sql = stripBom(fs.readFileSync(abs, 'utf8'));
      // pg-node lets us send the whole script via simple-query protocol when
      // there are no parameters. Run as a single statement so DO blocks and
      // multi-statement scripts work as written.
      // eslint-disable-next-line no-await-in-loop
      await dbClient.query(sql);
    }
  } finally {
    await dbClient.end();
  }
}

async function setupTestDb() {
  await dropTestDb();
  await createTestDb();
  await applyMigrations();
}

async function teardownTestDb() {
  await dropTestDb();
}

module.exports = {
  TEST_URL,
  DB_NAME,
  setupTestDb,
  teardownTestDb,
};
