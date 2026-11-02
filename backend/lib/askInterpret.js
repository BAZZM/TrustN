/**
 * Turns a free-text question into search terms for "ask your network".
 *
 * Default is deterministic rules (no key, no network). An optional model call can improve
 * interpretation when ASK_LLM=1 and ANTHROPIC_API_KEY are set; it receives only the question text
 * (never anyone's profile) and its output is validated, falling back to the rules on any problem.
 *
 * Result shape: { mode, terms: string[], synonyms: { [term]: string[] } }. A synonym is an
 * *alternative* spelling of the same term (it is searched and matched in addition to the word the
 * user typed, never instead of it).
 */

const MAX_TERMS = 6;
const MAX_QUESTION_LENGTH = 300;

const STOPWORDS = new Set([
  'who', 'whom', 'whose', 'what', 'which', 'where', 'when', 'how', 'why', 'can', 'could', 'would',
  'should', 'does', 'did', 'you', 'your', 'yours', 'know', 'knows', 'anyone', 'someone', 'somebody',
  'people', 'person', 'any', 'the', 'and', 'for', 'with', 'has', 'have', 'had', 'are', 'was', 'were',
  'been', 'being', 'that', 'this', 'those', 'these', 'from', 'into', 'about', 'find', 'show', 'tell',
  'give', 'need', 'want', 'looking', 'look', 'work', 'works', 'working', 'worked', 'there', 'their',
  'them', 'they', 'but', 'not', 'all', 'some', 'our', 'out', 'also', 'than', 'then', 'very', 'just',
  'like', 'get', 'got', 'one', 'ones', 'its', 'his', 'her', 'she', 'him', 'may', 'might', 'must',
  'will', 'shall', 'much', 'many', 'more', 'most', 'other', 'such', 'only', 'own', 'same', 'too',
  'use', 'used', 'over', 'under', 'between', 'through', 'during', 'before', 'after',
]);

// A handful of everyday words and the profile vocabulary they usually mean.
const SYNONYMS = {
  doctor: 'healthcare',
  doctors: 'healthcare',
  physician: 'healthcare',
  nurse: 'healthcare',
  medical: 'healthcare',
  hospital: 'healthcare',
  lawyer: 'legal',
  lawyers: 'legal',
  attorney: 'legal',
  developer: 'engineer',
  developers: 'engineer',
  programmer: 'engineer',
  coder: 'engineer',
  software: 'engineer',
  banker: 'finance',
  accountant: 'finance',
};

/**
 * Very light stemming so "designers" and "design" meet. Used only for matching in askRank: terms
 * sent to Postgres full-text search stay as written, because Postgres stems on its own and a
 * second, cruder stem would stop matching what it indexed.
 */
function stem(word) {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith('ers')) return w.slice(0, -3);
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('er')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

const charCount = (s) => Array.from(s).length;

function interpretRules(question) {
  const tokens = String(question || '')
    .toLowerCase()
    .normalize('NFC')
    // Keep letters and digits in any script (so "médecin" and "Zürich" survive); drop punctuation.
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((t) => charCount(t) >= 3 && !STOPWORDS.has(t));

  const terms = [];
  const synonyms = {};
  for (const token of tokens) {
    if (terms.includes(token)) continue;
    terms.push(token);
    if (SYNONYMS[token] && SYNONYMS[token] !== token) synonyms[token] = [SYNONYMS[token]];
    if (terms.length >= MAX_TERMS) break;
  }
  return { mode: 'rules', terms, synonyms };
}

/** Accept only short, plain-letter terms from the model; anything else is rejected outright. */
function validateTerms(value) {
  if (!Array.isArray(value)) return null;
  const clean = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const term = raw.trim().toLowerCase();
    if (!/^\p{L}{3,32}$/u.test(term)) return null;
    if (!clean.includes(term)) clean.push(term);
  }
  if (clean.length === 0 || clean.length > MAX_TERMS) return null;
  return clean;
}

async function interpretLlm(question, { apiKey, fetchImpl, model = 'claude-haiku-5-5', timeoutMs = 4000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 120,
        system:
          'Extract up to 6 single-word, lowercase search keywords (job roles, industries, skills) from the ' +
          'user question. Reply with JSON only, exactly {"terms":["word", ...]}.',
        messages: [{ role: 'user', content: String(question) }],
      }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const text = body && body.content && body.content[0] && body.content[0].text;
    const parsed = JSON.parse(text);
    const terms = validateTerms(parsed && parsed.terms);
    return terms ? { mode: 'llm', terms, synonyms: {} } : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{ mode: 'rules'|'llm', terms: string[], synonyms: Object<string, string[]> }>}
 */
async function interpret(question, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.ASK_LLM === '1' && env.ANTHROPIC_API_KEY && typeof fetchImpl === 'function') {
    const viaModel = await interpretLlm(question, { apiKey: env.ANTHROPIC_API_KEY, fetchImpl });
    if (viaModel) return viaModel;
  }
  return interpretRules(question);
}

module.exports = { interpret, interpretRules, validateTerms, stem, MAX_TERMS, MAX_QUESTION_LENGTH };
