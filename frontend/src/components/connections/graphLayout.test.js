import {
  GRAPH_CENTER,
  GRAPH_VIEWBOX,
  HELIX_ANGLE_STEP_DEG,
  HELIX_DELTA_R,
  HELIX_R_MIN,
  INNER_RING_RADIUS,
  SECONDARY_RING_RADIUS,
  SECONDARY_RING_RADIUS_FOCUSED,
  getInnerRingLayout,
  getSecondaryRingLayout,
  pickFocusPresentationAngle,
} from "./graphLayout";

const innerFixture = [
  { id: "a", name: "Alice", strength: 5 },
  { id: "b", name: "Bob", strength: 4 },
  { id: "c", name: "Carol", strength: 3 },
  { id: "d", name: "Dave", strength: 2 },
];

describe("pickFocusPresentationAngle", () => {
  it("returns -90 when no focus id is provided", () => {
    expect(pickFocusPresentationAngle(innerFixture, null)).toBe(-90);
  });

  it("returns -90 when only one inner node exists", () => {
    expect(pickFocusPresentationAngle([innerFixture[0]], "a")).toBe(-90);
  });

  it("is deterministic for the same input", () => {
    const first = pickFocusPresentationAngle(innerFixture, "b");
    const second = pickFocusPresentationAngle(innerFixture, "b");
    expect(first).toBe(second);
  });

  it("prefers an angle whose rotated neighbours are farther away", () => {
    const angle = pickFocusPresentationAngle(innerFixture, "c");
    expect([-135, -120, -90, -60, -45, 0, 180]).toContain(angle);
  });

  it("prefers an upper-hemisphere angle on ties", () => {
    const angle = pickFocusPresentationAngle(
      [
        { id: "a", name: "Alice", strength: 1 },
        { id: "b", name: "Bob", strength: 1 },
      ],
      "b"
    );
    expect(Math.sin((angle * Math.PI) / 180)).toBeLessThan(0);
  });
});

describe("getInnerRingLayout with focus angle", () => {
  it("places the focused node on the picked presentation angle", () => {
    const layout = getInnerRingLayout(innerFixture, "c");
    const focused = layout.find((node) => node.isFocused);
    const expectedAngle = pickFocusPresentationAngle(innerFixture, "c");
    expect(focused.angle).toBeCloseTo(expectedAngle, 5);
  });
});

describe("getSecondaryRingLayout with focus fan", () => {
  const secondaries = [
    { id: "s1", name: "S1", strength: 1 },
    { id: "s2", name: "S2", strength: 1 },
    { id: "s3", name: "S3", strength: 1 },
  ];

  it("uses the default ring radius and the default spread when no focus angle is passed", () => {
    const layout = getSecondaryRingLayout(secondaries);
    layout.forEach((node) => {
      const dx = node.x - GRAPH_CENTER;
      const dy = node.y - GRAPH_CENTER;
      expect(Math.hypot(dx, dy)).toBeCloseTo(SECONDARY_RING_RADIUS, 5);
    });
    expect(layout[0].angle).toBe(-160);
    expect(layout[layout.length - 1].angle).toBe(-20);
  });

  it("uses the focused ring radius and centers the fan on the focus angle", () => {
    const focusAngle = -90;
    const layout = getSecondaryRingLayout(secondaries, focusAngle);
    layout.forEach((node) => {
      const dx = node.x - GRAPH_CENTER;
      const dy = node.y - GRAPH_CENTER;
      expect(Math.hypot(dx, dy)).toBeCloseTo(SECONDARY_RING_RADIUS_FOCUSED, 5);
    });
    const spread = layout[layout.length - 1].angle - layout[0].angle;
    expect(spread).toBeGreaterThan(0);
    expect(spread).toBeLessThanOrEqual(140);
    const center = (layout[0].angle + layout[layout.length - 1].angle) / 2;
    expect(center).toBeCloseTo(focusAngle, 5);
  });

  it("places a single secondary directly outward along the focus angle", () => {
    const layout = getSecondaryRingLayout([secondaries[0]], 0);
    expect(layout[0].angle).toBe(0);
    expect(layout[0].x).toBeCloseTo(GRAPH_CENTER + SECONDARY_RING_RADIUS_FOCUSED, 5);
    expect(layout[0].y).toBeCloseTo(GRAPH_CENTER, 5);
  });
});

describe("getInnerRingLayout with layoutMode helix_focus", () => {
  const nodes = [
    { id: "a", name: "Alice", strength: 5 },
    { id: "b", name: "Bob", strength: 4 },
    { id: "c", name: "Carol", strength: 3 },
    { id: "d", name: "Dave", strength: 2 },
  ];

  it("keeps the focused node on INNER_RING_RADIUS", () => {
    const layout = getInnerRingLayout(nodes, "b", { layoutMode: "helix_focus" });
    const focused = layout.find((n) => n.isFocused);
    const dx = focused.x - GRAPH_CENTER;
    const dy = focused.y - GRAPH_CENTER;
    expect(Math.hypot(dx, dy)).toBeCloseTo(INNER_RING_RADIUS, 5);
  });

  it("places non-focused nodes inside INNER_RING_RADIUS on a coil", () => {
    const layout = getInnerRingLayout(nodes, "b", { layoutMode: "helix_focus" });
    const others = layout.filter((n) => !n.isFocused);
    expect(others.length).toBe(nodes.length - 1);
    others.forEach((n) => {
      const r = Math.hypot(n.x - GRAPH_CENTER, n.y - GRAPH_CENTER);
      expect(r).toBeGreaterThanOrEqual(HELIX_R_MIN - 0.01);
      expect(r).toBeLessThan(INNER_RING_RADIUS);
    });
  });

  it("uses Δr per turn (radii grow monotonically with turn index)", () => {
    const layout = getInnerRingLayout(nodes, "b", { layoutMode: "helix_focus" });
    const others = layout
      .filter((n) => !n.isFocused)
      .slice()
      .sort((a, b) => a.turnIndex - b.turnIndex);
    for (let i = 1; i < others.length; i += 1) {
      const r0 = Math.hypot(others[i - 1].x - GRAPH_CENTER, others[i - 1].y - GRAPH_CENTER);
      const r1 = Math.hypot(others[i].x - GRAPH_CENTER, others[i].y - GRAPH_CENTER);
      expect(r1 - r0).toBeCloseTo(HELIX_DELTA_R, 5);
    }
  });

  it("stays inside viewBox with margin", () => {
    const layout = getInnerRingLayout(nodes, "b", { layoutMode: "helix_focus" });
    layout.forEach((n) => {
      expect(n.x).toBeGreaterThan(8);
      expect(n.x).toBeLessThan(GRAPH_VIEWBOX - 8);
      expect(n.y).toBeGreaterThan(8);
      expect(n.y).toBeLessThan(GRAPH_VIEWBOX - 8);
    });
  });

  it("is deterministic", () => {
    const a = getInnerRingLayout(nodes, "c", { layoutMode: "helix_focus" });
    const b = getInnerRingLayout(nodes, "c", { layoutMode: "helix_focus" });
    expect(a).toEqual(b);
  });

  it("ignores layoutMode when focusUserId is null (returns plain ring)", () => {
    const layout = getInnerRingLayout(nodes, null, { layoutMode: "helix_focus" });
    layout.forEach((n) => {
      const r = Math.hypot(n.x - GRAPH_CENTER, n.y - GRAPH_CENTER);
      expect(r).toBeCloseTo(INNER_RING_RADIUS, 5);
    });
  });
});
