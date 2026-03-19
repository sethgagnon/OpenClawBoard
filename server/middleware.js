import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { __dirname } from './config.js';
import { setupAuth, authGuard, authRoutes } from './auth.js';
import { readSettings } from './lib/fileStore.js';
import { readTasks, writeTasks, logActivity } from './lib/fileStore.js';
import { broadcast } from './broadcast.js';
import { dispatchTask } from './lib/taskDispatcher.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function setupMiddleware(app) {
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  app.use(express.json({ limit: '5mb' }));

  // ── Webhook endpoint (pre-auth, token-validated) ──
  app.post('/api/webhook/tasks', (req, res) => {
    const settings = readSettings();
    const webhookToken = settings.webhookToken;

    // Validate token from Authorization header or query param
    const authHeader = req.headers.authorization;
    const providedToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.query.token;

    if (!webhookToken || !providedToken || webhookToken !== providedToken) {
      return res.status(401).json({ error: 'Invalid or missing webhook token' });
    }

    const { title, description, priority, status, channel, sender, autoDispatch } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const tasks = readTasks();
    const now = new Date().toISOString();
    const task = {
      id: generateId(),
      title: title.trim(),
      description: description || '',
      priority: priority || 'medium',
      skill: null,
      skills: [],
      status: status || 'todo',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      schedule: null,
      scheduledAt: null,
      scheduleEnabled: false,
      runHistory: [],
      result: null,
      startedAt: null,
      error: null,
      order: tasks.length,
      pickedUp: false,
      subagentId: null,
      source: { type: 'webhook', channel: channel || 'unknown', sender: sender || null },
    };

    tasks.push(task);
    writeTasks(tasks);
    logActivity(sender || 'webhook', 'task.created', {
      taskId: task.id,
      title: task.title,
      channel: channel || 'webhook',
    });
    broadcast('task:created', task);

    // Auto-dispatch if requested
    if (autoDispatch) {
      const result = dispatchTask(task.id);
      return res.status(201).json({ task, dispatch: result });
    }

    res.status(201).json({ task });
  });

  // Session & auth
  setupAuth(app);
  app.use(authRoutes);
  app.use(authGuard);

  // Serve built frontend in production
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
}
