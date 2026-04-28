/**
 * Platform-agnostic graph model for Trust Network connections.
 * Pure functions only (no React). Use from web SVG, React Native SVG, or tests.
 *
 * Product defaults (change only with stakeholder sign-off):
 * - MAX_VISIBLE_INNER: top N inner-circle nodes on the first ring, sorted by strength/recency.
 * - Unfocused inners: faded (not removed) in focus mode.
 * - Node identity: peer_id via normalizeGraphNode.
 * - On mobile, pair this module with a native/ WebView shell; this file stays unchanged.
 */
export const GRAPH_VIEWBOX = 420;
export const GRAPH_CENTER = GRAPH_VIEWBOX / 2;
export const INNER_RING_RADIUS = 118;
export const SECONDARY_RING_RADIUS = 174;
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

export function getInnerRingLayout(nodes, focusUserId) {
  const total = nodes.length;

  if (total === 0) {
    return [];
  }

  const baseStep = 360 / total;
  const baseAngles = nodes.map((_, index) => -90 + index * baseStep);
  const focusIndex = focusUserId ? nodes.findIndex((node) => node.id === focusUserId) : -1;
  const rotation = focusIndex >= 0 ? -90 - baseAngles[focusIndex] : 0;

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

export function getSecondaryRingLayout(nodes) {
  const total = nodes.length;

  if (total === 0) {
    return [];
  }

  const startAngle = -160;
  const endAngle = -20;
  const step = total === 1 ? 0 : (endAngle - startAngle) / (total - 1);

  return nodes.map((node, index) => {
    const angle = total === 1 ? -90 : startAngle + step * index;
    const point = polarToCartesian(GRAPH_CENTER, GRAPH_CENTER, SECONDARY_RING_RADIUS, angle);
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
