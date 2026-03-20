import os from 'os';
import path from 'path';
import fs from 'fs';

const HOME = os.homedir();

/**
 * Provider registry — the source of truth for supported agent/skill providers.
 * Adding a new provider = add an entry here + create an importer file.
 */
export const PROVIDERS = {
  openclaw: {
    id: 'openclaw',
    name: 'OpenClaw',
    icon: 'terminal',
    color: '#a855f7',
    capabilities: ['cron', 'skills', 'channels', 'heartbeat', 'agents'],
    importAvailable: true,
    defaultPaths: {
      darwin: path.join(HOME, '.openclaw'),
      win32: path.join(HOME, '.openclaw'),
      linux: path.join(HOME, '.openclaw'),
    },
  },
  'claude-desktop': {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    icon: 'monitor',
    color: '#d97706',
    capabilities: ['scheduled-tasks', 'skills', 'mcp-servers', 'connectors'],
    importAvailable: true,
    defaultPaths: {
      darwin: path.join(HOME, 'Library', 'Application Support', 'Claude'),
      win32: path.join(process.env.APPDATA || '', 'Claude'),
      linux: path.join(HOME, '.config', 'Claude'),
    },
  },
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    icon: 'code',
    color: '#3b82f6',
    capabilities: ['skills', 'sessions', 'mcp-servers', 'projects'],
    importAvailable: true,
    defaultPaths: {
      darwin: path.join(HOME, '.claude'),
      win32: path.join(HOME, '.claude'),
      linux: path.join(HOME, '.claude'),
    },
  },
};

/**
 * Get the default path for a provider on the current OS.
 */
export function getDefaultPath(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;
  return provider.defaultPaths[process.platform] || null;
}

/**
 * Check if a provider is available at its default or a custom path.
 * @returns {{ available: boolean, detectedPath: string|null }}
 */
export function detectProvider(providerId, customPath) {
  const checkPath = customPath || getDefaultPath(providerId);
  if (!checkPath) return { available: false, detectedPath: null };

  const resolved = checkPath.startsWith('~')
    ? path.join(HOME, checkPath.slice(1))
    : checkPath;

  const available = fs.existsSync(resolved);
  return { available, detectedPath: available ? resolved : null };
}

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

export function getImporters() {
  return Object.values(PROVIDERS).filter(p => p.importAvailable);
}
