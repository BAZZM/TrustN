# D — Ask-your-network search — implementation plan

> Spec: `docs/superpowers/specs/2026-10-30-graph-next-roadmap-design.md`. Depends on A (`via`, `primary_via`, slim rows).

**Goal:** Type a question ("who do I know in healthcare who has run a design team?") and get ranked people with the introduction path, and a one-tap way to jump to that person in the graph.

**Principle:** retrieval, scoring and authorization are deterministic and stay in SQL/Node. A model, if enabled, only helps *interpret the question*; it never sees people data.

## Endpoint

```
POST /api/connections/ask   { "question": "who works in healthcare and has led a design team" }
→ 200
{
  "mode": "rules" | "llm",
  "interpretation": { "terms": ["healthcare","design","team","led"], "note": "…" },
  "results": [{
     "id": 35, "name": "…", "job_role": "…", "industry": "…",
     "kind": "inner" | "secondary",
     "score": 6.5,
     "matched": ["industry","experience"],
     "path": { "kind": "direct_inner" | "via_inner" | "direct_edge_only",
               "via": { "id": 16, "name": "…" } | null },
     "reason": "Works in Healthcare; matches design, team. Introduced through Henry Harris."
  }],
  "meta": { "considered": 41 }
}
```

- `400` for an empty or > 300 character question; `401` without a token; rate limited.
- Results never include phone numbers or bio text; `matched` only names the **fields** that matched.

## Task 1: interpretation (pure)

**Files:** Create `backend/lib/askInterpret.js`, `backend/__tests__/askInterpret.test.js`

- [x] `interpretRules(question)` → `{ terms, note }`: lowercase, split on non-letters, drop stopwords (who, do, i, know, in, the, a, has, have, with, and, …), drop terms < 3 chars, light stemming (`designers → design`), small synonym map (`doctor/physician → healthcare`, `engineer/developer → engineer`, `lawyer → legal`), cap at 6 terms.
- [x] `interpret(question, { env, fetchImpl })` → uses `interpretLlm` only when `ASK_LLM === '1'` **and** `ANTHROPIC_API_KEY` is set; on any error or invalid JSON it falls back to rules. LLM output is validated to `{ terms: string[≤6] }` (strings, ≤ 32 chars, letters only).
- [x] Tests: stopwords/stemming/synonyms; cap; LLM disabled by default; LLM garbage → rules; LLM never called when the key is absent (spy on `fetchImpl`).

## Task 2: retrieval and scoring

**Files:** Create `backend/lib/askRank.js`, `backend/__tests__/askRank.test.js`; modify `backend/routes/connections.js`

- [x] Candidates: inner peers (existing `/connections` query, scored in Node over name / job_role / industry / experience) **plus** secondaries from `app_unified_secondary_search` run once per term and merged (the SQL function ANDs terms, so one call per term gives OR semantics).
- [x] `scoreCandidate({ candidate, terms })`: `coverage = matchedTerms / terms.length`; `score = 4*coverage + (kind==='inner' ? 2 : 0) + (via.length ? 1 : 0) + min(strength,4)*0.25`; field weights job_role 1.0, industry 0.8, experience 0.5, name 0.3 (so a name hit does not outrank a role match).
- [x] Path: inner → `direct_inner`; secondary with `via` → `via_inner` using `primary_via`; edge-only → `direct_edge_only` (flagged "no introducer").
- [x] Reason: template string from matched fields and path (no model).
- [x] Tests (pure): ranking order for a fixed fixture; coverage beats inner bonus when coverage differs by more than 0.5; deterministic ties (score desc, then name asc, then id).

## Task 3: route, safety, limits

**Files:** Modify `backend/routes/connections.js`, `backend/server.js` (only if a limiter is missing); create `backend/__tests__/ask.test.js`

- [x] `POST /ask` using `withUserContext`; top 12 results.
- [x] Per-user rate limit (express-rate-limit, 20 / minute, `ASK_RATE_LIMIT_MAX`). **Configured but not covered by a test.**
- [x] Integration tests: 401; 400 on empty / too-long; returns slim rows (no phone / experience keys); finds a secondary via discovery with the right `path.via`; finds an inner peer; respects authorization (a person only reachable through someone else's network never appears).

## Task 4: frontend

**Files:** Modify `frontend/src/components/connections/ConnectionsGraph.js`, `frontend/src/pages/Connections.js`, `Connections.css`, `frontend/src/i18n/en.js`

- [x] New overlay kind `"ask"` in the existing single-overlay state (reuses `useModalOverlay`: inert background, focus in, Escape, focus return) and a third FAB "Ask".
- [x] Modal: question input, Ask button, loading and error states (retry), result list with name, role / industry, reason, and the path line (`You → Henry Harris → Paul Parker`).
- [x] Tapping a result: close the overlay, focus the `via` inner peer, then select the person once the branch loads; inner results just focus that inner peer. **Verified in the browser; the page-level handler has no unit test.**
- [x] Empty state: example questions as chips.
- [x] Tests (Jest/RTL): FAB opens the dialog and focuses the input; submit calls the endpoint (mock axios) and renders results; a result tap calls the focus and select handlers; error shows retry.

## Task 5: docs

- [x] Add the endpoint, the scoring formula and the `ASK_LLM` / `ANTHROPIC_API_KEY` switches to `docs/RELATIONSHIP_BASED_CONNECTIONS.md`.
- [x] Document that embeddings / pgvector are deliberately not used yet and what would change (retrieval stage only).

## Verify

- [x] Backend and frontend suites green; build clean.
- [x] Browser: ask three questions against the demo data, confirm the path and the jump-to-graph behavior, confirm the Network tab shows no phone or bio fields.
