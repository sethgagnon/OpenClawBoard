import fs from 'fs';
import path from 'path';
import { OPENCLAW_DIR } from '../config.js';
import { formatDuration, formatCost, formatTokens } from '../lib/format.js';

function parseSessionLines(filePath) {
  const lines = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line));
      } catch {}
    }
  } catch {}
  return lines;
}

function getSessionSummary(sessionPath) {
  const lines = parseSessionLines(sessionPath);
  if (lines.length === 0) return null;

  let input = 0, output = 0, cacheRead = 0, cost = 0, messages = 0;
  let firstTs = null, lastTs = null;

  for (const line of lines) {
    if (line.timestamp) {
      if (!firstTs || line.timestamp < firstTs) firstTs = line.timestamp;
      if (!lastTs || line.timestamp > lastTs) lastTs = line.timestamp;
    }
    const usage = line.message?.usage;
    if (usage) {
      input += usage.input || 0;
      output += usage.output || 0;
      cacheRead += usage.cacheRead || 0;
      cost += usage.cost?.total || 0;
      messages++;
    }
  }

  const duration = firstTs && lastTs ? new Date(lastTs) - new Date(firstTs) : 0;

  return {
    messages,
    lines: lines.length,
    input, output, cacheRead, cost,
    startedAt: firstTs,
    endedAt: lastTs,
    duration,
    durationFormatted: formatDuration(duration),
    costFormatted: formatCost(cost),
    inputFormatted: formatTokens(input),
    outputFormatted: formatTokens(output),
  };
}

export function listAgents(req, res) {
  try {
    const agentsDir = path.join(OPENCLAW_DIR, 'agents');
    if (!fs.existsSync(agentsDir)) return res.json([]);

    const agents = [];
    for (const name of fs.readdirSync(agentsDir)) {
      const agentDir = path.join(agentsDir, name);
      if (!fs.statSync(agentDir).isDirectory()) continue;

      const sessionsDir = path.join(agentDir, 'sessions');
      let sessionCount = 0;
      let lastActive = null;
      let totalCost = 0;

      if (fs.existsSync(sessionsDir)) {
        const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
        sessionCount = sessionFiles.length;

        // Get most recent session info
        for (const sf of sessionFiles) {
          const stat = fs.statSync(path.join(sessionsDir, sf));
          if (!lastActive || stat.mtimeMs > new Date(lastActive).getTime()) {
            lastActive = stat.mtime.toISOString();
          }
        }
      }

      // Read agent config if exists
      let config = {};
      const configPath = path.join(agentDir, 'config.json');
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
      }

      agents.push({
        name,
        sessions: sessionCount,
        lastActive,
        config,
      });
    }

    agents.sort((a, b) => {
      if (!a.lastActive && !b.lastActive) return 0;
      if (!a.lastActive) return 1;
      if (!b.lastActive) return -1;
      return new Date(b.lastActive) - new Date(a.lastActive);
    });

    res.json(agents);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getAgent(req, res) {
  try {
    const agentDir = path.join(OPENCLAW_DIR, 'agents', req.params.name);
    if (!fs.existsSync(agentDir)) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    let config = {};
    const configPath = path.join(agentDir, 'config.json');
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
    }

    const sessionsDir = path.join(agentDir, 'sessions');
    let sessionCount = 0;
    let totalCost = 0;
    let totalMessages = 0;

    if (fs.existsSync(sessionsDir)) {
      const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      sessionCount = sessionFiles.length;

      for (const sf of sessionFiles) {
        const summary = getSessionSummary(path.join(sessionsDir, sf));
        if (summary) {
          totalCost += summary.cost;
          totalMessages += summary.messages;
        }
      }
    }

    res.json({
      name: req.params.name,
      config,
      sessions: sessionCount,
      totalCost,
      totalMessages,
      costFormatted: formatCost(totalCost),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getAgentSessions(req, res) {
  try {
    const sessionsDir = path.join(OPENCLAW_DIR, 'agents', req.params.name, 'sessions');
    if (!fs.existsSync(sessionsDir)) return res.json([]);

    const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    const sessions = [];

    for (const sf of sessionFiles) {
      const filePath = path.join(sessionsDir, sf);
      const stat = fs.statSync(filePath);
      const summary = getSessionSummary(filePath);
      sessions.push({
        id: sf.replace('.jsonl', ''),
        file: sf,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        ...summary,
      });
    }

    sessions.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json(sessions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getAgentSession(req, res) {
  try {
    const filePath = path.join(
      OPENCLAW_DIR, 'agents', req.params.name, 'sessions', req.params.id + '.jsonl'
    );
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const lines = parseSessionLines(filePath);
    const summary = getSessionSummary(filePath);
    const limit = parseInt(req.query.limit) || 200;
    const offset = parseInt(req.query.offset) || 0;

    res.json({
      id: req.params.id,
      agent: req.params.name,
      ...summary,
      total: lines.length,
      lines: lines.slice(offset, offset + limit),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
