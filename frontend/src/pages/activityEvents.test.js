import { buildActivityEvents } from "./activityEvents";

const t = (key) =>
  ({
    "activity.sentSecondary": "You asked to meet {target} via {intermediary}",
    "activity.sentInner": "You asked to connect with {target}",
    "activity.needsVouch": "{requester} asked you to vouch for an intro to {target}",
    "activity.needsResponse": "{requester} wants to connect with you",
    "activity.snapshot": "Network snapshot: {inner} inner, {secondary} secondary",
  })[key] || key;

const request = (id, createdAt, over) => ({
  id,
  requester_id: 1,
  circle_type: "secondary",
  intermediary_id: 3,
  intermediary_name: "Charlie Chen",
  target_name: `Person ${id}`,
  created_at: createdAt,
  ...over,
});

describe("buildActivityEvents", () => {
  it("sorts the dashboard snapshot in by time instead of always appending it", () => {
    const events = buildActivityEvents({
      sent: [request(1, "2026-11-02T17:30:00Z"), request(2, "2026-05-17T23:24:00Z")],
      dashboard: { computed_at: "2026-11-02T18:09:00Z", kpis: { inner: { total: 8 }, secondary: { total: 32 } } },
      currentUserId: 1,
      t,
    });
    expect(events.map((e) => e.id)).toEqual(["snapshot", "request-1", "request-2"]);
    expect(events[0].text).toBe("Network snapshot: 8 inner, 32 secondary");
  });

  it("marks inbox items as needing attention and words them for the current user", () => {
    const events = buildActivityEvents({
      inbox: [request(5, "2026-11-01T10:00:00Z", { requester_id: 9, requester_name: "Dana Day", intermediary_id: 1 })],
      sent: [request(6, "2026-10-01T10:00:00Z", { circle_type: "inner", intermediary_id: null })],
      currentUserId: 1,
      t,
    });
    expect(events[0]).toMatchObject({ type: "attention", text: "Dana Day asked you to vouch for an intro to Person 5" });
    expect(events[1]).toMatchObject({ type: "sent", text: "You asked to connect with Person 6" });
  });

  it("keeps the eight newest items", () => {
    const sent = Array.from({ length: 12 }, (_, i) => request(i + 1, `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    const events = buildActivityEvents({ sent, currentUserId: 1, t });
    expect(events).toHaveLength(8);
    expect(events[0].id).toBe("request-12");
  });
});
