# Immersive Connections — helix deprioritization + minimal bottom chrome

**Date:** 2026-05-18  
**Status:** Draft for review (no implementation until approved)  
**Relates to:** Glass hero HUD (`2026-05-17-connections-immersive-glass-hero-design.md`), adaptive focus wedge (`2026-05-17-connections-adaptive-focus-wedge-design.md`)

---

## 1. Problem

On **mobile immersive** Connections, the **bottom glass sheet** (focus card + search + requests) consumes a large share of the viewport and **sandwiches** the graph with the top hero capsule. Users want **attention on the graph**: the **focused branch** should feel **expanded and central**; **other inner-circle peers** should move into a **tighter, secondary geometry** so the scene reads as “zoomed into” the selection.

---

## 2. Product decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Deprioritized inner geometry | **C — Helix / spiral** (2D projection in SVG; v1 is math + CSS, not WebGL) |
| Bottom chrome default | **A — Peek strip** (~80–100 px effective height): focused person **name**, **role/industry line**, **Reset** |
| Search + discovery + requests | **B — Off default chrome**: primary entry via **FAB**; **full sheet** (current rich panel) opens from **FAB** and/or **expand handle** on the peek (same content, one surface) |

**Interpretation of “A and B”:** Default UI is **compact peek**; **no** full search/requests stack visible until the user **expands** or taps the **FAB**. FAB and expand may both route to the **same** expanded panel to avoid two divergent flows.

---

## 3. Goals

1. **Helix mode (focus active):** When `focusUserId` is set, **non-focused** visible inner nodes are laid out on a **2D spiral / coil** (e.g. Archimedean-style: radius grows with turn index) **inside the existing viewBox**, biased **away from the primary wedge** used by the focused node + secondaries. **Focused** inner node keeps **strong presence** on the main inner ring (existing radii / scale / wedge behavior, extended as needed).
2. **Graph-first readability:** Deprioritized nodes remain **tappable** (switch focus) with **minimum hit target** consistent with `NODE_HIT_PADDING` (may relax slightly only with QA sign-off).
3. **Less invasive chrome:** Implement **peek** + **FAB** + **expandable sheet**; cap default footprint so **graph + helix** occupy most of the vertical corridor between hero and nav.
4. **Theming / multi-tenancy readiness:** Layout strategy and tunables are **documented** in [`docs/THEME_GRAPH_HOOKS.md`](../THEME_GRAPH_HOOKS.md) so tenants can swap **layout mode** and constants without forking core product logic.

---

## 4. Non-goals

- WebGL / three.js / true 3D camera.
- Changing **backend**, **RLS**, or **connection APIs**.
- Removing **overflow** or **requests** features — only **progressive disclosure** of UI.
- Breaking **desktop** non-immersive graph layout in v1 (helix applies to **immersive + branch focus** only unless spec extended later).

---

## 5. Layout concept (helix)

**v1 algorithm (implementable in `graphLayout.js`):**

- Inputs: same as today `getInnerRingLayout(nodes, focusUserId)` plus optional **layout options** object (see theme hooks doc).
- When **no focus**: keep current **evenly spaced ring** (unchanged).
- When **focus**:
  - **Focused node:** position on **INNER_RING_RADIUS** at **presentation angle** (reuse `pickFocusPresentationAngle` + rotation).
  - **Non-focused visibles:** assign integer **turn index** `k = 0 … N-2`; map to polar `(r_k, θ_k)` where  
    - `θ_k` advances by fixed angular step (e.g. 42–55°) around a **helix axis angle** offset from the focus—toward **bottom** or **side** of viewBox to avoid secondary fan collision (exact bias from wedge tests).  
    - `r_k = r_inner_min + k * Δr` with `r_inner_min` **clearly inside** `INNER_RING_RADIUS` (tighter coil) and `Δr` small enough that nodes stay in viewBox with margin for labels.
  - Merge outputs so each node has `x, y, angle, opacity, scale, radius` — deprioritized nodes: **lower opacity** than today’s 0.16 **or** similar but **smaller radius** so the helix reads as “background” (exact numbers TBD in implementation; must pass visual QA).

**Collision:** If a helix node would overlap the **secondary fan**, **nudge θ_k** or **compress Δr** deterministically (documented order: resolve by index).

---

## 6. Bottom sheet behavior

| State | UI |
|--------|-----|
| **Peek** | Rounded top bar: avatar optional (future), **name**, **role / industry** one line, **Reset**, thin **grab hint**; **no** search field, **no** long body copy in peek. |
| **Expanded** | Today’s **focus card** body + **UnifiedSecondarySearchBar** + **intro actions** + sheet scroll for overflow + requests (unchanged logic). |
| **FAB** | Floating action control above nav / above peek; opens **expanded** panel (or focuses search — product default: **open expanded**). |

**Default on focus:** start in **peek** (`sheetOpen === false` semantics flipped: today “closed” still shows a lot; **reduce** `max-height` / static block for default).

**Accessibility:** FAB must have **visible label** (sr-only or text); expand handle **keyboard** operable.

---

## 7. Motion

- **Framer-motion** transitions for inner node positions when switching focus (spring or tweened; respect existing `useReducedMotion` for **graph** motion; hero strip policy unchanged per prior spec).
- Helix **re-layout** should be **deterministic** and **test-covered** in `graphLayout.test.js`.

---

## 8. Files (anticipated)

| File | Role |
|------|------|
| `frontend/src/components/connections/graphLayout.js` | Helix branch of inner layout; exports for tests |
| `frontend/src/components/connections/graphLayout.test.js` | Helix positions, determinism, no overlap focus |
| `frontend/src/components/connections/ConnectionsGraph.js` | Wire layout mode; FAB; sheet state machine |
| `frontend/src/pages/Connections.css` | Peek height, FAB, sheet transitions |
| `frontend/src/pages/Connections.js` | Pass theme/layout options if needed |
| `docs/THEME_GRAPH_HOOKS.md` | Tenant-tunable knobs |

---

## 9. Testing

- Unit: helix outputs in viewBox; focus node on main radius; deprioritized count ≤ `MAX_VISIBLE_INNER - 1`.
- Component: peek height below threshold; FAB opens expanded; existing overlay sheet tests updated if DOM changes.
- Manual: iOS WebView / Chrome device toolbar; dense graph (8 inner); focus swap latency.

---

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Helix illegible at 8 nodes | Tune Δr / opacity; optional “compact list” theme flag later |
| FAB vs dock overlap | Safe-area + z-index spec in CSS |
| Tenant wants ring-only | `layoutMode: 'ring'` in theme hooks |

---

## 11. Approval gate

- Review this spec + [`THEME_GRAPH_HOOKS.md`](../THEME_GRAPH_HOOKS.md).  
- **Next step after approval:** `writing-plans` implementation plan, then TDD on `graphLayout`.
