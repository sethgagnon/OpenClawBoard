import { readActivity } from '../lib/fileStore.js';
import { getTimezone, isoToDateInTz, startOfDayInTz, startOfWeekInTz, startOfMonthInTz } from '../lib/timezone.js';

export function getActivity(req, res) {
  try {
    const activity = readActivity();
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const actor = req.query.actor;
    const action = req.query.action;

    let filtered = activity;
    if (actor) filtered = filtered.filter(a => a.actor === actor);
    if (action) filtered = filtered.filter(a => a.action === action);

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    res.json({ items, total, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getActivityHeatmap(req, res) {
  try {
    const activity = readActivity();
    const days = parseInt(req.query.days) || 365;
    const cutoff = new Date(Date.now() - days * 86400000);

    const heatmap = {};
    for (const entry of activity) {
      if (!entry.timestamp) continue;
      const d = new Date(entry.timestamp);
      if (d < cutoff) continue;
      const dateKey = isoToDateInTz(entry.timestamp);
      heatmap[dateKey] = (heatmap[dateKey] || 0) + 1;
    }

    // Build array of { date, count } for the period
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      result.push({ date: dateKey, count: heatmap[dateKey] || 0 });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getActivityChart(req, res) {
  try {
    const activity = readActivity();
    const range = req.query.range || 'week'; // day, week, month
    const tz = getTimezone();
    const now = new Date();

    let startDate;
    let groupBy;

    if (range === 'day') {
      startDate = startOfDayInTz(now, tz);
      groupBy = 'hour';
    } else if (range === 'month') {
      startDate = startOfMonthInTz(now, tz);
      groupBy = 'day';
    } else {
      startDate = startOfWeekInTz(now, tz);
      groupBy = 'day';
    }

    const groups = {};
    for (const entry of activity) {
      if (!entry.timestamp) continue;
      const d = new Date(entry.timestamp);
      if (d < startDate) continue;

      let key;
      if (groupBy === 'hour') {
        key = d.toISOString().slice(0, 13);
      } else {
        key = isoToDateInTz(entry.timestamp);
      }
      groups[key] = (groups[key] || 0) + 1;
    }

    const data = Object.entries(groups)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    res.json({ range, groupBy, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getTime(req, res) {
  const tz = getTimezone();
  res.json({
    timezone: tz,
    iso: new Date().toISOString(),
    local: new Date().toLocaleString('en-US', { timeZone: tz }),
    unix: Date.now(),
  });
}
