# Immersive helix focus + peek/FAB sheet — implementation plan

**Goal:** When a branch is focused in immersive Connections, lay non-focused inner peers on a 2D helix coil while the focused node retains its strong inner-ring slot; collapse the bottom sheet to a peek by default and gate search/requests behind a FAB or expand affordance.

**Architecture:**
- Pure layout helpers (`graphLayout.js`) extended with optional `options.layoutMode` so the helix variant is opt-in and backward compatible.
- `ConnectionsGraph.js` reads immersive+focus and threads `layoutMode: 'helix_focus'` plus helix constants; CSS adds peek state and FAB; existing expand handle reused.
- Theme/multi-tenancy: new constants exported from `graphLayout.js` re-used in `docs/THEME_GRAPH_HOOKS.md`.

**Tech stack:** Plain CSS, React 18, framer-motion (unchanged motion contract on graph), Jest + RTL component tests.

---

### Task 1: Helix layout helpers (TDD red→green)

**Files:**
- Modify: `frontend/src/components/connections/graphLayout.js`
- Modify: `frontend/src/components/connections/graphLayout.test.js`

- [ ] **Step 1: Add failing tests** at bottom of `graphLayout.test.js`:

```js
import {
  GRAPH_VIEWBOX,
  HELIX_R_MIN,
  HELIX_DELTA_R,
  HELIX_ANGLE_STEP_DEG,
  INNER_RING_RADIUS,
} from "./graphLayout";

describe("getInnerRingLayout with layoutMode helix_focus", () => {
  const nodes = [
    { id: "a", name: "Alice", strength: 5 },
    { id: "b", name: "Bob", strength: 4 },
    { id: "c", name: "Carol", strength: 3 },
    { id: "d", name: "Dave", strength: 2 },
  ];

  it("keeps the focused node on INNER_RING_RADIUS", () => {
    const layout = getInnerRingLayout(nodes, "b", { layoutMode: "helix_focus" });
    const focused = layout.find((n) => n.isFocused);
    const dx = focused.x - GRAPH_CENTER;
    const dy = focused.y - GRAPH_CENTER;
    expect(Math.hypot(dx, dy)).toBeCloseTo(INNER_RING_RADIUS, 5);
  });

  it("places non-focused nodes inside INNER_RING_RADIUS on a coil", () => {
    const layout = getInnerRingLayout(nodes, "b", { layoutMode: "helix_focus" });
    const others = layout.filter((n) => !n.isFocused);
    others.forEach((n) => {
      const r = Math.hypot(n.x - GRAPH_CENTER, n.y - GRAPH_CENTER);
      expect(r).toBeGreaterThanOrEqual(HELIX_R_MIN - 0.01);
      expect(r).toBeLessThan(INNER_RING_RADIUS);
    });
  });

  it("uses Δr per turn (radii grow monotonically with turn index)", () => {
    const layout = getInnerRingLayout(nodes, "b", { layoutMode: "helix_focus" });
    const others = layout
      .filter((n) => !n.isFocused)
      .sort((a, b) => a.turnIndex - b.turnIndex);
    for (let i = 1; i < others.length; i += 1) {
      const r0 = Math.hypot(others[i - 1].x - GRAPH_CENTER, others[i - 1].y - GRAPH_CENTER);
      const r1 = Math.hypot(others[i].x - GRAPH_CENTER, others[i].y - GRAPH_CENTER);
      expect(r1 - r0).toBeCloseTo(HELIX_DELTA_R, 5);
    }
  });

  it("stays inside viewBox with margin", () => {
    const layout = getInnerRingLayout(nodes, "b", { layoutMode: "helix_focus" });
    layout.forEach((n) => {
      expect(n.x).toBeGreaterThan(8);
      expect(n.x).toBeLessThan(GRAPH_VIEWBOX - 8);
      expect(n.y).toBeGreaterThan(8);
      expect(n.y).toBeLessThan(GRAPH_VIEWBOX - 8);
    });
  });

  it("is deterministic", () => {
    const a = getInnerRingLayout(nodes, "c", { layoutMode: "helix_focus" });
    const b = getInnerRingLayout(nodes, "c", { layoutMode: "helix_focus" });
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests, expect failures** referencing missing exports / unknown option.

```powershell
Set-Location "c:\Users\basim\Documents\Intro\frontend"; $env:CI = "true"; npm test -- --runTestsByPath src/components/connections/graphLayout.test.js --watchAll=false
```

- [ ] **Step 3: Implement in `graphLayout.js`** — add constants and helix branch:

```js
export const HELIX_R_MIN = 56;
export const HELIX_DELTA_R = 10;
export const HELIX_ANGLE_STEP_DEG = 52;
```

Update `getInnerRingLayout(nodes, focusUserId, options = {})`. When `options.layoutMode === "helix_focus"` and a focus exists:
- Focused node uses existing ring math.
- Non-focused: sorted by current input order, assigned `turnIndex k = 0..N-2`. Helix axis angle = `presentationAngle + 180` (opposite hemisphere).
- `θ_k = helixAxis + k * HELIX_ANGLE_STEP_DEG` (degrees).
- `r_k = HELIX_R_MIN + k * HELIX_DELTA_R`.
- Cartesian via `polarToCartesian`.
- `opacity = 0.22`, `scale = 0.7`, `radius = 14`, `turnIndex = k`.
- `isFocused = false` for non-focused.

- [ ] **Step 4: Run tests, expect pass.**
- [ ] **Step 5: Commit:** `test(connections): helix focus inner layout`.

---

### Task 2: Wire ConnectionsGraph + peek sheet + FAB + CSS

**Files:**
- Modify: `frontend/src/components/connections/ConnectionsGraph.js`
- Modify: `frontend/src/pages/Connections.css`
- Modify: `frontend/src/components/connections/ConnectionsGraph.test.js`
- Modify: `frontend/src/i18n/en.js` (FAB label)

- [ ] **Step 1:** In `ConnectionsGraph.js`, when `immersive && focusUserId`, pass `{ layoutMode: "helix_focus" }` to `getInnerRingLayout`.

- [ ] **Step 2:** Sheet starts collapsed by default (`useState(false)` already true). Add peek-only visible content (focused name + role line + Reset). Hide search bar from peek; show under `connections__sheet--open`. Add FAB rendered alongside sheet that calls `setSheetOpen(true)`.

- [ ] **Step 3:** CSS:
  - `.connections__sheet--peek` height ≤ 110 px (closed); `--open` expands to today's height.
  - `.connections__sheet--peek .connections__focus-search`, `.connections__sheet-scroll` collapse to 0 / hidden.
  - `.connections__fab` floating circular button bottom-right, z-index above peek but below modal sheet; hide when expanded.
  - `aria-label` via i18n.

- [ ] **Step 4:** Add i18n keys `connections.expandDetails`, `connections.heroFabAria`.

- [ ] **Step 5:** Component test additions:
  - When immersive+focus, peek default (sheet has class `--peek` / not `--open`).
  - FAB exists; clicking it toggles sheet open (subsequent query has `--open` class).

- [ ] **Step 6:** Run tests + production build.

- [ ] **Step 7:** Commit: `feat(connections): helix focus layout, peek sheet and FAB`.

---

### Task 3: Theme hooks doc update + final verification + push

**Files:**
- Modify: `docs/THEME_GRAPH_HOOKS.md`

- [ ] Add row(s) in “Layout modes” table marking `helix_focus` as **implemented**. List `HELIX_R_MIN`, `HELIX_DELTA_R`, `HELIX_ANGLE_STEP_DEG` constants.
- [ ] Run focused tests + build.
- [ ] Commit + push.

---

## Spec coverage

| Spec § | Task |
|--------|------|
| 5 Helix layout | 1 |
| 6 Peek + FAB | 2 |
| 7 Motion (re-use existing) | 2 |
| 8 Files | 1–3 |
| 9 Tests | 1, 2 |
| 11 Approval / docs | 3 |
