import fs from 'fs';
import path from 'path';
import { OPENCLAW_DIR } from '../config.js';
import { readJSON } from '../lib/fileStore.js';
import { computeNextRun, computeFutureRuns, describeSchedule } from '../lib/schedule.js';

const CRON_DIR = path.join(OPENCLAW_DIR, 'cron');
const JOBS_FILE = path.join(CRON_DIR, 'jobs.json');
const RUNS_DIR = path.join(CRON_DIR, 'runs');

function loadJobs() {
  const raw = readJSON(JOBS_FILE, []);
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.jobs)) return raw.jobs;
  return [];
}

function normalizeExpression(job) {
  // Handle schedule as object { kind, expr, tz } or plain string
  if (job.expression) return job.expression;
  if (typeof job.schedule === 'string') return job.schedule;
  if (job.schedule?.expr) return job.schedule.expr;
  if (job.schedule?.expression) return job.schedule.expression;
  return null;
}

export function listCronJobs(req, res) {
  try {
    const jobs = loadJobs();
    const enriched = jobs.map(job => ({
      ...job,
      expression: normalizeExpression(job),
      nextRun: job.schedule ? computeNextRun(job.schedule) : null,
      scheduleDescription: describeSchedule(job.schedule),
    }));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getCronRuns(req, res) {
  try {
    const jobId = req.params.id;
    const runFile = path.join(RUNS_DIR, `${jobId}.json`);
    const runs = readJSON(runFile, []);

    // Sort most recent first
    runs.sort((a, b) => {
      const ta = a.completedAt || a.startedAt || '';
      const tb = b.completedAt || b.startedAt || '';
      return tb.localeCompare(ta);
    });

    const limit = parseInt(req.query.limit) || 50;
    res.json(runs.slice(0, limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function triggerCronJob(req, res) {
  try {
    const jobId = req.params.id;
    const jobs = loadJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return res.status(404).json({ error: 'Cron job not found' });

    // Record a manual trigger in runs
    if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
    const runFile = path.join(RUNS_DIR, `${jobId}.json`);
    const runs = readJSON(runFile, []);

    const run = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      jobId,
      trigger: 'manual',
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'triggered',
      result: null,
    };

    runs.unshift(run);
    const dir = path.dirname(runFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = runFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(runs, null, 2));
    fs.renameSync(tmp, runFile);

    res.json({ ok: true, run });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getUpcomingCrons(req, res) {
  try {
    const jobs = loadJobs();
    const days = parseInt(req.query.days) || 7;
    const upcoming = [];

    for (const job of jobs) {
      if (!job.schedule || job.enabled === false) continue;
      const runs = computeFutureRuns(job.schedule, days);
      for (const runDate of runs) {
        upcoming.push({
          jobId: job.id,
          name: job.name || job.id,
          schedule: job.schedule,
          scheduleDescription: describeSchedule(job.schedule),
          date: runDate,
        });
      }
    }

    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    const limit = parseInt(req.query.limit) || 100;
    res.json(upcoming.slice(0, limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
