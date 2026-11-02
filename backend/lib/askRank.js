/**
 * Scores and explains candidates for "ask your network". Pure functions: retrieval and
 * authorization happen in SQL; this only ranks what the viewer is already allowed to see.
 *
 * Candidate: { id, name, job_role, industry, experience, kind: 'inner'|'secondary', strength,
 *              direct, via: number[], primary_via: number|null, ftsTerms?: string[] }
 * `experience` (bio text) is used only for matching and is never returned.
 *
 * Matching is by word start, not raw substring: "art" matches "Art Director" but not "smart" or
 * "partner", and "designers" (stemmed to "design") matches "Design Lead".
 */

const { stem } = require('./askInterpret');

const FIELD_WEIGHT = { job_role: 1.0, industry: 0.8, experience: 0.5, name: 0.3 };
const FTS_ONLY_WEIGHT = 0.5; // matched by full-text search but not by word-start matching
const MAX_RESULTS = 12;
const MIN_STEM_LENGTH = 4; // shorter stems ("wat" from "water") match unrelated words

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Compiled patterns are cached, but words come from user questions: bound the cache so a long-lived
// server cannot be made to grow without limit by asking about many distinct words.
const MAX_PATTERN_CACHE = 500;
const wordStartCache = new Map();
function wordStartPattern(word) {
  let re = wordStartCache.get(word);
  if (!re) {
    if (wordStartCache.size >= MAX_PATTERN_CACHE) wordStartCache.clear();
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, 'u');
    wordStartCache.set(word, re);
  }
  return re;
}

/** The term as typed, its stem (when long enough to be safe), and any synonyms (and their stems). */
function variantsOf(term, synonyms) {
  const out = new Set();
  for (const word of [term, ...((synonyms && synonyms[term]) || [])]) {
    out.add(word);
    const stemmed = stem(word);
    if (stemmed !== word && stemmed.length >= MIN_STEM_LENGTH) out.add(stemmed);
  }
  return [...out];
}

/** Which terms hit which fields, and the best field weight per term. */
function matchCandidate(candidate, terms, synonyms = {}) {
  const matchedTerms = new Map(); // term -> best weight
  const matchedFields = new Set();
  const fts = new Set(candidate.ftsTerms || []);

  for (const term of terms) {
    const variants = variantsOf(term, synonyms);
    let best = 0;
    for (const field of Object.keys(FIELD_WEIGHT)) {
      const text = String(candidate[field] || '').toLowerCase();
      if (text && variants.some((v) => wordStartPattern(v).test(text))) {
        matchedFields.add(field);
        best = Math.max(best, FIELD_WEIGHT[field]);
      }
    }
    if (best === 0 && fts.has(term)) {
      best = FTS_ONLY_WEIGHT;
      matchedFields.add('profile');
    }
    if (best > 0) matchedTerms.set(term, best);
  }
  return { matchedTerms, matchedFields };
}

function scoreCandidate(candidate, terms, synonyms = {}) {
  const { matchedTerms, matchedFields } = matchCandidate(candidate, terms, synonyms);
  if (matchedTerms.size === 0 || terms.length === 0) return null;

  const coverage = matchedTerms.size / terms.length;
  const fieldQuality = [...matchedTerms.values()].reduce((sum, w) => sum + w, 0) / terms.length;
  const score =
    4 * coverage +
    fieldQuality +
    (candidate.kind === 'inner' ? 2 : 0) +
    (candidate.via && candidate.via.length > 0 ? 1 : 0) +
    Math.min(Number(candidate.strength) || 0, 4) * 0.25;

  return { score: round2(score), matchedTerms: [...matchedTerms.keys()], matchedFields: [...matchedFields] };
}

function buildPath(candidate, innerNameById) {
  if (candidate.kind === 'inner') return { kind: 'direct_inner', via: null };
  if (candidate.via && candidate.via.length > 0 && candidate.primary_via != null) {
    return {
      kind: 'via_inner',
      via: { id: candidate.primary_via, name: innerNameById.get(candidate.primary_via) || null },
    };
  }
  return { kind: 'direct_edge_only', via: null };
}

function buildReason(matchedTerms, path) {
  const matches = matchedTerms.length ? `Matches ${matchedTerms.join(', ')}.` : '';
  let how;
  if (path.kind === 'direct_inner') how = 'In your inner circle.';
  else if (path.kind === 'via_inner') how = path.via.name ? `Introduced through ${path.via.name}.` : 'Introduced through someone in your inner circle.';
  else how = 'You have a direct link but no introducer.';
  return [matches, how].filter(Boolean).join(' ');
}

/**
 * @param candidates see top of file
 * @param terms interpreted search terms
 * @param innerNameById Map<number, string> of the viewer's inner peers (for path names)
 * @param options { limit?: number, synonyms?: Object<string, string[]> }
 */
function rankCandidates(candidates, terms, innerNameById = new Map(), { limit = MAX_RESULTS, synonyms = {} } = {}) {
  const scored = [];
  for (const candidate of candidates) {
    const result = scoreCandidate(candidate, terms, synonyms);
    if (!result) continue;
    const path = buildPath(candidate, innerNameById);
    scored.push({
      id: candidate.id,
      name: candidate.name,
      job_role: candidate.job_role ?? null,
      industry: candidate.industry ?? null,
      kind: candidate.kind,
      score: result.score,
      matched: result.matchedFields,
      path,
      reason: buildReason(result.matchedTerms, path),
    });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.name).localeCompare(String(b.name)) ||
      a.id - b.id
  );
  return scored.slice(0, limit);
}

module.exports = {
  rankCandidates,
  scoreCandidate,
  matchCandidate,
  buildReason,
  patternCacheSize: () => wordStartCache.size,
  FIELD_WEIGHT,
  MAX_RESULTS,
  MAX_PATTERN_CACHE,
};
