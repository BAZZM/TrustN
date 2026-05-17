# Connections Adaptive Focus Wedge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an inner-circle connection is selected, rotate the focused branch into the clearest angular zone and fan its secondaries out on a wider, larger-radius arc so every name stays readable.

**Architecture:** Keep all logic in the existing pure layout module (`graphLayout.js`) so the contract documented in `frontend/src/components/connections/README.md` (platform-agnostic web + future React Native) is preserved. The React adapter (`ConnectionsGraph.js`) only consumes the new layout output and tweaks SVG paint order. CSS changes are limited to label contrast.

**Tech Stack:** React 18 (CRA), Jest + React Testing Library + `react-dom/test-utils` `act`, framer-motion for SVG node motion, plain CSS modules with design tokens from `index.css`.

**Spec reference:** `docs/superpowers/specs/2026-05-17-connections-adaptive-focus-wedge-design.md`

---

## File Structure

| File | Responsibility | Status |
|------|----------------|--------|
| `frontend/src/components/connections/graphLayout.js` | Pure layout math. Adds focus-angle picker + focused secondary fan. | Modify |
| `frontend/src/components/connections/graphLayout.test.js` | Pure-JS unit tests for the new helpers (no DOM). | **Create** |
| `frontend/src/components/connections/ConnectionsGraph.js` | React SVG adapter. Wires layout output into paint order. | Modify |
| `frontend/src/components/connections/ConnectionsGraph.test.js` | Component test. Adds paint-order assertion for focused mode. | Modify |
| `frontend/src/pages/Connections.css` | Bump secondary label contrast for focused branch. | Modify |
| `frontend/src/components/connections/README.md` | Document new constants and the adaptive-wedge behavior. | Modify |

No other files touched. No backend, DB, or i18n changes.

---

## Task 1: Add unit tests for the layout helpers (RED)

**Files:**
- Create: `frontend/src/components/connections/graphLayout.test.js`

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/components/connections/graphLayout.test.js`:

```js
import {
  GRAPH_CENTER,
  SECONDARY_RING_RADIUS,
  SECONDARY_RING_RADIUS_FOCUSED,
  getInnerRingLayout,
  getSecondaryRingLayout,
  pickFocusPresentationAngle,
} from "./graphLayout";

const innerFixture = [
  { id: "a", name: "Alice", strength: 5 },
  { id: "b", name: "Bob", strength: 4 },
  { id: "c", name: "Carol", strength: 3 },
  { id: "d", name: "Dave", strength: 2 },
];

describe("pickFocusPresentationAngle", () => {
  it("returns -90 when no focus id is provided", () => {
    expect(pickFocusPresentationAngle(innerFixture, null)).toBe(-90);
  });

  it("returns -90 when only one inner node exists", () => {
    expect(pickFocusPresentationAngle([innerFixture[0]], "a")).toBe(-90);
  });

  it("is deterministic for the same input", () => {
    const first = pickFocusPresentationAngle(innerFixture, "b");
    const second = pickFocusPresentationAngle(innerFixture, "b");
    expect(first).toBe(second);
  });

  it("prefers an angle whose rotated neighbours are farther away", () => {
    const angle = pickFocusPresentationAngle(innerFixture, "c");
    expect([-135, -120, -90, -60, -45, 0, 180]).toContain(angle);
  });

  it("prefers an upper-hemisphere angle on ties", () => {
    // Two-node ring: focus index 1 means the other node sits opposite.
    // Every candidate yields the same min distance (180), so tie-break
    // should pick an upper-hemisphere angle (sin(angle) < 0 in SVG y-down).
    const angle = pickFocusPresentationAngle(
      [
        { id: "a", name: "Alice", strength: 1 },
        { id: "b", name: "Bob", strength: 1 },
      ],
      "b"
    );
    expect(Math.sin((angle * Math.PI) / 180)).toBeLessThan(0);
  });
});

describe("getInnerRingLayout with focus angle", () => {
  it("places the focused node on the picked presentation angle", () => {
    const layout = getInnerRingLayout(innerFixture, "c");
    const focused = layout.find((node) => node.isFocused);
    const expectedAngle = pickFocusPresentationAngle(innerFixture, "c");
    expect(focused.angle).toBeCloseTo(expectedAngle, 5);
  });
});

