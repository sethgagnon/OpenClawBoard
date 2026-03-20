import fs from 'fs';
import path from 'path';
import { OPENCLAW_DIR, WORKSPACE } from '../../config.js';
import { readJSON } from '../../lib/fileStore.js';
import { getItems, setItems } from '../../lib/registryStore.js';
import { logActivity } from '../../lib/fileStore.js';
import { broadcast } from '../../broadcast.js';
import { describeSchedule, resolveSchedule } from '../../lib/schedule.js';
import { scanSkillDirectories } from '../../lib/skillParser.js';
import { detectProvider } from '../../lib/providers.js';

const CRON_DIR = path.join(OPENCLAW_DIR, 'cron');
const JOBS_FILE = path.join(CRON_DIR, 'jobs.json');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');
const MANAGED_SKILLS_DIR = path.join(OPENCLAW_DIR, 'skills');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function scanSkills() {
  return scanSkillDirectories([
    { dir: SKILLS_DIR, source: 'workspace' },
    { dir: MANAGED_SKILLS_DIR, source: 'managed' },
  ]);
}

// ─── Cron Job Loader ───

function loadJobs() {
  const raw = readJSON(JOBS_FILE, []);
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.jobs)) return raw.jobs;
  return [];
}

// ─── Cross-reference crons ↔ skills ───

function matchSkillToCron(job, skills) {
  const text = job.payload?.text || job.payload?.message || '';
  for (const skill of skills) {
    // Match by path reference in payload
    if (skill.path && text.includes(path.basename(skill.path))) return skill;
    if (skill.path && text.includes(skill.path)) return skill;
    // Match by name reference
    if (skill.name && text.toLowerCase().includes(skill.name.toLowerCase())) return skill;
  }
  return null;
}

function normalizeExpression(job) {
  if (typeof job.schedule === 'string') return job.schedule;
  if (job.schedule?.expr) return job.schedule.expr;
  return null;
}

// ─── Endpoints ───

export function importStatus(req, res) {
  try {
    const available = fs.existsSync(OPENCLAW_DIR);
    let cronCount = 0;
    let skillCount = 0;

    if (available) {
      cronCount = loadJobs().length;
      skillCount = scanSkills().length;
    }

    res.json({
      available,
      openclawDir: OPENCLAW_DIR,
      cronCount,
      skillCount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function scanOpenClaw(req, res) {
  try {
    const jobs = loadJobs();
    const skills = scanSkills();
    const existing = getItems();

    // Build a set of already-imported cron keys and skill paths
    const importedCronKeys = new Set();
    const importedSkillPaths = new Set();
    for (const a of existing) {
      const oc = a.platforms?.openclaw;
      if (oc?.cronKey) importedCronKeys.add(oc.cronKey);
      if (oc?.skillPath) importedSkillPaths.add(oc.skillPath);
    }

    const proposed = [];
    const matchedSkillPaths = new Set();

    // Process cron jobs
    for (const job of jobs) {
      const expr = normalizeExpression(job);
      const matchedSkill = matchSkillToCron(job, skills);
      if (matchedSkill) matchedSkillPaths.add(matchedSkill.path);

      const cronKey = job.id || job.name;
      const alreadyImported = importedCronKeys.has(cronKey);

      proposed.push({
        _source: 'cron',
        _alreadyImported: alreadyImported,
        _skillContent: matchedSkill?.content || null,
        name: job.name || job.id,
        description: job.description || job.payload?.text?.slice(0, 200) || '',
        kind: 'scheduled-automation',
        provider: 'openclaw',
        category: 'scheduled-automation',
        schedule: expr ? {
          cron: expr,
          humanReadable: describeSchedule(job.schedule),
          timezone: job.schedule?.tz || null,
        } : null,
        tags: [],
        platforms: {
          openclaw: {
            status: job.enabled ? 'active' : 'inactive',
            cronKey,
            skillPath: matchedSkill?.path || null,
            agentId: job.agentId || job.sessionTarget || null,
            model: null,
            lastRun: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
            lastStatus: job.state?.lastStatus || null,
            wakeMode: job.wakeMode || null,
            delivery: job.delivery || null,
          },
          'claude-desktop': {
            status: 'not-migrated',
          },
        },
      });
    }

    // Orphan skills (not referenced by any cron)
    for (const skill of skills) {
      if (matchedSkillPaths.has(skill.path)) continue;
      const alreadyImported = importedSkillPaths.has(skill.path);

      proposed.push({
        _source: 'skill',
        _alreadyImported: alreadyImported,
        _skillContent: skill.content,
        name: skill.name,
        description: skill.description || skill.title || '',
        kind: 'skill',
        provider: 'openclaw',
        category: skill.type === 'script' ? 'script' : 'skill',
        schedule: null,
        tags: [],
        platforms: {
          openclaw: {
            status: 'active',
            cronKey: null,
            skillPath: skill.path,
            agentId: null,
            model: null,
            lastRun: null,
            lastStatus: null,
          },
          'claude-desktop': {
            status: 'not-migrated',
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

    // Ensure skill-cache directory exists
    const cacheDir = path.join(path.dirname(JOBS_FILE), '..', '..', '.openclawboard', 'skill-cache');
    const actualCacheDir = path.join(OPENCLAW_DIR, '..', '.openclawboard', 'skill-cache');
    if (!fs.existsSync(actualCacheDir)) {
      fs.mkdirSync(actualCacheDir, { recursive: true });
    }

    for (const entry of selected) {
      const id = generateId();

      // Cache skill content for exporter
      if (entry._skillContent) {
        const cachePath = path.join(actualCacheDir, `${id}.md`);
        fs.writeFileSync(cachePath, entry._skillContent);
      }

      // Strip internal fields
      const item = {
        id,
        name: entry.name,
        description: entry.description,
        kind: entry.kind || 'skill',
        provider: entry.provider || 'openclaw',
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

    logActivity('user', 'registry.imported', { platform: 'openclaw', count: imported.length });
    broadcast('registry:imported', { platform: 'openclaw', count: imported.length });

    res.status(201).json({
      imported: imported.length,
      ids: imported.map(i => i.id),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
