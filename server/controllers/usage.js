import fs from 'fs';
import path from 'path';
import { OPENCLAW_DIR } from '../config.js';
import { isoToDateInTz } from '../lib/timezone.js';
import { formatCost, formatTokens } from '../lib/format.js';

function parseSessionLines(filePath) {
  const lines = [];
  try {
    if (!fs.existsSync(filePath)) return lines;
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

function collectAllSessions() {
  const agentsDir = path.join(OPENCLAW_DIR, 'agents');
  const sessions = [];
  try {
    if (!fs.existsSync(agentsDir)) return sessions;
    for (const agentName of fs.readdirSync(agentsDir)) {
      const sessionsDir = path.join(agentsDir, agentName, 'sessions');
      if (!fs.existsSync(sessionsDir)) continue;
      for (const file of fs.readdirSync(sessionsDir)) {
        if (!file.endsWith('.jsonl')) continue;
        const filePath = path.join(sessionsDir, file);
        const lines = parseSessionLines(filePath);
        sessions.push({ agent: agentName, sessionId: file.replace('.jsonl', ''), lines });
      }
    }
  } catch {}
  return sessions;
}

// Track provider from model_change events in JSONL stream
function resolveProvider(line, currentProvider) {
  if (line.type === 'model_change' && line.provider) return line.provider;
  if (line.provider) return line.provider;
  return currentProvider;
}

function emptyBucket() {
  return { input: 0, output: 0, cacheRead: 0, cost: 0, messages: 0 };
}

function addUsage(bucket, usage) {
  bucket.input += usage.input || 0;
  bucket.output += usage.output || 0;
  bucket.cacheRead += usage.cacheRead || 0;
  bucket.cost += usage.cost?.total || 0;
  bucket.messages++;
}

function aggregateUsage(sessions) {
  const totals = emptyBucket();
  const byProvider = {};
  const providers = new Set();

  for (const session of sessions) {
    let currentProvider = 'unknown';

    for (const line of session.lines) {
      currentProvider = resolveProvider(line, currentProvider);

      const usage = line.message?.usage;
      if (!usage) continue;

      providers.add(currentProvider);
      addUsage(totals, usage);

      if (!byProvider[currentProvider]) byProvider[currentProvider] = emptyBucket();
      addUsage(byProvider[currentProvider], usage);
    }
  }

  return { totals, byProvider, providers: [...providers].sort() };
}

export function getUsage(req, res) {
  try {
    const sessions = collectAllSessions();
    const { totals, byProvider, providers } = aggregateUsage(sessions);

    res.json({
      input: totals.input,
      output: totals.output,
      cacheRead: totals.cacheRead,
      totalTokens: totals.input + totals.output + totals.cacheRead,
      cost: totals.cost,
      messages: totals.messages,
      sessions: sessions.length,
      inputFormatted: formatTokens(totals.input),
      outputFormatted: formatTokens(totals.output),
      costFormatted: formatCost(totals.cost),
      providers,
      byProvider,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getUsageHistory(req, res) {
  try {
    const sessions = collectAllSessions();
    const days = parseInt(req.query.days) || 30;
    const cutoff = Date.now() - days * 86400000;

    const dailyMap = {};

    for (const session of sessions) {
      let currentProvider = 'unknown';

      for (const line of session.lines) {
        currentProvider = resolveProvider(line, currentProvider);

        if (!line.timestamp) continue;
        const ts = new Date(line.timestamp).getTime();
        if (ts < cutoff) continue;

        const dateKey = isoToDateInTz(line.timestamp);
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { date: dateKey, ...emptyBucket(), byProvider: {} };
        }

        const usage = line.message?.usage;
        if (usage) {
          addUsage(dailyMap[dateKey], usage);
          if (!dailyMap[dateKey].byProvider[currentProvider]) {
            dailyMap[dateKey].byProvider[currentProvider] = emptyBucket();
          }
          addUsage(dailyMap[dateKey].byProvider[currentProvider], usage);
        }
      }
    }

    const history = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getUsageBreakdown(req, res) {
  try {
    const sessions = collectAllSessions();
    const byKey = {};

    for (const session of sessions) {
      let currentProvider = 'unknown';

      for (const line of session.lines) {
        currentProvider = resolveProvider(line, currentProvider);

        const usage = line.message?.usage;
        if (!usage) continue;

        const key = `${session.agent}::${currentProvider}`;
        if (!byKey[key]) {
          byKey[key] = { agent: session.agent, provider: currentProvider, ...emptyBucket(), sessions: 0 };
        }
        addUsage(byKey[key], usage);
      }

      // Count sessions per agent+provider (use the last known provider for the session)
      const key = `${session.agent}::${currentProvider}`;
      if (!byKey[key]) {
        byKey[key] = { agent: session.agent, provider: currentProvider, ...emptyBucket(), sessions: 0 };
      }
      byKey[key].sessions++;
    }

    const breakdown = Object.values(byKey).sort((a, b) => b.cost - a.cost);
    res.json(breakdown);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getDetectedProviders(req, res) {
  try {
    const sessions = collectAllSessions();
    const providers = new Set();
    for (const session of sessions) {
      for (const line of session.lines) {
        if (line.type === 'model_change' && line.provider) {
          providers.add(line.provider);
        } else if (line.provider) {
          providers.add(line.provider);
        }
      }
    }
    res.json([...providers].sort());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
