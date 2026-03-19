import { execSync } from 'child_process';
import path from 'path';
import { WORKSPACE } from '../config.js';
import { logActivity } from '../lib/fileStore.js';

// Strict whitelist of safe commands
const ALLOWED_COMMANDS = new Map([
  ['ls', { description: 'List directory contents', maxArgs: 5 }],
  ['cat', { description: 'Display file contents', maxArgs: 2 }],
  ['head', { description: 'Display first lines of a file', maxArgs: 4 }],
  ['tail', { description: 'Display last lines of a file', maxArgs: 4 }],
  ['wc', { description: 'Word, line, character count', maxArgs: 3 }],
  ['find', { description: 'Find files by name', maxArgs: 8 }],
  ['grep', { description: 'Search file contents', maxArgs: 8 }],
  ['du', { description: 'Disk usage summary', maxArgs: 4 }],
  ['df', { description: 'Disk free space', maxArgs: 3 }],
  ['pwd', { description: 'Print working directory', maxArgs: 0 }],
  ['date', { description: 'Display current date/time', maxArgs: 2 }],
  ['whoami', { description: 'Display current user', maxArgs: 0 }],
  ['uname', { description: 'System information', maxArgs: 2 }],
  ['uptime', { description: 'System uptime', maxArgs: 0 }],
  ['echo', { description: 'Print text', maxArgs: 10 }],
  ['which', { description: 'Locate a command', maxArgs: 2 }],
  ['file', { description: 'Determine file type', maxArgs: 2 }],
  ['stat', { description: 'File statistics', maxArgs: 2 }],
  ['tree', { description: 'Directory tree', maxArgs: 4 }],
  ['git', { description: 'Git version control (read-only)', maxArgs: 6, subcommands: new Set(['status', 'log', 'diff', 'branch', 'show', 'remote', 'tag', 'rev-parse', 'ls-files', 'blame']) }],
  ['node', { description: 'Node.js (version only)', maxArgs: 1, argsOnly: new Set(['-v', '--version', '-e']) }],
  ['npm', { description: 'npm (list/info only)', maxArgs: 4, subcommands: new Set(['ls', 'list', 'info', 'version', 'outdated', 'audit']) }],
  ['python3', { description: 'Python (version only)', maxArgs: 1, argsOnly: new Set(['-V', '--version', '-c']) }],
  ['python', { description: 'Python (version only)', maxArgs: 1, argsOnly: new Set(['-V', '--version', '-c']) }],
]);

// Dangerous patterns to block
const DANGEROUS_PATTERNS = [
  /[;&|`$]/, // shell operators and command substitution
  /\.\.\//,  // path traversal
  />\s*/,    // output redirection
  /</,       // input redirection
  /\bsudo\b/,
  /\brm\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bmkdir\b/,
  /\brmdir\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\bkill\b/,
  /\bcurl\b/,
  /\bwget\b/,
  /\beval\b/,
  /\bexec\b/,
];

function validateCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) return { valid: false, error: 'Empty command' };

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: `Command contains disallowed pattern: ${pattern}` };
    }
  }

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  const allowed = ALLOWED_COMMANDS.get(cmd);
  if (!allowed) {
    return { valid: false, error: `Command not in whitelist: ${cmd}` };
  }

  if (allowed.maxArgs !== undefined && args.length > allowed.maxArgs) {
    return { valid: false, error: `Too many arguments for ${cmd}` };
  }

  // Check subcommand restrictions (e.g., git status ok, git push not ok)
  if (allowed.subcommands && args.length > 0) {
    if (!allowed.subcommands.has(args[0])) {
      return { valid: false, error: `Subcommand not allowed: ${cmd} ${args[0]}` };
    }
  }

  // Check arg restrictions
  if (allowed.argsOnly && args.length > 0) {
    for (const arg of args) {
      if (!allowed.argsOnly.has(arg)) {
        return { valid: false, error: `Argument not allowed for ${cmd}: ${arg}` };
      }
    }
  }

  return { valid: true, cmd, args };
}

export function getTerminalCommands(req, res) {
  try {
    const commands = [];
    for (const [name, info] of ALLOWED_COMMANDS) {
      commands.push({
        name,
        description: info.description,
        subcommands: info.subcommands ? [...info.subcommands] : undefined,
      });
    }
    res.json(commands);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function execTerminalCommand(req, res) {
  try {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'command is required' });

    const validation = validateCommand(command);
    if (!validation.valid) {
      return res.status(403).json({ error: validation.error });
    }

    const startTime = Date.now();
    let output, exitCode = 0;

    try {
      output = execSync(command, {
        cwd: WORKSPACE,
        timeout: 15000, // 15 second timeout
        maxBuffer: 1024 * 1024, // 1MB output limit
        encoding: 'utf-8',
        env: { ...process.env, HOME: process.env.HOME },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      output = (err.stdout || '') + (err.stderr || '');
      exitCode = err.status || 1;
    }

    const duration = Date.now() - startTime;

    logActivity('user', 'terminal.exec', { command: validation.cmd, duration });

    res.json({
      command,
      output: output || '',
      exitCode,
      duration,
      cwd: WORKSPACE,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
