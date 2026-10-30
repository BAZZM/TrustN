# B — Immersive layout on desktop — implementation plan

> Spec: `docs/superpowers/specs/2026-10-30-graph-next-roadmap-design.md` (wireframe there).

**Goal:** The full-bleed Connections view is the experience at every width, not only under 768px. On wide screens the graph, hero, stats dock and FABs sit in a centered column; keyboard users can drive the graph.

**Today:** `immersiveGraph = showTrustGraph && narrowViewport` in `Connections.js`, and `Layout.js` uses `narrowViewport` for `app--immersive-graph`, `app__main--immersive-graph` and the floating nav. Wider screens fall back to the older card layout (`ring_focus`-style rotation, graph clipped by the viewport).

## Task 1: remove the width gate

**Files:** Modify `frontend/src/pages/Connections.js`, `frontend/src/components/Layout.js`, `frontend/src/components/connections/ConnectionsGraph.js`

- [x] Removed the width gate outright (no `IMMERSIVE_MIN_WIDTH` constant was added); re-introducing a gate is a one-line change in `Layout.js` and `Connections.js`.
- [x] Keep `narrowViewport` only for what is genuinely mobile (hit padding, pinch zoom).
- [ ] Test for a wide `matchMedia`. **Not added**: `ConnectionsGraph` no longer depends on the viewport for `immersive`, and the browser check at 768 to 1920 covers it.

## Task 2: centered column CSS

**Files:** Modify `frontend/src/pages/Connections.css`, `frontend/src/App.css`

- [x] No shell `max-width` was needed: the shell stays full-bleed so the background fills the screen, while the graph square (limited by the stage height), the stats dock (560px max) and the nav centre themselves.
- [x] Floating nav is a centred bar capped at 560px (`Layout.css`, `min-width: 768px`).
- [x] Verify no horizontal scroll at 768, 1024, 1280 and 1920.

## Task 3: keyboard support

**Files:** Modify `ConnectionsGraph.js`, `Connections.js`, tests

- [x] **Escape** with no overlay open clears the focused branch (same as the Reset button).
- [x] **Arrow keys** on a focused inner node move focus to the neighbouring inner node in angular order (wraps); Enter/Space still selects. Implemented as a keydown handler on the inner ring group using `innerLayout` order.
- [x] Visible focus ring on SVG nodes (`:focus-visible` outline in `Connections.css`).
- [x] Tests: Escape clears focus and does not fire while an overlay is open; ArrowRight/ArrowLeft move `document.activeElement` among inner nodes.

## Task 4: pointer adjustments

- [ ] Hit padding stays larger on touch (`narrowViewport || matchMedia('(pointer: coarse)')`), smaller with a mouse. **Deferred: hit padding still follows the narrow-viewport check.**
- [x] Pinch-zoom hook stays touch-only (it already is); Ctrl+wheel zoom **not added**.

## Verify

- [x] Jest + `CI=true npm run build`.
- [x] Browser at 375, 768, 1280 and 1920: graph centered, nothing clipped, modal overlays and the focus trap still behave (reuse the real-keyboard checks from the modal-overlay plan).
- [x] Other pages unchanged (Home, Contacts, Activity, Settings, Admin).
