# Round 3 — hardening, performance and polish (overnight run)

> Follows `2026-10-30-graph-next-roadmap-design.md`. Ground rules for this run: **nothing is committed, merged or pushed**; every change is test-first where it has logic, verified (Jest, `CI=true npm run build`, backend suite on a throwaway Postgres, and the browser pane) before the next item starts. The working tree is clean at `9eb86d4`, so `git diff` shows exactly this run.

## Backlog, in order

| # | Item | Why | Risk |
|---|------|-----|------|
| 1 | Review last round's code, fix real findings | Three large commits landed in one night; fresh eyes catch what tests did not | low |
| 2 | Performance: memoize graph nodes, measure physics frames | Free layout re-renders every node at 60fps while moving | low |
| 3 | Close deferred gaps | Rate-limit test, coarse-pointer hit padding, reduced-motion free layout, page-level ask-pick logic | low |
| 4 | Ask: highlight the introduction path in the graph | After picking a result the *why* is invisible; draw You → introducer → person | medium |
| 5 | Desktop polish: bigger graph | At 1280×800 the graph is ~406px; chrome stacks under it | low |
| 6 | Docs and a morning review guide | `AGENTS.md` points at `UI_CHANGE_GUIDANCE.md`; the user wakes up to a diff | none |

Explicitly **not** in this run (needs a decision or is risky unattended): merging or pushing, embeddings / pgvector, new SQL migrations, removing `peer_phone` from legacy endpoints, any model/API key setup.

## Path highlight (item 4) — intent

```
 before                         after (a result was picked)
  You ── Bob ── (Kate)           You ━━ Bob ━━ (Kate)   thick, accent
   │      ╲                       │      ╲
  other inners dim               other edges dim, labels of the path emphasised
```

## Progress log

_Updated as each item finishes. Status: ☐ pending · ◐ in progress · ☑ done · ⚠ done with a caveat._

| # | Status | Notes |
|---|--------|-------|
| 1 | ☑ | `/code-review` at high effort over the last three commits: 10 findings, 9 fixed, 1 skipped (per-term discovery queries are only mitigated: capped at 5 words and 50 rows each; the real fix is an OR-capable SQL function, which needs a migration). Fixed: Unicode questions, synonyms now add instead of replace, word-start matching (no more `water` ≈ `watch`), `/ask` logic moved to `lib/askRetrieve.js`, wrong CSS token, desktop width cap for loading/empty/error states, stale `UI_CHANGE_GUIDANCE.md`, missing tests. |
| 2 | ☑ | `Node` is `React.memo`; live positions keep object identity while unchanged; drag callbacks and the transition object are stable. A per-frame render test (separate `act` per frame) shows 96 node renders without memo vs at most 4 with it. |
| 3 | ☑ | Rate-limit test (429 after the cap, other users unaffected); `useMediaQuery` hook replaces a duplicate and adds coarse-pointer touch targets; `resolveAskPick` extracted and tested; `useForceLayout` has 8 tests (sleep, reduced motion, re-seed, unmount cleanup). |
| 4 | ☑ | The selected person's path is drawn: You → introducer → them in the accent colour, other secondary edges dim (3 tests; checked in the browser). Also: peers behind an open branch hide their labels until hover/focus, which removed the pile-up on the hub label. |
| 5 | ☑ | At ≥768px the stats dock and the Ask/Search/Details buttons share one row (CSS grid on the shell); the graph went from 406px to 467px tall at 1280×800, phone layout unchanged. |
| 6 | ☑ | `UI_CHANGE_GUIDANCE.md`, `RELATIONSHIP_BASED_CONNECTIONS.md` and the frontend README updated; `2026-10-30-morning-review.md` written. Extras found along the way: Ask results/loading/empty states are announced to screen readers; the regex cache in `askRank` is bounded (found in a manual security pass). |
