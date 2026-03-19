const PRESETS = {
  daily: '0 9 * * *',
  weekly: '0 9 * * 1',
  monthly: '0 9 1 * *',
};

export function resolveSchedule(schedule) {
  if (!schedule) return null;
  // Handle object format: { kind: "cron", expr: "0 7 * * 1-5" }
  if (typeof schedule === 'object' && schedule !== null) {
    return schedule.expr || schedule.expression || schedule.cron || null;
  }
  if (schedule === 'asap' || schedule === 'next-heartbeat') return schedule;
  return PRESETS[schedule] || schedule;
}

function parseCronField(field, min, max) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [rangeStep, step] = part.split('/');
    const stepVal = step ? parseInt(step) : 1;

    if (rangeStep === '*') {
      for (let i = min; i <= max; i += stepVal) values.add(i);
    } else if (rangeStep.includes('-')) {
      const [a, b] = rangeStep.split('-').map(Number);
      for (let i = a; i <= b; i += stepVal) values.add(i);
    } else {
      values.add(parseInt(rangeStep));
    }
  }
  return [...values].sort((a, b) => a - b);
}

export function computeNextRun(schedule) {
  const resolved = resolveSchedule(schedule);
  if (!resolved || resolved === 'asap' || resolved === 'next-heartbeat') {
    return new Date().toISOString();
  }

  const parts = resolved.split(/\s+/);
  if (parts.length !== 5) return new Date().toISOString();

  const [minField, hourField, domField, monField, dowField] = parts;
  const minutes = parseCronField(minField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const doms = parseCronField(domField, 1, 31);
  const months = parseCronField(monField, 1, 12);
  const dows = parseCronField(dowField, 0, 6);

  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);

  for (let i = 0; i < 525960; i++) {
    candidate.setMinutes(candidate.getMinutes() + 1);
    const m = candidate.getMinutes();
    const h = candidate.getHours();
    const dom = candidate.getDate();
    const mon = candidate.getMonth() + 1;
    const dow = candidate.getDay();

    if (!minutes.includes(m)) continue;
    if (!hours.includes(h)) continue;
    if (!months.includes(mon)) continue;
    if (domField === '*' && dowField === '*') {
      return candidate.toISOString();
    }
    if (domField !== '*' && dowField !== '*') {
      if (doms.includes(dom) || dows.includes(dow)) return candidate.toISOString();
    } else if (domField !== '*') {
      if (doms.includes(dom)) return candidate.toISOString();
    } else {
      if (dows.includes(dow)) return candidate.toISOString();
    }
  }

  return new Date(Date.now() + 86400000).toISOString();
}

export function computeFutureRuns(schedule, days = 30) {
  const resolved = resolveSchedule(schedule);
  if (!resolved || resolved === 'asap' || resolved === 'next-heartbeat') return [];

  const runs = [];
  const end = Date.now() + days * 86400000;
  let current = computeNextRun(schedule);

  while (current && new Date(current).getTime() < end && runs.length < 200) {
    runs.push(current);
    const next = new Date(current);
    next.setMinutes(next.getMinutes() + 1);
    const saved = new Date();
    // Temporarily advance "now" to find next occurrence
    const parts = resolved.split(/\s+/);
    if (parts.length !== 5) break;

    const [minField, hourField, domField, monField, dowField] = parts;
    const minutes = parseCronField(minField, 0, 59);
    const hours = parseCronField(hourField, 0, 23);
    const doms = parseCronField(domField, 1, 31);
    const months = parseCronField(monField, 1, 12);
    const dows = parseCronField(dowField, 0, 6);

    let found = false;
    for (let i = 0; i < 525960; i++) {
      next.setMinutes(next.getMinutes() + 1);
      const m = next.getMinutes();
      const h = next.getHours();
      const dom = next.getDate();
      const mon = next.getMonth() + 1;
      const dow = next.getDay();

      if (!minutes.includes(m)) continue;
      if (!hours.includes(h)) continue;
      if (!months.includes(mon)) continue;

      let dayMatch = false;
      if (domField === '*' && dowField === '*') {
        dayMatch = true;
      } else if (domField !== '*' && dowField !== '*') {
        dayMatch = doms.includes(dom) || dows.includes(dow);
      } else if (domField !== '*') {
        dayMatch = doms.includes(dom);
      } else {
        dayMatch = dows.includes(dow);
      }

      if (dayMatch) {
        current = next.toISOString();
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  return runs;
}

export function describeSchedule(schedule) {
  if (!schedule) return 'No schedule';
  const resolved = resolveSchedule(schedule);
  if (!resolved) return 'No schedule';
  if (resolved === 'asap') return 'ASAP';
  if (resolved === 'next-heartbeat') return 'Next heartbeat';
  if (resolved === 'daily') return 'Daily at 9:00 AM';
  if (resolved === 'weekly') return 'Weekly on Monday at 9:00 AM';
  if (resolved === 'monthly') return 'Monthly on the 1st at 9:00 AM';
  return `Cron: ${resolved}`;
}
