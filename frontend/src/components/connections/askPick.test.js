import { resolveAskPick } from "./askPick";

describe("resolveAskPick", () => {
  it("focuses an inner peer directly", () => {
    expect(resolveAskPick({ id: 12, kind: "inner", path: { kind: "direct_inner", via: null } })).toEqual({
      focusInnerId: "12",
      selectSecondaryId: null,
    });
  });

  it("opens the introducer's branch and selects the secondary", () => {
    expect(
      resolveAskPick({ id: 19, kind: "secondary", path: { kind: "via_inner", via: { id: 10, name: "Bob Brown" } } })
    ).toEqual({ focusInnerId: "10", selectSecondaryId: "19" });
  });

  it("treats a direct link with no introducer as nothing to do", () => {
    expect(resolveAskPick({ id: 3, kind: "secondary", path: { kind: "direct_edge_only", via: null } })).toBeNull();
  });

  it("ignores malformed results", () => {
    expect(resolveAskPick(null)).toBeNull();
    expect(resolveAskPick({})).toBeNull();
    expect(resolveAskPick({ id: 5, kind: "secondary", path: { kind: "via_inner", via: { id: null } } })).toBeNull();
  });
});
