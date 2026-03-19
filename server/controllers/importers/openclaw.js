import fs from 'fs';
import path from 'path';
import { OPENCLAW_DIR, WORKSPACE } from '../../config.js';
import { readJSON } from '../../lib/fileStore.js';
import { getAutomations, setAutomations } from '../../lib/registryStore.js';
import { logActivity } from '../../lib/fileStore.js';
import { broadcast } from '../../broadcast.js';
import { describeSchedule, resolveSchedule } from '../../lib/schedule.js';

const CRON_DIR = path.join(OPENCLAW_DIR, 'cron');
const JOBS_FILE = path.join(CRON_DIR, 'jobs.json');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');
const MANAGED_SKILLS_DIR = path.join(OPENCLAW_DIR, 'skills');
const EXCLUDED = new Set(['node_modules', '.git', '__pycache__', '.venv']);

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── YAML Frontmatter Parser (regex-based, no dependency) ───

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: {}, body: content };

  const body = content.slice(match[0].length).trim();
  const yaml = match[1];
  const frontmatter = {};

  let currentKey = null;
  let currentIndent = 0;

  for (const line of yaml.split('\n')) {
    // Top-level key: value
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const [, key, rawVal] = kvMatch;
      let val = rawVal.trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Inline array
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      }
      // Multi-line indicator
      if (val === '|' || val === '>') {
        frontmatter[key] = '';
        currentKey = key;
        currentIndent = 2;
        continue;
      }
      frontmatter[key] = val || true;
      currentKey = null;
      continue;
    }

    // Continuation of multi-line value
    if (currentKey && line.startsWith(' ')) {
      frontmatter[currentKey] += (frontmatter[currentKey] ? '\n' : '') + line.trim();
      continue;
    }

    // Array items (- value)
    if (currentKey && line.match(/^\s+-\s+/)) {
      if (!Array.isArray(frontmatter[currentKey])) frontmatter[currentKey] = [];
      frontmatter[currentKey].push(line.replace(/^\s+-\s+/, '').trim());
    }
  }

  return { frontmatter, body };
}

// ─── Skill Scanner ───

function scanSkills() {
  const skills = [];

  for (const dir of [SKILLS_DIR, MANAGED_SKILLS_DIR]) {
    if (!fs.existsSync(dir)) continue;

    try {
      for (const entry of fs.readdirSync(dir)) {
        if (EXCLUDED.has(entry) || entry.startsWith('.')) continue;
        const entryPath = path.join(dir, entry);
        const stat = fs.statSync(entryPath);

        if (stat.isDirectory()) {
          // Directory-based skill with SKILL.md
          const skillFile = path.join(entryPath, 'SKILL.md');
          if (fs.existsSync(skillFile)) {
            const content = fs.readFileSync(skillFile, 'utf-8');
            const { frontmatter, body } = parseFrontmatter(content);
            const titleMatch = body.match(/^#\s+(.+)/m);

            skills.push({
              type: 'skill-dir',
              name: frontmatter.name || entry,
              title: titleMatch ? titleMatch[1].trim() : frontmatter.name || entry,
              description: frontmatter.description || '',
              path: skillFile,
              dirPath: entryPath,
              frontmatter,
              content,
              source: dir === SKILLS_DIR ? 'workspace' : 'managed',
            });
          }
        } else if (entry.endsWith('.md') && stat.isFile()) {
          // Flat .md skill
          const content = fs.readFileSync(entryPath, 'utf-8');
          const { frontmatter, body } = parseFrontmatter(content);
          const titleMatch = body.match(/^#\s+(.+)/m);
          const name = entry.replace(/\.md$/, '');

          skills.push({
            type: 'skill-md',
            name: frontmatter.name || name,
            title: titleMatch ? titleMatch[1].trim() : name,
            description: frontmatter.description || '',
            path: entryPath,
            dirPath: null,
            frontmatter,
            content,
            source: dir === SKILLS_DIR ? 'workspace' : 'managed',
          });
        } else if (entry.endsWith('.py') && stat.isFile()) {
          // Python script skill
          skills.push({
            type: 'script',
            name: entry.replace(/\.py$/, ''),
            title: entry.replace(/\.py$/, '').replace(/-/g, ' '),
            description: `Python script: ${entry}`,
            path: entryPath,
            dirPath: null,
            frontmatter: {},
            content: null,
            source: dir === SKILLS_DIR ? 'workspace' : 'managed',
          });
        }
      }
    } catch {}
  }

  return skills;
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
    const existing = getAutomations();

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

    const items = getAutomations();
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

    setAutomations(items);

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
