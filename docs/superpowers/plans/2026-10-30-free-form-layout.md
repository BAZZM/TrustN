# C — Free-form (force-directed) layout — implementation plan

> Spec: `docs/superpowers/specs/2026-10-30-graph-next-roadmap-design.md`.

**Goal:** Nodes feel alive and draggable instead of pinned to a ring, without losing the legible structure (inner ring / helix / branch fan) or the deterministic layout the tests assert.

**Approach:** keep `graphLayout.js` as the source of **rest positions**. A small physics step moves each node *around* its rest position. Flag **off by default**; when off, nothing changes.

## Physics model (pure, no dependency)

Per node: position `p`, velocity `v`, rest `r`, radius `rad`, pinned flag.

| Force | Formula | Purpose |
|-------|---------|---------|
| Rest spring | `k_rest * (r - p)` | stay near the structured layout |
| Repulsion | `k_rep / d²` along the line between nodes (capped) | spread without overlap |
| Collision | push apart when `d < rad_a + rad_b + gap` | no overlapping discs or labels |
| Bounds | clamp inside the viewBox with a margin | never leave the SVG |
| Damping | `v *= 0.82` per step | settle, no jitter |

A dragged node is pinned to the pointer (`pinned = true`); on release it keeps its position as the new rest point for that node until the layout changes (focus change resets all rests).

## Task 1: `graphPhysics.js`

**Files:** Create `frontend/src/components/connections/graphPhysics.js`, `graphPhysics.test.js`

- [x] `createPhysicsState(nodes, previous?)` → `{ awake, calm, nodes: [{ id, x, y, vx, vy, rx, ry, radius, fixed, pinned }] }` from layout output; `previous` lets a changed layout glide from the old positions.
- [x] `stepPhysics(state, params)` → new state (pure). After `calmSteps` calm steps `awake` becomes false and `stepPhysics` returns the same object; `wake(state)` restarts it.
- [x] `pinNode(state, id, x, y)` / `releaseNode(state, id)`.
- [x] Tests: converges (max speed < ε after N steps); with `k_rest` only, nodes stay within a few units of rest; no pair closer than `rad_a + rad_b` after settling when rests are far enough apart; every node inside bounds; deterministic (same input → same output); pinned node does not move under forces; sleeping state is a fixed point.

## Task 2: `useForceLayout` hook

**Files:** Create `frontend/src/hooks/useForceLayout.js`

- [x] `useForceLayout({ enabled, nodes, prefersReducedMotion })` returns `{ positions, pin, release, awake }`.
- [x] Runs one `requestAnimationFrame` loop only while `alpha > threshold` or a node is pinned; stops (no idle CPU) otherwise.
- [x] Reduced motion → no loop: positions equal rest positions (still draggable, no spring).
- [x] Re-seeds when node ids or rest positions change (focus change).
- [x] Gentle idle drift is **not** included in v1 (keeps CPU at zero when idle).

## Task 3: wire into the graph

**Files:** Modify `ConnectionsGraph.js`, `Connections.css`

- [x] Flag: `localStorage["intro_graph_layout"] === "free"` or `?layout=free` (URL wins and is stored); a small toggle in the hero capsule ("Free layout") reads/writes it.
- [x] When enabled, `Node` gets `instant` and takes its position as plain `style` (a zero-duration framer-motion animation from `initial={false}` is never rendered, which left nodes without a transform; found in the browser).
- [x] Pointer drag on a node: pointer capture, convert client → viewBox coords with the SVG's `getScreenCTM().inverse()`, drag threshold = existing `tapSlop`; below it the gesture stays a tap/select, above it it becomes a drag. Pinch/pan layer ignores events that start on a node.
- [x] Edges follow the live node positions (they are drawn from layout output today; read from the hook when enabled).
- [x] Dragging while a modal overlay is open is impossible (background is inert).

## Verify

- [x] Jest (physics unit tests + a component test that the flag off renders exactly today's positions).
- [ ] Browser: flag on at 375 and 1280; drag a node and watch neighbours part; release and watch it settle; refocus a branch and watch rests reset; CPU idle when settled (the rAF loop stops). **Reduced-motion emulation and a before/after screenshot diff with the flag off were not run; the flag-off equivalence is covered by a component test.**
- [ ] Flag off: before/after screenshot comparison. **Not captured**; equivalence is covered by the component test and the physics path being skipped entirely when the flag is off.
