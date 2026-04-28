/**
 * Loads schema.sql + numbered migrations once (PostgreSQL URL from DATABASE_URL).
 * Safe to skip if public.users already exists (idempotent-ish for redeploy).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function alreadyInitialized(client) {
  const r = await client.query(`
    SELECT 1 AS ok
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
    LIMIT 1
  `);
  return r.rowCount > 0;
}

async function main() {
  const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
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

  try {
    if (await alreadyInitialized(client)) {
      console.log('db-bootstrap: database already initialized, skipping');
      return;
    }

    const schemaSql = stripBom(fs.readFileSync(schemaPath, 'utf8'));
    await client.query(schemaSql);

    const files = fs
      .readdirSync(migDir)
      .filter((f) => /\.sql$/i.test(f))
      .sort();

    for (const file of files) {
      const p = path.join(migDir, file);
      console.log('db-bootstrap: applying', file);
      const sql = stripBom(fs.readFileSync(p, 'utf8'));
      await client.query(sql);
    }

    console.log('db-bootstrap: ok');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('db-bootstrap:', err.message || err);
  process.exit(1);
});
