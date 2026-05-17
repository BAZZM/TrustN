/**
 * Ensures the same ordered migration set is used by:
 * - Docker Compose (postgres init volume mounts)
 * - Jest (backend/__tests__/helpers/testDb.js MIGRATION_ORDER)
 * - Fly/local db-bootstrap (database/migrations/*.sql lexicographic order)
 *
 * Run from repo root: cd backend && npm run verify:migrations
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIG_DIR = path.join(REPO_ROOT, 'database', 'migrations');
const COMPOSE_PATH = path.join(REPO_ROOT, 'docker-compose.yml');
const TEST_DB_HELPER = path.join(REPO_ROOT, 'backend', '__tests__', 'helpers', 'testDb.js');

function migrationsFromDisk() {
  return fs
    .readdirSync(MIG_DIR)
    .filter((f) => /\.sql$/i.test(f))
    .sort();
}

function migrationsFromCompose() {
  const text = fs.readFileSync(COMPOSE_PATH, 'utf8');
  const re = /\.\/database\/migrations\/([\w.-]+\.sql)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function migrationsFromTestDb() {
  const text = fs.readFileSync(TEST_DB_HELPER, 'utf8');
  const re = /['"](database\/migrations\/\d{3}_[^'"]+\.sql)['"]/g;
  const rel = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    rel.push(m[1]);
  }
  return rel.map((r) => path.basename(r));
}

function main() {
  const disk = migrationsFromDisk();
  const compose = migrationsFromCompose();
  const testDb = migrationsFromTestDb();

  const errors = [];

  if (compose.length === 0) {
    errors.push('No migration paths found in docker-compose.yml');
  }

  const uniqCompose = [...new Set(compose)];
  if (uniqCompose.length !== compose.length) {
    errors.push('docker-compose.yml lists duplicate migration mounts');
  }

  function cmp(name, a, b) {
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
      errors.push(`${name} mismatch:\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
    }
  }

  cmp('Docker Compose vs disk', compose, disk);
  cmp('testDb.js vs disk', testDb, disk);

  if (errors.length) {
    console.error('verify-migration-parity: FAILED\n');
    errors.forEach((e) => console.error(e + '\n'));
    process.exit(1);
  }

  console.log(`verify-migration-parity: ok (${disk.length} migrations aligned)`);
}

main();
