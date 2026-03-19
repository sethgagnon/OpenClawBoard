import fs from 'fs';
import path from 'path';
import { SKILL_SCAN_DIRS, SKILLS_DIRS, EXCLUDED } from '../config.js';
import { logActivity } from '../lib/fileStore.js';
import { broadcast } from '../broadcast.js';

function scanSkillsInDirs(dirs, source) {
  const skills = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (EXCLUDED.has(entry)) continue;
        const skillDir = path.join(dir, entry);
        if (!fs.statSync(skillDir).isDirectory()) continue;
        const skillFile = path.join(skillDir, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;

        const content = fs.readFileSync(skillFile, 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)/m);
        const descMatch = content.match(/^(?:#+\s+.+\n+)?(.+)/m);

        // Check for disabled marker
        const disabledPath = path.join(skillDir, '.disabled');
        const enabled = !fs.existsSync(disabledPath);

        skills.push({
          id: Buffer.from(`${source}:${entry}`).toString('base64url'),
          name: entry,
          title: titleMatch ? titleMatch[1].trim() : entry,
          description: descMatch ? descMatch[1].trim() : '',
          source,
          dir: skillDir,
          enabled,
          hasSkillMd: true,
        });
      }
    } catch {}
  }
  return skills;
}

export function listSkills(req, res) {
  try {
    const skills = [
      ...scanSkillsInDirs(SKILL_SCAN_DIRS.bundled, 'bundled'),
      ...scanSkillsInDirs(SKILL_SCAN_DIRS.managed, 'managed'),
      ...scanSkillsInDirs(SKILL_SCAN_DIRS.workspace, 'workspace'),
    ];
    res.json(skills);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function findSkillById(id) {
  const allSkills = [
    ...scanSkillsInDirs(SKILL_SCAN_DIRS.bundled, 'bundled'),
    ...scanSkillsInDirs(SKILL_SCAN_DIRS.managed, 'managed'),
    ...scanSkillsInDirs(SKILL_SCAN_DIRS.workspace, 'workspace'),
  ];
  return allSkills.find(s => s.id === id);
}

export function toggleSkill(req, res) {
  try {
    const skill = findSkillById(req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    const disabledPath = path.join(skill.dir, '.disabled');
    if (skill.enabled) {
      fs.writeFileSync(disabledPath, '');
      skill.enabled = false;
    } else {
      if (fs.existsSync(disabledPath)) fs.unlinkSync(disabledPath);
      skill.enabled = true;
    }

    logActivity('user', 'skill.toggled', { skill: skill.name, enabled: skill.enabled });
    broadcast('skill:toggled', { id: skill.id, enabled: skill.enabled });
    res.json(skill);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function createSkill(req, res) {
  try {
    const { name, content } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

    const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    const skillDir = path.join(SKILLS_DIRS.workspace, safeName);

    if (fs.existsSync(skillDir)) {
      return res.status(409).json({ error: 'Skill already exists' });
    }

    fs.mkdirSync(skillDir, { recursive: true });
    const skillContent = content || `# ${safeName}\n\nDescribe your skill here.\n`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    logActivity('user', 'skill.created', { skill: safeName });
    broadcast('skill:created', { name: safeName });

    res.status(201).json({
      id: Buffer.from(`workspace:${safeName}`).toString('base64url'),
      name: safeName,
      title: safeName,
      source: 'workspace',
      dir: skillDir,
      enabled: true,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getSkillContent(req, res) {
  try {
    const skill = findSkillById(req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    const skillFile = path.join(skill.dir, 'SKILL.md');
    const content = fs.readFileSync(skillFile, 'utf-8');

    res.json({ ...skill, content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function deleteSkill(req, res) {
  try {
    const skill = findSkillById(req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    if (skill.source === 'bundled') {
      return res.status(403).json({ error: 'Cannot delete bundled skills' });
    }

    fs.rmSync(skill.dir, { recursive: true, force: true });
    logActivity('user', 'skill.deleted', { skill: skill.name });
    broadcast('skill:deleted', { id: skill.id });
    res.json({ ok: true, id: skill.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
