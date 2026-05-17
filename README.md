# Trust Network (**TrustN**)

Deploy to production with **[Fly.io](https://fly.io/)** using **`backend/fly.toml`**, **`frontend/fly.toml`**, and the Dockerfiles referenced there. Full **handoff / upload–download workflow** (what lives on Fly vs Git, provision, deploy, inspect): **[`deploy/FLY.md`](deploy/FLY.md)**.

**AI / coding-agent context:** **[`AGENTS.md`](AGENTS.md)** and **[`.cursor/rules/`](.cursor/rules/)** (persistent checklist); UI specifics in **[`docs/UI_CHANGE_GUIDANCE.md`](docs/UI_CHANGE_GUIDANCE.md)**.

---

## Features
✓ Phone verification & authentication
✓ Contact import & automatic matching
✓ Network browsing & search
✓ Introduction requests system
✓ Analytics dashboard
✓ Scalable architecture
✓ Production-ready

## Quick Start

1. Ensure Docker Desktop is running
2. Run: `docker-compose up -d --build`
3. Access: http://localhost
4. Test login: +1234567890 / code: 123456

## Architecture
- Frontend: trust-network-web (React, port 80)
- Backend: trust-network-api (Node.js, host port **3000**)
- Database: trust-network-db (PostgreSQL, host port **5433** → container 5432)

## Commands
```powershell
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f

# Status
docker-compose ps

# Rebuild
docker-compose up -d --build

# Database (default DB name: trustnetwork)
docker exec -it trust-network-db psql -U trustnetwork -d trustnetwork
```

## Test Users
- +1234567890 - John Doe (Software Engineer)
- +0987654321 - Jane Smith (Product Manager)
- +1122334455 - Alice Johnson (Data Scientist)
- +5544332211 - Bob Wilson (UX Designer)

All test logins use code: 123456 (only if phone verification is enabled and that OTP exists in `otp_codes`).

## Local dev (Create React App on port 3000 + Express API on 5000)

**Port 3000:** Only one process can listen on host **3000**. The Compose **backend** publishes **3000**, and Create React App defaults to **3000** — they cannot run at the same time. Stop the Docker backend (`docker compose stop backend`) or run `docker compose down` before `npm start`, or use the **full Docker UI** at **http://localhost** (nginx on port **80**) instead of CRA.

1. **PostgreSQL running** — either:
   - **Docker (recommended, matches `database/` init scripts):** start Docker Desktop, then from the repo root run `docker compose up -d database` and wait until the container is healthy. Host port is **5433** (see `docker-compose.yml`). Set `DATABASE_URL` in `backend/.env` to match [`backend/.env.example`](backend/.env.example).
   - **Local install:** create a DB and point `DATABASE_URL` at it (e.g. port 5432).
2. If the DB is new or you need demo data, run migrations/seed (Compose mounts SQL on first start), then from `backend/`: `npm run seed:graph` for user **+1234567890** and graph data.
3. In one terminal, `cd backend` and `node server.js` — you should see **API listening on http://localhost:5000**.
4. In another, `cd frontend` and `npm start` — open **http://localhost:3000** and hard-refresh. The dev server proxies `/api` to port **5000**; with the API and DB up, you should not see `ECONNREFUSED` in the proxy log.
5. If `require_phone_verification` is off in the database, you can sign in with **+1234567890** with no SMS code. If the API is not running, the login form shows a message that the API is unreachable, not "number not found".

## Production Setup
1. Change POSTGRES_PASSWORD in .env
2. Set JWT_SECRET to a secure random string
3. Configure Twilio for real SMS (optional)
4. Enable HTTPS with SSL certificates
5. Set up monitoring and backups

See deployment-manual.md for complete instructions.
