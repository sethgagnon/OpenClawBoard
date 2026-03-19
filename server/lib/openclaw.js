import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * OpenClaw CLI wrapper for Tier 3 deep analysis.
 *
 * Spawns `openclaw chat --message <prompt>` and streams output
 * back via an EventEmitter.
 *
 * Events:
 *   'data'    — partial chunk of text from stdout
 *   'error'   — error message from stderr or spawn failure
 *   'close'   — process exited, payload: { code }
 *
 * @param {string} prompt — The analysis prompt to send to OpenClaw
 * @param {object} [options]
 * @param {string} [options.cwd] — Working directory for the process
 * @param {number} [options.timeout] — Kill after N milliseconds (default 120000)
 * @returns {EventEmitter & { kill: () => void }}
 */
export function invokeOpenclawAgent(prompt, options = {}) {
  const { cwd, timeout = 120_000 } = options;
  const emitter = new EventEmitter();

  let proc;
  try {
    proc = spawn('openclaw', ['chat', '--message', prompt], {
      cwd: cwd || process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // spawn itself can throw (e.g. ENOENT)
    process.nextTick(() => {
      emitter.emit('error', `Failed to spawn openclaw: ${err.message}`);
      emitter.emit('close', { code: 1 });
    });
    emitter.kill = () => {};
    return emitter;
  }

  let killed = false;

  // Timeout guard
  const timer = setTimeout(() => {
    if (!killed) {
      killed = true;
      proc.kill('SIGTERM');
      emitter.emit('error', 'Analysis timed out');
      emitter.emit('close', { code: 124 });
    }
  }, timeout);

  proc.stdout.on('data', (chunk) => {
    emitter.emit('data', chunk.toString('utf-8'));
  });

  proc.stderr.on('data', (chunk) => {
    // stderr content is informational — relay as error events
    emitter.emit('error', chunk.toString('utf-8'));
  });

  proc.on('error', (err) => {
    clearTimeout(timer);
    if (!killed) {
      emitter.emit('error', `Process error: ${err.message}`);
      emitter.emit('close', { code: 1 });
    }
  });

  proc.on('close', (code) => {
    clearTimeout(timer);
    if (!killed) {
      emitter.emit('close', { code: code ?? 0 });
    }
  });

  emitter.kill = () => {
    if (!killed) {
      killed = true;
      clearTimeout(timer);
      proc.kill('SIGTERM');
    }
  };

  return emitter;
}

/**
 * Build the analysis prompt from workspace context.
 *
 * @param {object} context
 * @param {Array} context.suggestions — Tier 1 rule-based suggestions
 * @param {object} context.insights — Tier 2 insight data
 * @returns {string}
 */
export function buildAnalysisPrompt(context = {}) {
  const { suggestions = [], insights = {} } = context;

  const summaryLines = suggestions.slice(0, 20).map(
    (s) => `- [${s.severity}] ${s.title}: ${s.description}`
  );

  return [
    'You are an expert software engineering advisor analyzing a workspace.',
    'Based on the following automated checks, provide actionable improvement suggestions.',
    '',
    `Health Score: ${insights.score ?? 'N/A'}/100`,
    `Total issues found: ${suggestions.length}`,
    '',
    'Current issues:',
    ...summaryLines,
    '',
    'For each suggestion, respond with a JSON array where each item has:',
    '  { "type": "Create Skill"|"Edit Skill"|"Adjust Cron"|"Change Model"|"Create Task"|"Update Memory"|"Config Change",',
    '    "title": "short title",',
    '    "description": "detailed description of what to do and why",',
    '    "impact": "estimated impact, e.g. ~$12/week savings or 30% faster" }',
    '',
    'Provide 3-8 concrete, specific suggestions. Return ONLY the JSON array.',
  ].join('\n');
}
