import {
  GRAPH_CENTER,
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
