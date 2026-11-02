/**
 * Retrieval planning and candidate building for "ask your network", kept out of the route so it can
 * be unit tested without a database. The route only runs the SQL; this decides *what* to look up
 * and turns the rows into ranked-ready candidates.
 */

const { pickPrimaryVia } = require('./graphPayload');

// Every lookup is a full discovery query, so bound them. Terms come first, synonyms fill the rest.
const MAX_SEARCH_WORDS = 5;
const ROWS_PER_WORD = 50;

/**
 * The SQL search ANDs words, so each word is looked up separately and the results merged (OR).
 * @returns {{ words: string[], groupOf: Map<string, string> }} groupOf maps a searched word back to
 *          the term it belongs to (a synonym counts as a hit for its term).
 */
function planLookups(terms, synonyms = {}) {
  const words = [];
  const groupOf = new Map();
  const add = (word, term) => {
    if (groupOf.has(word) || words.length >= MAX_SEARCH_WORDS) return;
    words.push(word);
    groupOf.set(word, term);
  };
  terms.forEach((term) => add(term, term));
  terms.forEach((term) => (synonyms[term] || []).forEach((alt) => add(alt, term)));
  return { words, groupOf };
}

/**
 * @param viewerId the asking user
 * @param connectionRows the viewer's connections (peer_* columns, as in GET /api/connections)
 * @param secondaryByWord [{ word, rows }] raw rows from app_unified_secondary_search per word
 * @param groupOf Map<word, term> from planLookups
 */
function buildCandidates({ viewerId, connectionRows, secondaryByWord, groupOf }) {
  const innerRows = connectionRows.filter((r) => r.circle_type === 'inner');
  const innerStrengthById = new Map(innerRows.map((r) => [r.peer_id, Number(r.strength) || 0]));
  const innerNameById = new Map(innerRows.map((r) => [r.peer_id, r.peer_name]));

  const candidates = innerRows.map((r) => ({
    id: r.peer_id,
    name: r.peer_name,
    job_role: r.peer_job_role,
    industry: r.peer_industry,
    experience: r.peer_experience,
    kind: 'inner',
    strength: Number(r.strength) || 0,
    direct: false,
    via: [],
    primary_via: null,
  }));

  const secondaryById = new Map();
  for (const { word, rows } of secondaryByWord) {
    const term = groupOf.get(word) || word;
    for (const r of rows) {
      const id = r.res_peer_id;
      if (id === viewerId || innerStrengthById.has(id)) continue;
      let entry = secondaryById.get(id);
      if (!entry) {
        const via = [...new Set((r.res_via_inner_peer_ids || []).filter((v) => v != null))].sort((a, b) => a - b);
        entry = {
          id,
          name: r.res_peer_name,
          job_role: r.res_peer_job_role,
          industry: r.res_peer_industry,
          experience: r.res_peer_experience,
          kind: 'secondary',
          strength: 0,
          direct: Boolean(r.res_source_edge),
          via,
          primary_via: pickPrimaryVia(via, innerStrengthById),
          ftsTerms: [],
        };
        secondaryById.set(id, entry);
      }
      if (!entry.ftsTerms.includes(term)) entry.ftsTerms.push(term);
    }
  }

  return { candidates: [...candidates, ...secondaryById.values()], innerNameById };
}

module.exports = { planLookups, buildCandidates, MAX_SEARCH_WORDS, ROWS_PER_WORD };
