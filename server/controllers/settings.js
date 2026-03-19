import { readSettings, writeSettings } from '../lib/fileStore.js';
import { logActivity } from '../lib/fileStore.js';
import { broadcast } from '../broadcast.js';

const ALLOWED_KEYS = new Set([
  'timezone', 'theme', 'maxConcurrency', 'autoRefresh', 'refreshInterval',
  'notifications', 'compactMode', 'defaultPriority', 'defaultView',
  'terminalEnabled', 'costAlertThreshold', 'subscriptionMode', 'subscriptionProviders', 'timeFormat', 'webhookToken', 'autoDispatchTodo',
]);

export function getSettings(req, res) {
  try {
    const settings = readSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function postSettings(req, res) {
  try {
    const current = readSettings();
    const updates = req.body;

    // Merge only allowed keys
    const changes = [];
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_KEYS.has(key)) {
        current[key] = value;
        changes.push(key);
      }
    }

    current.updatedAt = new Date().toISOString();
    writeSettings(current);

    if (changes.length > 0) {
      logActivity('user', 'settings.updated', { keys: changes });
      broadcast('settings:updated', current);
    }

    res.json(current);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
