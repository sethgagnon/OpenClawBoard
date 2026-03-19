import fs from 'fs';
import path from 'path';
import { WORKSPACE } from '../config.js';
import { formatBytes } from '../lib/format.js';

const MEMORY_DIR = path.join(WORKSPACE, 'memory');

function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

export function listMemory(req, res) {
  try {
    ensureMemoryDir();
    const files = [];

    for (const entry of fs.readdirSync(MEMORY_DIR)) {
      if (!entry.endsWith('.md')) continue;
      const fullPath = path.join(MEMORY_DIR, entry);
      const stat = fs.statSync(fullPath);
      files.push({
        name: entry,
        path: entry,
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        modified: stat.mtime.toISOString(),
      });
    }

    files.sort((a, b) => a.name.localeCompare(b.name));
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getMemoryFile(req, res) {
  try {
    const fileName = req.query.name;
    if (!fileName) return res.status(400).json({ error: 'name is required' });

    // Prevent path traversal
    const safeName = path.basename(fileName);
    const fullPath = path.join(MEMORY_DIR, safeName);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Memory file not found' });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const stat = fs.statSync(fullPath);

    res.json({
      name: safeName,
      content,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function updateMemoryFile(req, res) {
  try {
    const { name, content } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (content === undefined) return res.status(400).json({ error: 'content is required' });

    ensureMemoryDir();
    const safeName = path.basename(name);
    // Ensure .md extension
    const fileName = safeName.endsWith('.md') ? safeName : safeName + '.md';
    const fullPath = path.join(MEMORY_DIR, fileName);

    fs.writeFileSync(fullPath, content, 'utf-8');
    const stat = fs.statSync(fullPath);

    res.json({
      name: fileName,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
