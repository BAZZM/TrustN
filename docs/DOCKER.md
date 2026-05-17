# Docker - Trust Network

## Quick start

```bash
docker compose up -d
```

- Frontend (web): http://localhost (port 80)
- Backend API: http://localhost:3000 or via nginx frontend at `/api/`
- Database: localhost:5433 (maps to 5432 in the container; user trustnetwork, db trustnetwork)

## Clean rebuild (propagate code changes)

Rebuild images so all code and schema changes are applied:

```bash
docker compose build --no-cache && docker compose up -d
```

Scripts:
- Windows: `.\scripts\docker-rebuild.ps1`
- Linux/macOS: `./scripts/docker-rebuild.sh`

## Full reset (fresh database)

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

Or: `.\scripts\docker-rebuild.ps1 -Reset` / `./scripts/docker-rebuild.sh --reset`

## Database init order

On **first** Postgres start only, init scripts under `/docker-entrypoint-initdb.d/` run in **filename order**:

1. `01_schema.sql` → `database/schema.sql`
2. `02_migrations.sql` through `18_*.sql` → each file in `database/migrations/` from **`001_` … `017_`** (one mount per migration), same order as [`backend/__tests__/helpers/testDb.js`](../backend/__tests__/helpers/testDb.js) `MIGRATION_ORDER` and [`backend/scripts/db-bootstrap.js`](../backend/scripts/db-bootstrap.js) (sorted filenames).

**Fly.io:** new databases get **`schema.sql`** + the same migrations via **`release_command`** `node scripts/db-bootstrap.js` (see [`deploy/FLY.md`](../deploy/FLY.md)).

**Parity check:** from `backend/`, run `npm run verify:migrations` — fails if Compose mounts, Jest order, and files on disk diverge.

## Environment

Optional .env: POSTGRES_PASSWORD, FRONTEND_URL, JWT_SECRET.
