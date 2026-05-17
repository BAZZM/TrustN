# Theme & multi-tenancy hooks — trust graph presentation

**Purpose:** Intro will eventually support **per-tenant themes**. Graph **layout**, **motion**, and **chrome** should be driven by **declarative knobs** (CSS variables + small config objects) so white-label changes do not require deep forks of `ConnectionsGraph.js`.

**Status:** Living document. Update when adding layout modes or new tokens.

---

## 1. CSS custom properties (global / tenant)

| Token | Used for | Notes |
|-------|-----------|--------|
| `--immersive-chrome-bg` | Hero capsule, aligned dock | Already in `:root`; tenant themes may override |
| `--immersive-chrome-border` | Hero + sheet borders | |
| `--immersive-chrome-blur` | Backdrop blur strength | Watch performance on mid-range Android |
| `--sheet-surface` | Bottom sheet / panels | |
| `--font-mono` | Stat-derived / “decode” numerals | |

Future (add when implemented):

| Token | Used for |
|-------|-----------|
| `--graph-helix-r-min` | Minimum spiral radius (px or unitless SVG user units via JS bridge) |
| `--graph-helix-delta-r` | Radial step between deprioritized nodes |
| `--graph-helix-opacity` | Deprioritized node opacity floor |

*Note:* Pure SVG layout in `graphLayout.js` cannot read CSS vars without passing them from React; **v1** may keep helix numbers in JS constants re-exported as `GRAPH_THEME_DEFAULTS` and later fed from `theme.config` API.

---

## 2. Layout modes (`graphLayout.js`)

| Mode | When | Behavior |
|------|------|----------|
| `ring` | Default; no focus | Current evenly spaced inner ring |
| `ring_focus` | Legacy focus behavior | Full ring + fade non-focused (pre-helix) |
| `helix_focus` | Immersive + `focusUserId` *(planned)* | Focused on main inner radius; others on spiral |

**Extension pattern:** `getInnerRingLayout(nodes, focusUserId, options)` where `options.layoutMode` is `'ring' | 'helix_focus'` (names subject to implementation). Default preserves today’s behavior for non-immersive routes.

---

## 3. Motion presets (Framer / CSS)

- **Graph nodes:** Springs vs linear — tied to `useReducedMotion` where product requires (see immersive hero spec for hero-specific PRM policy).
- **Sheet:** Peek ↔ expanded height — prefer CSS `max-height` + `transition` or Framer `animate` on container; tenant may swap **duration** via CSS var, e.g. `--sheet-expand-duration`.

---

## 4. Future tenant API (non-binding)

Example shape (not implemented until product asks):

```json
{
  "graph": {
    "innerLayoutMode": "helix_focus",
    "helix": { "deltaR": 12, "angleStepDeg": 48, "axisOffsetDeg": 180 }
  }
}
```

Server delivers with theme payload; frontend maps to `options` for `getInnerRingLayout`.

---

## 5. Change log

| Date | Change |
|------|--------|
| 2026-05-18 | Initial document; helix_focus mode specified in design spec `2026-05-18-connections-immersive-helix-focus-design.md` |
