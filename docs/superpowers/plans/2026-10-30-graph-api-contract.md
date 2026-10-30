# A — Graph API contract cleanup — implementation plan

> Spec: `docs/superpowers/specs/2026-10-30-graph-next-roadmap-design.md`. Backend tests must pass (`cd backend && npm test`). No SQL migration.

**Goal:** One endpoint, `GET /api/connections/graph`, returning slim, unambiguous rows for the inner ring and secondaries, so the frontend stops reconstructing relationship rules.

## Contract

```
GET /api/connections/graph?focus=<innerId>&q=<text>&limit=<1..200>
→ 200
{
  "viewer_id": 1,
  "inner":     [{ "id": 9, "name": "Alice", "job_role": "…", "industry": "…",
                  "strength": 2, "introduced": false, "created_at": "…" }],
  "secondary": [{ "id": 35, "name": "…", "job_role": "…", "industry": "…",
                  "direct": true, "via": [14,15,16], "primary_via": 16, "rank": null }],
  "meta": { "inner_total": 8, "secondary_total": 32, "focus": 16, "q": null }
}
```

- No `phone`, no `experience` anywhere. `job_role` and `industry` stay (shown on cards).
- `focus` set → secondary is **branch-only** for that inner peer (`branch_only = true`); an id that is not one of the viewer's inner peers yields an empty `secondary` and `meta.focus = null`.
- `primary_via` = highest `strength` among `via` inner peers, ties by lowest id; `null` when `via` is empty.
- `401` without a token (same middleware as the rest of `/api/connections`).

## Task 1: shaping helpers (pure, unit-tested)

**Files:** Create `backend/lib/graphPayload.js`, `backend/__tests__/graphPayload.test.js`

- [x] `shapeInner(rows)` → inner rows from the existing `/connections` query, filtered to `circle_type === 'inner'`, mapped to the contract (`introduced` from `peer_introduced`).
- [x] `shapeSecondary(rows, innerStrengthById)` → maps unified-search rows: `direct = res_source_edge`, `via` = de-duplicated ids, `primary_via` rule above.
- [x] Tests: `primary_via` picks the strongest, breaks ties by lowest id, is `null` with empty `via`; output has no `phone` / `experience` keys; `direct` and `via` independent (edge-only, discovery-only, both).

## Task 2: route

**Files:** Modify `backend/routes/connections.js`; create `backend/__tests__/graphEndpoint.test.js`

- [x] Add `router.get('/graph', …)` **before** the parameterised routes. One `withUserContext` block: inner query (same SQL as `/`), then `app_unified_secondary_search($1, $q, $limit, 0, NULL, $focus, $branchOnly)`.
- [x] Validate `focus` / `limit` like `/secondary-search`; `q` trimmed, `null` when empty.
- [x] Integration tests (supertest + fixtures): 401; slim shape and no phone/bio; counts in `meta`; `focus` scopes to the branch; focus on a non-inner id → empty secondary; `q` filters; person with edge + two introducers gets both in `via` and a deterministic `primary_via`.
- [x] Run `cd backend && npm test` — all suites green. (Needs the Docker Postgres on 5433; see "Environment" below.)

## Task 3: frontend

**Files:** Modify `frontend/src/components/connections/graphLayout.js` (+test), `frontend/src/pages/Connections.js`

- [x] `normalizeGraphNode` accepts the new shape (`id`, `job_role`, `direct`, `via`, `introduced`) alongside the legacy one, and exposes `direct`, `via`, `primaryVia`, `introduced` as first-class fields. **`peerIntroduced` stops being overloaded:** secondaries get `direct` instead of `peer_introduced = sources.includes("edge")`.
- [x] Replace `secondaryIntroEligibleViaFocusedInner` and `secondaryBranchArcPriority` with reads of `via` / `direct`.
- [x] `Connections.js`: load inner + counts from `GET /graph`, and the focused branch from `GET /graph?focus=…&q=…` instead of `/secondary-search`. Keep `/connection-requests`.
- [x] Leave Contacts and the dial on the old endpoints.
- [x] Tests: `normalizeGraphNode` for both shapes; ranking prefers `via`-here over `direct`-only. **Done for `normalizeGraphNode`; the page-level ranking helper is not unit tested (browser-verified).**

## Task 4: docs

- [x] Document the endpoint and the `direct` / `via` / `primary_via` definitions in `docs/RELATIONSHIP_BASED_CONNECTIONS.md`.
- [x] Note in `frontend/src/components/connections/README.md` that graph nodes carry `direct` / `via` and that `peerIntroduced` means "inner link came from an introduction".

## Environment

Backend tests expect the Docker Postgres (`localhost:5433`, superuser `intro`). The local Windows Postgres `intro` role is not a superuser, so the migrations fail under row-level security; start Docker Desktop (`docker compose up -d database`) instead.

## Verify

- [x] `cd backend && npm test` green; `npm run verify:migrations` unchanged (no migration added).
- [x] `cd frontend && CI=true npm test -- --watchAll=false && CI=true npm run build`.
- [x] Browser: Connections shows the same graph as before; Network tab has **no** `peer_phone` / `peer_experience` in `/api/connections/graph` responses and one fewer request on load.
