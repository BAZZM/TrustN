/**
 * Platform-agnostic graph model for Intro connections.
 * Pure functions only (no React). Use from web SVG, React Native SVG, or tests.
 *
 * Product defaults (change only with stakeholder sign-off):
 * - MAX_VISIBLE_INNER: top N inner-circle nodes on the first ring, sorted by strength/recency.
 * - Unfocused inners: faded (not removed) in focus mode.
 * - Node identity: peer_id via normalizeGraphNode.
 * - SVG paint order & hit-testing: secondary branch bodies and quick-add chips are drawn before inner-ring nodes so faded inners stay clickable where geometry overlaps; “+N more” chip is painted above but uses pointer-events:none (ConnectionsGraph + Connections.css). Stage-level “reset focus” ignores taps that originate on interactive nodes (see ConnectionsGraph.js).
 * - `focus_hub` (immersive + focus): focused inner at viewBox center; other inners helix outward; use `getCurrentUserFocusHubLayout` for the current user on the ring.
 * - On mobile, pair this module with a native/ WebView shell; this file stays unchanged.
 */
export const GRAPH_VIEWBOX = 420;
export const GRAPH_CENTER = GRAPH_VIEWBOX / 2;
export const INNER_RING_RADIUS = 118;
export const SECONDARY_RING_RADIUS = 174;
export const SECONDARY_RING_RADIUS_FOCUSED = 210;
export const FOCUS_FAN_DEGREES = 110;
export const HELIX_R_MIN = 56;
export const HELIX_DELTA_R = 10;
export const HELIX_ANGLE_STEP_DEG = 52;
export const MAX_VISIBLE_INNER = 8;
export const MAX_VISIBLE_SECONDARY = 8;
/** Extra radius beyond node core for touch / accessibility hit target (user units, matches SVG viewBox scale). */
export const NODE_HIT_PADDING = 14;

