# UI change guidance — context, pitfalls, and agent workflow

This document is the **working map** for anyone changing the Trust Network frontend (including automated agents). It ties together routing, trust-graph vs contacts UX, API coupling, i18n, CSP, and deployment surfaces. Use it **before** implementing UI changes so assumptions stay aligned with the repo.

**Repo-wide agent checklist:** [`AGENTS.md`](../AGENTS.md), Cursor [**`.cursor/rules/trustn-agent-context.mdc`**](../.cursor/rules/trustn-agent-context.mdc) (`alwaysApply`).

**Companion docs (prefer these when scopes overlap):**

| Topic | Primary reference |
|--------|-------------------|
| Connections trust graph + hit-testing order | [`docs/FRONTEND_DOCUMENTATION.md`](FRONTEND_DOCUMENTATION.md) (Connections section), [`frontend/src/components/connections/README.md`](../frontend/src/components/connections/README.md) |
| Secondary discovery API (`secondary-search`, `branch_only`, FTS) | [`docs/RELATIONSHIP_BASED_CONNECTIONS.md`](RELATIONSHIP_BASED_CONNECTIONS.md) §2b+ |
| Product / data model | [`docs/PRODUCT_OVERVIEW.md`](PRODUCT_OVERVIEW.md) |
| Fly deploy | [`deploy/FLY.md`](../deploy/FLY.md) |
| Migration parity (Compose / Jest / disk) | `cd backend && npm run verify:migrations` |
| Local Docker | [`docs/DOCKER.md`](DOCKER.md), root [`README.md`](../README.md) |

---

## 1. Routes and “who owns what UI”

| Route | Page component | Main UI responsibility |
|-------|----------------|-------------------------|
| `/` | `Dashboard.js` | Landing cards / status (not the trust graph). |
| `/connections` | `Connections.js` | **Trust graph**: `ConnectionsGraph.js` + unified secondary search; **`focused_inner_peer_id`** + **`branch_only=1`** when a branch is focused. |
| `/contacts` | `Contacts.js` | Grid / list / **radial** modes; radial uses **`DialContactScreen`** (dial rings + chips + discovery cards), **not** the rotating full-disk wheel in isolation. |
| `/activity`, `/settings`, `/admin` | respective pages | Profile/prefs, placeholders, admin toggles. |

**Agent rule:** Do not assume “radial” on Contacts equals `RadialContactWheel` or `DemiRadialNetwork` without opening `Contacts.js`. The shipped radial path is **`DialContactScreen`** under `frontend/src/components/dial/`.

---

## 2. Verified frontend architecture (2026)

### Auth and API base URL

- **`AppContext.js`**: user + theme + **`baseURL`** (`process.env.REACT_APP_API_URL` or `""` for same-origin).
- **Axios**: Bearer token from `localStorage` on requests.
- **CRA proxy**: `frontend/package.json` proxies `/api` to **`http://localhost:5000`** when running `npm start`; Compose/nginx setups differ (see README).

### Internationalization

- **`frontend/src/i18n/en.js`** plus **`useTranslations(locale)`**.
- New user-visible strings should go through **i18n keys**, not hard-coded English in shared flows.

### Motion and accessibility product prefs

- **Framer Motion** is used across pages (lists, dial, graph).
- Settings may set **`data-large-text`** and **`data-high-contrast`** on the document root (see Settings / `index.css`). Regression-test toggles when changing global layout.

### Connections module (platform-agnostic core)

- **`graphLayout.js`** is **pure JS** — stable contract for web + potential native; document defaults at top of file; coordinate constants (`GRAPH_VIEWBOX`, ring radii, `NODE_HIT_PADDING`, caps).
- **`ConnectionsGraph.js`** is the **browser adapter** (SVG + springs + pointer semantics). Pointer/event ordering documented in [`FRONTEND_DOCUMENTATION.md`](FRONTEND_DOCUMENTATION.md) matters for bugs (double-click, backdrop clearing focus).

### Contacts “radial” (dial UI)

- **`DialContactScreen.js`**: inner chips → optional **`selectedInnerCircleUserId`** → **`GET /api/connections/secondary-search`** with **`branch_only=1`** when an inner is selected; **`UnifiedSecondarySearchBar`** debounced query as **`q`**.
- **`dialConfig.js`**: tunable copy/behavior without rewriting the whole screen — **verify comments in that file** against code (some older comments still mention components no longer wired into Contacts).

### Legacy / unused in current routes

These files **exist** but are **not imported** by `App.js` routes today:

- **`DemiRadialNetwork.js`** — archived spec: [`archive/DEMI_RADIAL_SPEC.md`](archive/DEMI_RADIAL_SPEC.md); component **not mounted** from current routes.
- **`RadialContactWheel.js`**, **`RadialContactDetail.js`**, **`RadialContactActions.js`** — **not imported** by `App.js` routes; **`Contacts.js`** imports **`RadialContactWheel.css`** only for shared styles (view switcher). Safe deletion candidates when dropping **`@spaceymonk/react-radial-menu`**.

