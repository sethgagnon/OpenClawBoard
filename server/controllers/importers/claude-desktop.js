import fs from 'fs';
import path from 'path';
import os from 'os';
import { getItems, setItems } from '../../lib/registryStore.js';
import { logActivity } from '../../lib/fileStore.js';
import { broadcast } from '../../broadcast.js';
import { scanSkillDirectories, parseFrontmatter } from '../../lib/skillParser.js';
import { detectProvider, getDefaultPath } from '../../lib/providers.js';

const HOME = os.homedir();
const DATA_DIR = process.env.OPENCLAWBOARD_DATA || path.join(HOME, '.openclawboard');
const SKILL_CACHE_DIR = path.join(DATA_DIR, 'skill-cache');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function readJSONSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return null;
}

/**
 * Scan Claude Desktop config for MCP servers.
 */
function scanMcpServers(configPath) {
  const configFile = path.join(configPath, 'claude_desktop_config.json');
  const config = readJSONSafe(configFile);
  if (!config) return [];

  const servers = [];
  const mcpServers = config.mcpServers || {};

  for (const [name, serverConfig] of Object.entries(mcpServers)) {
    servers.push({
      type: 'mcp-server',
      name,
      title: name,
      description: `MCP server: ${serverConfig.command || name}`,
      config: {
        command: serverConfig.command,
        args: serverConfig.args || [],
      },
      source: 'claude-desktop-config',
    });
  }

  return servers;
}

/**
 * Scan Claude shared skills directory (~/.claude/skills/).
 */
function scanClaudeSkills() {
  const skillsDir = path.join(HOME, '.claude', 'skills');
  return scanSkillDirectories([
    { dir: skillsDir, source: 'claude-shared' },
  ]);
}

// ─── Endpoints ───

export function importStatus(req, res) {
  try {
    const customPath = req.query.path || null;
    const { available, detectedPath } = detectProvider('claude-desktop', customPath);

    let mcpServerCount = 0;
    let skillCount = 0;

    if (available && detectedPath) {
      mcpServerCount = scanMcpServers(detectedPath).length;
      skillCount = scanClaudeSkills().length;
    }

    res.json({
      available,
      detectedPath,
      defaultPath: getDefaultPath('claude-desktop'),
      mcpServerCount,
      skillCount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function scanClaudeDesktop(req, res) {
  try {
    const customPath = req.body.path || req.query.path || null;
    const { available, detectedPath } = detectProvider('claude-desktop', customPath);

    if (!available) {
      return res.status(400).json({
        error: 'Claude Desktop not found. Provide a custom path.',
        defaultPath: getDefaultPath('claude-desktop'),
      });
    }

    const mcpServers = scanMcpServers(detectedPath);
    const skills = scanClaudeSkills();
    const existing = getItems();

    // Track already imported by name + provider
    const importedKeys = new Set();
    for (const a of existing) {
      if (a.provider === 'claude-desktop') {
        importedKeys.add(`${a.kind}:${a.name}`);
      }
    }

    const proposed = [];

    // MCP servers as items
    for (const server of mcpServers) {
      const key = `mcp-server:${server.name}`;
      proposed.push({
        _source: 'mcp-server',
        _alreadyImported: importedKeys.has(key),
        name: server.name,
        description: server.description,
        kind: 'agent',
        provider: 'claude-desktop',
        category: 'mcp-server',
        schedule: null,
        tags: ['mcp'],
        platforms: {
          'claude-desktop': {
            status: 'active',
            type: 'mcp-server',
            command: server.config.command,
            args: server.config.args,
          },
        },
      });
    }

    // Skills
    for (const skill of skills) {
      const key = `skill:${skill.name}`;
      proposed.push({
        _source: 'skill',
        _alreadyImported: importedKeys.has(key),
        _skillContent: skill.content,
        name: skill.name,
        description: skill.description || skill.title || '',
        kind: 'skill',
        provider: 'claude-desktop',
        category: 'skill',
        schedule: null,
        tags: [],
        platforms: {
          'claude-desktop': {
            status: 'active',
            skillPath: skill.path,
          },
        },
      });
    }

    const alreadyImported = proposed.filter(p => p._alreadyImported);
    const newProposed = proposed.filter(p => !p._alreadyImported);

    res.json({
      proposed: newProposed,
      alreadyImported: alreadyImported.length,
      total: proposed.length,
      detectedPath,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function confirmImport(req, res) {
  try {
    const { selected } = req.body;
    if (!Array.isArray(selected) || selected.length === 0) {
      return res.status(400).json({ error: 'selected must be a non-empty array' });
    }

    const items = getItems();
    const now = new Date().toISOString();
    const imported = [];

    if (!fs.existsSync(SKILL_CACHE_DIR)) {
      fs.mkdirSync(SKILL_CACHE_DIR, { recursive: true });
    }

    for (const entry of selected) {
      const id = generateId();

      // Cache skill content
      if (entry._skillContent) {
        fs.writeFileSync(path.join(SKILL_CACHE_DIR, `${id}.md`), entry._skillContent);
      }

      const item = {
        id,
        name: entry.name,
        description: entry.description,
        kind: entry.kind || 'skill',
        provider: entry.provider || 'claude-desktop',
        category: entry.category || 'general',
        schedule: entry.schedule || null,
        inputs: entry.inputs || [],
        outputs: entry.outputs || [],
        dependencies: entry.dependencies || { tools: [], connectors: [], env_vars: [] },
        platforms: entry.platforms || {},
        tags: entry.tags || [],
        createdAt: now,
        updatedAt: now,
      };

      items.push(item);
      imported.push(item);
    }

    setItems(items);

    logActivity('user', 'agentcare.imported', { provider: 'claude-desktop', count: imported.length });
    broadcast('agentcare:imported', { provider: 'claude-desktop', count: imported.length });

    res.status(201).json({
      imported: imported.length,
      ids: imported.map(i => i.id),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
