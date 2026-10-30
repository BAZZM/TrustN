const express = require('express');
const { pool, withUserContext } = require('../db');
const { shapeInner, shapeSecondary, pickPrimaryVia } = require('../lib/graphPayload');
const { interpret, MAX_QUESTION_LENGTH } = require('../lib/askInterpret');
const { rankCandidates } = require('../lib/askRank');
const { askRateLimiter } = require('../middleware/rateLimitAsk');

const router = express.Router();

/** Viewer's connections joined to the peer's profile (shared by GET / and GET /graph). */
const VIEWER_CONNECTIONS_SQL = `SELECT 
          c.id, 
          c.strength, 
          c.circle_type, 
          c.created_at,
          (c.introduced_via_request_id IS NOT NULL) AS peer_introduced,
          u.id AS peer_id, 
          u.phone AS peer_phone, 
          u.name AS peer_name, 
          u.job_role AS peer_job_role,
          u.industry AS peer_industry,
          u.experience AS peer_experience
        FROM connections c 
        JOIN users u ON (u.id = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END) 
        WHERE c.user1_id = $1 OR c.user2_id = $1 
        ORDER BY c.circle_type DESC, c.strength DESC, c.created_at DESC`;

// Get all connections for the authenticated user (uses RLS via withUserContext)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { rows } = await withUserContext(userIdInt, async (client) => {
      const result = await client.query(
        VIEWER_CONNECTIONS_SQL,
        [userIdInt]
      );
      return result;
    });
    res.json({ connections: rows });
  } catch (err) {
    console.error('connections GET error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Slim, unambiguous graph payload for the Connections page (no phone numbers, no bio text).
 *
 * Query: focus (inner peer id; limits secondary to that branch), q (FTS), limit (1..200, default 100),
 *        secondary=0 to skip the secondary lookup (inner ring only).
 * Rows: see backend/lib/graphPayload.js for the direct / via / primary_via definitions.
 */
router.get('/graph', async (req, res) => {
  try {
    const viewerIdInt = typeof req.user.id === 'string' ? parseInt(req.user.id, 10) : req.user.id;
    if (isNaN(viewerIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const rawQ = req.query.q != null ? String(req.query.q).trim() : '';
    const qParam = rawQ === '' ? null : rawQ;

    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 100;

    let focus = null;
    if (req.query.focus != null && String(req.query.focus).trim() !== '') {
      focus = parseInt(String(req.query.focus), 10);
      if (isNaN(focus)) {
        return res.status(400).json({ error: 'Invalid focus' });
      }
    }

    const wantSecondary = String(req.query.secondary ?? '1') !== '0';

    const { connectionRows, secondaryRows } = await withUserContext(viewerIdInt, async (client) => {
      const conns = await client.query(VIEWER_CONNECTIONS_SQL, [viewerIdInt]);
      if (!wantSecondary) {
        return { connectionRows: conns.rows, secondaryRows: [] };
      }
      const sec = await client.query(
        `SELECT res_peer_id, res_peer_name, res_peer_job_role, res_peer_industry,
                res_source_edge, res_via_inner_peer_ids, res_search_rank
         FROM app_unified_secondary_search($1, $2, $3, 0, NULL::INTEGER, $4::INTEGER, $5::BOOLEAN)`,
        [viewerIdInt, qParam, limit, focus, focus != null]
      );
      return { connectionRows: conns.rows, secondaryRows: sec.rows };
    });

    const inner = shapeInner(connectionRows);
    const innerStrengthById = new Map(inner.map((p) => [p.id, p.strength]));
    // A focus that is not one of the viewer's inner peers is ignored (and returns no secondaries).
    const focusIsInner = focus != null && innerStrengthById.has(focus);
    const secondary = wantSecondary ? shapeSecondary(secondaryRows, innerStrengthById) : [];

    res.json({
      viewer_id: viewerIdInt,
      inner,
      secondary,
      meta: {
        inner_total: inner.length,
        secondary_count: secondary.length,
        focus: focusIsInner ? focus : null,
        q: qParam,
      },
    });
  } catch (err) {
    console.error('connections/graph error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * "Ask your network": rank people the viewer can already see against a free-text question and say
 * how to reach them. Retrieval and authorization stay in SQL (the viewer's own connections and
 * app_unified_secondary_search); interpretation is rules by default (see lib/askInterpret.js).
 *
 * Body: { question: string (1..300 chars) }
 * Response rows never include phone numbers or bio text; `matched` names fields only.
 */
router.post('/ask', askRateLimiter, async (req, res) => {
  try {
    const viewerIdInt = typeof req.user.id === 'string' ? parseInt(req.user.id, 10) : req.user.id;
    if (isNaN(viewerIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({ error: `question must be at most ${MAX_QUESTION_LENGTH} characters` });
    }

    const { mode, terms } = await interpret(question);
    if (terms.length === 0) {
      return res.json({ mode, interpretation: { terms }, results: [], meta: { considered: 0 } });
    }

    const { connectionRows, secondaryByTerm } = await withUserContext(viewerIdInt, async (client) => {
      const conns = await client.query(VIEWER_CONNECTIONS_SQL, [viewerIdInt]);
      // The SQL search ANDs words, so look each term up separately and merge (OR semantics).
      const byTerm = [];
      for (const term of terms) {
        // eslint-disable-next-line no-await-in-loop
        const found = await client.query(
          `SELECT res_peer_id, res_peer_name, res_peer_job_role, res_peer_industry, res_peer_experience,
                  res_source_edge, res_via_inner_peer_ids
           FROM app_unified_secondary_search($1, $2, 100, 0, NULL::INTEGER, NULL::INTEGER, FALSE)`,
          [viewerIdInt, term]
        );
        byTerm.push({ term, rows: found.rows });
      }
      return { connectionRows: conns.rows, secondaryByTerm: byTerm };
    });

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
    for (const { term, rows } of secondaryByTerm) {
      for (const r of rows) {
        const id = r.res_peer_id;
        if (id === viewerIdInt || innerStrengthById.has(id)) continue;
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
        entry.ftsTerms.push(term);
      }
    }
    candidates.push(...secondaryById.values());

    res.json({
      mode,
      interpretation: { terms },
      results: rankCandidates(candidates, terms, innerNameById),
      meta: { considered: candidates.length },
    });
  } catch (err) {
    console.error('connections/ask error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Unified hybrid discovery (SECURITY DEFINER app_unified_secondary_search).
 * Optional focused_inner_peer_id scopes relationship discovery to one inner peer.
 * Optional branch_only=1: when focused_inner_peer_id is set, return only peers reachable via that
 * inner’s discovery paths (exclude viewer secondary edges that are not discovered through that branch).
 * FTS q still applies on top.
 *
 * Query: q (FTS), limit (max 200), offset, focused_inner_peer_id (optional), branch_only (optional)
 */
router.get('/secondary-search', async (req, res) => {
  try {
    const viewerId = req.user.id;
    const viewerIdInt = typeof viewerId === 'string' ? parseInt(viewerId, 10) : viewerId;
    if (isNaN(viewerIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const rawQ = req.query.q != null ? String(req.query.q).trim() : '';
    const qParam = rawQ === '' ? null : rawQ;

    const rawLimit = parseInt(req.query.limit, 10);
    const rawOffset = parseInt(req.query.offset, 10);
    const limit =
      Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 100;
    const offset =
      Number.isFinite(rawOffset) && rawOffset > 0 ? Math.min(rawOffset, 50000) : 0;

    const rawFocus = req.query.focused_inner_peer_id ?? req.query.focusInnerPeerId;
    let focusInner = null;
    if (rawFocus != null && String(rawFocus).trim() !== '') {
      focusInner = parseInt(String(rawFocus), 10);
      if (isNaN(focusInner)) {
        return res.status(400).json({ error: 'Invalid focused_inner_peer_id' });
      }
    }

    const rawBranch =
      req.query.branch_only ?? req.query.branchOnly ?? req.query.branch_only_mode;
    const branchOnly =
      rawBranch === true ||
      rawBranch === 1 ||
      String(rawBranch || '').toLowerCase() === 'true' ||
      String(rawBranch || '') === '1';

    const { rows } = await withUserContext(viewerIdInt, async (client) =>
      client.query(
        `SELECT uni.res_peer_id,
                uni.res_peer_phone,
                uni.res_peer_name,
                uni.res_peer_job_role,
                uni.res_peer_industry,
                uni.res_peer_experience,
                uni.res_source_edge,
                uni.res_via_inner_peer_ids,
                uni.res_search_rank
         FROM app_unified_secondary_search($1, $2, $3, $4, NULL::INTEGER, $5::INTEGER, $6::BOOLEAN) AS uni`,
        [viewerIdInt, qParam, limit, offset, focusInner, branchOnly]
      )
    );

    const results = rows.map((r) => {
      const vias = Array.isArray(r.res_via_inner_peer_ids)
        ? [...new Set(r.res_via_inner_peer_ids.filter((id) => id != null))]
        : [];
      const sources = [];
      if (r.res_source_edge) sources.push('edge');
      if (vias.length > 0) sources.push('discovery');

      return {
        peer_id: r.res_peer_id,
        peer_phone: r.res_peer_phone,
        peer_name: r.res_peer_name,
        peer_job_role: r.res_peer_job_role,
        peer_industry: r.res_peer_industry,
        peer_experience: r.res_peer_experience,
        sources,
        via_inner_peer_ids: vias,
        rank: typeof r.res_search_rank === 'number' ? r.res_search_rank : null,
      };
    });

    res.json({
      results,
      limit,
      offset,
      q: qParam,
      focused_inner_peer_id: focusInner,
      branch_only: branchOnly,
    });
  } catch (err) {
    console.error('connections/secondary-search error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get secondary connections for a specific inner circle contact
router.get('/secondary-for/:innerCircleUserId', async (req, res) => {
  try {
    const primaryUserId = req.user.id;
    const primaryUserIdInt = typeof primaryUserId === 'string' ? parseInt(primaryUserId, 10) : primaryUserId;
    const innerCircleUserId = parseInt(req.params.innerCircleUserId, 10);

    if (isNaN(primaryUserIdInt) || isNaN(innerCircleUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const jobRoleFilter = req.query.job_role ? String(req.query.job_role).trim() : null;
    const industryFilter = req.query.industry ? String(req.query.industry).trim() : null;

    const { rows, isInner } = await withUserContext(primaryUserIdInt, async (client) => {
      const verifyInnerCircle = await client.query(
        `SELECT 1 FROM connections
         WHERE circle_type = 'inner'
         AND ((user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1))`,
        [primaryUserIdInt, innerCircleUserId]
      );

      if (verifyInnerCircle.rows.length === 0) {
        return { rows: [], isInner: false };
      }

      // Use SECURITY DEFINER helper to bypass RLS for the cross-user discovery read.
      // Authorization (viewer is in inner circle of innerPeer) is enforced inside the function.
      const result = await client.query(
        `SELECT peer_id, peer_phone, peer_name, peer_job_role, peer_industry, peer_experience, created_at
         FROM app_secondary_for($1, $2, $3, $4)`,
        [primaryUserIdInt, innerCircleUserId, jobRoleFilter, industryFilter]
      );
      return { rows: result.rows, isInner: true };
    });

    if (!isInner) {
      return res.status(403).json({ error: 'User is not in your inner circle' });
    }

    res.json({
      secondaryConnections: rows,
      innerCircleUserId: innerCircleUserId,
      filters: {
        job_role: jobRoleFilter,
        industry: industryFilter
      }
    });
  } catch (err) {
    console.error('connections/secondary-for error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get detailed profile information for an inner circle contact
router.get('/inner-circle/:userId/profile', async (req, res) => {
  try {
    const primaryUserId = req.user.id;
    const primaryUserIdInt = typeof primaryUserId === 'string' ? parseInt(primaryUserId, 10) : primaryUserId;
    const targetUserId = parseInt(req.params.userId, 10);
    
    if (isNaN(primaryUserIdInt) || isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const result = await withUserContext(primaryUserIdInt, async (client) => {
      const verify = await client.query(
        `SELECT 1 FROM connections 
         WHERE circle_type = 'inner' 
         AND ((user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1))`,
        [primaryUserIdInt, targetUserId]
      );
      if (verify.rows.length === 0) return { error: 'forbidden' };
      const { rows } = await client.query(
        `SELECT id, phone, name, job_role, industry, experience, created_at, last_active
         FROM users WHERE id = $1`,
        [targetUserId]
      );
      if (rows.length === 0) return { error: 'not_found' };
      return { profile: rows[0] };
    });

    if (result.error === 'forbidden') return res.status(403).json({ error: 'User is not in your inner circle' });
    if (result.error === 'not_found') return res.status(404).json({ error: 'User not found' });
    res.json({ profile: result.profile });
  } catch (err) {
    console.error('connections/inner-circle/profile error:', err.message, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
