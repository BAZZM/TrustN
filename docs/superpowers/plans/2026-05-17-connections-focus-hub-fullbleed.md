# Focus hub + full-bleed immersive Connections — implementation plan

> **For agentic workers:** Use superpowers **subagent-driven-development** or **executing-plans** for task-by-task execution. Track with checkboxes.

**Goal:** Ship immersive Connections per `docs/superpowers/specs/2026-05-18-connections-immersive-fullbleed-focus-hub-design.md`: **`focus_hub` geometry** (focused inner at `GRAPH_CENTER`, You on ring, helix for others), **stats in bottom dock**, **no peek sheet** (FAB opens full overlay), **full-bleed graph stage**.

**Architecture:** Pure layout changes in `graphLayout.js`; `ConnectionsGraph.js` switches `layoutMode`, dedupes centered focused peer vs `Node` list, renders You as an inner-class `Node`; `Connections.css` adjusts flex/chrome/sheet states. `Connections.js` keeps passing `statsSummary` — graph moves it to the bottom dock.

**Tech stack:** CRA, React 18, Jest + RTL, existing Framer Motion.

---

### Task 1: `focus_hub` layout + You ring helper

**Files:**
- Modify: `frontend/src/components/connections/graphLayout.js`
- Modify: `frontend/src/components/connections/graphLayout.test.js`

- [ ] Add `layoutMode === "focus_hub"` branch: focused node at `(GRAPH_CENTER, GRAPH_CENTER)`; non-focused on helix from hub (same Δr/angle step as `helix_focus`).
- [ ] Export `getCurrentUserFocusHubLayout(innerConnections, focusUserId)` → `{ x, y, angle, ... }` on `INNER_RING_RADIUS` at `pickFocusPresentationAngle(...) + 180°`, or `null` if invalid.
- [ ] Tests: focused at center; You helper not at center; monotonic helix radii for non-focused.

### Task 2: Wire graph SVG + immersive chrome

**Files:**
- Modify: `frontend/src/components/connections/ConnectionsGraph.js`
- Modify: `frontend/src/components/connections/ConnectionsGraph.test.js`
- Modify: `frontend/src/pages/Connections.css`
- Modify: `docs/THEME_GRAPH_HOOKS.md` (mark `focus_hub` implemented for immersive)

- [ ] `innerLayoutOptions`: `{ layoutMode: "focus_hub" }` when `immersive && focusUserId`.
- [ ] Center capsule: focused peer when `focus_hub` active + `focusUserId`; else You.
- [ ] Skip inner `Node` for focused id when `focus_hub`; render You `Node` calling `onResetFocus`.
- [ ] Inner edges: from `GRAPH_CENTER` to each visible inner + You; skip zero-length for focused.
- [ ] Sheet: default **closed** (no `--peek`); `--open` when `sheetOpen`. FAB when `immersive && !sheetOpen` (any time, not only when focused).
- [ ] Hero: context line + zoom only; **stats** in new **bottom dock** inside shell.
- [ ] CSS: stage `flex: 1` / min-height for ~85% feel; dock + FAB positions; `--closed` sheet; `.connections__inner-node--you` if needed.

### Task 3: Verify

**Run:** `cd frontend && npm test -- --testPathPattern="graphLayout|ConnectionsGraph" --watchAll=false`

Expected: all passed.
