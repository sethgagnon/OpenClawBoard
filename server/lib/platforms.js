/**
 * Platform registry — the source of truth for supported platforms.
 * Adding a new platform = add an entry here + create an importer/exporter file.
 */
export const PLATFORMS = {
  openclaw: {
    id: 'openclaw',
    name: 'OpenClaw',
    icon: 'terminal',
    color: '#a855f7',
    capabilities: ['cron', 'skills', 'channels', 'heartbeat', 'agents'],
    importAvailable: true,
    exportAvailable: false,
  },
  'claude-desktop': {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    icon: 'monitor',
    color: '#d97706',
    capabilities: ['scheduled-tasks', 'skills', 'dispatch', 'connectors'],
    importAvailable: false,
    exportAvailable: true,
    localRequirements: [
      'Claude Desktop app must be open',
      'Computer must be awake for scheduled tasks',
      'Connectors must be enabled in Desktop settings for integrations',
      'Dispatch requires Claude Desktop + Claude mobile app',
    ],
    exportArtifacts: ['scheduled-task', 'skill', 'dispatch', 'gaps'],
  },
};

export function getPlatform(id) {
  return PLATFORMS[id] || null;
}

export function getImporters() {
  return Object.values(PLATFORMS).filter(p => p.importAvailable);
}

export function getExporters() {
  return Object.values(PLATFORMS).filter(p => p.exportAvailable);
}
