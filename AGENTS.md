# Guidance for AI assistants and reviewers

Use this file together with **`.cursor/rules/`** (Cursor loads rules automatically). Canonical detail lives in linked docs—prefer them over stale chat summaries.

## Core references

| Topic | Document |
|--------|-----------|
| UI routes, dial vs legacy radial, API coupling, agent workflow | [`docs/UI_CHANGE_GUIDANCE.md`](docs/UI_CHANGE_GUIDANCE.md) |
| Product & data model | [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md) |
| Secondary search / `branch_only` / FTS API | [`docs/RELATIONSHIP_BASED_CONNECTIONS.md`](docs/RELATIONSHIP_BASED_CONNECTIONS.md) |
| Trust graph module (`graphLayout.js`) | [`frontend/src/components/connections/README.md`](frontend/src/components/connections/README.md) |
| CSP truth table + nginx surfaces | [`docs/SECURITY-CSP.md`](docs/SECURITY-CSP.md) |
| Before removing `unsafe-eval` | [`docs/CSP_TIGHTENING_QUESTIONS.md`](docs/CSP_TIGHTENING_QUESTIONS.md) |
| Fly deploy | [`deploy/FLY.md`](deploy/FLY.md) |
| Docker / DB init | [`docs/DOCKER.md`](docs/DOCKER.md) |

## Quick facts (avoid wrong assumptions)

- **`/contacts` radial** is **`DialContactScreen`**, not **`DemiRadialNetwork`** / **`RadialContactWheel`** (those files exist but are not routed from `App.js`).
- **`docs/archive/`** holds superseded radial/checklist docs—historical only.
- **Compose runtime nginx CSP** comes from the **`frontend/nginx/default.conf` volume mount**, not only the stricter **`frontend/nginx.conf`** baked into the image.

## Required checks

1. **Migrations:** After adding or reordering SQL under **`database/migrations/`**, or editing Compose DB mounts or **`backend/__tests__/helpers/testDb.js`** `MIGRATION_ORDER`, run **`cd backend && npm run verify:migrations`** (must exit 0).
2. **Backend/API contract changes:** Run **`cd backend && npm test`** (or the relevant `--testPathPattern`).
3. **CSP changes:** Update Helmet + **both** nginx site configs (**`default.conf`**, **`fly-static.conf`**) and **`docs/SECURITY-CSP.md`** in the same change unless you explicitly document env-only divergence.

## Frontend build notes

- CRA dev: **`frontend/`** proxies **`/api`** to **`localhost:5000`**; Compose publishes backend on host **3000**—do not run both on **3000** without stopping one.