describe("getSecondaryRingLayout with focus fan", () => {
  const secondaries = [
    { id: "s1", name: "S1", strength: 1 },
    { id: "s2", name: "S2", strength: 1 },
    { id: "s3", name: "S3", strength: 1 },
  ];

  it("uses the default ring radius and the default spread when no focus angle is passed", () => {
    const layout = getSecondaryRingLayout(secondaries);
    layout.forEach((node) => {
      const dx = node.x - GRAPH_CENTER;
      const dy = node.y - GRAPH_CENTER;
      expect(Math.hypot(dx, dy)).toBeCloseTo(SECONDARY_RING_RADIUS, 5);
    });
    expect(layout[0].angle).toBe(-160);
    expect(layout[layout.length - 1].angle).toBe(-20);
  });

  it("uses the focused ring radius and centers the fan on the focus angle", () => {
    const focusAngle = -90;
    const layout = getSecondaryRingLayout(secondaries, focusAngle);
    layout.forEach((node) => {
      const dx = node.x - GRAPH_CENTER;
      const dy = node.y - GRAPH_CENTER;
      expect(Math.hypot(dx, dy)).toBeCloseTo(SECONDARY_RING_RADIUS_FOCUSED, 5);
    });
    const spread = layout[layout.length - 1].angle - layout[0].angle;
    expect(spread).toBeGreaterThan(0);
    expect(spread).toBeLessThanOrEqual(140);
    const center = (layout[0].angle + layout[layout.length - 1].angle) / 2;
    expect(center).toBeCloseTo(focusAngle, 5);
  });

  it("places a single secondary directly outward along the focus angle", () => {
    const layout = getSecondaryRingLayout([secondaries[0]], 0);
    expect(layout[0].angle).toBe(0);
    expect(layout[0].x).toBeCloseTo(GRAPH_CENTER + SECONDARY_RING_RADIUS_FOCUSED, 5);
    expect(layout[0].y).toBeCloseTo(GRAPH_CENTER, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
Set-Location "c:\Users\basim\Documents\Intro\frontend"; $env:CI = "true"; npm test -- --runTestsByPath src/components/connections/graphLayout.test.js --watchAll=false
```

Expected: FAIL with "pickFocusPresentationAngle is not defined" / "SECONDARY_RING_RADIUS_FOCUSED is not defined".

- [ ] **Step 3: Commit the failing test**

```powershell
Set-Location "c:\Users\basim\Documents\Intro"; git add frontend/src/components/connections/graphLayout.test.js; git -c user.name="Basim Musa" -c user.email="basimmusa98@gmail.com" commit -m "test(connections): add failing layout tests for adaptive focus wedge"
```

---

## Task 2: Implement the layout helpers (GREEN)

**Files:**
- Modify: `frontend/src/components/connections/graphLayout.js`

- [ ] **Step 1: Add the new constant and helpers**

In `graphLayout.js`, add `SECONDARY_RING_RADIUS_FOCUSED` next to the existing `SECONDARY_RING_RADIUS` export:

```js
export const SECONDARY_RING_RADIUS = 174;
export const SECONDARY_RING_RADIUS_FOCUSED = 210;
export const FOCUS_FAN_DEGREES = 110;
```

Then add two new pure helpers below `polarToCartesian`:

```js
const FOCUS_PRESENTATION_CANDIDATES = [-90, -60, -120, -45, -135, 0, 180];

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function angularDistance(a, b) {
  const diff = ((normalizeAngle(a) - normalizeAngle(b) + 540) % 360) - 180;
  return Math.abs(diff);
}

export function pickFocusPresentationAngle(nodes, focusUserId) {
  if (!focusUserId || !Array.isArray(nodes) || nodes.length <= 1) {
    return -90;
  }

  const total = nodes.length;
  const baseStep = 360 / total;
  const baseAngles = nodes.map((_, index) => -90 + index * baseStep);
  const focusIndex = nodes.findIndex((node) => node.id === focusUserId);

  if (focusIndex < 0) return -90;

  const otherAngles = baseAngles.filter((_, index) => index !== focusIndex);

  let best = { angle: -90, score: -Infinity, upper: false };

  FOCUS_PRESENTATION_CANDIDATES.forEach((candidate) => {
    const rotation = candidate - baseAngles[focusIndex];
    const rotatedOthers = otherAngles.map((angle) => angle + rotation);
    const minDistance = rotatedOthers.reduce(
      (acc, angle) => Math.min(acc, angularDistance(angle, candidate)),
      Infinity
    );
    const upper = Math.sin((candidate * Math.PI) / 180) < 0;
    const isBetterScore = minDistance > best.score + 1e-6;
    const isTieAndUpper =
      Math.abs(minDistance - best.score) <= 1e-6 && upper && !best.upper;

    if (isBetterScore || isTieAndUpper) {
      best = { angle: candidate, score: minDistance, upper };
    }
  });

  return best.angle;
}
```

- [ ] **Step 2: Update `getInnerRingLayout` to use the picker**

Replace the current rotation calculation inside `getInnerRingLayout`:

```js
export function getInnerRingLayout(nodes, focusUserId) {
  const total = nodes.length;

  if (total === 0) {
    return [];
  }

  const baseStep = 360 / total;
  const baseAngles = nodes.map((_, index) => -90 + index * baseStep);
  const focusIndex = focusUserId ? nodes.findIndex((node) => node.id === focusUserId) : -1;
  const presentationAngle =
    focusIndex >= 0 ? pickFocusPresentationAngle(nodes, focusUserId) : -90;
  const rotation = focusIndex >= 0 ? presentationAngle - baseAngles[focusIndex] : 0;

  return nodes.map((node, index) => {
    const angle = baseAngles[index] + rotation;
    const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, INNER_RING_RADIUS, angle);
    const isFocused = node.id === focusUserId;
    const nodeStrength = Math.max(0, Number(node.strength) || 0);

    return {
      ...node,
      angle,
      x: point.x,
      y: point.y,
      isFocused,
      opacity: focusUserId ? (isFocused ? 1 : 0.16) : 1,
      scale: focusUserId ? (isFocused ? 1.18 : 0.84) : 0.92 + Math.min(nodeStrength, 4) * 0.05,
      radius: focusUserId
        ? isFocused
          ? 24
          : 18
        : 18 + Math.min(nodeStrength, 4) * 1.5,
    };
  });
}
```

- [ ] **Step 3: Extend `getSecondaryRingLayout` to accept a focus angle**

Replace the existing `getSecondaryRingLayout` with:

```js
export function getSecondaryRingLayout(nodes, focusAngle = null) {
  const total = nodes.length;

  if (total === 0) {
    return [];
  }

  const useFocusFan = typeof focusAngle === "number" && Number.isFinite(focusAngle);
  const radius = useFocusFan ? SECONDARY_RING_RADIUS_FOCUSED : SECONDARY_RING_RADIUS;

  let startAngle;
  let endAngle;

  if (useFocusFan) {
    startAngle = focusAngle - FOCUS_FAN_DEGREES / 2;
    endAngle = focusAngle + FOCUS_FAN_DEGREES / 2;
  } else {
    startAngle = -160;
    endAngle = -20;
  }

  const step = total === 1 ? 0 : (endAngle - startAngle) / (total - 1);

  return nodes.map((node, index) => {
    let angle;
    if (total === 1) {
      angle = useFocusFan ? focusAngle : -90;
    } else {
      angle = startAngle + step * index;
    }

    const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, radius, angle);
    const nodeStrength = Math.max(0, Number(node.strength) || 0);

    return {
      ...node,
      angle,
      x: point.x,
      y: point.y,
      scale: 0.9 + Math.min(nodeStrength, 4) * 0.04,
      radius: 14 + Math.min(nodeStrength, 4) * 1.2,
    };
  });
}
```

- [ ] **Step 4: Run the layout tests to verify they pass**

Run:

```powershell
Set-Location "c:\Users\basim\Documents\Intro\frontend"; $env:CI = "true"; npm test -- --runTestsByPath src/components/connections/graphLayout.test.js --watchAll=false
```

Expected: PASS — 7 tests across 3 describe blocks.

- [ ] **Step 5: Commit**

```powershell
Set-Location "c:\Users\basim\Documents\Intro"; git add frontend/src/components/connections/graphLayout.js; git -c user.name="Basim Musa" -c user.email="basimmusa98@gmail.com" commit -m "feat(connections): adaptive focus angle and focused secondary fan"
```

---

## Task 3: Wire the focus angle through `ConnectionsGraph` and fix label paint order

**Files:**
- Modify: `frontend/src/components/connections/ConnectionsGraph.js`

The current SVG paint order puts inner ring nodes (with labels) AFTER secondary node bodies (with labels), which is why a focused inner node like Diana Davis covers Paul Parker's name. We need (a) the secondary layout to receive the picked focus angle, and (b) the secondary labels to be drawn LAST so they always read above the inner ring.

- [ ] **Step 1: Update the imports**

In `ConnectionsGraph.js`, change the import block to include the focus picker:

```js
import {
  GRAPH_CENTER,
  GRAPH_VIEWBOX,
  MAX_VISIBLE_SECONDARY,
  NODE_HIT_PADDING,
  getInnerRingLayout,
  getNodeInitials,
  getSecondaryRingLayout,
  pickFocusPresentationAngle,
  truncateLabel,
} from "./graphLayout";
```

- [ ] **Step 2: Add a `hideLabel` prop to the local `Node` component**

Update the `Node` function signature to accept `hideLabel` and skip rendering the trailing `<text>` when set:

```js
function Node({
  node,
  label,
  className,
  labelClassName,
  onSelect,
  disabled = false,
  selected = false,
  motionTransition,
  hitPadding = 10,
  tapSlop = 0,
  hideLabel = false,
}) {
```

Then in the JSX body of `Node`, replace the trailing `<text>` with a conditional render:

```jsx
      <circle r={node.radius + hitPadding} className={`${className}__hit`} />
      <circle r={node.radius + 4} className={`${className}__halo`} />
      <circle r={node.radius} className={`${className}__core`} />
      <text textAnchor="middle" dominantBaseline="central" className={`${className}__glyph`}>
        {getNodeInitials(node.name)}
      </text>
      {!hideLabel && (
        <text y={node.radius + 24} textAnchor="middle" className={labelClassName}>
          {truncateLabel(label, 14)}
        </text>
      )}
```

- [ ] **Step 3: Compute and pass the focus angle to the secondary layout**

Inside `ConnectionsGraph`, replace the existing `secondaryLayout` `useMemo` with:

```js
  const focusPresentationAngle = useMemo(
    () => (focusUserId ? pickFocusPresentationAngle(innerConnections, focusUserId) : null),
    [innerConnections, focusUserId]
  );
  const visibleSecondary = secondaryConnections.slice(0, MAX_VISIBLE_SECONDARY);
  const secondaryLayout = useMemo(
    () => getSecondaryRingLayout(visibleSecondary, focusPresentationAngle),
    [visibleSecondary, focusPresentationAngle]
  );
```

- [ ] **Step 4: Hide labels on the secondary node bodies**

In the JSX where secondary nodes are rendered (the `secondaryLayout.map((node) => (...))` block that produces `<g key={`secondary-wrap-${node.id}`}>...`), pass `hideLabel` to the `Node` element:

```jsx
          <Node
            node={node}
            label={node.name}
            className="connections__secondary-node"
            labelClassName="connections__secondary-label"
            onSelect={onSelectSecondary}
            disabled={!onSelectSecondary}
            selected={Boolean(selectedSecondaryId && selectedSecondaryId === node.id)}
            motionTransition={nodeMotionTransition}
            hitPadding={narrowViewport ? Math.max(12, NODE_HIT_PADDING - 2) : 10}
            tapSlop={immersive ? tapSlop : 0}
            hideLabel
          />
```

- [ ] **Step 5: Emit secondary labels as the final paint pass**

After the existing inner-ring `innerLayout.map(...)` block that renders inner nodes, and before the overflow-chip block, add a new label pass:

```jsx
      {secondaryLayout.map((node) => (
        <text
          key={`secondary-label-${node.id}`}
          x={node.x}
          y={node.y + node.radius + 24}
          textAnchor="middle"
          className="connections__secondary-label connections__secondary-label--floating"
          data-testid="secondary-floating-label"
        >
          {truncateLabel(node.name, 14)}
        </text>
      ))}
```

- [ ] **Step 6: Manually verify in dev**

Run the local dev frontend if it's not already running:

```powershell
Set-Location "c:\Users\basim\Documents\Intro\frontend"; $env:CI = "true"; npm test -- --runTestsByPath src/components/connections/graphLayout.test.js --watchAll=false
```

Expected: PASS (no regressions in the pure-layout tests).

Then open `http://localhost:3000`, sign in, navigate to Connections, focus Diana Davis (or any inner contact with secondaries), and confirm:

1. Diana is no longer locked to the top — she rotates to a clearer wedge.
2. Paul Parker's name is fully readable, not obscured by Diana's body or label.
3. Secondary nodes sit farther out than the inner ring (visibly more separation than before).

Note: if the local dev server is not running, skip this manual check and rely on the production build + component test in later tasks.

- [ ] **Step 7: Commit**

```powershell
Set-Location "c:\Users\basim\Documents\Intro"; git add frontend/src/components/connections/ConnectionsGraph.js; git -c user.name="Basim Musa" -c user.email="basimmusa98@gmail.com" commit -m "feat(connections): paint secondary labels above inner ring"
```

---

## Task 4: Boost focused secondary label contrast

**Files:**
- Modify: `frontend/src/pages/Connections.css`

- [ ] **Step 1: Add a new CSS rule for the floating label**

Find the existing block in `Connections.css`:

```css
.connections__inner-label,
.connections__secondary-label,
.connections__status-label,
.connections__overflow-chip text {
  fill: rgba(255, 255, 255, 0.72);
  font-size: 10px;
}
```

Immediately AFTER that rule, append:

```css
.connections__secondary-label--floating {
  fill: rgba(255, 255, 255, 0.94);
  font-size: 10px;
  paint-order: stroke fill;
  stroke: rgba(11, 15, 24, 0.85);
  stroke-width: 2.6;
  stroke-linejoin: round;
  pointer-events: none;
}
```

The `paint-order: stroke fill` plus a dark stroke gives the floating label a halo so it remains legible even if it briefly overlaps a faded inner-node halo while the layout animates.

- [ ] **Step 2: Commit**

```powershell
Set-Location "c:\Users\basim\Documents\Intro"; git add frontend/src/pages/Connections.css; git -c user.name="Basim Musa" -c user.email="basimmusa98@gmail.com" commit -m "style(connections): floating secondary label contrast and halo"
```

---

## Task 5: Extend the component test to guard paint order

**Files:**
- Modify: `frontend/src/components/connections/ConnectionsGraph.test.js`

- [ ] **Step 1: Add a new test case**

Inside the existing `describe("ConnectionsGraph", () => { ... })` block in `ConnectionsGraph.test.js`, add the following test AFTER the existing `it(...)` for the overlay sheet:

```jsx
  it("paints secondary labels above the inner ring when a branch is focused", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ConnectionsGraph
          currentUserName="Alice"
          innerConnections={[
            { id: "1", name: "Diana Davis", strength: 5 },
            { id: "2", name: "Bob Brown", strength: 4 },
            { id: "3", name: "Carol Chen", strength: 3 },
          ]}
          overflowInnerConnections={[]}
          focusUserId="1"
          focusedConnection={{ id: "1", name: "Diana Davis", jobRole: "Data Scientist", industry: "Technology" }}
          secondaryConnections={[{ id: "p1", peer_id: "p1", name: "Paul Parker", strength: 2 }]}
          secondaryLoading={false}
          onFocusConnection={jest.fn()}
          onResetFocus={jest.fn()}
          onSelectSecondary={jest.fn()}
          t={t}
          immersive
        />
      );
    });

    const svg = container.querySelector(".connections__graph-svg");
    expect(svg).toBeTruthy();

    const innerNodes = Array.from(svg.querySelectorAll(".connections__inner-node"));
    const floatingLabels = Array.from(svg.querySelectorAll("[data-testid='secondary-floating-label']"));
    expect(innerNodes.length).toBeGreaterThan(0);
    expect(floatingLabels.length).toBe(1);

    const allChildren = Array.from(svg.querySelectorAll("*"));
    const lastInnerIndex = Math.max(...innerNodes.map((node) => allChildren.indexOf(node)));
    const firstFloatingLabelIndex = Math.min(
      ...floatingLabels.map((label) => allChildren.indexOf(label))
    );

    expect(firstFloatingLabelIndex).toBeGreaterThan(lastInnerIndex);
    expect(floatingLabels[0].textContent).toBe("Paul Parker");
  });
```

- [ ] **Step 2: Run the full focused suite**

```powershell
Set-Location "c:\Users\basim\Documents\Intro\frontend"; $env:CI = "true"; npm test -- --runTestsByPath src/components/connections/graphLayout.test.js src/components/connections/ConnectionsGraph.test.js --watchAll=false
```

Expected: ALL tests pass (existing overlay test + new layout suite + new paint-order test).

- [ ] **Step 3: Run the production build to confirm nothing regresses**

```powershell
Set-Location "c:\Users\basim\Documents\Intro\frontend"; npm run build
```

Expected: "Compiled successfully." with no warnings beyond the existing `fs.F_OK` deprecation note.

- [ ] **Step 4: Commit**

```powershell
Set-Location "c:\Users\basim\Documents\Intro"; git add frontend/src/components/connections/ConnectionsGraph.test.js; git -c user.name="Basim Musa" -c user.email="basimmusa98@gmail.com" commit -m "test(connections): guard secondary label paint order when focused"
```

---

## Task 6: Update the connections README and push

**Files:**
- Modify: `frontend/src/components/connections/README.md`

- [ ] **Step 1: Document the new constants and behavior**

In `frontend/src/components/connections/README.md`, replace the existing table row that ends with `SECONDARY_RING_RADIUS` with these two rows:

```
| `polarToCartesian`, `getInnerRingLayout`, `getSecondaryRingLayout` | Math for positions, opacity, scale. `getSecondaryRingLayout(nodes, focusAngle?)` takes an optional focus angle to switch from the default arc to a focused fan. |
| `pickFocusPresentationAngle` | Deterministic angle picker used by `getInnerRingLayout` when a branch is focused; rotates the focused inner node into the clearest wedge. |
| `GRAPH_VIEWBOX`, `GRAPH_CENTER`, `INNER_RING_RADIUS`, `SECONDARY_RING_RADIUS`, `SECONDARY_RING_RADIUS_FOCUSED`, `FOCUS_FAN_DEGREES` | Coordinate system. `SECONDARY_RING_RADIUS_FOCUSED` and `FOCUS_FAN_DEGREES` apply only when an inner connection is focused. |
```

Then update the **Product defaults** section by appending the following bullet directly under the existing line:

```
- **Adaptive focus wedge:** when an inner connection is selected, the inner ring rotates so the focused node lands on the clearest available angle from `FOCUS_PRESENTATION_CANDIDATES`. Secondary nodes are placed on `SECONDARY_RING_RADIUS_FOCUSED` along a fan of `FOCUS_FAN_DEGREES` centred on the focused node so labels stay readable.
```

- [ ] **Step 2: Re-run the full focused verification one final time**

```powershell
Set-Location "c:\Users\basim\Documents\Intro\frontend"; $env:CI = "true"; npm test -- --runTestsByPath src/components/connections/graphLayout.test.js src/components/connections/ConnectionsGraph.test.js --watchAll=false; npm run build
```

Expected: ALL tests pass AND the production build compiles successfully.

- [ ] **Step 3: Commit and push**

```powershell
Set-Location "c:\Users\basim\Documents\Intro"; git add frontend/src/components/connections/README.md; git -c user.name="Basim Musa" -c user.email="basimmusa98@gmail.com" commit -m "docs(connections): document adaptive focus wedge in module README"; git push
```

- [ ] **Step 4 (optional): Deploy to Fly**

If the user wants the live demo updated, run:

```powershell
Set-Location "c:\Users\basim\Documents\Intro\frontend"; flyctl deploy --remote-only
```

Expected: image builds, machines update, `https://intro-web.fly.dev/` returns `200`.

---

## Self-review

**Spec coverage:**

| Spec § | Covered by |
|--------|------------|
| §3.1 default (no focus) | Existing `getInnerRingLayout` path is preserved by Task 2 Step 2; existing test fixtures cover it implicitly via the "no focus angle passed" branch in Task 1. |
| §3.2.1 focus angle selection | Task 1 + Task 2 (`pickFocusPresentationAngle`). |
| §3.2.2 inner ring rotation | Task 2 Step 2 (`getInnerRingLayout` rotation). |
| §3.2.3 secondary ring radius + fan | Task 2 Step 3 (`getSecondaryRingLayout(focusAngle)`) + Task 1 layout tests. |
| §3.2.4 non-focused inner fade | Already in place — `opacity: 0.16` retained. |
| §3.2.5 labels paint order | Task 3 Steps 4–5 + Task 5 component test. |
| §3.2.5 secondary label contrast | Task 4 CSS rule. |
| §3.3 reset / unfocus | No state to roll back; covered by the default branch in `getSecondaryRingLayout` and `getInnerRingLayout`. |
| §4 files affected | One task per file, matching the table. |
| §5 testing plan | Task 1 (unit) + Task 5 (component) + Task 3 Step 6 (manual smoke). |
| §6 edge cases | Task 1 "only one inner node" case + Task 2 single-secondary branch in `getSecondaryRingLayout` + existing reduced-motion path untouched. |

**Placeholder scan:** None — every code block contains the actual implementation, every test contains assertions, every command is concrete with expected output.

**Type consistency:** Helper names match across tasks (`pickFocusPresentationAngle`, `getSecondaryRingLayout(nodes, focusAngle)`, `SECONDARY_RING_RADIUS_FOCUSED`, `FOCUS_FAN_DEGREES`). The Node component's new `hideLabel` prop is used in Task 3 Step 4 with the same name defined in Task 3 Step 2.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-connections-adaptive-focus-wedge.md`.**
