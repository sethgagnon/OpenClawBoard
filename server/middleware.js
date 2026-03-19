import express from 'express';
import cors from 'cors';
import path from 'path';
import { __dirname } from './config.js';
import { setupAuth, authGuard, authRoutes } from './auth.js';

export function setupMiddleware(app) {
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  app.use(express.json({ limit: '5mb' }));

  // Session & auth
  setupAuth(app);
  app.use(authRoutes);
  app.use(authGuard);

  // Serve built frontend in production
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
}
