const express = require('express');
const { pool, withUserContext } = require('../db');

const router = express.Router();

// Finalises a secondary request when both intermediary and target have approved.
// Uses the SECURITY DEFINER function app_finalize_secondary which bypasses RLS
// for the cross-user INSERT into connections (intermediary is not a participant
// of the resulting requester<->target edge). The function is idempotent and
// only finalises if the request is still pending and both approvals are set.
async function finishSecondaryIfBothApproved(client, requestId) {
  await client.query('SELECT * FROM app_finalize_secondary($1)', [requestId]);
}

// List pending connection requests (uses RLS via withUserContext)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) return res.status(400).json({ error: 'Invalid user ID' });

    const { rows } = await withUserContext(userIdInt, async (client) => {
      return await client.query(
        `SELECT ar.id, ar.requester_id, ar.target_user_id, ar.intermediary_id, ar.status, ar.note, ar.circle_type,
                ar.approved_by_intermediary_at, ar.approved_by_target_at, ar.created_at,
                ru.phone AS requester_phone, ru.name AS requester_name,
                tu.phone AS target_phone, tu.name AS target_name,
                iu.phone AS intermediary_phone, iu.name AS intermediary_name
         FROM access_requests ar
         JOIN users ru ON ru.id = ar.requester_id
         LEFT JOIN users tu ON tu.id = ar.target_user_id
         LEFT JOIN users iu ON iu.id = ar.intermediary_id
         WHERE (ar.target_user_id = $1 OR ar.intermediary_id = $1) AND ar.status = 'pending'
         ORDER BY ar.created_at DESC`,
        [userIdInt]
      );
    });
    res.json({ requests: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a connection request
router.post('/', async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requesterIdInt = typeof requesterId === 'string' ? parseInt(requesterId, 10) : requesterId;
    if (isNaN(requesterIdInt)) return res.status(400).json({ error: 'Invalid user ID' });
    const { target_user_id, intermediary_id, circle_type } = req.body || {};
    if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
    const cType = (circle_type || 'secondary').toLowerCase();
    if (cType !== 'inner' && cType !== 'secondary') return res.status(400).json({ error: 'circle_type must be inner or secondary' });
    if (cType === 'secondary' && !intermediary_id) return res.status(400).json({ error: 'intermediary_id required for secondary requests' });

    await withUserContext(requesterIdInt, async (client) => {
      if (cType === 'secondary') {
        // Use SECURITY DEFINER helper so the requester can verify the
        // intermediary<->target edge they are not a participant of.
        // The function returns FALSE for any combination where either edge
        // is missing (covers both "intermediary not in your inner circle"
        // and "intermediary not in target inner circle").
        const check = await client.query(
          'SELECT app_can_intermediate($1, $2, $3) AS ok',
          [requesterIdInt, target_user_id, intermediary_id]
        );
        if (!check.rows[0] || check.rows[0].ok !== true) {
          throw Object.assign(new Error('Intermediary must share an inner circle with both you and the target'), { status: 400 });
        }
      }
      const ins = await client.query(
        `INSERT INTO access_requests (requester_id, target_user_id, intermediary_id, status, circle_type)
         VALUES ($1, $2, $3, 'pending', $4) RETURNING id, requester_id, target_user_id, intermediary_id, circle_type, created_at`,
        [requesterIdInt, target_user_id, cType === 'secondary' ? intermediary_id : null, cType]
      );
      res.status(201).json(ins.rows[0]);
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Respond to request
router.post('/:id/respond', async (req, res) => {
  try {
    const requestId = req.params.id;
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) return res.status(400).json({ error: 'Invalid user ID' });
    const { action } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action required' });
    const actions = ['accept', 'decline', 'approve_as_intermediary', 'approve_as_target'];
    if (!actions.includes(action)) return res.status(400).json({ error: 'action must be accept, decline, approve_as_intermediary, or approve_as_target' });

    await withUserContext(userIdInt, async (client) => {
      const { rows: reqRows } = await client.query(
        `SELECT id, requester_id, target_user_id, intermediary_id, circle_type,
                approved_by_intermediary_at, approved_by_target_at FROM access_requests WHERE id = $1 AND status = 'pending'`,
        [requestId]
      );
      if (reqRows.length === 0) throw Object.assign(new Error('Request not found or already processed'), { status: 404 });
      const r = reqRows[0];
      const uid = String(userIdInt);

      if (action === 'decline') {
        const canRespond = uid === String(r.target_user_id) || uid === String(r.intermediary_id);
        if (!canRespond) throw Object.assign(new Error('Not allowed to respond'), { status: 403 });
        await client.query(
          'UPDATE access_requests SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['declined', requestId]
        );
        return res.json({ ok: true, action: 'declined' });
      }

      if (action === 'accept') {
        const canRespond = uid === String(r.target_user_id) || uid === String(r.intermediary_id);
        if (!canRespond) throw Object.assign(new Error('Not allowed to respond'), { status: 403 });
        if (r.circle_type === 'inner' || !r.intermediary_id) {
          await client.query(
            'UPDATE access_requests SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['accepted', requestId]
          );
          const uid1 = Math.min(r.requester_id, r.target_user_id);
          const uid2 = Math.max(r.requester_id, r.target_user_id);
          await client.query(
            `INSERT INTO connections (user1_id, user2_id, strength, circle_type) VALUES ($1, $2, 1, 'inner')
             ON CONFLICT (user1_id, user2_id) DO NOTHING`,
            [uid1, uid2]
          );
          return res.json({ ok: true, action: 'accepted' });
        }
      }

      if (action === 'approve_as_intermediary') {
        if (uid !== String(r.intermediary_id)) throw Object.assign(new Error('Not the intermediary'), { status: 403 });
        await client.query(
          'UPDATE access_requests SET approved_by_intermediary_at = CURRENT_TIMESTAMP WHERE id = $1',
          [requestId]
        );
        await finishSecondaryIfBothApproved(client, requestId);
        return res.json({ ok: true, action: 'approved_as_intermediary' });
      }

      if (action === 'approve_as_target') {
        if (uid !== String(r.target_user_id)) throw Object.assign(new Error('Not the target'), { status: 403 });
        await client.query(
          'UPDATE access_requests SET approved_by_target_at = CURRENT_TIMESTAMP WHERE id = $1',
          [requestId]
        );
        await finishSecondaryIfBothApproved(client, requestId);
        return res.json({ ok: true, action: 'approved_as_target' });
      }

      throw Object.assign(new Error('Invalid action'), { status: 400 });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
