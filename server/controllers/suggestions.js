import fs from 'fs';
import path from 'path';
import { WORKSPACE, EXCLUDED, SUGGESTIONS_HISTORY_FILE } from '../config.js';
import { readJSON, writeJSON } from '../lib/fileStore.js';
import { logActivity } from '../lib/fileStore.js';
import { broadcast } from '../broadcast.js';
import { invokeOpenclawAgent, buildAnalysisPrompt } from '../lib/openclaw.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Tier 1 Rule-Based Checks ---

function checkLargeFiles(dir, suggestions, prefix = '', depth = 0) {
  if (depth > 6) return;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED.has(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        checkLargeFiles(fullPath, suggestions, relativePath, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 1024 * 1024) {
            suggestions.push({
              id: generateId(),
              type: 'large-file',
              severity: 'warning',
              title: 'Large file detected',
              description: `${relativePath} is ${(stat.size / 1024 / 1024).toFixed(1)}MB. Consider if it needs to be in the workspace.`,
              file: relativePath,
              category: 'workspace',
            });
          }
        } catch {}
      }
    }
  } catch {}
}

function checkTodoComments(dir, suggestions, prefix = '', depth = 0) {
  if (depth > 6) return;
  const codeExts = new Set(['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh']);
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED.has(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        checkTodoComments(fullPath, suggestions, relativePath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (!codeExts.has(ext)) continue;
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 256 * 1024) continue; // skip large files
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          let todoCount = 0;
          for (const line of lines) {
            if (/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/i.test(line)) todoCount++;
          }
          if (todoCount > 0) {
            suggestions.push({
              id: generateId(),
              type: 'todo-comments',
              severity: todoCount > 5 ? 'warning' : 'info',
              title: `${todoCount} TODO/FIXME comment${todoCount > 1 ? 's' : ''} found`,
              description: `${relativePath} has ${todoCount} unresolved TODO/FIXME/HACK comments.`,
              file: relativePath,
              category: 'code-quality',
              count: todoCount,
            });
          }
        } catch {}
      }
    }
  } catch {}
}

function checkMissingFiles(suggestions) {
  const important = [
    { file: 'README.md', title: 'Missing README', desc: 'Consider adding a README.md to document the project.' },
    { file: '.gitignore', title: 'Missing .gitignore', desc: 'Consider adding a .gitignore to prevent committing unwanted files.' },
  ];

  for (const item of important) {
    if (!fs.existsSync(path.join(WORKSPACE, item.file))) {
      suggestions.push({
        id: generateId(),
        type: 'missing-file',
        severity: 'info',
        title: item.title,
        description: item.desc,
        file: item.file,
        category: 'project-structure',
      });
    }
  }
}

function checkDuplicatePackages(suggestions) {
  const pkgPath = path.join(WORKSPACE, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    const duplicates = deps.filter(d => devDeps.includes(d));

    for (const dup of duplicates) {
      suggestions.push({
        id: generateId(),
        type: 'duplicate-dependency',
        severity: 'warning',
        title: `Duplicate dependency: ${dup}`,
        description: `${dup} appears in both dependencies and devDependencies.`,
        file: 'package.json',
        category: 'dependencies',
      });
    }
  } catch {}
}

function checkEmptyDirectories(dir, suggestions, prefix = '', depth = 0) {
  if (depth > 4) return;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED.has(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const contents = fs.readdirSync(fullPath).filter(f => !f.startsWith('.'));
        if (contents.length === 0) {
          suggestions.push({
            id: generateId(),
            type: 'empty-directory',
            severity: 'info',
            title: 'Empty directory',
            description: `${relativePath} is empty. Consider removing it or adding content.`,
            file: relativePath,
            category: 'workspace',
          });
        } else {
          checkEmptyDirectories(fullPath, suggestions, relativePath, depth + 1);
        }
      }
    }
  } catch {}
}

function runAllChecks() {
  const suggestions = [];
  checkLargeFiles(WORKSPACE, suggestions);
  checkTodoComments(WORKSPACE, suggestions);
  checkMissingFiles(suggestions);
  checkDuplicatePackages(suggestions);
  checkEmptyDirectories(WORKSPACE, suggestions);
  return suggestions;
}

