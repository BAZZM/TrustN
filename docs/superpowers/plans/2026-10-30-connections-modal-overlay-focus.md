# Modal overlay focus management — implementation plan

> Spec: `docs/superpowers/specs/2026-10-30-connections-modal-overlay-focus-design.md`. Track with checkboxes; run tests after each task.

**Goal:** Make the immersive details sheet and branch search behave as proper modals: focus moves in, background is inert, Escape closes, focus returns to the opening FAB.

**Architecture:** A small `useModalOverlay` hook owns inert/focus/Escape. `ConnectionsGraph.js` replaces two booleans with one `overlay` state, keeps the FAB cluster mounted, and adds a sheet scrim. CSS gains hidden-FAB, scrim and reduced-motion rules.

**Tech stack:** CRA, React 18.2, Jest + RTL (`createRoot` + `act`, as in `ConnectionsGraph.test.js`).

---

### Task 1: `useModalOverlay` hook

**Files:**
- Create: `frontend/src/hooks/useModalOverlay.js`
- Modify: `frontend/src/components/connections/ConnectionsGraph.test.js` (behavior covered through the component in Task 2)

- [x] Hook signature: `useModalOverlay({ open, onClose, panelRef, returnFocusRef, getInitialFocus })`. The background is **everything outside the panel's ancestor chain** (siblings of the panel and each ancestor up to `<body>`), not a hand-listed set of refs: the first version used per-region refs and a real-keyboard pass showed Tab escaping into the app's bottom nav. Elements marked `data-modal-keep` (the scrim) stay active.
- [x] On open: remember `document.activeElement`, set `inert` on everything outside the panel, focus `getInitialFocus()` or the first focusable in `panelRef` on the next animation frame, add a document `keydown` listener for Escape.
- [x] On close/unmount: remove listener, cancel the frame, remove `inert`, focus `returnFocusRef.current` (else the remembered opener) if still connected.
- [x] Latest options are read from a ref so the effect depends only on `open` (keeps CRA's `react-hooks/exhaustive-deps` lint clean; `CI=true npm run build` fails on warnings).

### Task 2: Single overlay state in `ConnectionsGraph`

**Files:**
- Modify: `frontend/src/components/connections/ConnectionsGraph.js`
- Modify: `frontend/src/components/connections/ConnectionsGraph.test.js`

- [x] **Tests first (red):** opening the sheet via the Details FAB sets `inert` on the stage, dock and FAB cluster, moves focus to `.connections__sheet-handle`, gives the sheet `role="dialog"` / `aria-modal`, keeps both FAB buttons mounted; Escape closes it and returns focus to the Details FAB; opening search focuses the search input path and Escape returns focus to the Search FAB; sheet and search are mutually exclusive.
- [x] Replace `sheetOpen` / `branchSearchOpen` state with `overlay`; derive both flags; update every `setSheetOpen` / `setBranchSearchOpen` call site; drop the two now-redundant effects and the hand-rolled Escape effect.
- [x] Add refs (sheet, search overlay, both FABs); call the hook once per overlay kind (or once keyed on `overlay`).
- [x] Always render the FAB cluster; add a `--hidden` modifier while an overlay is open.
- [x] `pinchDisabled` uses `Boolean(overlay)`.

### Task 3: Scrim, semantics, CSS

**Files:**
- Modify: `frontend/src/components/connections/ConnectionsGraph.js`
- Modify: `frontend/src/pages/Connections.css`
- Modify: `frontend/src/i18n/en.js`

- [x] **Test first:** clicking the sheet scrim closes the sheet and does not call `onResetFocus`.
- [x] Render `.connections__sheet-scrim` (below the sheet, above the stage) only while the sheet is open; `onClick` closes it.
- [x] `role="dialog"`, `aria-modal`, `aria-label` (`connections.sheetDialogAria`) on the sheet only while open.
- [x] CSS: `.connections__immersive-fab-dock--hidden { visibility: hidden; }`, scrim rule, and `.connections__sheet--open { transition: none; }` under `prefers-reduced-motion`.

### Task 4: Verify

- [x] `cd frontend && CI=true npm test -- --watchAll=false` all pass.
- [x] `cd frontend && CI=true npm run build` compiles with no warnings.
- [x] Browser pane at 375px, real keyboard: Tab/Shift+Tab inside the open sheet and search never reach graph nodes; Escape closes; `document.activeElement` is the opening FAB; tapping the scrim closes the sheet and leaves the focused branch in place.
- [x] Update `frontend/src/components/connections/README.md` with the overlay contract.

**Implementation notes (found while verifying in the browser):**
- The sheet's `visibility 0.22s` transition left it `hidden` on the first frame, so `focus()` silently failed. Fixed in CSS (`visibility 0s` on open) and the hook retries once after 80ms.
- The stats dock (z-index 4) drew over the open sheet. Scrim is now z-index 5 and the sheet 7; the branch search overlay stays at 8.
- With the whole page inert, the bottom nav is visible but not tappable while a modal is open; close the modal first.
