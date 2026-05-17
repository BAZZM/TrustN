# Intro connections (graph) module

## Stable, platform-agnostic API — `graphLayout.js`

[`graphLayout.js`](./graphLayout.js) is a **pure JavaScript** module: no React, no DOM, no `framer-motion`. It is safe to import from:

- this web app’s SVG view ([`ConnectionsGraph.js`](./ConnectionsGraph.js));
- a future **React Native** screen using `react-native-svg` (or similar);
- unit tests;
- a Capacitor-wrapped build (unchanged, still web SVG).

**Exports to treat as a stable contract:**

| Export | Role |
|--------|------|
| `normalizeGraphNode` | Map API rows to a single `peer_id`-centric node shape. |
| `sortConnectionsByPriority` | Deterministic sort (strength, recency, name, id). |
| `polarToCartesian`, `getInnerRingLayout`, `getSecondaryRingLayout` | Math for positions, opacity, scale. `getSecondaryRingLayout(nodes, focusAngle?)` takes an optional focus angle to switch from the default arc to a focused fan. |
| `pickFocusPresentationAngle` | Deterministic angle picker used by `getInnerRingLayout` when a branch is focused; rotates the focused inner node into the clearest wedge. |
| `GRAPH_VIEWBOX`, `GRAPH_CENTER`, `INNER_RING_RADIUS`, `SECONDARY_RING_RADIUS`, `SECONDARY_RING_RADIUS_FOCUSED`, `FOCUS_FAN_DEGREES` | Coordinate system. `SECONDARY_RING_RADIUS_FOCUSED` and `FOCUS_FAN_DEGREES` apply only when an inner connection is focused. |
| `MAX_VISIBLE_INNER`, `MAX_VISIBLE_SECONDARY` | Default caps for the first screen. |
| `NODE_HIT_PADDING` | Extra hit radius in viewBox units (touch targets). |
| `getNodeInitials`, `truncateLabel` | Presentation helpers; optional for native. |

## Web-only adapter — `ConnectionsGraph.js`

[`ConnectionsGraph.js`](./ConnectionsGraph.js) is the **browser implementation**: React + SVG + `framer-motion` (springs) and `prefers-reduced-motion` handling. For native, re-implement a view that consumes the same layout output from `graphLayout.js` and renders `Circle` / `Line` / `Text` in your stack.

## Requests UI — `ConnectionRequestsPanel.js`

Collapsible panel for connection requests. Uses `framer-motion` for the drawer; keep motion in this file or add a `reduceMotion` path when reusing patterns on native (often a simple height animation is omitted).

## Product defaults

Documented at the top of `graphLayout.js` (N, focus = fade, identity rule). Change only with explicit product sign-off.

- **Adaptive focus wedge:** when an inner connection is selected, the inner ring rotates so the focused node lands on the clearest available angle from `FOCUS_PRESENTATION_CANDIDATES`. Secondary nodes are placed on `SECONDARY_RING_RADIUS_FOCUSED` along a fan of `FOCUS_FAN_DEGREES` centred on the focused node so labels stay readable.
