/**
 * Loads database/seed_connections_graph_demo.sql using DATABASE_URL from .env
 * (same as the API). Run from backend: npm run seed:graph
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const fs = require("fs");
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL (e.g. in backend/.env) to your PostgreSQL connection string.");
    process.exit(1);
  }
  const sqlPath = path.join(__dirname, "../../database/seed_connections_graph_demo.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
  console.log("OK:", sqlPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
