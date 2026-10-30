import {
  PHYSICS_DEFAULTS,
  createPhysicsState,
  pinNode,
  releaseNode,
  stepPhysics,
  wake,
} from "./graphPhysics";

const BOUNDS = 420;

const ring = (count, radius = 118, center = 210) =>
  Array.from({ length: count }, (_, i) => {
    const a = ((-90 + (360 / count) * i) * Math.PI) / 180;
    return { id: `n${i}`, x: center + radius * Math.cos(a), y: center + radius * Math.sin(a), radius: 18 };
  });

function run(state, steps, params) {
  let s = state;
  for (let i = 0; i < steps; i += 1) s = stepPhysics(s, params);
  return s;
}

const byId = (state, id) => state.nodes.find((n) => n.id === id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe("createPhysicsState", () => {
  it("starts every node at its rest position, awake, with no velocity", () => {
    const nodes = ring(4);
    const state = createPhysicsState(nodes);
    expect(state.awake).toBe(true);
    state.nodes.forEach((n, i) => {
      expect(n.x).toBeCloseTo(nodes[i].x, 6);
      expect(n.rx).toBeCloseTo(nodes[i].x, 6);
      expect(n.vx).toBe(0);
    });
  });

  it("starts nodes from a previous position when one is supplied, rest stays at the new layout", () => {
    const nodes = ring(2);
    const state = createPhysicsState(nodes, new Map([["n0", { x: 50, y: 60 }]]));
    expect(byId(state, "n0")).toMatchObject({ x: 50, y: 60 });
    expect(byId(state, "n0").rx).toBeCloseTo(nodes[0].x, 6);
  });
});

describe("stepPhysics", () => {
  it("a layout with no overlaps is already at rest and goes to sleep without moving", () => {
    const nodes = ring(6);
    const settled = run(createPhysicsState(nodes), 120);
    expect(settled.awake).toBe(false);
    settled.nodes.forEach((n, i) => {
      expect(Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y)).toBeLessThan(0.5);
    });
  });

  it("pulls a displaced node back to its rest position and sleeps", () => {
    const nodes = ring(4);
    let s = createPhysicsState(nodes, new Map([["n0", { x: nodes[0].x + 60, y: nodes[0].y + 40 }]]));
    s = run(s, 600);
    expect(s.awake).toBe(false);
    expect(Math.hypot(byId(s, "n0").x - nodes[0].x, byId(s, "n0").y - nodes[0].y)).toBeLessThan(1);
  });

  it("separates overlapping nodes so no pair is closer than the sum of radii", () => {
    // Two rests that overlap on purpose, plus a third to the side.
    const nodes = [
      { id: "a", x: 200, y: 210, radius: 20 },
      { id: "b", x: 212, y: 210, radius: 20 },
      { id: "c", x: 300, y: 210, radius: 20 },
    ];
    const s = run(createPhysicsState(nodes), 400);
    const min = 20 + 20;
    expect(dist(byId(s, "a"), byId(s, "b"))).toBeGreaterThanOrEqual(min - 1);
    expect(dist(byId(s, "a"), byId(s, "c"))).toBeGreaterThanOrEqual(min - 1);
    expect(dist(byId(s, "b"), byId(s, "c"))).toBeGreaterThanOrEqual(min - 1);
  });

  it("keeps every node inside the bounds", () => {
    const nodes = ring(8, 205);
    let s = createPhysicsState(nodes, new Map(nodes.map((n) => [n.id, { x: n.x * 2, y: n.y * 2 }])));
    s = run(s, 300);
    s.nodes.forEach((n) => {
      expect(n.x).toBeGreaterThanOrEqual(n.radius);
      expect(n.x).toBeLessThanOrEqual(BOUNDS - n.radius);
      expect(n.y).toBeGreaterThanOrEqual(n.radius);
      expect(n.y).toBeLessThanOrEqual(BOUNDS - n.radius);
    });
  });

  it("never moves fixed nodes, but still pushes others away from them", () => {
    const nodes = [
      { id: "hub", x: 210, y: 210, radius: 34, fixed: true },
      { id: "n", x: 215, y: 210, radius: 18 },
    ];
    const s = run(createPhysicsState(nodes), 300);
    expect(byId(s, "hub")).toMatchObject({ x: 210, y: 210 });
    expect(dist(byId(s, "hub"), byId(s, "n"))).toBeGreaterThanOrEqual(34 + 18 - 1);
  });

  it("is deterministic: the same input gives the same output", () => {
    const nodes = ring(7, 60);
    const a = run(createPhysicsState(nodes), 150);
    const b = run(createPhysicsState(nodes), 150);
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
  });

  it("does not mutate the state it was given", () => {
    const state = createPhysicsState(ring(3));
    const snapshot = JSON.stringify(state);
    stepPhysics(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("an asleep state is a fixed point until woken", () => {
    const settled = run(createPhysicsState(ring(4)), 200);
    expect(settled.awake).toBe(false);
    expect(stepPhysics(settled)).toBe(settled);
    expect(wake(settled).awake).toBe(true);
  });
});

describe("pinning and dragging", () => {
  it("a pinned node stays where it is put while neighbours part around it", () => {
    const nodes = ring(6);
    let s = createPhysicsState(nodes);
    const target = { x: nodes[1].x, y: nodes[1].y };
    s = pinNode(s, "n0", target.x, target.y); // drag n0 onto n1
    s = run(s, 300);
    expect(byId(s, "n0")).toMatchObject({ x: target.x, y: target.y });
    expect(dist(byId(s, "n0"), byId(s, "n1"))).toBeGreaterThanOrEqual(18 + 18 - 1);
    expect(s.awake).toBe(true); // stays awake while something is pinned
  });

  it("releasing makes the dropped spot the node's new rest and lets the system settle", () => {
    let s = createPhysicsState(ring(5));
    s = pinNode(s, "n2", 100, 100);
    s = run(s, 20);
    s = releaseNode(s, "n2");
    expect(byId(s, "n2")).toMatchObject({ rx: 100, ry: 100, pinned: false });
    s = run(s, 600);
    expect(s.awake).toBe(false);
    expect(dist(byId(s, "n2"), { x: 100, y: 100 })).toBeLessThan(2);
  });

  it("pinning clamps the node inside the bounds", () => {
    const s = pinNode(createPhysicsState(ring(3)), "n0", -50, 999);
    const n = byId(s, "n0");
    expect(n.x).toBeGreaterThanOrEqual(n.radius);
    expect(n.y).toBeLessThanOrEqual(BOUNDS - n.radius);
  });

  it("ignores unknown ids", () => {
    const s = createPhysicsState(ring(2));
    expect(pinNode(s, "nope", 1, 1).nodes).toEqual(s.nodes);
    expect(releaseNode(s, "nope").nodes).toEqual(s.nodes);
  });
});

describe("PHYSICS_DEFAULTS", () => {
  it("exposes tunables with sane values", () => {
    expect(PHYSICS_DEFAULTS.kRest).toBeGreaterThan(0);
    expect(PHYSICS_DEFAULTS.damping).toBeGreaterThan(0);
    expect(PHYSICS_DEFAULTS.damping).toBeLessThan(1);
  });
});
