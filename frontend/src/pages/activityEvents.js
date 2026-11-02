const MAX_EVENTS = 8;

export function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildRequestText(request, currentUserId, t) {
  const isOutbound = String(request.requester_id) === String(currentUserId);
  const isSecondary = request.circle_type === "secondary" && request.intermediary_id;

  if (isOutbound) {
    return isSecondary
      ? t("activity.sentSecondary")
          .replace("{target}", request.target_name || "—")
          .replace("{intermediary}", request.intermediary_name || "—")
      : t("activity.sentInner").replace("{target}", request.target_name || "—");
  }

  if (isSecondary && String(request.intermediary_id) === String(currentUserId)) {
    return t("activity.needsVouch")
      .replace("{requester}", request.requester_name || "—")
      .replace("{target}", request.target_name || "—");
  }

  return t("activity.needsResponse").replace("{requester}", request.requester_name || "—");
}

const timeOf = (value) => {
  const ms = new Date(value || 0).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * The activity timeline: the newest requests plus the dashboard snapshot, merged and sorted
 * newest first (the snapshot is usually the newest item, so it must be sorted in, not appended).
 */
export function buildActivityEvents({ inbox = [], sent = [], dashboard = null, currentUserId, t }) {
  const inboxIds = new Set(inbox.map((r) => r.id));
  const events = [...inbox, ...sent].map((request) => ({
    id: `request-${request.id}`,
    type: inboxIds.has(request.id) ? "attention" : "sent",
    text: buildRequestText(request, currentUserId, t),
    at: timeOf(request.created_at),
    time: formatTime(request.created_at),
    href: "/connections",
  }));

  if (dashboard) {
    events.push({
      id: "snapshot",
      type: "system",
      text: t("activity.snapshot")
        .replace("{inner}", String(dashboard.kpis?.inner?.total ?? 0))
        .replace("{secondary}", String(dashboard.kpis?.secondary?.total ?? 0)),
      at: timeOf(dashboard.computed_at),
      time: formatTime(dashboard.computed_at),
      href: "/",
    });
  }

  return events.sort((a, b) => b.at - a.at).slice(0, MAX_EVENTS);
}
