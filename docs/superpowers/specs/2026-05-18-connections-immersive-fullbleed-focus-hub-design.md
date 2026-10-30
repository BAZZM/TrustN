# Immersive Connections — full-bleed stage + focus hub (signed decisions)

**Status:** Design locked (2026-05-18 user sign-off). Supersedes the chrome/layout portions of `2026-05-18-connections-immersive-helix-focus-design.md` where they conflict: **geometry is hub-centered**, **stats leave the top hero**, **no peek sheet**.

**Problem statement (from review):**
- Top glass hero + stat row reads too strong and overlaps the graph.
- Bottom tooling feels too small for an “immersive” stage.
- Prior `helix_focus` keeps **You** at the SVG geometric center; product wants the **focused inner peer** at that center when a focus is active.

---

## Signed decisions

| Topic | Choice | Meaning |
|--------|--------|--------|
| Stage framing | **C — Full bleed** | Graph is the hero; chrome is **edge-attached** and visually quiet so it does not cover or compete with nodes. |
| Graph height | **Yes (~85%+)** | Between safe areas, the drawable graph stage targets **≥ ~85%** of viewport height (exact token TBD in CSS; goal is maximal vertical real estate). |
| Focus geometry | **A — Focused node = geometric center** | When `focusUserId` is set on an inner peer, that node is placed at **`GRAPH_CENTER`** (210, 210 in the 420 viewBox). **You** are **not** fixed at center in this mode; You become a **layouted** inner (or special-case) node at a computed position. Non-focused inners use a **helix / spiral outward** from the **focused hub** (same “backward deprioritization” intent as today’s helix, but **origin = focused peer**, not You). |
| Stats / summary | **FAB / bottom** | Remove or strip the **top** stat chips row; counts and decode live in **bottom chrome** and/or **FAB**-opened surfaces (not a dominant top capsule). |
| Bottom sheet | **No peek** | No persistent **peek** strip (~116px) over the graph. Default view is **full graph**; FAB (or equivalent) opens a **full** sheet/modal when tooling is needed. |

---

## Layout (`graphLayout.js`) — target behavior

**New or renamed mode** (working name `focus_hub`; alias `hub_helix` acceptable in code review):

1. **Unfocused** (immersive, no `focusUserId`): may remain **ring** at inner radius around You at center, or a lighter variant — product default can match non-immersive **ring** for parity.
2. **Focused inner:**
   - **Focused peer** → coordinates `(GRAPH_CENTER, GRAPH_CENTER)` (subject to optional `NODE_HIT_PADDING` / label clearance — same as center node today).
   - **Current user (“You”)** → single position on inner ring / short arc **away from focused hub** (exact rule: e.g. opposite semicircle or `pickFocusPresentationAngle` family — keep readable and test-friendly).
   - **Other inners** → helix **emanating from focus** (increasing radius + angle step), **not** from You.
   - **Secondaries** → unchanged contract where possible: still branch from **focused** inner for focus mode; verify edge cases when focused id equals You (should not happen for inner focus) or when focus cleared.

**Difference from shipped `helix_focus`:** Today’s implementation keeps You at `GRAPH_CENTER` and coils **other** inners inward. **focus_hub** instead **translates the conceptual hub** to the selected peer and moves You to the ring.

**Tests:** Extend `graphLayout.test.js` with fixtures asserting: focused id at center ±ε, You not at center when focus is another inner, monotonic helix radii from hub.

---

## Chrome & CSS (`ConnectionsGraph.js`, `Connections.css`)

- **Top:** Eliminate or reduce to **title / wayfinding only** (no heavy glass stats block). Optional **single subtle line** (counts as text) only if it does not steal vertical space — prefer **bottom** for numbers.
- **Bottom:** **Stats** + primary actions in a **compact dock** above the global nav (or integrated with floating nav pattern already in repo). Must respect safe-area insets.
- **FAB:** Opens **full** sheet (search, requests, focus detail) — **no** intermediate peek height; animation can go **closed ↔ expanded** only.
- **Z-order:** Graph strokes/nodes must not be visually **under** opaque chrome; use blur + transparency consistent with “understated” (avoid large solid overlays on the spiral).

---

## i18n & a11y

- Reuse existing keys where strings unchanged; add keys if top hero copy is removed and bottom/FAB labels need distinct wording.
- FAB and sheet retain `aria-expanded`, focus trap when sheet open (existing patterns).

---

## Out of scope (this spec)

- Tenant API payload shape (see `THEME_GRAPH_HOOKS.md` for future `innerLayoutMode`).
- Admin tooling.

---

## Implementation order (suggested)

1. **`focus_hub` layout** + unit tests (geometry correctness).
2. **ConnectionsGraph:** center glyph draws **You OR focused peer** by mode; secondary lines originate from correct hub.
3. **CSS:** full-bleed stage height, remove peek sheet UX, relocate stats, tune glass weight.

---

## Change log

| Date | Author | Note |
|------|--------|------|
| 2026-05-18 | Product + engineering | Decisions C / A / FAB-bottom / 85%+ / no peek recorded; supersedes conflicting helix-only chrome spec sections. |
