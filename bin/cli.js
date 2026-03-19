#!/usr/bin/env node

import { program } from 'commander';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

program
  .name('openclawboard')
  .description('Mission control dashboard for OpenClaw')
  .version(pkg.version)
  .option('-p, --port <number>', 'Port to run the dashboard on', '3333')
  .option('-H, --host <address>', 'Host to bind to', '127.0.0.1')
  .option('--no-auth', 'Disable authentication (not recommended for non-localhost)')
  .option('--openclaw-dir <path>', 'Path to OpenClaw directory', '~/.openclaw')
  .option('--data-dir <path>', 'Path to OpenClawBoard data directory', '~/.openclawboard')
  .action(async (opts) => {
    process.env.PORT = opts.port;
    process.env.HOST = opts.host;
    if (opts.openclawDir) process.env.OPENCLAW_DIR = opts.openclawDir;
    if (opts.dataDir) process.env.OPENCLAWBOARD_DATA = opts.dataDir;
    if (!opts.auth) process.env.DISABLE_AUTH = 'true';

    console.log('');
    console.log('  \x1b[35m⚡ OpenClawBoard\x1b[0m v' + pkg.version);
    console.log('');

    // Import and start the server
    await import('../server/index.js');
  });

program.parse();
