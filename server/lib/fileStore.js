import fs from 'fs';
import path from 'path';

export function readJSON(filePath, fallback = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.warn(`Failed to read ${filePath}:`, e.message);
  }
  return fallback;
}

export function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// Convenience wrappers for common data files
import {
  TASKS_FILE, ACTIVITY_FILE, HEARTBEAT_FILE,
  SETTINGS_FILE, NOTIFICATIONS_FILE,
} from '../config.js';

export function readTasks() { return readJSON(TASKS_FILE, []); }
export function writeTasks(tasks) { writeJSON(TASKS_FILE, tasks); }

export function readActivity() { return readJSON(ACTIVITY_FILE, []); }
export function writeActivity(activity) { writeJSON(ACTIVITY_FILE, activity); }

export function readHeartbeat() { return readJSON(HEARTBEAT_FILE, {}); }
export function writeHeartbeat(data) { writeJSON(HEARTBEAT_FILE, data); }

export function readSettings() { return readJSON(SETTINGS_FILE, {}); }
export function writeSettings(data) { writeJSON(SETTINGS_FILE, data); }

export function readNotifications() { return readJSON(NOTIFICATIONS_FILE, []); }
export function writeNotifications(data) { writeJSON(NOTIFICATIONS_FILE, data); }

export function logActivity(actor, action, details = {}) {
  const activity = readActivity();
  activity.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    actor,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
  // Keep last 1000 entries
  if (activity.length > 1000) activity.length = 1000;
  writeActivity(activity);
}
