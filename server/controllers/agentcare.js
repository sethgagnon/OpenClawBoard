import { getItems, setItems } from '../lib/registryStore.js';
import { logActivity } from '../lib/fileStore.js';
import { broadcast } from '../broadcast.js';
import { PROVIDERS, getImporters } from '../lib/providers.js';
import { analyzeGaps } from '../lib/gapAnalysis.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── Providers ───

export function listProviders(req, res) {
  try {
    res.json(PROVIDERS);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── Dashboard ───

export function getDashboard(req, res) {
  try {
    const items = getItems();
    const providers = Object.keys(PROVIDERS);

    const byProvider = {};
    const byKind = {};
    let sharedCount = 0;

    for (const item of items) {
      // By provider
      const provider = item.provider || 'unknown';
      byProvider[provider] = (byProvider[provider] || 0) + 1;

      // By kind
      const kind = item.kind || 'unknown';
      byKind[kind] = (byKind[kind] || 0) + 1;

      // Shared items (exist on multiple providers)
      const platformCount = Object.keys(item.platforms || {}).length;
      if (platformCount > 1) sharedCount++;
    }

    // Health summary
    let healthyCount = 0;
    let warningCount = 0;
    let criticalCount = 0;

    for (const item of items) {
      const { readiness } = analyzeGaps(item, null);
      if (readiness === 'ready') healthyCount++;
      else if (readiness === 'partial') warningCount++;
      else criticalCount++;
    }

    res.json({
      total: items.length,
      byProvider,
      byKind,
      sharedCount,
      providersConnected: providers.length,
      health: {
        healthy: healthyCount,
        warning: warningCount,
        critical: criticalCount,
      },
      recentItems: items
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 5),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── Items CRUD ───

export function listItems(req, res) {
  try {
    let items = getItems();
    const { provider, kind, status, tag, search } = req.query;

    if (provider) {
      items = items.filter(a => a.provider === provider);
    }
    if (kind) {
      items = items.filter(a => a.kind === kind);
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

export function getItem(req, res) {
  try {
    const items = getItems();
    const item = items.find(a => a.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function createItem(req, res) {
  try {
    const { name, description, kind, provider, category, schedule, inputs, outputs, dependencies, platforms, tags } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const now = new Date().toISOString();
    const item = {
      id: generateId(),
      name: name.trim(),
      description: (description || '').trim(),
      kind: kind || 'skill',
      provider: provider || 'unknown',
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

    const items = getItems();
    items.push(item);
    setItems(items);

    logActivity('user', 'agentcare.created', { id: item.id, name: item.name });
    broadcast('agentcare:created', item);
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function updateItem(req, res) {
  try {
    const items = getItems();
    const idx = items.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    const updates = req.body;
    const item = items[idx];

    const allowedFields = [
      'name', 'description', 'kind', 'provider', 'category', 'schedule',
      'inputs', 'outputs', 'dependencies', 'platforms', 'tags',
    ];

    for (const key of allowedFields) {
      if (key in updates) {
        item[key] = updates[key];
      }
    }

    item.updatedAt = new Date().toISOString();
    items[idx] = item;
    setItems(items);

    logActivity('user', 'agentcare.updated', { id: item.id, name: item.name });
    broadcast('agentcare:updated', item);
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function deleteItem(req, res) {
  try {
    const items = getItems();
    const idx = items.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    const removed = items.splice(idx, 1)[0];
    setItems(items);

    logActivity('user', 'agentcare.deleted', { id: removed.id, name: removed.name });
    broadcast('agentcare:deleted', { id: removed.id });
    res.json({ ok: true, id: removed.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── Insights ───

export function getInsightsInventory(req, res) {
  try {
    const items = getItems();
    const providerIds = Object.keys(PROVIDERS);

    // Cross-provider analysis
    const byProvider = {};
    const byKind = {};
    const byCategory = {};
    const sharedItems = [];
    const uniqueByProvider = {};

    for (const pid of providerIds) {
      byProvider[pid] = [];
      uniqueByProvider[pid] = [];
    }

    for (const item of items) {
      const provider = item.provider || 'unknown';
      const kind = item.kind || 'unknown';
      const cat = item.category || 'general';

      if (byProvider[provider]) byProvider[provider].push(item);
      byKind[kind] = (byKind[kind] || 0) + 1;
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      // Check if shared
      const platformCount = Object.keys(item.platforms || {}).length;
      if (platformCount > 1) {
        sharedItems.push({
          id: item.id,
          name: item.name,
          kind: item.kind,
          providers: Object.keys(item.platforms),
        });
      } else if (uniqueByProvider[provider]) {
        uniqueByProvider[provider].push(item);
      }
    }

    // Capability matrix
    const capabilityMatrix = providerIds.map(pid => ({
      provider: pid,
      providerName: PROVIDERS[pid].name,
      capabilities: PROVIDERS[pid].capabilities,
      itemCount: (byProvider[pid] || []).length,
    }));

    res.json({
      total: items.length,
      byProvider: Object.fromEntries(
        Object.entries(byProvider).map(([k, v]) => [k, v.length])
      ),
      byKind,
      byCategory,
      sharedItems,
      uniqueByProvider: Object.fromEntries(
        Object.entries(uniqueByProvider).map(([k, v]) => [k, v.length])
      ),
      capabilityMatrix,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getInsightsHealth(req, res) {
  try {
    const items = getItems();

    const results = [];
    let healthyCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    const gapsByCategory = {};

    for (const item of items) {
      const analysis = analyzeGaps(item, null);

      if (analysis.readiness === 'ready') healthyCount++;
      else if (analysis.readiness === 'partial') warningCount++;
      else criticalCount++;

      for (const gap of analysis.gaps) {
        gapsByCategory[gap.category] = (gapsByCategory[gap.category] || 0) + 1;
      }

      if (analysis.readiness !== 'ready') {
        results.push({
          id: item.id,
          name: item.name,
          kind: item.kind,
          provider: item.provider,
          readiness: analysis.readiness,
          gapCount: analysis.gaps.length,
          gaps: analysis.gaps,
          connectors: analysis.connectors,
        });
      }
    }

    const healthScore = items.length > 0
      ? Math.round((healthyCount / items.length) * 100)
      : 100;

    res.json({
      healthScore,
      total: items.length,
      healthy: healthyCount,
      warning: warningCount,
      critical: criticalCount,
      gapsByCategory,
      itemsWithGaps: results.sort((a, b) => {
        const order = { blocked: 0, partial: 1 };
        return (order[a.readiness] ?? 2) - (order[b.readiness] ?? 2);
      }),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getInsightsUsage(req, res) {
  try {
    const items = getItems();

    // Aggregate usage from items that have platform data with lastRun info
    const byProvider = {};
    const recentlyActive = [];

    for (const item of items) {
      const provider = item.provider || 'unknown';
      byProvider[provider] = (byProvider[provider] || 0) + 1;

      // Check for last run across platforms
      for (const [pid, pdata] of Object.entries(item.platforms || {})) {
        if (pdata.lastRun) {
          recentlyActive.push({
            id: item.id,
            name: item.name,
            kind: item.kind,
            provider: pid,
            lastRun: pdata.lastRun,
            lastStatus: pdata.lastStatus || 'unknown',
          });
        }
      }
    }

    // Sort by most recent
    recentlyActive.sort((a, b) => (b.lastRun || '').localeCompare(a.lastRun || ''));

    res.json({
      totalItems: items.length,
      byProvider,
      recentlyActive: recentlyActive.slice(0, 20),
      byKind: items.reduce((acc, item) => {
        const kind = item.kind || 'unknown';
        acc[kind] = (acc[kind] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