**Agent rule:** Prefer extending **`DialContactScreen`** / **`ConnectionsGraph`** for product work unless explicitly reviving legacy components.

---

## 3. API coupling checklist (UI changes)

When listing or searching “secondary” users:

- **`GET /api/connections/secondary-for/:id`** — discovery for one inner; filters `job_role` / `industry`.
- **`GET /api/connections/secondary-search`** — hybrid discovery + stored secondaries + FTS **`q`**; with **`focused_inner_peer_id`**, send **`branch_only=1`** when the product intent is “only paths through this inner” (Connections graph + Contacts dial).

Backend authorization is strict (403/401). UI should surface failures without leaking internals.

---

## 4. CSP and nginx — multiple configs

**Compose/Fly today:** **`unsafe-eval`** on scripts (historic **`@spaceymonk/react-radial-menu`**, unused by routed UI) and **`unsafe-inline`** on styles (animations). **`frontend/nginx.conf`** baked into the image is **stricter** but **Compose overrides** the live site with the **`default.conf` volume** ([`docker-compose.yml`](../docker-compose.yml)).

| Layer | File(s) |
|-------|---------|
| API (Helmet) | `backend/server.js` |
| Compose runtime | `frontend/nginx/default.conf` (mounted) |
| Fly static nginx | `frontend/nginx/fly-static.conf` — **`connect-src`** includes **`https:`** / **`wss:`** for cross-origin API |
| Image-only baseline | `frontend/nginx.conf` (overridden by Compose mount) |

[`SECURITY-CSP.md`](SECURITY-CSP.md) documents this matrix; **[`CSP_TIGHTENING_QUESTIONS.md`](CSP_TIGHTENING_QUESTIONS.md)** gates **`unsafe-eval` removal**.

**Agent rule:** When changing CSP, update **`server.js`**, **`default.conf`**, **`fly-static.conf`**, **`nginx.conf`** (if used without compose override), and **`SECURITY-CSP.md`** together, or explicitly document env-specific divergence.

---

## 5. Build and deploy surfaces

- **Local CRA:** `cd frontend && npm start` → port **3000**; API **5000** (avoid port clash with Compose backend on 3000 — see README).
- **Compose:** full stack often **`http://localhost`** (nginx → frontend + proxied API per compose).
- **Fly:** static web **`trustn-web`** built with **`REACT_APP_API_URL=https://trustn-api.fly.dev`** (see [`deploy/FLY.md`](../deploy/FLY.md)).

---

## 6. Recommended workflow for agent-assisted UI work

1. **Read the narrowest authoritative doc** for the feature (`FRONTEND_DOCUMENTATION`, `RELATIONSHIP_BASED_CONNECTIONS`, `connections/README.md`).
2. **Confirm entry components** with search (`Contacts.js`, `Connections.js`, `App.js`) — do not trust older “implementation summary” docs as structure diagrams.
3. **Match existing patterns:** same hooks, `motion` usage, `axios` + `baseURL`, i18n keys.
4. **Touch i18n** when adding copy; keep **`aria-label` / `id`** on forms where the codebase already does.
5. **Graph math / sorting:** change **`graphLayout.js`** only when product requires it; keep **`ConnectionsGraph`** as presentation.
6. **Verify CSP** if adding new script origins, inline handlers, or embedding third-party widgets.
7. **Run checks:** `cd frontend && npm run build`; backend tests if API contracts change; manual smoke on `/connections` and `/contacts` radial.

---

## 7. Archived UI docs (historical)

Legacy radial / questionnaire artifacts live under **[`docs/archive/`](archive/README.md)** (`RADIAL_UI`, `IMPLEMENTATION_SUMMARY`, `RADIAL_ENHANCEMENTS`, `DEMI_RADIAL_SPEC`, `GUI-FEATURE-CHECKLIST`). None are referenced by application code or CI.

---

## 8. CSP documentation

[`SECURITY-CSP.md`](SECURITY-CSP.md) describes **actual** Helmet + nginx surfaces and links to **[`CSP_TIGHTENING_QUESTIONS.md`](CSP_TIGHTENING_QUESTIONS.md)** before removing **`unsafe-eval`**.

Remaining drift worth tracking:

| Item | Notes |
|------|--------|
| [`README.md`](../README.md) §Production Setup | References **`deployment-manual.md`** (missing); use [`deploy/FLY.md`](../deploy/FLY.md). |
| [`RELATIONSHIP_BASED_CONNECTIONS.md`](RELATIONSHIP_BASED_CONNECTIONS.md) header dates | **`database/migrations/`** is authoritative for schema. |

---

## 9. Quick file map (UI-centric)

```
frontend/src/
  pages/           Login, Dashboard, Connections, Contacts, Settings, Activity, Admin
  components/
    connections/   ConnectionsGraph, graphLayout, UnifiedSecondarySearchBar, ConnectionRequestsPanel
    dial/          DialContactScreen, DialToolbar, dialConfig
  context/         AppContext
  i18n/            en.js, useTranslations
```

---

*Last updated: 2026-05-05*
