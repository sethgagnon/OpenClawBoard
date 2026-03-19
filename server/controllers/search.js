import fs from 'fs';
import path from 'path';
import { WORKSPACE, EXCLUDED } from '../config.js';
import { formatBytes } from '../lib/format.js';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg',
  'mp3', 'mp4', 'wav', 'avi', 'mov',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib',
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'woff', 'woff2', 'ttf', 'eot',
  'pyc', 'class', 'o',
]);

const MAX_RESULTS = 100;
const MAX_FILE_SCAN_SIZE = 512 * 1024; // 512KB

function isBinary(fileName) {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function searchInDir(dir, query, results, prefix = '', depth = 0) {
  if (depth > 10 || results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) break;
    if (EXCLUDED.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Check if directory name matches
      if (entry.name.toLowerCase().includes(query)) {
        results.push({
          path: relativePath,
          name: entry.name,
          type: 'directory',
          matchType: 'name',
        });
      }
      searchInDir(fullPath, query, results, relativePath, depth + 1);
    } else if (entry.isFile()) {
      // Check file name match
      const nameMatch = entry.name.toLowerCase().includes(query);

      if (nameMatch) {
        const stat = fs.statSync(fullPath);
        results.push({
          path: relativePath,
          name: entry.name,
          type: 'file',
          matchType: 'name',
          size: stat.size,
          sizeFormatted: formatBytes(stat.size),
          ext: path.extname(entry.name).slice(1),
        });
      }

      // Check file content match (skip binary files and large files)
      if (!isBinary(entry.name) && results.length < MAX_RESULTS) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size <= MAX_FILE_SCAN_SIZE) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            const matchingLines = [];

            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(query)) {
                matchingLines.push({
                  line: i + 1,
                  text: lines[i].trim().slice(0, 200),
                });
                if (matchingLines.length >= 5) break;
              }
            }

            if (matchingLines.length > 0 && !nameMatch) {
              results.push({
                path: relativePath,
                name: entry.name,
                type: 'file',
                matchType: 'content',
                size: stat.size,
                sizeFormatted: formatBytes(stat.size),
                ext: path.extname(entry.name).slice(1),
                matches: matchingLines,
              });
            } else if (nameMatch && matchingLines.length > 0) {
              // Augment existing name match with content matches
              const existing = results.find(r => r.path === relativePath);
              if (existing) existing.matches = matchingLines;
            }
          }
        } catch {}
      }
    }
  }
}

export function searchFiles(req, res) {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.status(400).json({ error: 'q parameter is required' });
    if (q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });

    const results = [];
    searchInDir(WORKSPACE, q, results);

    res.json({
      query: req.query.q,
      results,
      total: results.length,
      truncated: results.length >= MAX_RESULTS,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
