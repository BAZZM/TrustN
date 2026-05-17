> **Archived.** Specification for `DemiRadialNetwork.js`, which is **not imported** by current app routes. See [`../UI_CHANGE_GUIDANCE.md`](../UI_CHANGE_GUIDANCE.md).

# DemiRadialNetwork – Design Decisions & Specification

Semi-circular dual-ring radial interface for direct (primary) and secondary connections. Resolved design decisions and full implementation spec.

---

## Design Decisions (Resolved)

### Apex behavior
- **Selected contact snaps to apex (top center).**
- Rationale: predictable focus, less eye travel, better thumb ergonomics, intentional feel.

### Max visible primary contacts
- **Default: 6.** Range: 4–8 (configurable).
- **Scaling:** ≤6 → standard spacing; 7–8 → slightly larger radius + tighter spacing; 8 → overflow fades into blur mask to avoid crowding.

### Secondary connections display
- **Visible at once: up to 8.** If >8: radial pagination (subtle scroll) or cluster by relationship type. No dumping dozens at once.

### Secondary ring overflow
- **Cluster when large:** close/frequent → individual nodes; others → grouped cluster node with +count badge. Keeps cognitive load low.

### Information density (inner ring / info panel)
- **Show:** name, relationship tag, last interaction indicator, interaction frequency pulse.
- **Do NOT show:** timestamps or heavy data.

### Connection strength
- **Computed automatically** (not manually set). Based on: interaction frequency, recency, communication diversity. Users do not manage it.

### Accent color strategy
- **Primary accent:** muted cool blue.
- **Secondary state:** soft violet.
- **Base:** graphite / charcoal / slate.
- Rationale: professional, modern, calm, accessible contrast.

### Glow response
- Glow intensity reflects: interaction recency, activity frequency, selection focus. “Living network” feel.

### Platform target
- **Primary:** Web (React). **Architecture ready for:** React Native. Use platform-agnostic layout math.

### Low-power performance fallback
- If performance is low: disable blur backdrop, reduce glow layers, shorten animation duration, remove ripple pulses. Functionality over visuals.

---

## Component Architecture

```
DemiRadialNetwork
 ├── ArcMaskContainer (clipPath = focus window)
 │    ├── PrimaryRingSegments (Ring 1: wedge segments, full area clickable)
 │    ├── SecondaryRingSegments (Ring 2: scrollable wedge segments; click promotes to focus)
 │    └── InnerInfoRing
```

- **Primary ring:** Segmented rim (pie-slice wedges); each segment is fully clickable. Selected segment shifts to focus center; only a portion of the wheel is visible (layered effect).
- **Secondary ring:** When a primary segment is selected, the inner ring shows that contact’s connections as segments; scrollable (e.g. wheel or drag). Clicking a secondary segment promotes that contact to focus (main level) and shows them in the info ring.

---

## Geometry & Positioning

- **Arc:** 180° semi-circle; center of the circle is at (0,0); diameter is a strict horizontal line (y=0 in SVG); apex (bottom of circle in math) at 90°.
- **Alignment:** Semi-circle is rigid and centered; viewBox and `preserveAspectRatio` keep the arc aligned.
- **Mobile (≤768px):** Diameter is aligned with the **bottom edge of the screen**: the arc is flipped (`scale(1,-1)`), viewBox shows only the upper half so the diameter sits at the bottom of the SVG, and the wheel is positioned at the bottom of the radial view (column-reverse). The flat edge is invisible at the viewport edge.
- **Desktop:** Full wheel is shown centered; full viewBox 320×320; no flip.
- **Radius:** Responsive; primary radius 100 (scale to 100+ for 7–8 nodes).
- **Node spacing:** `angleStep = arcAngle / (visibleNodes - 1)` for 180°.
- **Node orientation:** Avatars remain upright; container rotates, nodes counter-rotate.

---

## Primary Ring (Direct Contacts)

- **Purpose:** Display primary (inner-circle) connections.
- **Node:** avatar, halo glow, connection strength ring.
- **States:** idle (40% glow), recent interaction (soft pulse 4–6s), selected (stronger glow, thicker halo, scale ~1.15).
- **Apex:** selected node snaps to top center.

---

## Secondary Ring (Associated Connections)

- **Trigger:** Appears when a primary node is selected.
- **Behavior:** Expands outward from selected node; aligned to arc; eases outward.
- **Node style:** 85% size of primary; lower glow; subtle link line to parent.
- **Overflow:** If >8: cluster nodes; show +count cluster; expand cluster on tap.

---

## Inner Info Ring

- Shown near apex when a node is selected.
- **Content:** name, relationship tag, interaction pulse indicator, action buttons.
- **Style:** frosted glass panel, curved, fade + slight upward drift.
- **No timestamps or heavy data.**

---

## Edge Blur & Masking

- Top and bottom gradient masks to fade nodes at edges and support dynamic scaling.

---

## Motion & Animation

- Smooth easing, inertia-driven rotation, no abrupt jumps.
- **Rotation:** drag/swipe rotates arc; inertia with friction; snap to apex on release.
- **Selection timeline:**
  - 0 ms: glow intensifies
  - 120 ms: ripple pulse
  - 180 ms: info ring fades in
  - 260 ms: secondary arc expands

---

## Visual Styling

- Arc stroke: 1–2 px; glass blur where supported; neutral grayscale base.
- **Glow:** layered (base halo, focus glow, optional pulse). Strength via halo thickness, glow intensity, pulse frequency—no numeric labels.

---

## Responsiveness & Ergonomics

- Radius from viewport; touch targets ≥ 44 px; portrait: arc top-centered; landscape: arc slightly higher. Apex within natural thumb arc.

---

## Performance

- Render only visible nodes + neighbors; virtualize off-arc; GPU transforms. **Fallback:** auto-disable heavy effects when FPS drops.

---

## Props API

```jsx
<DemiRadialNetwork
  contacts={contacts}
  visiblePrimary={6}
  maxSecondaryVisible={8}
  accentColor="coolBlue"
  onSelectContact={handleSelect}
  enableBlur={true}
  performanceMode="auto"
/>
```

---

## Data Model

```ts
type Contact = {
  id: string
  name: string
  avatar?: string
  relationship: string       // e.g. "inner" / "secondary"
  strengthScore: number      // computed
  lastInteraction: number    // timestamp or 0
  secondaryConnections: Contact[]
}
```

---

## Interaction Summary

| Action | Result |
|--------|--------|
| User rotates arc | Explore contacts |
| User taps contact | Focus + info ring; secondary arc expands |
| User taps elsewhere | Collapse to primary arc only |

**Outcome:** Calm, professional, spatially intuitive, informative without clutter, alive but not flashy, effortless on mobile.

---

## Rebuild

After editing DemiRadialNetwork or its CSS:

```bash
cd frontend && npm run build
# Or with Docker:
docker compose build frontend && docker compose up -d frontend
```

---

*Last updated: 2025-02-16*
