require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const profileRouter = require('./routes/profile');
const connectionsRouter = require('./routes/connections');
const connectionRequestsRouter = require('./routes/connectionRequests');
const contactsRouter = require('./routes/contacts');
const themesRouter = require('./routes/themes');

const app = express();
const PORT = process.env.PORT || 5000;

const corsExtra = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(function (s) { return s.trim(); })
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  process.env.FRONTEND_URL
].filter(Boolean).concat(corsExtra);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'"], // Required for @spaceymonk/react-radial-menu
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Framer Motion
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: null
    }
  },
  hsts: false
}));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));
app.use(express.json());

// Container / load balancer health (plain)
app.get('/health', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
  res.json({ message: 'Trust Network API', version: '1.0.0' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/profile', requireAuth, profileRouter);
app.use('/api/connections', requireAuth, connectionsRouter);
app.use('/api/connection-requests', requireAuth, connectionRequestsRouter);
app.use('/api/contacts', requireAuth, contactsRouter);
app.use('/api/themes', themesRouter);

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('API listening on http://localhost:' + PORT);
  });
}

module.exports = app;
