# TrustN — Fly.io deployment (handoff guide)

This document is the **single source of truth** for running TrustN on [Fly.io](https://fly.io/docs/): what gets **uploaded** when you deploy, what lives **only on Fly**, and how a new teammate can **pick up** the stack from the repo plus their Fly account.

---

## 1. Mental model: Docker Compose vs Fly.io


| Local `docker-compose`                        | Fly.io                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| One `docker compose up` starts DB + API + web | **Three separate Fly “apps”** (each has its own machines, config, and optional secrets).                                                  |
| Images built on your machine                  | Images are **built** (local or remote builder) and **pushed** to Fly’s registry `registry.fly.io/<app>`, then **pulled** by Fly Machines. |
| Postgres in a container                       | **Fly Postgres** app (e.g. `trustn-db`) — a managed cluster, not the same as `docker compose` networking.                                 |


**Typical production names (adjust if yours differ):**


| Role              | Fly app name | Public URL (default)                              |
| ----------------- | ------------ | ------------------------------------------------- |
| PostgreSQL        | `trustn-db`  | *no public HTTP* (private `*.internal` / flycast) |
| Node API          | `trustn-api` | `https://trustn-api.fly.dev`                      |
| Static UI (nginx) | `trustn-web` | `https://trustn-web.fly.dev`                      |


The React app is built with `**REACT_APP_API_URL=https://trustn-api.fly.dev`** so the browser talks to the API over HTTPS. CORS is configured with `**FRONTEND_URL`** and optional `**CORS_ORIGINS`** on the API.

**Repo files that define Fly behavior:**


| Path                                                                    | Purpose                                                                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[backend/fly.toml](../backend/fly.toml)`                               | API: `internal_port = 8080`, `release_command`, VM size, `**[build]`** context repo root + `[backend/Dockerfile.fly](../backend/Dockerfile.fly)`. |
| `[backend/Dockerfile.fly](../backend/Dockerfile.fly)`                   | Production API image — includes `**database/`** SQL for bootstrap.                                                                                |
| `[frontend/fly.toml](../frontend/fly.toml)`                             | Web: nginx on port **80**, small VM.                                                                                                              |
| `[frontend/Dockerfile.fly](../frontend/Dockerfile.fly)`                 | CRA `**npm run build`** + nginx with `[nginx/fly-static.conf](../frontend/nginx/fly-static.conf)`.                                                |
| `[backend/scripts/db-bootstrap.js](../backend/scripts/db-bootstrap.js)` | Runs on `**release_command`** if DB empty (strips BOM, applies `schema.sql` + ordered migrations).                                                |


---

## 2. Prerequisites

1. **Install `flyctl`**
  Windows (PowerShell): `iwr https://fly.io/install.ps1 -useb | iex`  
   Add `C:\Users\BazzM\.fly\bin` to `**PATH**` (or use full path `flyctl.exe`).  
   Docs: [Install flyctl](https://fly.io/docs/hands-on/install-flyctl/).
2. **Log in** (browser or token):
  `flyctl auth login`  
   `flyctl auth whoami`
3. **Clone this repo** and install local dependencies only if you need to run `**npm`** outside Docker (`backend/`, `frontend/`).

---

## 3. What “upload” and “download” mean on Fly.io

### Upload (you → Fly)


| Action                            | Command / notes                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Deploy new image**              | `flyctl deploy` reads `fly.toml` + Dockerfile, builds (or uses cache), **pushes layers to** `registry.fly.io`, then updates machines. |
| **Secrets** (API keys, JWT, URLs) | `flyctl secrets set -a trustn-api KEY=value` — stored on Fly **only**, not in Git. Values are **not** shown again after set.          |
| **Config**                        | `backend/fly.toml` / `frontend/fly.toml` are **committed in Git**. Changes deploy when you run `flyctl deploy` after editing them.    |


### Download / inspect (Fly → you)


| Need                                  | Command                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Effective config**                  | `flyctl config show -a trustn-api` / `trustn-web`                                                                |
| **Secret names** (values hidden)      | `flyctl secrets list -a trustn-api`                                                                              |
| **Logs**                              | `flyctl logs -a trustn-api`                                                                                      |
| **Status / machines**                 | `flyctl status -a trustn-db` (and same for `trustn-api`, `trustn-web`)                                           |
| **Postgres connect**                  | `flyctl postgres connect -a trustn-db` (interactive `psql`)                                                      |
| **Postgres proxy (local tool to DB)** | `flyctl proxy 15432:5432 -a trustn-db` then point `psql`/GUI at `localhost:15432` (see Fly docs for exact port). |


There is no single “download my whole app as a zip” — the **source of truth for code** is **Git**; the **running state** is **machines + volumes + secrets** on Fly.

---

## 4. First-time provisioning (greenfield)

Skip to **§5** if `trustn-db`, `trustn-api`, and `trustn-web` already exist in your Fly org.

1. **Create Postgres** (pick region near users, e.g. `iad`):
  ```bash
   flyctl postgres create -n trustn-db -o personal -r iad --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 10
  ```
2. **Create empty apps** (names must match `app =` in each `fly.toml` or edit `fly.toml`):
  ```bash
   flyctl apps create trustn-api -o personal
   flyctl apps create trustn-web -o personal
  ```
3. **Attach DB to API** — creates `**DATABASE_URL`** on `trustn-api`:
  ```bash
   flyctl postgres attach trustn-db --app trustn-api --database-name trustnetwork --yes
  ```
4. **API secrets** (replace `JWT_SECRET` with a long random string):
  ```bash
   flyctl secrets set -a trustn-api JWT_SECRET="YOUR_LONG_SECRET" FRONTEND_URL="https://trustn-web.fly.dev" CORS_ORIGINS="https://trustn-web.fly.dev"
  ```
5. **Deploy API** from **repository root** (build context must include `database/` per `backend/fly.toml`):
  ```bash
   cd /path/to/trust-network-connections-rebuild
   flyctl deploy --config backend/fly.toml -a trustn-api --yes
  ```
   The `**release_command**` runs `node scripts/db-bootstrap.js` once per deploy if the DB has no `public.users` table yet. Subsequent deploys pick up new `database/migrations/*.sql` entries via `schema_version` (for example `016_unified_secondary_fts`: `user_search_vector`, trigger, `app_unified_secondary_search`, FTS backfill).
6. **Deploy Web** — **must** use `**frontend/`** as the working directory so upload size stays small:
  ```bash
   cd frontend
   flyctl deploy . -a trustn-web --build-arg REACT_APP_API_URL=https://trustn-api.fly.dev --yes
  ```
7. **Verify**
  ```bash
   curl https://trustn-api.fly.dev/api/health
   curl -s -o /dev/null -w "%{http_code}" https://trustn-web.fly.dev/health
  ```

---

## 5. Ongoing updates (brownfield — pick up from Git + Fly)

Someone with **Git access** and `**flyctl auth`** to the same Fly org:

1. `git pull`
2. **API** (from repo root):
  ```bash
   flyctl deploy --config backend/fly.toml -a trustn-api --yes
  ```
3. **Web** (if JS/CSS/API URL changed — **re-bake** `REACT_APP_API_URL` when API hostname changes):
  ```bash
   cd frontend
   flyctl deploy . -a trustn-web --build-arg REACT_APP_API_URL=https://trustn-api.fly.dev --yes
  ```
4. **Secrets only** (no full deploy):
  `flyctl secrets set -a trustn-api KEY=value` then **redeploy API** so the process sees new env (Fly injects secrets at deploy).

---

## 6. Environment reference (API app)


| Variable       | Set via                                               | Notes                                                                     |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL` | `flyctl postgres attach`                              | Do not commit.                                                            |
| `JWT_SECRET`   | `flyctl secrets set`                                  | Required.                                                                 |
| `FRONTEND_URL` | `flyctl secrets set`                                  | Must match `**https://trustn-web.fly.dev`** (no trailing slash) for CORS. |
| `CORS_ORIGINS` | `flyctl secrets set`                                  | Optional comma-separated extra origins.                                   |
| `PORT`         | `[backend/fly.toml](../backend/fly.toml)` `**[env]`** | **8080** — must match `internal_port` and `app.listen`.                   |
| `NODE_ENV`     | `fly.toml`                                            | `production`.                                                             |
| Twilio         | `flyctl secrets set`                                  | Optional; see `[backend/.env.example](../backend/.env.example)`.          |


---

## 7. Troubleshooting


| Symptom                                   | What to check                                                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Huge slow **frontend** deploy             | You ran `flyctl deploy` from **repo root** with only `--config frontend/fly.toml`. **Always** `cd frontend` and `flyctl deploy .` or pass `**frontend`** as [WORKING_DIRECTORY](https://fly.io/docs/flyctl/deploy/). |
| API not reachable                         | `flyctl logs -a trustn-api`; `internal_port` **8080** and `**PORT=8080`** in `backend/fly.toml`.                                                                                                                     |
| CORS / login fails                        | `FRONTEND_URL` exactly matches browser origin; redeploy web if API URL changed.                                                                                                                                      |
| DB errors                                 | `flyctl postgres connect -a trustn-db`; confirm attach: `flyctl secrets list -a trustn-api` includes `DATABASE_URL`.                                                                                                 |
| Metrics / “token unavailable” CLI warning | Often harmless; see Fly status page if deploys fail.                                                                                                                                                                 |


---

## 8. CI (optional)

Create a **[personal access token](https://fly.io/user/personal_access_tokens)**, add GitHub secret `**FLY_API_TOKEN`**, run `flyctl deploy` in Actions. Never commit tokens.

---

## 9. Quick command cheat sheet

```text
flyctl apps list
flyctl status -a trustn-db
flyctl status -a trustn-api
flyctl status -a trustn-web
flyctl logs -a trustn-api
flyctl deploy --config backend/fly.toml -a trustn-api --yes    # from repo root
cd frontend && flyctl deploy . -a trustn-web --build-arg REACT_APP_API_URL=https://trustn-api.fly.dev --yes
```

---

## 10. Related local docs

- **Local Docker Compose**: root `[README.md](../README.md)` “Quick Start”.
- **Backend env sample**: `[backend/.env.example](../backend/.env.example)`.

