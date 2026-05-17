# Connections immersive “glass hero” HUD — design spec

**Date:** 2026-05-17  
**Status:** Draft for implementation planning  
**Scope:** Mobile immersive Connections trust graph (`narrowViewport` + `immersive` graph), including coordinated styling with the floating bottom nav on the same route.

---

## 1. Problem

- The current immersive layout separates a large graph stage from a **separate HUD band** (eyebrow, title, summary, stats). The user wants a **single, floating glass control strip** over the graph that **condenses** that copy and keeps the **same numeric stats**.
- Secondary nodes and labels can feel **clipped** relative to the usable graph region; the drawable area should align with the **chrome** (this bar is the top boundary of the “graph scene,” not an unrelated block below).
- Aesthetic direction: **light glass**, **high-motion “decode / glitch”** on numerals, **idle motion**, and a path that remains **WebView/Capacitor-friendly** (CSS-first, no heavy UI framework).
- **Accessibility:** The product owner explicitly wants this surface to remain **visually dynamic even when `prefers-reduced-motion: reduce`** so it can act as the app’s future **centerpiece**. This **deviates from WCAG 2.x motion guidance**; mitigate via documentation and a **future** optional “calm mode” (out of scope here unless added later).

---

## 2. Goals

1. **One floating glass bar** (capsule / rounded rect) **overlaid on the top of the graph area**, horizontally inset with safe margins, containing:
   - **Three stat chips** with the **same values** as today (Inner total, In graph, Introductions).
   - **One short contextual line** only (replaces separate eyebrow + long title + long summary stack). Content rules in §4.
2. **Light glass** (~6–8px blur equivalent, high transparency, subtle border) per user preference **3A**.
3. **Glitch / decode motion on numerals** (primary emphasis); **larger motion on value change** + **lighter idle loop** so the strip feels “alive.”
4. **Visual cohesion across the full immersive scene (4C):** shell background, graph stage read, **bottom sheet / focus card**, and **overflow** areas should share the same **glass + typography + motion language** (tokens/variables), without turning every subpixel into an animation.
5. **Bottom navigation (8A):** On `layout-nav--floating` (Connections immersive route), align **blur strength, border, and tint** with the new top bar via **shared CSS variables** (`index.css` / theme) so dock + hero bar feel like one system.

---

## 3. Non-goals

- Replacing plain CSS with Tailwind or a third-party glass library for this slice.
- **React Native** parity; Capacitor uses the **same WebView CSS**.
- Weakening graph **pinch/pan** or **tap targets**; the bar must use **`pointer-events`** carefully so it doesn’t steal gestures from the graph.
- **RLS, API, or graph layout math** changes (`graphLayout.js`) unless clipping fixes require **purely visual** overflow/viewport changes.

---

## 4. Information architecture (copy)

| Element | Rule |
|--------|------|
| Stats | Unchanged **labels and values** from existing `stats` data in `Connections.js`. |
| Single line | **One** line of text in the bar: e.g. combined **context** — focused vs overview (maps from existing `connections.focusActive` / `connections.graphIntro` or a **new short i18n key** if we need a tighter string). **No** separate eyebrow row; optional **micro-label** inside the bar if needed for brand (e.g. “Trust graph” as part of the one line or as a **small prefix** — max one sub-line). |
| Title | **Dropped** as a large second heading in immersive; any “title” is **inline or abbreviated** inside the single line policy (**2C**). |

---

## 5. Layout & clipping

1. **DOM / stacking:** Move immersive HUD from **below** the graph stage to an **absolutely positioned layer** inside the graph shell, **above** the pinch layer, **below** modal overlays (sheet z-index unchanged relative to graph). The **graph stage** uses **remaining flex height** under the **top safe area**; the bar sits in the **overlay slot**, not consuming a full flex row (fixes “graph stops below stats” clipping mentally and frees vertical space).
2. **Overflow:** Revisit `overflow: hidden` on `.connections__graph-shell--immersive` and `.connections__graph-stage--immersive` so **SVG labels and secondary fan** are not clipped; prefer **`overflow: visible`** on the stage if hit-testing and sheet positioning still work; if not, **pad the SVG viewBox** or **scale** in `ConnectionsGraph` as a follow-on numeric tweak (implementation plan).
3. **Touch:** Bar is `pointer-events: auto`; graph backdrop reset remains on the **stage**; ensure **transparent** regions of the bar don’t block pinch (use a **solid enough hit target** only on text/chips, or accept full-bar blocking — choose in implementation; default: **full bar clickable for readability**, graph still tappable **outside** bar).