function toTimestamp(value) {
  if (!value) return 0;
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function normalizeGraphNode(item, fallbackCircleType = "secondary") {
  const id = item?.peer_id ?? item?.user_id ?? item?.id;

  if (id == null) {
    return null;
  }

  const strengthValue = Number(item?.strength);
  const strength = Number.isFinite(strengthValue) ? strengthValue : 0;
  const circleType = item?.circle_type === "inner" ? "inner" : fallbackCircleType;
  const peerIntroduced = Boolean(
    item?.peer_introduced ?? item?.introduced_via_request_id ?? item?.raw?.peer_introduced
  );

  return {
    id: String(id),
    rawId: id,
    name:
      item?.peer_name ??
      item?.user_name ??
      item?.contact_name ??
      item?.name ??
      item?.peer_phone ??
      item?.phone ??
      "Unknown",
    phone: item?.peer_phone ?? item?.phone ?? "",
    jobRole: item?.peer_job_role ?? item?.job_role ?? "",
    industry: item?.peer_industry ?? item?.industry ?? "",
    experience: item?.peer_experience ?? item?.experience ?? "",
    strength,
    circleType,
    peerIntroduced,
    createdAt: item?.created_at ?? null,
    createdAtMs: toTimestamp(item?.created_at),
    raw: item,
  };
}

export function sortConnectionsByPriority(connections) {
  return [...connections].sort((left, right) => {
    if (right.strength !== left.strength) {
      return right.strength - left.strength;
    }

    if (right.createdAtMs !== left.createdAtMs) {
      return right.createdAtMs - left.createdAtMs;
    }

    const leftName = (left.name || "").toLowerCase();
    const rightName = (right.name || "").toLowerCase();

    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

export function polarToCartesian(centerX, centerY, radius, angleDeg) {
  const radians = (angleDeg * Math.PI) / 180;

  return {
    x: centerX + Math.cos(radians) * radius,
    y: centerY + Math.sin(radians) * radius,
  };
}

const FOCUS_PRESENTATION_CANDIDATES = [-90, -60, -120, -45, -135, 0, 180];

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function angularDistance(a, b) {
  const diff = ((normalizeAngle(a) - normalizeAngle(b) + 540) % 360) - 180;
  return Math.abs(diff);
}

export function pickFocusPresentationAngle(nodes, focusUserId) {
  if (!focusUserId || !Array.isArray(nodes) || nodes.length <= 1) {
    return -90;
  }

  const total = nodes.length;
  const baseStep = 360 / total;
  const baseAngles = nodes.map((_, index) => -90 + index * baseStep);
  const focusIndex = nodes.findIndex((node) => node.id === focusUserId);

  if (focusIndex < 0) return -90;

  const otherAngles = baseAngles.filter((_, index) => index !== focusIndex);

  let best = { angle: -90, score: -Infinity, upper: false };

  FOCUS_PRESENTATION_CANDIDATES.forEach((candidate) => {
    const rotation = candidate - baseAngles[focusIndex];
    const rotatedOthers = otherAngles.map((angle) => angle + rotation);
    const minDistance = rotatedOthers.reduce(
      (acc, angle) => Math.min(acc, angularDistance(angle, candidate)),
      Infinity
    );
    const upper = Math.sin((candidate * Math.PI) / 180) < 0;
    const isBetterScore = minDistance > best.score + 1e-6;
    const isTieAndUpper =
      Math.abs(minDistance - best.score) <= 1e-6 && upper && !best.upper;

    if (isBetterScore || isTieAndUpper) {
      best = { angle: candidate, score: minDistance, upper };
    }
  });

  return best.angle;
}

/**
 * When an inner peer is the geometric hub (`focus_hub`), place the current user on the inner ring,
 * opposite the hub's presentation angle, so "You" stays readable and testably off-center.
 */
export function getCurrentUserFocusHubLayout(innerConnections, focusUserId) {
  if (!focusUserId || !Array.isArray(innerConnections) || innerConnections.length === 0) {
    return null;
  }
  const focusIndex = innerConnections.findIndex((node) => node.id === focusUserId);
  if (focusIndex < 0) {
    return null;
  }
  const presentationAngle = pickFocusPresentationAngle(innerConnections, focusUserId);
  const youAngle = presentationAngle + 180;
  const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, INNER_RING_RADIUS, youAngle);
  return {
    angle: youAngle,
    x: point.x,
    y: point.y,
    opacity: 1,
    scale: 0.9,
    radius: 20,
    isFocused: false,
  };
}

export function getInnerRingLayout(nodes, focusUserId, options = {}) {
  const total = nodes.length;

  if (total === 0) {
    return [];
  }

  const baseStep = 360 / total;
  const baseAngles = nodes.map((_, index) => -90 + index * baseStep);
  const focusIndex = focusUserId ? nodes.findIndex((node) => node.id === focusUserId) : -1;
  const presentationAngle =
    focusIndex >= 0 ? pickFocusPresentationAngle(nodes, focusUserId) : -90;
  const rotation = focusIndex >= 0 ? presentationAngle - baseAngles[focusIndex] : 0;

  if (focusIndex >= 0 && options.layoutMode === "focus_hub") {
    const helixAxis = presentationAngle + 180;
    let turnIndex = 0;
    return nodes.map((node) => {
      const isFocused = node.id === focusUserId;
      if (isFocused) {
        return {
          ...node,
          angle: presentationAngle,
          x: GRAPH_CENTER,
          y: GRAPH_CENTER,
          isFocused: true,
          opacity: 1,
          scale: 1.18,
          radius: 24,
          turnIndex: -1,
        };
      }
      const k = turnIndex;
      turnIndex += 1;
      const angle = helixAxis + k * HELIX_ANGLE_STEP_DEG;
      const r = HELIX_R_MIN + k * HELIX_DELTA_R;
      const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, r, angle);
      return {
        ...node,
        angle,
        x: point.x,
        y: point.y,
        isFocused: false,
        opacity: 0.22,
        scale: 0.7,
        radius: 14,
        turnIndex: k,
      };
    });
  }

  if (focusIndex >= 0 && options.layoutMode === "helix_focus") {
    const helixAxis = presentationAngle + 180;
    let turnIndex = 0;
    return nodes.map((node) => {
      const isFocused = node.id === focusUserId;
      if (isFocused) {
        const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, INNER_RING_RADIUS, presentationAngle);
        return {
          ...node,
          angle: presentationAngle,
          x: point.x,
          y: point.y,
          isFocused: true,
          opacity: 1,
          scale: 1.18,
          radius: 24,
          turnIndex: -1,
        };
      }
      const k = turnIndex;
      turnIndex += 1;
      const angle = helixAxis + k * HELIX_ANGLE_STEP_DEG;
      const r = HELIX_R_MIN + k * HELIX_DELTA_R;
      const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, r, angle);
      return {
        ...node,
        angle,
        x: point.x,
        y: point.y,
        isFocused: false,
        opacity: 0.22,
        scale: 0.7,
        radius: 14,
        turnIndex: k,
      };
    });
  }

  return nodes.map((node, index) => {
    const angle = baseAngles[index] + rotation;
    const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, INNER_RING_RADIUS, angle);
    const isFocused = node.id === focusUserId;
    const nodeStrength = Math.max(0, Number(node.strength) || 0);

    return {
      ...node,
      angle,
      x: point.x,
      y: point.y,
      isFocused,
      opacity: focusUserId ? (isFocused ? 1 : 0.16) : 1,
      scale: focusUserId ? (isFocused ? 1.18 : 0.84) : 0.92 + Math.min(nodeStrength, 4) * 0.05,
      radius: focusUserId
        ? isFocused
          ? 24
          : 18
        : 18 + Math.min(nodeStrength, 4) * 1.5,
    };
  });
}

export function getSecondaryRingLayout(nodes, focusAngle = null) {
  const total = nodes.length;

  if (total === 0) {
    return [];
  }

  const useFocusFan = typeof focusAngle === "number" && Number.isFinite(focusAngle);
  const radius = useFocusFan ? SECONDARY_RING_RADIUS_FOCUSED : SECONDARY_RING_RADIUS;

  let startAngle;
  let endAngle;

  if (useFocusFan) {
    startAngle = focusAngle - FOCUS_FAN_DEGREES / 2;
    endAngle = focusAngle + FOCUS_FAN_DEGREES / 2;
  } else {
    startAngle = -160;
    endAngle = -20;
  }

  const step = total === 1 ? 0 : (endAngle - startAngle) / (total - 1);

  return nodes.map((node, index) => {
    let angle;
    if (total === 1) {
      angle = useFocusFan ? focusAngle : -90;
    } else {
      angle = startAngle + step * index;
    }

    const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, radius, angle);
    const nodeStrength = Math.max(0, Number(node.strength) || 0);

    return {
      ...node,
      angle,
      x: point.x,
      y: point.y,
      scale: 0.9 + Math.min(nodeStrength, 4) * 0.04,
      radius: 14 + Math.min(nodeStrength, 4) * 1.2,
    };
  });
}

export function getNodeInitials(name) {
  const cleaned = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return cleaned || "?";
}

export function truncateLabel(value, maxLength = 16) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}
