const express = require('express');
const { pool } = require('../db');
const { signToken } = require('../middleware/auth');
const { parsePhoneNumberWithError } = require('libphonenumber-js');

const router = express.Router();

function normalizeE164(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const trimmed = phone.replace(/\s/g, '').trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePhoneNumberWithError(trimmed);
    return parsed ? parsed.format('E.164') : null;
  } catch {
    return null;
  }
}

async function getRequirePhoneVerification() {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM admin_config WHERE key = 'require_phone_verification'`
    );
    const val = rows.length > 0 ? rows[0].value : false;
    return val === true || (typeof val === 'string' && val === 'true');
  } catch {
    return false;
  }
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtpViaTwilio(phone, code) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    console.warn('Twilio not configured; OTP not sent');
    return false;
  }
  try {
    const twilio = require('twilio')(accountSid, authToken);
    await twilio.messages.create({
      body: `Your Trust Network verification code is: ${code}`,
      from: fromNumber,
      to: phone,
    });
    return true;
  } catch (err) {
    console.error('Twilio send error:', err.message);
    return false;
  }
}

// POST /identify - Start login: phone lookup. If OTP required, send code and return pending. Else return user+token.
router.post('/identify', async (req, res) => {
  try {
    const phone = req.body && req.body.phone;
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Phone is required' });
    }
    const normalized = normalizeE164(phone);
    if (!normalized) {
      return res.status(400).json({ error: 'Invalid phone number; use E.164 or international format' });
    }

    const requireOtp = await getRequirePhoneVerification();

    const result = await pool.query(
      'SELECT id, phone, name, job_role, industry, experience, theme_id, large_text, high_contrast, locale, notifications_connection_requests, created_at FROM users WHERE phone = $1',
      [normalized]
    );
    const rows = result.rows;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found', phone: normalized });
    }

    const user = rows[0];

    if (requireOtp) {
      const code = generateOtpCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await pool.query(
        'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)',
        [normalized, code, expiresAt]
      );
      const sent = await sendOtpViaTwilio(normalized, code);
      if (!sent) {
        return res.status(503).json({ error: 'Could not send verification code. Please try again.' });
      }
      return res.json({ pending: true, phone: normalized, message: 'Verification code sent' });
    }

    await pool.query('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    const token = signToken(user.id);
    res.json({ user, token });
  } catch (err) {
    console.error('auth identify error:', err.message || err);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: isProd
        ? 'Server error'
        : String(err && err.message ? err.message : 'Server error'),
    });
  }
});

// POST /verify - Complete login with OTP code (when require_phone_verification is on)
router.post('/verify', async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Phone and code are required' });
    }
    const normalized = normalizeE164(phone);
    if (!normalized) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    const { rows } = await pool.query(
      `SELECT id FROM otp_codes 
       WHERE phone = $1 AND code = $2 AND expires_at > CURRENT_TIMESTAMP AND used_at IS NULL 
       ORDER BY created_at DESC LIMIT 1`,
      [normalized, code.trim()]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    await pool.query('UPDATE otp_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [rows[0].id]);

    const userResult = await pool.query(
      'SELECT id, phone, name, job_role, industry, experience, theme_id, large_text, high_contrast, locale, notifications_connection_requests, created_at FROM users WHERE phone = $1',
      [normalized]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];
    await pool.query('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    const token = signToken(user.id);
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /register - Create new user
router.post('/register', async (req, res) => {
  try {
    const { phone, name, job_role, industry, experience } = req.body || {};
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Phone is required' });
    }
    const normalized = normalizeE164(phone);
    if (!normalized) {
      return res.status(400).json({ error: 'Invalid phone number; use E.164 or international format' });
    }

    const nameStr = (name && typeof name === 'string' ? name.trim() : '').slice(0, 255) || 'New User';
    const jobRoleStr = (job_role && typeof job_role === 'string' ? job_role.trim() : '').slice(0, 255) || '';
    const industryStr = (industry && typeof industry === 'string' ? industry.trim() : '').slice(0, 255) || '';
    const experienceStr = (experience && typeof experience === 'string' ? experience.trim() : '').slice(0, 2000) || '';

    const { rows } = await pool.query(
      `INSERT INTO users (phone, name, job_role, industry, experience) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (phone) DO NOTHING
       RETURNING id, phone, name, job_role, industry, experience, theme_id, large_text, high_contrast, locale, notifications_connection_requests, created_at`,
      [normalized, nameStr, jobRoleStr, industryStr, experienceStr]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: 'Phone already registered' });
    }
    const user = rows[0];
    await pool.query('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    const token = signToken(user.id);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /otp-required - Public endpoint for frontend to know if OTP step is needed
router.get('/otp-required', async (req, res) => {
  try {
    const requireOtp = await getRequirePhoneVerification();
    res.json({ require_phone_verification: requireOtp });
  } catch {
    res.json({ require_phone_verification: false });
  }
});

module.exports = router;
