import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { AUTH_FILE } from './config.js';
import { readJSON, writeJSON } from './lib/fileStore.js';

/**
 * Configure express-session middleware and mount it on the app.
 */
export function setupAuth(app) {
  const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

  app.use(
    session({
      secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );
}

/**
 * Middleware that enforces authentication on all routes except /api/auth/*.
 * When DISABLE_AUTH env var is 'true', all requests pass through.
 */
export function authGuard(req, res, next) {
  // Bypass auth entirely when disabled
  if (process.env.DISABLE_AUTH === 'true') {
    return next();
  }

  // Always allow auth-related routes
  if (req.path.startsWith('/api/auth/') || req.path.startsWith('/api/auth')) {
    return next();
  }

  // Allow non-API routes (frontend SPA pages served as static files)
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  // Check session
  if (req.session && req.session.isAuthenticated) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Login rate limiter: 5 attempts per 15 minutes per IP.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

/**
 * Auth routes router.
 */
export const authRoutes = Router();

// GET /api/auth/status
authRoutes.get('/api/auth/status', (req, res) => {
  const authData = readJSON(AUTH_FILE, null);
  const needsSetup = !authData || !authData.passwordHash;
  const authenticated =
    process.env.DISABLE_AUTH === 'true' ||
    (req.session && req.session.isAuthenticated === true);

  res.json({ authenticated, needsSetup });
});

// POST /api/auth/setup
authRoutes.post('/api/auth/setup', async (req, res) => {
  try {
    const authData = readJSON(AUTH_FILE, null);
    if (authData && authData.passwordHash) {
      return res.status(400).json({ error: 'Password already configured. Use login instead.' });
    }

    const { password } = req.body;
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const passwordHash = await bcryptjs.hash(password, 12);
    writeJSON(AUTH_FILE, { passwordHash, createdAt: new Date().toISOString() });

    req.session.isAuthenticated = true;
    res.json({ success: true });
  } catch (err) {
    console.error('Auth setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
authRoutes.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const authData = readJSON(AUTH_FILE, null);
    if (!authData || !authData.passwordHash) {
      return res.status(400).json({ error: 'No password configured. Complete setup first.' });
    }

    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const valid = await bcryptjs.compare(password, authData.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    req.session.isAuthenticated = true;
    res.json({ success: true });
  } catch (err) {
    console.error('Auth login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
authRoutes.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});
