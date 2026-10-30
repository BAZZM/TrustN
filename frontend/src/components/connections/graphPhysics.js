/**
 * Tiny deterministic physics for the free-form graph layout (viewBox units, no dependencies).
 *
 * `graphLayout.js` stays the source of truth: every node has a *rest* position from it, and this
 * module only moves nodes around that rest position. Turning the free layout off therefore restores
 * today's layout exactly.
 *
 * Forces: a spring to the rest position, a soft push when nodes get close, a hard projection so
 * discs never overlap, bounds, and damping. A dragged node is pinned; releasing it makes the drop
 * point its new rest. When nothing is moving the state goes to sleep and `stepPhysics` becomes a
 * no-op so callers can stop their animation loop.
 *
 * All functions are pure: they return new state and never mutate their input.
 */

export const PHYSICS_DEFAULTS = {
  kRest: 0.06, // spring pull toward the rest position
  kSoft: 0.12, // soft push while within `gap` of touching
  gap: 8, // preferred clear space between discs
  damping: 0.82,
  bounds: 420, // square viewBox
  margin: 4, // keep this far from the edge
  calmSpeed: 0.02, // below this for `calmSteps` steps the system sleeps
  calmSteps: 8,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampToBounds(node, params) {
  const lo = node.radius + params.margin;
  const hi = params.bounds - node.radius - params.margin;
  return { x: clamp(node.x, lo, hi), y: clamp(node.y, lo, hi) };
}

/**
 * @param nodes [{ id, x, y, radius, fixed? }] rest layout
 * @param previous optional Map<id, {x, y}>: start from these positions (so a changed layout glides)
 */
export function createPhysicsState(nodes, previous) {
  return {
    awake: true,
    calm: 0,
    nodes: nodes.map((n) => {
      const start = previous && previous.get(n.id);
      return {
        id: n.id,
        x: start ? start.x : n.x,
        y: start ? start.y : n.y,
        vx: 0,
        vy: 0,
        rx: n.x,
        ry: n.y,
        radius: n.radius,
        fixed: Boolean(n.fixed),
        pinned: false,
      };
    }),
  };
}

export function wake(state) {
  return { ...state, awake: true, calm: 0 };
}

export function pinNode(state, id, x, y, params = PHYSICS_DEFAULTS) {
  if (!state.nodes.some((n) => n.id === id)) return state;
  return {
    ...wake(state),
    nodes: state.nodes.map((n) => {
      if (n.id !== id) return n;
      const placed = clampToBounds({ ...n, x, y }, params);
      return { ...n, x: placed.x, y: placed.y, vx: 0, vy: 0, pinned: true };
    }),
  };
}

export function releaseNode(state, id) {
  if (!state.nodes.some((n) => n.id === id)) return state;
  return {
    ...wake(state),
    nodes: state.nodes.map((n) => (n.id === id ? { ...n, pinned: false, rx: n.x, ry: n.y } : n)),
  };
}

const immovable = (n) => n.fixed || n.pinned;

/** Unit vector from b to a; deterministic fallback when they coincide. */
function direction(a, b, indexA, indexB) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d > 1e-6) return { ux: dx / d, uy: dy / d, d };
  return { ux: indexA > indexB ? 1 : -1, uy: 0, d: 0 };
}

export function stepPhysics(state, params = PHYSICS_DEFAULTS) {
  if (!state.awake) return state;

  const nodes = state.nodes.map((n) => ({ ...n }));
  const count = nodes.length;
  const fx = new Array(count).fill(0);
  const fy = new Array(count).fill(0);

  for (let i = 0; i < count; i += 1) {
    const a = nodes[i];
    if (!immovable(a)) {
      fx[i] += (a.rx - a.x) * params.kRest;
      fy[i] += (a.ry - a.y) * params.kRest;
    }
    for (let j = i + 1; j < count; j += 1) {
      const b = nodes[j];
      const { ux, uy, d } = direction(a, b, i, j);
      const soft = a.radius + b.radius + params.gap;
      if (d < soft) {
        const push = (soft - d) * params.kSoft;
        const aFree = !immovable(a);
        const bFree = !immovable(b);
        // A partner that cannot move hands its share to the one that can.
        const shareA = aFree ? (bFree ? 1 : 2) : 0;
        const shareB = bFree ? (aFree ? 1 : 2) : 0;
        fx[i] += ux * push * shareA;
        fy[i] += uy * push * shareA;
        fx[j] -= ux * push * shareB;
        fy[j] -= uy * push * shareB;
      }
    }
  }

  let maxSpeed = 0;
  for (let i = 0; i < count; i += 1) {
    const n = nodes[i];
    if (immovable(n)) continue;
    n.vx = (n.vx + fx[i]) * params.damping;
    n.vy = (n.vy + fy[i]) * params.damping;
    n.x += n.vx;
    n.y += n.vy;
    maxSpeed = Math.max(maxSpeed, Math.hypot(n.vx, n.vy));
  }

  // Hard constraint: discs never overlap, whatever the forces did.
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const min = a.radius + b.radius;
        const { ux, uy, d } = direction(a, b, i, j);
        if (d >= min) continue;
        const overlap = min - d;
        const aFree = !immovable(a);
        const bFree = !immovable(b);
        if (aFree && bFree) {
          a.x += (ux * overlap) / 2;
          a.y += (uy * overlap) / 2;
          b.x -= (ux * overlap) / 2;
          b.y -= (uy * overlap) / 2;
        } else if (aFree) {
          a.x += ux * overlap;
          a.y += uy * overlap;
        } else if (bFree) {
          b.x -= ux * overlap;
          b.y -= uy * overlap;
        }
      }
    }
    for (const n of nodes) {
      if (immovable(n)) continue;
      const placed = clampToBounds(n, params);
      n.x = placed.x;
      n.y = placed.y;
    }
  }

  const anyPinned = nodes.some((n) => n.pinned);
  const calm = !anyPinned && maxSpeed < params.calmSpeed ? state.calm + 1 : 0;
  if (calm >= params.calmSteps) {
    return {
      awake: false,
      calm,
      nodes: nodes.map((n) => ({ ...n, vx: 0, vy: 0 })),
    };
  }
  return { awake: true, calm, nodes };
}
