import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAutomations } from '../../lib/registryStore.js';
import { readJSON, writeJSON } from '../../lib/fileStore.js';
import { logActivity } from '../../lib/fileStore.js';
import { broadcast } from '../../broadcast.js';

const HOME = os.homedir();
const DATA_DIR = process.env.OPENCLAWBOARD_DATA || path.join(HOME, '.openclawboard');
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');
const SKILL_CACHE_DIR = path.join(DATA_DIR, 'skill-cache');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCachedSkill(automationId) {
  const cachePath = path.join(SKILL_CACHE_DIR, `${automationId}.md`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }
  // Try reading from the OpenClaw skill path directly
  return null;
}

function loadExport(automationId) {
  const exportPath = path.join(EXPORTS_DIR, `${automationId}.json`);
  return readJSON(exportPath, null);
}

function saveExport(automationId, data) {
  ensureDir(EXPORTS_DIR);
  writeJSON(path.join(EXPORTS_DIR, `${automationId}.json`), data);
}

// ─── Gap Detection Rules ───

const GAP_RULES = [
  {
    category: 'push-notification',
    test: (content) => /\bmessage\b.*\b(telegram|discord|slack|whatsapp|signal)\b/i.test(content) ||
      /\bdeliver(y|ed)?\b/i.test(content),
    severity: 'medium',
    description: 'OpenClaw sends results via messaging channels (Telegram, Discord, etc.). Claude Desktop scheduled tasks save results to files. Dispatch shows results in the mobile app thread.',
    workaround: 'Check the Dispatch thread on your phone after the scheduled run, or use a Slack/Notion connector in Claude Desktop to send yourself a summary.',
  },
  {
    category: 'model-routing',
    test: (content, automation) => {
      const model = automation.platforms?.openclaw?.model;
      return !!model;
    },
    severity: 'low',
    description: 'OpenClaw routes this to a specific model. Claude Desktop uses whatever model you select when creating the task.',
    workaround: 'Select your preferred model when creating the scheduled task in Claude Desktop. The model is locked for the task\'s lifetime.',
  },
  {
    category: 'skill-chaining',
    test: (content) => /\bread\s+.*skill/i.test(content) && /\bthen\b.*\bread\b/i.test(content),
    severity: 'high',
    description: 'This automation chains multiple skills together. Claude Desktop skills don\'t support explicit chaining.',
    workaround: 'Inline the chained steps into a single skill file, or rely on Claude\'s sub-agent decomposition to handle multi-step workflows.',
  },
  {
    category: 'custom-binary',
    test: (content) => /\bpython3?\b|\bnode\b|\bnpm\b|\bbash\b/i.test(content) &&
      /\b(run|exec|execute|spawn)\b/i.test(content),
    severity: 'medium',
    description: 'This automation executes custom scripts or binaries. Claude Desktop runs in a local environment but may need specific tools installed.',
    workaround: 'Ensure the required tools (Python, Node, etc.) are installed and accessible on the machine running Claude Desktop.',
  },
  {
    category: 'high-frequency',
    test: (content, automation) => {
      const cron = automation.schedule?.cron;
      if (!cron) return false;
      const parts = cron.split(' ');
      return parts[0]?.includes('/') && parts[1] === '*'; // e.g., */5 * * * *
    },
    severity: 'medium',
    description: 'This automation runs at high frequency (sub-hourly). Claude Desktop scheduled tasks support hourly minimum frequency.',
    workaround: 'Set the Claude Desktop task to hourly, or use the /loop command in an active Claude Code session for more frequent polling.',
  },
  {
    category: 'gateway-config',
    test: (content) => /\bgateway\b|\bwebhook\b|\bport\b.*\blisten/i.test(content),
    severity: 'low',
    description: 'OpenClaw uses gateway/webhook configuration. Claude Desktop is local and doesn\'t need gateway setup.',
    workaround: 'Remove gateway references. Claude Desktop accesses local files and connectors directly.',
  },
  {
    category: 'memory-plugin',
    test: (content) => /\bmemory\b.*\b(store|save|read|load)\b/i.test(content) ||
      /\b\.json\b.*\bstate\b/i.test(content),
    severity: 'low',
    description: 'This automation uses structured memory/state files. Claude Desktop uses CLAUDE.md files and local file system for context.',
    workaround: 'State files on the local filesystem work the same way. CLAUDE.md provides persistent project context.',
  },
  {
    category: 'env-vars',
    test: (content) => /\benv\b|\bAPI_KEY\b|\bTOKEN\b|\bSECRET\b/i.test(content),
    severity: 'low',
    description: 'This automation uses environment variables. Claude Desktop inherits env vars from your shell profile.',
    workaround: 'Set required environment variables in your shell profile (~/.zshrc or ~/.bashrc). Claude Desktop inherits them on launch.',
  },
];

