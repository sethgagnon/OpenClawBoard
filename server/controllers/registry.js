import { getAutomations, setAutomations } from '../lib/registryStore.js';
import { logActivity } from '../lib/fileStore.js';
import { broadcast } from '../broadcast.js';
import { PLATFORMS } from '../lib/platforms.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function listPlatforms(req, res) {
  try {
    res.json(PLATFORMS);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function listAutomations(req, res) {
  try {
    let items = getAutomations();
    const { platform, status, tag, search } = req.query;

    if (platform) {
      items = items.filter(a => a.platforms && a.platforms[platform]);
    }
    if (status) {
      items = items.filter(a => {
        if (!a.platforms) return false;
        return Object.values(a.platforms).some(p => p.status === status);
      });
    }
    if (tag) {
      const t = tag.toLowerCase();
      items = items.filter(a => (a.tags || []).some(at => at.toLowerCase() === t));
    }
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(a =>
        a.name.toLowerCase().includes(s) ||
        (a.description || '').toLowerCase().includes(s)
      );
    }

    items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getAutomation(req, res) {
  try {
    const items = getAutomations();
    const item = items.find(a => a.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Automation not found' });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function createAutomation(req, res) {
  try {
    const { name, description, category, schedule, inputs, outputs, dependencies, platforms, tags } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'description is required' });
    }

    const now = new Date().toISOString();
    const item = {
      id: generateId(),
      name: name.trim(),
      description: description.trim(),
      category: category || 'general',
      schedule: schedule || null,
      inputs: inputs || [],
      outputs: outputs || [],
      dependencies: dependencies || { tools: [], connectors: [], env_vars: [] },
      platforms: platforms || {},
      tags: tags || [],
      createdAt: now,
      updatedAt: now,
    };

    const items = getAutomations();
    items.push(item);
    setAutomations(items);

    logActivity('user', 'registry.created', { id: item.id, name: item.name });
    broadcast('registry:created', item);
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function updateAutomation(req, res) {
  try {
    const items = getAutomations();
    const idx = items.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Automation not found' });

    const updates = req.body;
    const item = items[idx];

    const allowedFields = [
      'name', 'description', 'category', 'schedule',
      'inputs', 'outputs', 'dependencies', 'platforms', 'tags',
    ];

    for (const key of allowedFields) {
      if (key in updates) {
        item[key] = updates[key];
      }
    }

    item.updatedAt = new Date().toISOString();
    items[idx] = item;
    setAutomations(items);

    logActivity('user', 'registry.updated', { id: item.id, name: item.name });
    broadcast('registry:updated', item);
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function deleteAutomation(req, res) {
  try {
    const items = getAutomations();
    const idx = items.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Automation not found' });

    const removed = items.splice(idx, 1)[0];
    setAutomations(items);

    logActivity('user', 'registry.deleted', { id: removed.id, name: removed.name });
    broadcast('registry:deleted', { id: removed.id });
    res.json({ ok: true, id: removed.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getRegistryStats(req, res) {
  try {
    const items = getAutomations();
    const byPlatform = {};
    const byCategory = {};
    const tagCounts = {};

    for (const item of items) {
      // Category
      const cat = item.category || 'general';
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      // Tags
      for (const tag of (item.tags || [])) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }

      // Platforms
      for (const [pid, pdata] of Object.entries(item.platforms || {})) {
        if (!byPlatform[pid]) byPlatform[pid] = {};
        const status = pdata.status || 'unknown';
        byPlatform[pid][status] = (byPlatform[pid][status] || 0) + 1;
      }
    }

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    res.json({
      total: items.length,
      byPlatform,
      byCategory,
      topTags,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
