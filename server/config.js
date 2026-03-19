import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const __dirname = ROOT_DIR;
export const HOME = os.homedir();

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return HOME;
  if (input.startsWith('~/')) return path.join(HOME, input.slice(2));
  return input;
}

function normalizeDir(input) {
  return path.resolve(expandHome(input));
}

function resolvePathExecutable(name) {
  const pathEnv = process.env.PATH || '';
  for (const segment of pathEnv.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(segment, name);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return fs.realpathSync(candidate);
      }
    } catch {}
  }
  return null;
}

function inferOpenclawInstallRoot(executablePath) {
  if (!executablePath) return null;
  let current = path.dirname(executablePath);
  const visited = new Set();
  let depth = 0;
  while (true) {
    const normalized = path.resolve(current);
    if (visited.has(normalized) || depth > 1024) break;
    visited.add(normalized);
    depth += 1;
    const base = path.basename(current);
    const parent = path.dirname(current);
    if (base === 'openclaw' && path.basename(parent) === 'node_modules') {
      return current;
    }
    if (current === parent) break;
    current = parent;
  }
  return null;
}

function uniqueExistingDirs(candidates) {
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate) continue;
    let resolved;
    try {
      resolved = fs.realpathSync(normalizeDir(candidate));
    } catch {
      continue;
    }
    if (!fs.existsSync(resolved)) continue;
    if (!fs.statSync(resolved).isDirectory()) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    unique.push(resolved);
  }
  return unique;
}

// --- Configurable values ---

const parsedPort = Number.parseInt(process.env.PORT || '', 10);
export const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3333;
export const HOST = process.env.HOST || '127.0.0.1';

export const OPENCLAW_DIR = normalizeDir(process.env.OPENCLAW_DIR || path.join(HOME, '.openclaw'));
export const OPENCLAW_JSON = path.join(OPENCLAW_DIR, 'openclaw.json');

// Data directory for OpenClawBoard runtime data
export const DATA_DIR = normalizeDir(process.env.OPENCLAWBOARD_DATA || path.join(HOME, '.openclawboard'));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Read workspace from OpenClaw config
let WORKSPACE_FROM_CONFIG = null;
try {
  if (fs.existsSync(OPENCLAW_JSON)) {
    const openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    WORKSPACE_FROM_CONFIG = openclawConfig?.agents?.defaults?.workspace;
  }
} catch (e) {
  console.warn('Failed to read workspace from openclaw.json:', e.message);
}

export const WORKSPACE = WORKSPACE_FROM_CONFIG
  ? normalizeDir(WORKSPACE_FROM_CONFIG)
  : path.join(OPENCLAW_DIR, 'workspace');

// Data file paths (stored in ~/.openclawboard/)
export const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
export const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
export const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.json');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
export const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
export const SUGGESTIONS_HISTORY_FILE = path.join(DATA_DIR, 'suggestions-history.json');
export const REGISTRY_FILE = path.join(DATA_DIR, 'agent-registry.json');

// Skill directories
const inferredOpenclawRoot = inferOpenclawInstallRoot(resolvePathExecutable('openclaw'));

export const BUNDLED_SKILLS_DIRS = uniqueExistingDirs([
  process.env.OPENCLAW_BUNDLED_SKILLS_DIR || null,
  inferredOpenclawRoot ? path.join(inferredOpenclawRoot, 'skills') : null,
  '/usr/lib/node_modules/openclaw/skills',
  '/usr/local/lib/node_modules/openclaw/skills',
  '/opt/homebrew/lib/node_modules/openclaw/skills',
  path.join(HOME, '.npm-global', 'lib', 'node_modules', 'openclaw', 'skills'),
]);

export const SKILLS_DIRS = {
  bundled: BUNDLED_SKILLS_DIRS[0] || '/usr/lib/node_modules/openclaw/skills',
  managed: path.join(OPENCLAW_DIR, 'skills'),
  workspace: path.join(WORKSPACE, 'skills'),
};

export const SKILL_SCAN_DIRS = {
  bundled: BUNDLED_SKILLS_DIRS.length > 0 ? BUNDLED_SKILLS_DIRS : [SKILLS_DIRS.bundled],
  managed: [SKILLS_DIRS.managed],
  workspace: [SKILLS_DIRS.workspace],
};

export const EXCLUDED = new Set(['node_modules', '.git']);

// Read openclaw.json helper
export function readOpenclawJson() {
  try {
    if (fs.existsSync(OPENCLAW_JSON)) {
      return JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    }
  } catch {}
  return {};
}
