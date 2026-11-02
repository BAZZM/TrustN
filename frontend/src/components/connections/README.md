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
| `getCurrentUserFocusHubLayout` | `focus_hub` only: position of the current user on the inner ring, opposite the focused hub, since the focused peer takes `GRAPH_CENTER`. Returns `null` when the focus id is not an inner peer. |
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

- **Inner layout modes** (`getInnerRingLayout(nodes, focusUserId, { layoutMode })`): `ring` (default), `ring_focus` (legacy fade), `helix_focus` (You at center, others coil in), and `focus_hub` (focused peer at `GRAPH_CENTER`, You on the ring, others on a helix from the hub). The immersive graph, shown only on narrow viewports, uses `focus_hub` while a peer is focused; desktop keeps the ring. See `docs/THEME_GRAPH_HOOKS.md`.
- **Adaptive focus wedge:** when an inner connection is selected, the inner ring rotates so the focused node lands on the clearest available angle from `FOCUS_PRESENTATION_CANDIDATES`. Secondary nodes are placed on `SECONDARY_RING_RADIUS_FOCUSED` along a fan of `FOCUS_FAN_DEGREES` centred on the focused node so labels stay readable.

- **Modal overlays (immersive):** the details sheet and branch search share one `overlay` state (`null | "sheet" | "search"`) and the `useModalOverlay` hook (`frontend/src/hooks/useModalOverlay.js`). While open, everything outside the overlay is `inert`, focus moves inside, Escape closes, and focus returns to the FAB that opened it (the FABs stay mounted, hidden, for that reason). Tapping the sheet scrim closes only the sheet and never clears the focused branch. Spec: `docs/superpowers/specs/2026-10-30-connections-modal-overlay-focus-design.md`.
- **Node shape (`normalizeGraphNode`):** secondary nodes carry `direct` (stored secondary edge), `via` (inner peers who can introduce) and `primaryVia` (the branch used for placement); `peerIntroduced` is inner-only and means "this inner link came from an introduction". The page loads them from `GET /api/connections/graph` (see `docs/RELATIONSHIP_BASED_CONNECTIONS.md`); the legacy `sources` / `via_inner_peer_ids` shape is still understood.
- **Immersive at every width:** the full-bleed view is no longer gated to narrow screens; on wide screens the graph, dock and a capped 560px nav are centred. Escape clears the focused branch (an open modal closes first); arrow keys move focus between inner nodes.
- **Free layout (flag, off by default):** `graphPhysics.js` (pure, deterministic) and `useForceLayout` move nodes *around* the rest positions from `graphLayout.js`: spring to rest, soft push, hard no-overlap projection, bounds, damping. Dragging pins a node; releasing makes the drop point its new rest. The animation loop sleeps when nothing moves. Enable with the "Free layout" toggle, `localStorage["intro_graph_layout"] = "free"`, or `?layout=free` / `?layout=fixed`. In free mode nodes take their position as plain `style` (a zero-duration framer-motion animation from `initial={false}` is never rendered).
- **Introduction path:** the selected secondary's path (You → focused inner peer → them) is drawn in the accent colour and the other branch edges dim. While a branch is open, the other inner peers keep their node but hide their label until hover or keyboard focus (their `aria-label` is unchanged), which stops labels piling onto the hub. On wide screens the stats dock and the Ask/Search/Details buttons share one row under the graph.
- **Performance contract:** `Node` is `React.memo`; the parent keeps its props stable (cached live positions, one transition object, per-kind drag callbacks). `ConnectionsGraph.perf.test.js` fails if a physics frame re-renders more than the dragged node.
- **Ask your network:** `AskNetworkPanel` in a third overlay kind (`"ask"`); pass `renderAsk` to `ConnectionsGraph` to show the "Ask" button. See `docs/RELATIONSHIP_BASED_CONNECTIONS.md`.
