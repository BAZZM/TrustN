/**
 * Loads schema.sql + numbered migrations via DATABASE_URL (release_command).
 * - First blank DB: apply schema.sql, then each migration ordered by filename.
 * - Subsequent deploys: apply any *.sql migrations whose basename is not recorded in schema_version.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function usersTableExists(client) {
  const r = await client.query(`
    SELECT 1 AS ok
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
    LIMIT 1
  `);
  return r.rowCount > 0;
}

async function fetchAppliedVersions(client) {
  try {
    const { rows } = await client.query(`SELECT version FROM schema_version`);
    return new Set(rows.map((row) => row.version));
  } catch (e) {
    if (e.code === '42P01') {
      return new Set();
    }
    throw e;
  }
}

async function applyMigrationFile(client, filePath, label) {
  const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
  const sql = stripBom(fs.readFileSync(filePath, 'utf8'));
  console.log(`db-bootstrap: ${label}`, path.basename(filePath));
  await client.query(sql);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== 'string') {
    console.error('db-bootstrap: DATABASE_URL is required');
    process.exit(1);
  }

  const databaseRoot = path.join(__dirname, '..', 'database');
  const schemaPath = path.join(databaseRoot, 'schema.sql');
  const migDir = path.join(databaseRoot, 'migrations');

  if (!fs.existsSync(schemaPath)) {
    console.error('db-bootstrap: missing', schemaPath);
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);

  try {
    const migrationFiles = fs
      .readdirSync(migDir)
      .filter((f) => /\.sql$/i.test(f))
      .sort();

    const initialized = await usersTableExists(client);

    if (!initialized) {
      const schemaSql = stripBom(fs.readFileSync(schemaPath, 'utf8'));
      console.log('db-bootstrap: applying schema.sql');
      await client.query(schemaSql);
      for (const file of migrationFiles) {
        await applyMigrationFile(client, path.join(migDir, file), 'applying');
      }
      console.log('db-bootstrap: ok (cold start)');
      return;
    }

    let appliedVersions = await fetchAppliedVersions(client);
    let pending = migrationFiles.filter((f) => !appliedVersions.has(path.basename(f, '.sql')));

    if (pending.length === 0) {
      console.log('db-bootstrap: database already initialized, no pending migrations');
      return;
    }

    console.log(`db-bootstrap: applying ${pending.length} pending migration(s)`);
    for (const file of pending) {
      await applyMigrationFile(client, path.join(migDir, file), 'applying pending');
      appliedVersions = await fetchAppliedVersions(client);
      const key = path.basename(file, '.sql');
      if (!appliedVersions.has(key)) {
        console.warn(`db-bootstrap: warning migration ${file} did not insert schema_version row '${key}'`);
      }
    }
    console.log('db-bootstrap: ok (migrations)');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('db-bootstrap:', err.message || err);
  process.exit(1);
});
