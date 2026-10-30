const rateLimit = require('express-rate-limit');

// Each ask can fan out to several full-text lookups (and, if enabled, one model call), so cap it per user.
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = parseInt(process.env.ASK_RATE_LIMIT_MAX, 10) || 20;

const askRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS_PER_WINDOW,
  message: { error: 'Too many questions; try again in a minute' },
  standardHeaders: true,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anon',
});

module.exports = { askRateLimiter };