const CONNECTOR_MAP = [
  { pattern: /\bnotion\b/i, openclawTool: 'Notion (via API/MCP)', coworkConnector: 'Notion connector', status: 'direct-match' },
  { pattern: /\bgmail\b|\bemail\b|\binbox\b/i, openclawTool: 'Gmail (via API)', coworkConnector: 'Gmail connector', status: 'direct-match' },
  { pattern: /\bslack\b/i, openclawTool: 'Slack (via API/channel)', coworkConnector: 'Slack connector', status: 'direct-match' },
  { pattern: /\bgoogle\s*calendar\b|\bcalendar\b/i, openclawTool: 'Google Calendar (via API)', coworkConnector: 'Google Calendar connector', status: 'direct-match' },
  { pattern: /\bgoogle\s*drive\b|\bdrive\b/i, openclawTool: 'Google Drive (via API)', coworkConnector: 'Google Drive connector', status: 'direct-match' },
  { pattern: /\blinear\b/i, openclawTool: 'Linear (via API)', coworkConnector: 'Linear connector', status: 'direct-match' },
  { pattern: /\bgithub\b/i, openclawTool: 'GitHub (via API/CLI)', coworkConnector: 'GitHub (via gh CLI)', status: 'direct-match' },
];

// ─── Generators ───

