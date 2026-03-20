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
 * Scan Claude Code skills from ~/.claude/skills/
 */
function scanCodeSkills(basePath) {
  const skillsDir = path.join(basePath, 'skills');
  return scanSkillDirectories([
    { dir: skillsDir, source: 'claude-code' },
  ]);
}

/**
 * Scan Claude Code settings for MCP servers.
 */
function scanMcpServers(basePath) {
  const settingsFile = path.join(basePath, 'settings.json');
  const settings = readJSONSafe(settingsFile);
  if (!settings) return [];

  const servers = [];
  const mcpServers = settings.mcpServers || {};

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
      source: 'claude-code-settings',
    });
  }

  return servers;
}

/**
 * Scan Claude Code projects for project-level CLAUDE.md files.
 */
function scanProjects(basePath) {
  const projectsDir = path.join(basePath, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  const projects = [];
  try {
    for (const entry of fs.readdirSync(projectsDir)) {
      if (entry.startsWith('.')) continue;
      const entryPath = path.join(projectsDir, entry);
      if (!fs.statSync(entryPath).isDirectory()) continue;

      // Check for CLAUDE.md in the project directory
      const claudeMd = path.join(entryPath, 'CLAUDE.md');
      if (fs.existsSync(claudeMd)) {
        const content = fs.readFileSync(claudeMd, 'utf-8');
        const firstLine = content.split('\n')[0].replace(/^#\s+/, '').trim();

        projects.push({
          type: 'project',
          name: entry,
          title: firstLine || entry,
          description: `Claude Code project: ${entry}`,
          path: claudeMd,
          content,
          source: 'claude-code-project',
        });
      }

      // Also check for project-level skills
      const projectSkillsDir = path.join(entryPath, 'skills');
      if (fs.existsSync(projectSkillsDir)) {
        const skills = scanSkillDirectories([
          { dir: projectSkillsDir, source: `project:${entry}` },
        ]);
        projects.push(...skills.map(s => ({
          ...s,
          type: 'skill',
          source: `project:${entry}`,
        })));
      }
    }
  } catch {}

  return projects;
}

// ─── Endpoints ───

export function importStatus(req, res) {
  try {
    const customPath = req.query.path || null;
    const { available, detectedPath } = detectProvider('claude-code', customPath);

    let skillCount = 0;
    let mcpServerCount = 0;
    let projectCount = 0;

    if (available && detectedPath) {
      skillCount = scanCodeSkills(detectedPath).length;
      mcpServerCount = scanMcpServers(detectedPath).length;
      projectCount = scanProjects(detectedPath).filter(p => p.type === 'project').length;
    }

    res.json({
      available,
      detectedPath,
      defaultPath: getDefaultPath('claude-code'),
      skillCount,
      mcpServerCount,
      projectCount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function scanClaudeCode(req, res) {
  try {
    const customPath = req.body.path || req.query.path || null;
    const { available, detectedPath } = detectProvider('claude-code', customPath);

    if (!available) {
      return res.status(400).json({
        error: 'Claude Code config not found. Provide a custom path.',
        defaultPath: getDefaultPath('claude-code'),
      });
    }

    const skills = scanCodeSkills(detectedPath);
    const mcpServers = scanMcpServers(detectedPath);
    const projects = scanProjects(detectedPath);
    const existing = getItems();

    // Track already imported
    const importedKeys = new Set();
    for (const a of existing) {
      if (a.provider === 'claude-code') {
        importedKeys.add(`${a.kind}:${a.name}`);
      }
    }

    const proposed = [];

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
        provider: 'claude-code',
        category: 'skill',
        schedule: null,
        tags: [],
        platforms: {
          'claude-code': {
            status: 'active',
            skillPath: skill.path,
            source: skill.source,
          },
        },
      });
    }

    // MCP servers
    for (const server of mcpServers) {
      const key = `agent:${server.name}`;
      proposed.push({
        _source: 'mcp-server',
        _alreadyImported: importedKeys.has(key),
        name: server.name,
        description: server.description,
        kind: 'agent',
        provider: 'claude-code',
        category: 'mcp-server',
        schedule: null,
        tags: ['mcp'],
        platforms: {
          'claude-code': {
            status: 'active',
            type: 'mcp-server',
            command: server.config.command,
            args: server.config.args,
          },
        },
      });
    }

    // Project skills
    for (const proj of projects) {
      if (proj.type === 'skill') {
        const key = `skill:${proj.name}`;
        if (importedKeys.has(key)) continue;
        proposed.push({
          _source: 'project-skill',
          _alreadyImported: false,
          _skillContent: proj.content,
          name: proj.name,
          description: proj.description || proj.title || '',
          kind: 'skill',
          provider: 'claude-code',
          category: 'skill',
          schedule: null,
          tags: ['project'],
          platforms: {
            'claude-code': {
              status: 'active',
              skillPath: proj.path,
              source: proj.source,
            },
          },
        });
      }
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

      if (entry._skillContent) {
        fs.writeFileSync(path.join(SKILL_CACHE_DIR, `${id}.md`), entry._skillContent);
      }

      const item = {
        id,
        name: entry.name,
        description: entry.description,
        kind: entry.kind || 'skill',
        provider: entry.provider || 'claude-code',
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

    logActivity('user', 'agentcare.imported', { provider: 'claude-code', count: imported.length });
    broadcast('agentcare:imported', { provider: 'claude-code', count: imported.length });

    res.status(201).json({
      imported: imported.length,
      ids: imported.map(i => i.id),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
