z\ q# Connections — adaptive focus wedge for selected branch

**Status:** Brainstorming design, awaiting user review before implementation planning  
**Last updated:** 2026-05-17  
**Scope:** Frontend layout only (`frontend/src/components/connections/graphLayout.js`, `ConnectionsGraph.js`, `Connections.css`). No backend, no API, no DB.

---

## 1. Problem

On the Connections page, selecting an inner-circle node (e.g. Diana Davis) currently:

1. Pins the focused inner node at the top of the graph (`angle = -90°`) regardless of which other faded inner nodes sit nearby. As a result, secondary nodes such as **Paul Parker (PP)** can render close to or under the focused inner node, with the secondary's label visually colliding with the focused node's body and label.
2. Places secondary nodes on a fixed ring (`SECONDARY_RING_RADIUS = 174`) inside the same `420 × 420` viewBox as inner nodes (`INNER_RING_RADIUS = 118`). The radial gap between the two rings is too small for distinct labels, especially on narrow viewports where text is already truncated.

User goal: when a branch is focused, every secondary node and its name should be readable without overlap, and the focused branch should be clearly separated from the rest of the graph.

---

## 2. Decision summary

Implement **Approach C — Adaptive Focus Wedge**:

- On focus, rotate the **selected** inner node into the clearest available branch angle rather than always `-90°`.
- Widen the secondary ring radius and arc when a branch is focused, so secondaries fan out into the most readable region of the graph.
- Keep all non-focused inner nodes visible (current "fade, don't hide" behavior is retained) but reduce their label dominance so they don't compete with the active branch.
- Keep all changes in the existing pure layout module so platform-agnosticism (web SVG + future React Native) is preserved.

Approaches A and B (top-locked focus with bigger rings) were rejected: they reduce but don't eliminate the underlying overlap because the focused branch always lives in the same angular zone as the page header / freshness copy / details sheet.

---

## 3. Behavior contract

### 3.1 Default (no focus)
- Inner ring radius, spread, and node sizes: **unchanged** from today's defaults.
- Secondary nodes: not rendered.

### 3.2 Focused inner branch
1. **Focus angle selection.** Compute a "presentation angle" for the focused inner node by scoring candidate angles for empty space:
   - Candidate angles: the focused node's own current angle, plus `-90°`, `-60°`, `-120°`, `-45°`, `-135°`, `0°`, `180°`.
   - For each candidate, score the minimum angular distance to all *other* inner nodes (after rotation). Higher minimum distance = clearer wedge.
   - Choose the highest-scoring candidate. Tie-break by preferring angles in the upper hemisphere (`y < center`) so the branch reads above "You".
2. **Inner ring rotation.** Rotate the whole inner ring so the focused node sits at the chosen angle. Non-focused inner nodes keep their relative ordering.
3. **Secondary ring.**
   - Radius increases from `SECONDARY_RING_RADIUS = 174` to a new `SECONDARY_RING_RADIUS_FOCUSED ≈ 210` (final value chosen during implementation but documented in `graphLayout.js`).
   - Arc spread becomes a focused fan centered on the focused angle, ≈ `110°` wide (clamped to a maximum of `140°`), instead of the current global arc `-160°..-20°`.
   - When a single secondary is present, place it directly outward along the focused angle.
4. **Non-focused inner nodes.** Keep the existing `opacity ≈ 0.16` fade, and additionally reduce their label opacity so faded names don't visually compete with secondary names. No change to interactivity; faded inners remain clickable.
5. **Labels.**
   - Focused inner label: stronger contrast (opacity 1).
   - Secondary labels: higher contrast than today and rendered *after* the secondary node body in SVG paint order to ensure they always read on top.
   - If a secondary's label would still overlap the focused inner node's bounding circle, shift the label slightly outward along the radial.

### 3.3 Reset / unfocus
Returns to default layout. No persistence of the chosen presentation angle between sessions.

---

## 4. Files affected

| File | Change |
|------|--------|
| `frontend/src/components/connections/graphLayout.js` | Add `pickFocusPresentationAngle(innerNodes, focusUserId)`; update `getInnerRingLayout` to use it; extend `getSecondaryRingLayout` to take optional `focusAngle` and emit a focused fan + larger radius. Export new constant `SECONDARY_RING_RADIUS_FOCUSED`. |
| `frontend/src/components/connections/ConnectionsGraph.js` | Pass the focus angle from inner layout into the secondary layout call. Adjust SVG paint order so secondary labels are drawn last. |
| `frontend/src/pages/Connections.css` | Add focus-mode label rules: stronger focused secondary label opacity, reduced faded inner label opacity. No new colors. |
| `frontend/src/components/connections/README.md` | Document the new constants and the "adaptive focus wedge" behavior in the product defaults section. |

No changes to:
- `Connections.js` page (still consumes the same component props)
- API or DB
- Other pages
- Translation files

---

## 5. Testing plan

- **Unit test** (Jest, existing test harness): add a focused-branch case to `graphLayout` confirming that (a) the focused node lands on the chosen presentation angle, (b) secondary nodes lie on the focused radius, (c) the fan spread is bounded.
- **Component test** (extend `ConnectionsGraph.test.js`): assert that with a focused branch and multiple secondaries, all secondary `<text>` elements render *after* their corresponding `<g>` body in SVG document order (overlap-safe ordering).
- **Manual smoke** (Chrome + Safari iOS sim or DevTools mobile profile, 767px breakpoint):
  - Focus Diana Davis with at least 1 secondary; verify Paul Parker is no longer hidden.
  - Focus a connection that already sits near the bottom of the inner ring; verify the wedge rotates upward instead of staying at the bottom.
  - Focus an inner connection with zero secondaries; verify "No secondary branch returned" copy still renders centered.
  - Reset focus; verify default layout matches the prior screenshot baseline.

---

## 6. Edge cases

- **One inner connection total.** No other inner nodes to dodge — focus angle defaults to `-90°`.
- **Many secondaries near the cap (`MAX_VISIBLE_SECONDARY = 8`).** A `110°` fan still gives ≥ `13°` between secondaries at radius `210`; verify labels still fit when names are long. If not, rely on the existing `truncateLabel` path.
- **Reduced motion.** The focus rotation should still animate via the existing `framer-motion` spring; for `prefers-reduced-motion`, the existing `linear 0.12s` transition is reused. No new animations.
- **Pinch-zoom interaction.** Coordinate space and viewBox are unchanged, so the existing `usePinchPanZoom` hook continues to work without modification.
- **RLS / auth.** Not applicable — this is a presentation-only change.

---

## 7. Out of scope

- Backend or `app_unified_secondary_search` changes.
- Reworking the bottom-sheet (already overlays correctly per commit `53180e4`).
- Replacing the radial layout with a force-directed graph (would be a separate spec).
- Visual redesign of node chrome, halos, or colors.

---

## 8. Self-review

- All "TBD"s are explicit numeric defaults that can be tuned during implementation (`SECONDARY_RING_RADIUS_FOCUSED ≈ 210`, fan ≈ `110°`). No vague requirements.
- Sections are internally consistent: the focus contract (§3) maps 1:1 to the file changes (§4) and tests (§5).
- Scope is small enough for a single implementation plan: one pure module update, one React component update, one CSS update, plus tests.
- Ambiguity check: the "presentation angle picker" is deterministic — given the same inner ring and focus id, it always returns the same angle.

---

**Next step:** User review of this spec, then transition to `writing-plans` to produce the implementation plan.
