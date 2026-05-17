const express = require('express');
const { pool, withUserContext } = require('../db');

const router = express.Router();

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
        `SELECT 
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
        ORDER BY c.circle_type DESC, c.strength DESC, c.created_at DESC`,
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
