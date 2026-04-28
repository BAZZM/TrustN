# Radial Contact UI – Design & Implementation

The Contacts page **radial view** uses **DemiRadialNetwork**: a semi-circular dual-ring interface with apex at top, primary (inner) and secondary connections, and an inner info ring. Full design decisions and behavior are in **`docs/DEMI_RADIAL_SPEC.md`**.

---

## Overview

| Mode    | Description |
|--------|-------------|
| **Grid**  | Card grid of all contacts (default). |
| **List**  | Compact single-column list of contacts. |
| **Radial**| **DemiRadialNetwork**: 180° arc, apex at top, 4–8 primary nodes (default 6), up to 8 secondary when a primary is selected, frosted info ring, prospective chips. |

---

## Current Architecture

### DemiRadialNetwork (`frontend/src/components/DemiRadialNetwork.js`)

- **Primary arc (ring 1):** Inner-circle connections on a 180° semi-circle; selected node snaps to apex (top center). Visible count 4–8 (configurable; default 6). Scaling for 7–8; edge blur mask at 8.
- **Secondary arc (ring 2):** Appears when a primary node is selected; up to 8 nodes; overflow shown as a +count cluster. Subtle link lines to parent.
- **InnerInfoRing:** Near apex when a node is selected. Shows name, relationship tag, interaction pulse (no timestamps). Actions: Add to circle (prospective), Close.
- **Connection strength:** Computed from circle type, API `strength`, and recency (no manual setting). Shown via halo thickness and glow, not numbers.
- **Visuals:** Muted cool blue primary, soft violet secondary, graphite/slate base. Glow reflects recency and selection. Optional blur; low-performance mode reduces effects.
- **Props:** `visiblePrimary`, `maxSecondaryVisible`, `innerConnections`, `secondaryConnections`, `prospectiveContacts`, `onSelectContact`, `onAddToSecondary`, `enableBlur`, `performanceMode`, `accentColor`, `theme`.

### Contacts page

- Fetches **contacts** and **connections**; derives `innerConnections`, `secondaryConnections`, `prospectiveContacts`.
- Search filters all three lists before passing to DemiRadialNetwork.
- Radial state: `radialSelected`, `radialSearch`. Selection is handled inside DemiRadialNetwork; “Add to circle” calls `openAddToSecondary` for the intermediary modal.

### Legacy components (optional)

- **RadialContactWheel**, **RadialContactDetail**, **RadialContactActions** remain in the repo for reference or fallback but are not used when the radial view is DemiRadialNetwork.

---

## Data & Behavior

- **Strength score:** Computed in `DemiRadialNetwork` from `circle_type`, `strength`, and `created_at` (see `computeStrengthScore`).
- **Rotation:** Drag to rotate; selection snaps so the chosen node is at apex. Spring-based rotation.
- **Performance:** `performanceMode="auto"` (or `"low"`) disables blur, reduces glow, shortens animations when needed.

---

## Files

| File | Purpose |
|------|--------|
| `frontend/src/components/DemiRadialNetwork.js` | Semi-circular arc, primary/secondary rings, InnerInfoRing, prospective strip. |
| `frontend/src/components/DemiRadialNetwork.css` | Styles for nodes, info ring, chips, buttons. |
| `frontend/src/pages/Contacts.js` | View mode, data fetch, search filter, DemiRadialNetwork integration. |
| `docs/DEMI_RADIAL_SPEC.md` | Full design decisions, geometry, motion, props API, data model. |

---

## Rebuild

After changing DemiRadialNetwork or its CSS:

```bash
# From project root
cd frontend && npm run build
# Or with Docker
docker compose build frontend
docker compose up -d frontend
```

---

*Last updated: 2025-02-16*
