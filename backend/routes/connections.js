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
