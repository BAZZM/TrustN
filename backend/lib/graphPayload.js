/**
 * Shapes database rows into the slim, unambiguous payload of GET /api/connections/graph.
 *
 * Vocabulary (see docs/RELATIONSHIP_BASED_CONNECTIONS.md):
 * - direct       the viewer has a stored secondary edge to this person
 * - via          inner peers who can introduce the viewer (discovery paths); a person can be
 *                introduced only if this is non-empty
 * - primary_via  the one branch used to place the person in the tree: highest inner strength,
 *                ties broken by lowest id; null when via is empty
 * - introduced   (inner only) the inner link was created by an introduction request
 *
 * Phone numbers and bio text are intentionally absent: the graph does not show them.
 */

function toInt(value) {
  const n = typeof value === 'string' ? parseInt(value, 10) : value;
  return Number.isInteger(n) ? n : null;
}

function shapeInner(rows) {
  return (rows || [])
    .filter((r) => r.circle_type === 'inner')
    .map((r) => ({
      id: r.peer_id,
      name: r.peer_name,
      job_role: r.peer_job_role ?? null,
      industry: r.peer_industry ?? null,
      strength: Number(r.strength) || 0,
      introduced: Boolean(r.peer_introduced),
      created_at: r.created_at ?? null,
    }));
}

/** Highest strength wins; ties go to the lowest id. */
function pickPrimaryVia(via, strengthById) {
  if (!via || via.length === 0) return null;
  const strength = (id) => (strengthById && Number(strengthById.get(id))) || 0;
  return [...via].sort((a, b) => strength(b) - strength(a) || a - b)[0];
}

/**
 * @param rows raw rows from app_unified_secondary_search (res_* columns)
 * @param innerStrengthById Map<number, number> of the viewer's inner peers
 */
function shapeSecondary(rows, innerStrengthById) {
  return (rows || []).map((r) => {
    const via = [...new Set((Array.isArray(r.res_via_inner_peer_ids) ? r.res_via_inner_peer_ids : []).map(toInt))]
      .filter((id) => id != null)
      .sort((a, b) => a - b);
    return {
      id: r.res_peer_id,
      name: r.res_peer_name,
      job_role: r.res_peer_job_role ?? null,
      industry: r.res_peer_industry ?? null,
      direct: Boolean(r.res_source_edge),
      via,
      primary_via: pickPrimaryVia(via, innerStrengthById),
      rank: typeof r.res_search_rank === 'number' ? r.res_search_rank : null,
    };
  });
}

module.exports = { shapeInner, shapeSecondary, pickPrimaryVia };