function generateSkill(automation, skillContent) {
  // Follow anthropics/skills skill-creator best practices:
  // - name: lowercase, hyphens only
  // - description: "pushy" — include what it does AND when to use it
  // - Keep SKILL.md under 500 lines with progressive disclosure
  // - Include "When to Use" section
  // - Explain the why, not just rigid instructions

  const name = automation.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const desc = automation.description || automation.name;
  const schedule = automation.schedule;

  // Build a rich description for triggering (skill-creator pattern: be pushy)
  const triggerContexts = [];
  if (schedule) triggerContexts.push(`runs on schedule (${schedule.humanReadable || schedule.cron})`);
  triggerContexts.push('when asked to perform this task manually');

  const richDescription = `${desc}. Use ${triggerContexts.join(', or ')}.`;

  // Strip OpenClaw-specific references from skill content
  let body = skillContent || '';
  body = body.replace(/^---\n[\s\S]*?\n---\n?/, ''); // Remove old frontmatter
  body = body.replace(/\bmessage\s+.*?(telegram|discord|slack|whatsapp)\b[^\n]*/gi, '');
  body = body.replace(/\bgateway\b[^\n]*/gi, '');
  body = body.replace(/\bheartbeat\b[^\n]*/gi, '');
  body = body.trim();

  // Detect connectors
  const fullText = (skillContent || '') + ' ' + desc;
  const connectors = CONNECTOR_MAP.filter(c => c.pattern.test(fullText));

  const lines = [
    '---',
    `name: ${name}`,
    `description: "${richDescription.replace(/"/g, '\\"')}"`,
    '---',
    '',
    `# ${automation.name}`,
    '',
  ];

  // When to Use section (skill-creator best practice)
  lines.push('## When to Use', '');
  if (schedule) {
    lines.push(`This skill is designed to run ${schedule.humanReadable || 'on a schedule'}${schedule.timezone ? ` (${schedule.timezone})` : ''}. It can also be invoked manually when you need to run it on demand.`);
  } else {
    lines.push(`Use this skill when you need to: ${desc}.`);
  }
  lines.push('');

  // Overview
  lines.push('## Overview', '', desc, '');

  // Main instructions — preserve the core from original skill
  if (body) {
    // Extract just the instructional content (skip title if duplicated)
    let instructions = body.replace(/^#\s+.*\n+/, ''); // Remove H1 if present
    lines.push(instructions);
  } else {
    lines.push('## Steps', '', `1. ${desc}`, '');
  }

  // Connectors section
  if (connectors.length > 0) {
    lines.push('', '## Connectors Required', '');
    for (const c of connectors) {
      lines.push(`- **${c.coworkConnector}** — ensure this is enabled in Claude Desktop settings`);
    }
    lines.push('');
  }

  // Migration notes
  lines.push('## Notes', '');
  lines.push(`- Migrated from OpenClaw automation: \`${automation.name}\``);
  if (automation.platforms?.openclaw?.model) {
    lines.push(`- Original model: ${automation.platforms.openclaw.model}`);
  }
  if (schedule) {
    lines.push(`- Original schedule: \`${schedule.cron}\` (${schedule.humanReadable})`);
  }

  return lines.join('\n');
}

function generateScheduledTask(automation, skillContent) {
  // Generate a natural language prompt suitable for Claude Desktop's scheduled task UI.
  // Per Claude Desktop docs: "Write this the same way you'd write any message in the prompt box."
  // Keep it conversational, outcome-focused, under 200 words ideally.
  // Reference connectors by name, be specific about sources/outputs.

  const desc = automation.description || automation.name;
  const schedule = automation.schedule;
  const fullText = (skillContent || '') + ' ' + desc;
  const connectors = CONNECTOR_MAP.filter(c => c.pattern.test(fullText));

  const lines = [];

  // Natural language task description
  lines.push(desc);
  lines.push('');

  // Include key steps from skill content if available
  if (skillContent) {
    let body = skillContent.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
    body = body.replace(/^#\s+.*\n+/, ''); // Remove title

    // Extract steps/workflow section
    const stepsMatch = body.match(/##?\s*(Steps|Instructions|Workflow|Process|What to do)\n+([\s\S]*?)(?=\n##?\s|\n*$)/im);
    if (stepsMatch) {
      lines.push(stepsMatch[0].trim());
    } else {
      // Use the body but keep it concise
      const trimmed = body.slice(0, 1200).trim();
      if (trimmed) lines.push(trimmed);
    }
  }

  // Connector hints
  if (connectors.length > 0) {
    lines.push('');
    lines.push('Use the following connectors: ' + connectors.map(c => c.coworkConnector).join(', ') + '.');
  }

  // Keep under ~200 words for scheduled tasks
  let result = lines.join('\n').trim();
  const words = result.split(/\s+/);
  if (words.length > 250) {
    result = words.slice(0, 240).join(' ') + '\n\n[Note: This prompt was truncated. Consider breaking into a skill file for complex workflows.]';
  }

  return result;
}

function generateDispatch(automation) {
  const desc = automation.description || automation.name;
  // Condense to under 50 words, outcome-focused
  const words = desc.split(/\s+/);
  if (words.length <= 50) return desc;
  return words.slice(0, 45).join(' ') + '...';
}

function analyzeGaps(automation, skillContent) {
  const fullText = (skillContent || '') + ' ' + (automation.description || '');
  const gaps = [];

  for (const rule of GAP_RULES) {
    if (rule.test(fullText, automation)) {
      gaps.push({
        category: rule.category,
        severity: rule.severity,
        description: rule.description,
        workaround: rule.workaround,
      });
    }
  }

  // Connector mapping
  const connectorMapping = CONNECTOR_MAP
    .filter(c => c.pattern.test(fullText))
    .map(c => ({
      openclawTool: c.openclawTool,
      coworkConnector: c.coworkConnector,
      status: c.status,
      notes: `Ensure ${c.coworkConnector} is enabled in Claude Desktop settings`,
    }));

  // Overall readiness
  const highCount = gaps.filter(g => g.severity === 'high').length;
  const medCount = gaps.filter(g => g.severity === 'medium').length;
  const readiness = highCount > 0 ? 'blocked' : medCount > 0 ? 'partial' : 'ready';

  // Manual steps
  const manualSteps = [
    'Open Claude Desktop app',
    'Go to Schedule sidebar → + New task',
    'Set name, frequency, and working folder',
    'Paste the generated prompt',
    'Click "Run now" to test the task',
    'Approve any permission prompts that appear',
  ];

  if (connectorMapping.length > 0) {
    manualSteps.push('Enable required connectors in Claude Desktop settings');
  }

  manualSteps.push('Verify the task runs correctly before relying on the schedule');

  return {
    automationId: automation.id,
    automationName: automation.name,
    overallMigrationReadiness: readiness,
    gaps,
    connectorMapping,
    manualSteps,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Endpoints ───

export function generateExport(req, res) {
  try {
    const items = getAutomations();
    const automation = items.find(a => a.id === req.params.id);
    if (!automation) return res.status(404).json({ error: 'Automation not found' });

    const skillContent = loadCachedSkill(automation.id);

    const result = {
      skill: generateSkill(automation, skillContent),
      scheduledTask: generateScheduledTask(automation, skillContent),
      dispatch: generateDispatch(automation),
      gaps: analyzeGaps(automation, skillContent),
      generatedAt: new Date().toISOString(),
    };

    saveExport(automation.id, result);
    logActivity('user', 'export.generated', { platform: 'claude-desktop', automationId: automation.id });
    broadcast('export:generated', { platform: 'claude-desktop', automationId: automation.id });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getSkillArtifact(req, res) {
  try {
    const cached = loadExport(req.params.id);
    if (!cached) return res.status(404).json({ error: 'Export not generated yet. POST to generate first.' });
    res.json({ skill: cached.skill });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getScheduledTaskArtifact(req, res) {
  try {
    const cached = loadExport(req.params.id);
    if (!cached) return res.status(404).json({ error: 'Export not generated yet. POST to generate first.' });
    res.json({ scheduledTask: cached.scheduledTask });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getDispatchArtifact(req, res) {
  try {
    const cached = loadExport(req.params.id);
    if (!cached) return res.status(404).json({ error: 'Export not generated yet. POST to generate first.' });
    res.json({ dispatch: cached.dispatch });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getGapArtifact(req, res) {
  try {
    const cached = loadExport(req.params.id);
    if (!cached) return res.status(404).json({ error: 'Export not generated yet. POST to generate first.' });
    res.json(cached.gaps);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function saveSkillFile(req, res) {
  try {
    const { outputPath, type } = req.body;
    if (!outputPath) return res.status(400).json({ error: 'outputPath is required' });

    const cached = loadExport(req.params.id);
    if (!cached) return res.status(404).json({ error: 'Export not generated yet.' });

    const items = getAutomations();
    const automation = items.find(a => a.id === req.params.id);
    const name = (automation?.name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-');

    let content, filePath;
    if (type === 'scheduled-task') {
      const dir = path.join(outputPath, name);
      ensureDir(dir);
      filePath = path.join(dir, 'SKILL.md');
      content = cached.scheduledTask;
    } else {
      const dir = path.join(outputPath, name);
      ensureDir(dir);
      filePath = path.join(dir, 'SKILL.md');
      content = cached.skill;
    }

    fs.writeFileSync(filePath, content);
    logActivity('user', 'export.saved', { platform: 'claude-desktop', path: filePath });

    res.json({ ok: true, path: filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
