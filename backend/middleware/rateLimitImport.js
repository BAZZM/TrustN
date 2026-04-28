const rateLimit = require('express-rate-limit');

const MAX_CONTACTS_PER_REQUEST = parseInt(process.env.IMPORT_MAX_CONTACTS_PER_REQUEST, 10) || 500;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 10;

const importRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS_PER_WINDOW,
  message: { error: 'Too many import requests; try again later' },
  standardHeaders: true,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anon',
});

module.exports = { importRateLimiter, MAX_CONTACTS_PER_REQUEST };