export function getSuggestions(req, res) {
  try {
    const suggestions = runAllChecks();
    const category = req.query.category;
    const severity = req.query.severity;

    let filtered = suggestions;
    if (category) filtered = filtered.filter(s => s.category === category);
    if (severity) filtered = filtered.filter(s => s.severity === severity);

    // Sort by severity: critical > warning > info
    const sevOrder = { critical: 0, error: 0, warning: 1, info: 2 };
    filtered.sort((a, b) => (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2));

    res.json({
      suggestions: filtered,
      total: filtered.length,
      categories: [...new Set(suggestions.map(s => s.category))],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getSuggestionInsights(req, res) {
  try {
    const suggestions = runAllChecks();

    const bySeverity = {};
    const byCategory = {};
    const byType = {};

    for (const s of suggestions) {
      bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
      byCategory[s.category] = (byCategory[s.category] || 0) + 1;
      byType[s.type] = (byType[s.type] || 0) + 1;
    }

    // Compute a health score (0-100)
    const warningCount = bySeverity.warning || 0;
    const criticalCount = bySeverity.critical || bySeverity.error || 0;
    const infoCount = bySeverity.info || 0;
    const healthScore = Math.max(0, 100 - criticalCount * 15 - warningCount * 5 - infoCount);

    // Generate contextual insights from the data
    const insights = [];

    // Skill gap insight based on TODO comments
    const todoTotal = suggestions
      .filter(s => s.type === 'todo-comments')
      .reduce((sum, s) => sum + (s.count || 0), 0);
    if (todoTotal > 3) {
      insights.push({
        id: generateId(),
        type: 'skill-gap',
        title: 'Skill Gap Detected',
        description: `${todoTotal} unresolved TODO/FIXME comments suggest areas where automated skills could help. Consider creating skills to handle these recurring patterns.`,
        impact: `~${Math.ceil(todoTotal * 0.5)}h saved/week`,
        action: 'create-skill',
        actionLabel: 'Create Skill',
      });
    }

    // Cron optimization insight
    if (suggestions.some(s => s.category === 'workspace')) {
      insights.push({
        id: generateId(),
        type: 'cron-optimization',
        title: 'Cron Optimization',
        description: 'Workspace maintenance tasks could be automated via cron. Schedule cleanup jobs for large files and empty directories.',
        impact: 'Automated cleanup',
        currentSchedule: 'Manual',
        suggestedSchedule: '0 2 * * 0',
        action: 'adjust-cron',
        actionLabel: 'Schedule Cleanup',
      });
    }

    // Cost savings insight
    if (warningCount > 2) {
      const estimatedSavings = warningCount * 4;
      insights.push({
        id: generateId(),
        type: 'cost-savings',
        title: 'Model Cost Savings',
        description: `Resolving ${warningCount} warnings could reduce agent processing overhead. Consider using a lighter model for routine checks.`,
        impact: `~$${estimatedSavings}/week savings`,
        action: 'change-model',
        actionLabel: 'View Models',
      });
    }

    // Code quality insight
    const codeQualityCount = suggestions.filter(s => s.category === 'code-quality').length;
    if (codeQualityCount > 0) {
      insights.push({
        id: generateId(),
        type: 'skill-improvement',
        title: 'Skill Improvement',
        description: `${codeQualityCount} code quality issues detected. A linting skill could automatically catch and fix these patterns.`,
        impact: `${codeQualityCount} issues auto-fixed`,
        correctionFrequency: `${codeQualityCount} per scan`,
        action: 'create-skill',
        actionLabel: 'Create Lint Skill',
      });
    }

    // Dependency insight
    const depIssues = suggestions.filter(s => s.category === 'dependencies').length;
    if (depIssues > 0) {
      insights.push({
        id: generateId(),
        type: 'workflow-bottleneck',
        title: 'Workflow Bottleneck',
        description: `${depIssues} dependency issue${depIssues > 1 ? 's' : ''} detected. Duplicate dependencies increase install time and bundle size.`,
        impact: 'Faster builds',
        action: 'config-change',
        actionLabel: 'View Files',
      });
    }

    // Agent utilization insight
    if (suggestions.length > 10) {
      insights.push({
        id: generateId(),
        type: 'agent-utilization',
        title: 'Agent Utilization',
        description: `${suggestions.length} total issues detected — agents may be overloaded. Consider distributing work across multiple agents or prioritizing critical issues.`,
        impact: 'Better throughput',
        status: suggestions.length > 20 ? 'overloaded' : 'idle',
        action: 'view-agents',
        actionLabel: 'View Agents',
      });
    }

    res.json({
      healthScore,
      total: suggestions.length,
      bySeverity,
      byCategory,
      byType,
      insights,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function runDeepAnalysis(req, res) {
  try {
    // Gather context from Tier 1 and Tier 2
    const suggestions = runAllChecks();
    const bySeverity = {};
    for (const s of suggestions) {
      bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
    }
    const warningCount = bySeverity.warning || 0;
    const criticalCount = bySeverity.critical || bySeverity.error || 0;
    const infoCount = bySeverity.info || 0;
    const score = Math.max(0, 100 - criticalCount * 15 - warningCount * 5 - infoCount);

    const prompt = buildAnalysisPrompt({
      suggestions,
      insights: { score },
    });

    const timestamp = new Date().toISOString();
    const analysisId = generateId();

    // Respond immediately with the analysis ID
    res.json({ analysisId, timestamp, status: 'running' });

    // Stream analysis via WebSocket
    let fullOutput = '';
    const agent = invokeOpenclawAgent(prompt, { cwd: WORKSPACE, timeout: 120_000 });

    agent.on('data', (chunk) => {
      fullOutput += chunk;
      broadcast('suggestions:stream', { analysisId, chunk, timestamp });
    });

    agent.on('error', (err) => {
      broadcast('suggestions:stream', {
        analysisId,
        chunk: `\n[Error: ${err}]\n`,
        timestamp,
      });
    });

    agent.on('close', ({ code }) => {
      // Try to parse AI suggestions from the output
      let aiSuggestions = [];
      try {
        // Look for JSON array in the output
        const jsonMatch = fullOutput.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          aiSuggestions = parsed.map((item) => ({
            id: generateId(),
            type: item.type || 'Config Change',
            title: item.title || 'Suggestion',
            description: item.description || '',
            impact: item.impact || '',
            source: 'ai',
          }));
        }
      } catch {
        // If we can't parse JSON, create a single suggestion from the raw output
        if (fullOutput.trim()) {
          aiSuggestions = [{
            id: generateId(),
            type: 'Config Change',
            title: 'AI Analysis Complete',
            description: fullOutput.trim().slice(0, 2000),
            impact: 'See details',
            source: 'ai',
          }];
        }
      }

      // If openclaw was unavailable, fall back to rule-based suggestions
      // enhanced with type mapping for the UI
      if (aiSuggestions.length === 0) {
        aiSuggestions = suggestions.slice(0, 8).map((s) => {
          const typeMap = {
            'large-file': 'Config Change',
            'todo-comments': 'Create Skill',
            'missing-file': 'Create Task',
            'duplicate-dependency': 'Config Change',
            'empty-directory': 'Config Change',
          };
          return {
            id: s.id,
            type: typeMap[s.type] || 'Config Change',
            title: s.title,
            description: s.description,
            impact: s.severity === 'warning' ? 'Medium impact' : 'Low impact',
            source: 'rules',
            severity: s.severity,
            category: s.category,
          };
        });
      }

      // Save to history
      const history = readJSON(SUGGESTIONS_HISTORY_FILE, []);
      const entry = {
        id: analysisId,
        timestamp,
        total: aiSuggestions.length,
        bySeverity: {
          warning: suggestions.filter(s => s.severity === 'warning').length,
          info: suggestions.filter(s => s.severity === 'info').length,
        },
        suggestions: aiSuggestions,
        exitCode: code,
      };
      history.unshift(entry);
      if (history.length > 50) history.length = 50;
      writeJSON(SUGGESTIONS_HISTORY_FILE, history);

      logActivity('user', 'suggestions.deep_analysis', {
        analysisId,
        total: aiSuggestions.length,
        exitCode: code,
      });

      broadcast('suggestions:complete', {
        analysisId,
        timestamp,
        suggestions: aiSuggestions,
        total: aiSuggestions.length,
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getSuggestionHistory(req, res) {
  try {
    const history = readJSON(SUGGESTIONS_HISTORY_FILE, []);
    const limit = parseInt(req.query.limit) || 20;
    res.json(history.slice(0, limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function applySuggestion(req, res) {
  try {
    const suggestionId = req.params.id;
    const { action } = req.body; // 'dismiss', 'fix', 'ignore'

    const history = readJSON(SUGGESTIONS_HISTORY_FILE, []);

    // Record the application
    const applied = {
      id: generateId(),
      suggestionId,
      action: action || 'dismiss',
      timestamp: new Date().toISOString(),
    };

    // Store applied actions in a separate key in the first history entry
    if (history.length > 0) {
      history[0].applied = history[0].applied || [];
      history[0].applied.push(applied);
      writeJSON(SUGGESTIONS_HISTORY_FILE, history);
    }

    logActivity('user', 'suggestion.applied', { suggestionId, action });
    broadcast('suggestion:applied', applied);
    res.json({ ok: true, applied });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
