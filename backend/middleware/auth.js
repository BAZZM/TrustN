const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

/**
 * Issue a JWT for a user (after successful identify).
 * Payload: { sub: user.id }.
 */
function signToken(userId) {
  return jwt.sign(
    { sub: String(userId) },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * Authenticate requests: require Authorization Bearer token, set req.user.id.
 * Reject if client sends user_id in query/body that does not match token (prevents reading/writing other users' data).
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const tokenUserId = decoded.sub;
  req.user = { id: tokenUserId };

  // Reject mismatches: do not allow body/query user_id to override authenticated user
  const bodyId = req.body && req.body.user_id != null ? String(req.body.user_id) : null;
  const queryId = req.query && req.query.user_id != null ? String(req.query.user_id) : null;
  if (bodyId && bodyId !== tokenUserId) {
    return res.status(403).json({ error: 'Forbidden: user_id does not match authenticated user' });
  }
  if (queryId && queryId !== tokenUserId) {
    return res.status(403).json({ error: 'Forbidden: user_id does not match authenticated user' });
  }
  next();
}

module.exports = { requireAuth, signToken };
