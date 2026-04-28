const express = require('express');
const { pool, withUserContext } = require('../db');
const { normalizeE164, isValidLength } = require('../lib/phone');
const { importRateLimiter, MAX_CONTACTS_PER_REQUEST } = require('../middleware/rateLimitImport');

const router = express.Router();

const BATCH_SIZE = 200;
const MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB

// List contacts for user, with matched user info (by phone). Pagination: limit, offset; max page size 100.
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 100);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const result = await withUserContext(userIdInt, (client) =>
      client.query(
        `SELECT c.id, c.phone, c.name AS contact_name, c.created_at,
                u.id AS user_id, u.phone AS user_phone, u.name AS user_name, u.job_role, u.industry, u.experience
         FROM contacts c
         LEFT JOIN users u ON u.phone = c.phone
         WHERE c.user_id = $1
         ORDER BY c.name NULLS LAST, c.phone
         LIMIT $2 OFFSET $3`,
        [userIdInt, limit, offset]
      )
    );
    res.json({ contacts: result.rows, limit, offset });
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ contacts: [] });
    }
    console.error('contacts GET error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Import contacts (upsert by user_id + phone). Rate-limited; bulk upsert; E.164; validation.
router.post('/import', importRateLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const list = req.body.contacts;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'contacts must be an array' });
    if (list.length === 0) return res.status(400).json({ error: 'contacts array cannot be empty' });
    if (list.length > MAX_CONTACTS_PER_REQUEST) {
      return res.status(400).json({ error: `At most ${MAX_CONTACTS_PER_REQUEST} contacts per request` });
    }
    const payloadSize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
    if (payloadSize > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Payload too large' });
    }
    const parsed = [];
    const invalid = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item === null || typeof item !== 'object') {
        invalid.push(i);
        continue;
      }
      const raw = item.phone ?? item.number;
      const e164 = normalizeE164(raw);
      if (!e164 || !isValidLength(e164)) {
        invalid.push(i);
        continue;
      }
      const name = (item.name ?? item.firstName ?? '').toString().trim().slice(0, 255) || null;
      parsed.push({ user_id: userIdInt, phone: e164, name });
    }
    const result = await withUserContext(userIdInt, async (client) => {
      let imported = 0;
      for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
        const batch = parsed.slice(i, i + BATCH_SIZE);
        const userIds = batch.map((b) => b.user_id);
        const phones = batch.map((b) => b.phone);
        const names = batch.map((b) => b.name);
        await client.query(
          `INSERT INTO contacts (user_id, phone, name)
           SELECT * FROM UNNEST($1::integer[], $2::text[], $3::text[])
           ON CONFLICT (user_id, phone) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name)`,
          [userIds, phones, names]
        );
        imported += batch.length;
      }

      // Auto-create inner circle connections for imported contacts that match registered users.
      // A mutual match (both have each other's number in contacts) creates an inner connection.
      const allPhones = parsed.map((b) => b.phone);
      await client.query(
        `INSERT INTO connections (user1_id, user2_id, circle_type, strength)
         SELECT LEAST($1, u.id), GREATEST($1, u.id), 'inner', 1
         FROM users u
         WHERE u.phone = ANY($2::text[])
           AND u.id != $1
         ON CONFLICT (user1_id, user2_id) DO NOTHING`,
        [userIdInt, allPhones]
      );

      return { imported };
    });
      if (invalid.length > 0) {
        console.warn('contacts/import: invalid or skipped rows', { count: invalid.length, userId: userIdInt });
      }
    res.json({ ok: true, imported: result.imported, skipped: invalid.length });
  } catch (err) {
    if (err.code === '42P01') return res.status(400).json({ error: 'Contacts table not available' });
    if (err.code === '57014') {
      return res.status(408).json({ error: 'Request timed out' });
    }
    console.error('contacts/import error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GDPR: export all contacts for the authenticated user (machine-readable)
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const result = await withUserContext(userIdInt, (client) =>
      client.query(
        `SELECT id, phone, name, created_at FROM contacts WHERE user_id = $1 ORDER BY created_at`,
        [userIdInt]
      )
    );
    res.setHeader('Content-Type', 'application/json');
    res.json({ exported_at: new Date().toISOString(), contacts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GDPR: delete a single contact by id (must belong to user)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const contactId = req.params.id;
    if (!contactId) return res.status(400).json({ error: 'contact id required' });
    const result = await withUserContext(userIdInt, (client) =>
      client.query('DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id', [contactId, userIdInt])
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Contact not found or access denied' });
    }
    res.json({ ok: true, deleted: contactId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Find possible intermediaries for adding target to requester's secondary circle
router.get('/possible-intermediaries', async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requesterIdInt = typeof requesterId === 'string' ? parseInt(requesterId, 10) : requesterId;
    if (isNaN(requesterIdInt)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const targetUserId = req.query.target_user_id;
    if (!targetUserId) return res.status(400).json({ error: 'target_user_id required' });
    const { rows } = await pool.query(
      `SELECT u.id, u.phone, u.name, u.job_role
       FROM users u
       INNER JOIN connections c1 ON c1.circle_type = 'inner'
         AND ((c1.user1_id = $1 AND c1.user2_id = u.id) OR (c1.user2_id = $1 AND c1.user1_id = u.id))
       INNER JOIN connections c2 ON c2.circle_type = 'inner'
         AND ((c2.user1_id = $2 AND c2.user2_id = u.id) OR (c2.user2_id = $2 AND c2.user1_id = u.id))
       WHERE u.id != $1 AND u.id != $2`,
      [requesterIdInt, targetUserId]
    );
    res.json({ intermediaries: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
