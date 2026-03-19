import { readHeartbeat, writeHeartbeat } from '../lib/fileStore.js';
import { readOpenclawJson } from '../config.js';
import { OPENCLAW_DIR } from '../config.js';
import { broadcast } from '../broadcast.js';
import { logActivity } from '../lib/fileStore.js';
import fs from 'fs';
import path from 'path';

const KNOWN_MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
];

export function listModels(req, res) {
  try {
    const config = readOpenclawJson();
    const currentModel = config?.model || config?.agents?.defaults?.model || null;
    const heartbeat = readHeartbeat();

    const models = KNOWN_MODELS.map(m => ({
      ...m,
      active: m.id === currentModel,
    }));

    // If current model is not in known list, add it
    if (currentModel && !models.find(m => m.id === currentModel)) {
      models.unshift({ id: currentModel, name: currentModel, provider: 'unknown', active: true });
    }

    res.json({ models, current: currentModel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function setModel(req, res) {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model is required' });

    const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
    let config = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch {}

    config.model = model;
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    logActivity('user', 'model.changed', { model });
    broadcast('model:changed', { model });
    res.json({ ok: true, model });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getHeartbeat(req, res) {
  try {
    const heartbeat = readHeartbeat();
    const now = Date.now();
    const lastSeen = heartbeat.timestamp ? new Date(heartbeat.timestamp).getTime() : 0;
    const alive = lastSeen > 0 && (now - lastSeen) < 60000; // alive if seen within 60s

    res.json({
      ...heartbeat,
      alive,
      agoMs: lastSeen ? now - lastSeen : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function postHeartbeat(req, res) {
  try {
    const data = {
      ...req.body,
      timestamp: new Date().toISOString(),
    };
    writeHeartbeat(data);
    broadcast('heartbeat', data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
