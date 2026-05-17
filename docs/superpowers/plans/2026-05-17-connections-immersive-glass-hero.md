# Connections immersive glass hero HUD — implementation plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Execute in order; verify tests and build before shipping.

**Goal:** Replace the separate immersive HUD band with one floating glass hero bar over the graph (stats + one short line), share chrome tokens with the floating nav, add numeral glitch/idle motion per spec, and reduce SVG clipping.

**Architecture:** DOM change in `ConnectionsGraph.js` (hero as sibling of `pinch-inner` inside `graph-stage`); new CSS in `Connections.css` + `:root` / `.app--immersive-graph` tokens in `index.css` + `App.css`; optional `immersiveStatsKey` from `Connections.js` to trigger burst animation; i18n short strings; extend Jest tests.

**Tech stack:** CRA, plain CSS, Framer `useReducedMotion` unchanged for pinch (per user). Hero CSS animations **not** gated by PRM.

---

### Task 1: Tokens and dock alignment

**Files:** `frontend/src/index.css`, `frontend/src/App.css` (or `index.css` scoped block)

- [ ] Add `--immersive-chrome-bg`, `--immersive-chrome-border`, `--immersive-chrome-blur` (6–8px), `--immersive-chrome-shadow`.
- [ ] Under `.app--immersive-graph`, set `--dock-surface`, `--dock-border`, `--dock-blur`, `--dock-shadow` to match chrome tokens so `layout-nav--floating` matches the hero strip.
- [ ] Align `--hud-surface` / `--sheet-surface` slightly toward the same transparency family (4C).

**Verify:** Grep shows `.app--immersive-graph` in `Layout.js` already (yes).

---

### Task 2: i18n short hero lines

**Files:** `frontend/src/i18n/en.js`

- [ ] Add `connections.heroLineOverview` and `connections.heroLineFocus` (one line each, shorter than `graphIntro` / `focusActive`).

---

### Task 3: Pass stats key from Connections

**Files:** `frontend/src/pages/Connections.js`

- [ ] `useMemo` for `immersiveStatsKey` string from `innerConnections.length`, `visibleInnerConnections.length`, `requestInbox.length`, `requestSent.length`.
- [ ] Pass `immersiveStatsKey={immersiveGraph ? immersiveStatsKey : undefined}` to `ConnectionsGraph`.

---

### Task 4: ConnectionsGraph immersive DOM + glitch state

**Files:** `frontend/src/components/connections/ConnectionsGraph.js`

- [ ] Add prop `immersiveStatsKey` (optional string).
- [ ] `useRef` + `useEffect` to detect key changes and toggle ~680ms “burst” class on hero chips wrapper.
- [ ] Replace immersive block: inside `graph-stage`, first child = hero overlay (`position: absolute; top/left/right; z-index: 2; pointer-events: auto`), containing: headline row (short line + zoom reset button) and `statsSummary` wrap. Second child = existing `pinch-inner`.
- [ ] Remove old `connections__immersive-hud` sibling between stage and sheet.
- [ ] Stop click on hero from bubbling to stage `onResetFocus` (e.g. `stopPropagation` on hero container).

---

### Task 5: Connections.css — hero, motion, overflow

**Files:** `frontend/src/pages/Connections.css`

- [ ] New classes: `.connections__immersive-hero`, inner capsule, line typography (muted/transparent), chip row, glitch burst + idle keyframes on `.connections__immersive-hero .connections__stat-value`.
- [ ] Hero uses `backdrop-filter: blur(var(--immersive-chrome-blur))` and token vars.
- [ ] Adjust `.connections__graph-shell--immersive` / `.connections__graph-stage--immersive` overflow per spec (`visible` where safe).
- [ ] Deprecate or trim unused `.connections__immersive-hud*` rules superseded by hero.
- [ ] Sheet/focus card: use updated `var(--sheet-surface)` / borders if needed.

---

### Task 6: Tests

**Files:** `frontend/src/components/connections/ConnectionsGraph.test.js`

- [ ] Add `heroLineOverview` / `heroLineFocus` to test `translations`.
- [ ] Assert hero bar exists inside stage: e.g. `.connections__immersive-hero` child of `.connections__graph-stage--immersive`.
- [ ] Existing overlay + paint-order tests still pass.

**Run:** `cd frontend && set CI=true && npx react-scripts test --runTestsByPath src/components/connections/ConnectionsGraph.test.js --watchAll=false`

---

### Task 7: Build + commit

- [ ] `npm run build` in `frontend/`
- [ ] Commit with message like `feat(connections): glass hero HUD over immersive graph`

---

## Spec coverage (quick)

| Spec § | Task |
|--------|------|
| Floating bar + stats + one line | 2, 4, 5 |
| Light glass | 1, 5 |
| Glitch + idle | 4, 5 |
| Scene cohesion | 1, 5 |
| Dock alignment | 1 |
| Overflow / clipping | 5 |
| PRM (hero ignores) | 5 (no `prefers-reduced-motion` wrap on hero keyframes) |