---

## 6. Visual system — glass

**Top bar + dock (shared tokens):**

- `--hero-glass-bg`: `rgba(0,0,0,0.35–0.45)` range (tune in implementation)
- `--hero-glass-border`: `rgba(255,255,255,0.12–0.18)`
- `--hero-glass-blur`: **6–8px** (`backdrop-filter` / `-webkit-backdrop-filter`)
- **Border-radius:** match or slightly exceed `--radius-lg` for capsule feel
- **Shadow:** soft outer shadow (single layer) for separation from graph

**Full-scene cohesion (4C):**

- Apply the same **token set** to `.connections__sheet` (overlay), optional **focus card** inner panels, and **graph-shell** ambient gradient so the scene reads as one **hero layer** rather than mismatched opaque cards.

---

## 7. Motion — numerals (“decode / glitch”)

**Functional requirements:**

1. **On stat value change** (including initial mount when data loads): a **more pronounced** decode / glitch animation (duration and intensity **above** subtle) on the **numeric glyphs** only.
2. **Idle:** continuous **light** motion (e.g. slow scan shimmer, micro noise opacity, or occasional stagger) so the strip feels active without overpowering the graph.
3. **Scope:** Primary effect on **`.connections__stat-value`** (and optionally label if needed); avoid animating the entire viewport.
4. **`prefers-reduced-motion`:** **Do not disable** these animations for this feature (explicit product decision). Document in **Settings / accessibility** backlog: optional **“Reduce interface motion”** toggle that **does** disable hero animations app-wide (future).

**Implementation preference:** CSS `@keyframes` + class toggles from React on value change; **avoid** canvas/WebGL for v1. Capacitor iOS: test **backdrop-filter + transform** compositing cost on mid-range devices.

---

## 8. Typography

- **Numerals:** Monospace / **decodable** feel; optional **webfont** (single weight) only if system stack cannot achieve the glitch aesthetic — prefer **one** font load for the whole hero strip.
- **Single line:** Smaller, **semi-transparent** neutral (aligns with earlier “gray and transparent” direction from discovery).

---

## 9. Bottom nav (`layout-nav--floating`)

- Reuse **`--hero-glass-*`** (or rename to `--immersive-chrome-*`) for **background, border, blur** so **8A** is satisfied without duplicating magic numbers.
- **Active tab** accent remains; no change to **route list** or behavior.

---

## 10. Files likely touched (implementation hint)

| Area | Files |
|------|--------|
| Structure / overlay | `frontend/src/components/connections/ConnectionsGraph.js` |
| Styles | `frontend/src/pages/Connections.css`, `frontend/src/components/Layout.css`, `frontend/src/index.css` (tokens) |
| Copy | `frontend/src/i18n/en.js` (+ others if multi-locale later) |
| Tests | `frontend/src/components/connections/ConnectionsGraph.test.js` (selectors / overlay order) |

---

## 11. Testing

1. **Manual:** Immersive Connections on **≤767px** — stats correct, bar doesn’t clip graph interactions, sheet still opens, nav still navigates.
2. **Automated:** Extend existing **overlay sheet** test if DOM order or shell structure changes.
3. **Devices:** Smoke on **iOS WebView** (future Capacitor) — blur + animation FPS acceptable.

---

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Motion + reduced-motion policy | Future Settings toggle; document in release notes |
| Performance on older phones | Cap blur animation simultaneous count; throttle idle keyframes |
| Hit-testing / accidental bar taps | Padding and tap targets; QA focus mode |

---

## 13. Approval

Requirements sourced from user selections: **1D + condensed bar**, **2C**, **3A**, **4C**, **5C**, **6 (change + larger + idle)**, **7 (no PRM suppression for this hero)**, **8A**.

**Status:** Approved — implemented 2026-05-17 (see plan `docs/superpowers/plans/2026-05-17-connections-immersive-glass-hero.md`).

**Next step:** Maintenance only; optional Settings “calm mode” from §7.
