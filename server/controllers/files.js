import fs from 'fs';
import path from 'path';
import { WORKSPACE, EXCLUDED } from '../config.js';
import { formatBytes } from '../lib/format.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB read limit

function isPathSafe(filePath) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(WORKSPACE);
}

function walkDir(dir, prefix = '', depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return [];
  const entries = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const stat = fs.statSync(fullPath);
        entries.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          modified: stat.mtime.toISOString(),
        });
        entries.push(...walkDir(fullPath, relativePath, depth + 1, maxDepth));
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        entries.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          size: stat.size,
          sizeFormatted: formatBytes(stat.size),
          modified: stat.mtime.toISOString(),
          ext: path.extname(entry.name).slice(1),
        });
      }
    }
  } catch {}
  return entries;
}

export function listFiles(req, res) {
  try {
    const subdir = req.query.path || '';
    const dir = path.join(WORKSPACE, subdir);
    if (!isPathSafe(dir)) {
      return res.status(403).json({ error: 'Path outside workspace' });
    }
    if (!fs.existsSync(dir)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const flat = req.query.flat === 'true';
    const maxDepth = flat ? parseInt(req.query.depth) || 5 : 1;

    let entries;
    if (flat) {
      entries = walkDir(dir, subdir || '', 0, maxDepth);
    } else {
      entries = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (EXCLUDED.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(dir, entry.name);
        const relativePath = subdir ? `${subdir}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          entries.push({ name: entry.name, path: relativePath, type: 'directory' });
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          entries.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            size: stat.size,
            sizeFormatted: formatBytes(stat.size),
            modified: stat.mtime.toISOString(),
            ext: path.extname(entry.name).slice(1),
          });
        }
      }
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ path: subdir, entries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getFileContent(req, res) {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'path is required' });

    const fullPath = path.join(WORKSPACE, filePath);
    if (!isPathSafe(fullPath)) {
      return res.status(403).json({ error: 'Path outside workspace' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_FILE_SIZE) {
      return res.status(413).json({ error: 'File too large', size: stat.size, limit: MAX_FILE_SIZE });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({
      path: filePath,
      content,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      ext: path.extname(filePath).slice(1),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function updateFileContent(req, res) {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    if (content === undefined) return res.status(400).json({ error: 'content is required' });

    const fullPath = path.join(WORKSPACE, filePath);
    if (!isPathSafe(fullPath)) {
      return res.status(403).json({ error: 'Path outside workspace' });
    }

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(fullPath, content, 'utf-8');
    const stat = fs.statSync(fullPath);

    res.json({
      path: filePath,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function downloadFile(req, res) {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'path is required' });

    const fullPath = path.join(WORKSPACE, filePath);
    if (!isPathSafe(fullPath)) {
      return res.status(403).json({ error: 'Path outside workspace' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(fullPath, path.basename(fullPath));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
