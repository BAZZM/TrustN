/**
 * What to do in the graph when the user picks an "ask your network" result.
 *
 * - an inner peer: focus that peer;
 * - a secondary reached through an introducer: focus the introducer's branch, then select the person
 *   once that branch has loaded;
 * - a direct link with no introducer: nothing to show in the graph (the panel shows it as information).
 *
 * @returns {{ focusInnerId: string, selectSecondaryId: string|null } | null}
 */
export function resolveAskPick(result) {
  if (!result || result.id == null) return null;
  if (result.kind === "inner") {
    return { focusInnerId: String(result.id), selectSecondaryId: null };
  }
  if (result.path?.kind === "via_inner" && result.path.via?.id != null) {
    return { focusInnerId: String(result.path.via.id), selectSecondaryId: String(result.id) };
  }
  return null;
}
