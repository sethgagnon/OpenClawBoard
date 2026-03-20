import fs from 'fs';
import path from 'path';

const EXCLUDED = new Set(['node_modules', '.git', '__pycache__', '.venv']);

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter: {}, body: string }.
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: {}, body: content };

  const body = content.slice(match[0].length).trim();
  const yaml = match[1];
  const frontmatter = {};

  let currentKey = null;

  for (const line of yaml.split('\n')) {
    // Top-level key: value
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const [, key, rawVal] = kvMatch;
      let val = rawVal.trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Inline array
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      }
      // Multi-line indicator
      if (val === '|' || val === '>') {
        frontmatter[key] = '';
        currentKey = key;
        continue;
      }
      frontmatter[key] = val || true;
      currentKey = null;
      continue;
    }

    // Continuation of multi-line value
    if (currentKey && line.startsWith(' ')) {
      frontmatter[currentKey] += (frontmatter[currentKey] ? '\n' : '') + line.trim();
      continue;
    }

    // Array items (- value)
    if (currentKey && line.match(/^\s+-\s+/)) {
      if (!Array.isArray(frontmatter[currentKey])) frontmatter[currentKey] = [];
      frontmatter[currentKey].push(line.replace(/^\s+-\s+/, '').trim());
    }
  }

  return { frontmatter, body };
}

/**
 * Scan a list of directories for skills.
 * Each directory is scanned for:
 *   - Subdirectories containing SKILL.md
 *   - Flat .md files with optional frontmatter
 *   - Python scripts (.py)
 *
 * @param {Array<{dir: string, source: string}>} dirs — directories to scan with source labels
 * @returns {Array} — skill objects
 */
export function scanSkillDirectories(dirs) {
  const skills = [];

  for (const { dir, source } of dirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      for (const entry of fs.readdirSync(dir)) {
        if (EXCLUDED.has(entry) || entry.startsWith('.')) continue;
        const entryPath = path.join(dir, entry);
        const stat = fs.statSync(entryPath);

        if (stat.isDirectory()) {
          // Directory-based skill with SKILL.md
          const skillFile = path.join(entryPath, 'SKILL.md');
          if (fs.existsSync(skillFile)) {
            const content = fs.readFileSync(skillFile, 'utf-8');
            const { frontmatter, body } = parseFrontmatter(content);
            const titleMatch = body.match(/^#\s+(.+)/m);

            skills.push({
              type: 'skill-dir',
              name: frontmatter.name || entry,
              title: titleMatch ? titleMatch[1].trim() : frontmatter.name || entry,
              description: frontmatter.description || '',
              path: skillFile,
              dirPath: entryPath,
              frontmatter,
              content,
              source,
            });
          }
        } else if (entry.endsWith('.md') && stat.isFile()) {
          // Flat .md skill
          const content = fs.readFileSync(entryPath, 'utf-8');
          const { frontmatter, body } = parseFrontmatter(content);
          const titleMatch = body.match(/^#\s+(.+)/m);
          const name = entry.replace(/\.md$/, '');

          skills.push({
            type: 'skill-md',
            name: frontmatter.name || name,
            title: titleMatch ? titleMatch[1].trim() : name,
            description: frontmatter.description || '',
            path: entryPath,
            dirPath: null,
            frontmatter,
            content,
            source,
          });
        } else if (entry.endsWith('.py') && stat.isFile()) {
          // Python script skill
          skills.push({
            type: 'script',
            name: entry.replace(/\.py$/, ''),
            title: entry.replace(/\.py$/, '').replace(/-/g, ' '),
            description: `Python script: ${entry}`,
            path: entryPath,
            dirPath: null,
            frontmatter: {},
            content: null,
            source,
          });
        }
      }
    } catch {}
  }

  return skills;
}
