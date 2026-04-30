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

On first start, Postgres runs in order:
1. 01_schema.sql - base tables
2. 02_migrations.sql - themes, user preferences, circle_type
3. 03_schema_version_and_instances.sql - schema_version, instances, locales

## Environment

Optional .env: POSTGRES_PASSWORD, FRONTEND_URL, JWT_SECRET.
