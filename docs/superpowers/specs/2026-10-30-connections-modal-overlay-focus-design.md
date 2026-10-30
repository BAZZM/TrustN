# Immersive Connections — modal overlay focus management

**Status:** Approved for implementation (2026-10-30 user request: "pick up focus trap").

**Problem (observed in code, `ConnectionsGraph.js` immersive branch):**
- The Search / Details FABs unmount while an overlay is open, so the element that had focus disappears and focus falls to `<body>`.
- The details sheet has no `role="dialog"`, `aria-modal`, Escape handler, focus move or focus return.
- Graph nodes (`tabindex=0`) stay in the Tab order behind the sheet; screen-reader swipe can leave the sheet.
- Tapping the graph above the sheet calls `onResetFocus`, clearing the branch behind an open sheet.
- Sheet and branch search are tracked by two booleans that are manually kept mutually exclusive (`setSheetOpen(false); setBranchSearchOpen(true)` plus two effects).

## Decisions

| Topic | Choice |
|--------|--------|
| Trap mechanism | **`inert` on the background** (stage, stats dock, FAB cluster). No Tab-wrapping code and no dependency; Tab leaves through browser UI and returns, which is acceptable for a modal. |
| State | **One `overlay` value**: `null \| "sheet" \| "search"`. `sheetOpen` / `branchSearchOpen` become derived. |
| Shared behavior | **`useModalOverlay` hook** (`frontend/src/hooks/useModalOverlay.js`): sets background `inert`, moves focus in, closes on Escape, restores focus on close. |
| Trigger survival | **FAB cluster stays mounted** (hidden with `visibility` while an overlay is open) so focus has a real element to return to. |
| Scrim | **Sheet gets a scrim**; tapping it closes the sheet only and never calls `onResetFocus`. |
| Dialog semantics | Sheet gets `role="dialog"`, `aria-modal`, `aria-label` while open. Branch search keeps its existing dialog markup. |
| Motion | Sheet transition off under `prefers-reduced-motion`. |

`inert` is set through a ref (`setAttribute("inert", "")`) because React 18.2 does not support a boolean `inert` prop.

## Behavior

1. **Open (FAB click or Enter):** background inert, focus moves to the sheet handle (or the branch-search input), FAB cluster hidden.
2. **Close (Escape, handle, scrim, close button, picking a search result):** `overlay = null`, inert removed, focus returns to the FAB that opened the overlay, falling back to the previously focused element. Safari does not focus buttons on click, so the explicit FAB ref is preferred over `document.activeElement`.
3. **Branch cleared while search is open:** search closes (existing behavior); sheet stays open.
4. **Pinch / pan** is disabled while any overlay is open.

## Out of scope

- Backend / API changes.
- Re-skinning the sheet or search modal.
- A Tab-wrapping fallback for browsers without `inert` (Chrome 102, Safari 15.5, Firefox 112 and later all support it).

## Test notes

jsdom does not enforce `inert`, so tests assert the attribute, `document.activeElement`, Escape and the scrim. A real-keyboard pass in the browser pane covers the rest.
