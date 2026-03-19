import { readTasks, writeTasks } from '../lib/fileStore.js';
import { logActivity } from '../lib/fileStore.js';
import { broadcast } from '../broadcast.js';
import { computeNextRun, computeFutureRuns, describeSchedule, resolveSchedule } from '../lib/schedule.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function listTasks(req, res) {
  try {
    const tasks = readTasks();
    const status = req.query.status;
    const priority = req.query.priority;
    let filtered = tasks;
    if (status) filtered = filtered.filter(t => t.status === status);
    if (priority) filtered = filtered.filter(t => t.priority === priority);
    filtered.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function createTask(req, res) {
  try {
    const tasks = readTasks();
    const {
      title, description, priority, status: reqStatus, skill, skills,
      schedule, scheduledAt, scheduleEnabled,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const now = new Date().toISOString();
    const task = {
      id: generateId(),
      title: title.trim(),
      description: description || '',
      priority: priority || 'medium',
      skill: skill || null,
      skills: skills || [],
      status: reqStatus || 'pending',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      schedule: schedule || null,
      scheduledAt: scheduledAt || (schedule ? computeNextRun(schedule) : null),
      scheduleEnabled: scheduleEnabled ?? (!!schedule),
      runHistory: [],
      result: null,
      startedAt: null,
      error: null,
      order: tasks.length,
      pickedUp: false,
      subagentId: null,
    };

    tasks.push(task);
    writeTasks(tasks);
    logActivity('user', 'task.created', { taskId: task.id, title: task.title });
    broadcast('task:created', task);
    res.status(201).json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function updateTask(req, res) {
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const updates = req.body;
    const task = tasks[idx];
    const prevStatus = task.status;

    const allowedFields = [
      'title', 'description', 'priority', 'skill', 'skills',
      'status', 'schedule', 'scheduledAt', 'scheduleEnabled',
      'result', 'error', 'recommendation', 'order', 'subagentId',
    ];

    for (const key of allowedFields) {
      if (key in updates) {
        task[key] = updates[key];
      }
    }

    task.updatedAt = new Date().toISOString();

    // Handle status transitions
    if (updates.status === 'completed' && prevStatus !== 'completed') {
      task.completedAt = new Date().toISOString();
    }
    if (updates.status === 'running' && prevStatus !== 'running') {
      task.startedAt = new Date().toISOString();
    }

    // If schedule changed, recompute next run
    if ('schedule' in updates && updates.schedule) {
      task.scheduledAt = computeNextRun(updates.schedule);
    }

    tasks[idx] = task;
    writeTasks(tasks);
    logActivity('user', 'task.updated', { taskId: task.id, changes: Object.keys(updates) });
    broadcast('task:updated', task);
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function reorderTasks(req, res) {
  try {
    const { order } = req.body; // array of task IDs in new order
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of task IDs' });
    }

    const tasks = readTasks();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    for (let i = 0; i < order.length; i++) {
      const task = taskMap.get(order[i]);
      if (task) task.order = i;
    }

    writeTasks(tasks);
    broadcast('tasks:reordered', { order });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function runTask(req, res) {
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[idx];
    task.status = 'queued';
    task.updatedAt = new Date().toISOString();
    task.error = null;
    task.result = null;
    task.startedAt = null;
    task.pickedUp = false;

    tasks[idx] = task;
    writeTasks(tasks);
    logActivity('user', 'task.queued', { taskId: task.id, title: task.title });
    broadcast('task:queued', task);
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getTaskQueue(req, res) {
  try {
    const tasks = readTasks();
    const queued = tasks
      .filter(t => t.status === 'queued' && !t.pickedUp)
      .sort((a, b) => {
        // Priority ordering: critical > high > medium > low
        const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const pa = pOrder[a.priority] ?? 2;
        const pb = pOrder[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return (a.order ?? Infinity) - (b.order ?? Infinity);
      });
    res.json(queued);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function pickupTask(req, res) {
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[idx];
    if (task.status !== 'queued') {
      return res.status(400).json({ error: 'Task is not queued' });
    }

    task.pickedUp = true;
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    task.subagentId = req.body.subagentId || null;

    tasks[idx] = task;
    writeTasks(tasks);
    logActivity('agent', 'task.picked_up', { taskId: task.id, subagentId: task.subagentId });
    broadcast('task:running', task);
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function completeTask(req, res) {
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[idx];
    const now = new Date().toISOString();
    const { result, error } = req.body;

    // Record in run history
    task.runHistory = task.runHistory || [];
    task.runHistory.push({
      startedAt: task.startedAt,
      completedAt: now,
      duration: task.startedAt ? new Date(now) - new Date(task.startedAt) : 0,
      result: result || null,
      error: error || null,
      subagentId: task.subagentId,
      success: !error,
    });

    task.status = error ? 'failed' : 'completed';
    task.completedAt = now;
    task.updatedAt = now;
    task.result = result || null;
    task.error = error || null;
    task.pickedUp = false;

    // If recurring, reschedule
    if (task.schedule && task.scheduleEnabled && !error) {
      task.status = 'pending';
      task.scheduledAt = computeNextRun(task.schedule);
      task.completedAt = null;
      task.startedAt = null;
      task.result = null;
      task.error = null;
      task.pickedUp = false;
      task.subagentId = null;
    }

    tasks[idx] = task;
    writeTasks(tasks);
    logActivity('agent', 'task.completed', { taskId: task.id, success: !error });
    broadcast('task:completed', task);
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function deleteTask(req, res) {
  try {
    let tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const removed = tasks.splice(idx, 1)[0];
    writeTasks(tasks);
    logActivity('user', 'task.deleted', { taskId: removed.id, title: removed.title });
    broadcast('task:deleted', { id: removed.id });
    res.json({ ok: true, id: removed.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function bulkDeleteTasks(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    let tasks = readTasks();
    const idSet = new Set(ids);
    const removed = tasks.filter(t => idSet.has(t.id));
    tasks = tasks.filter(t => !idSet.has(t.id));
    writeTasks(tasks);

    logActivity('user', 'tasks.bulk_deleted', { count: removed.length });
    broadcast('tasks:deleted', { ids: removed.map(t => t.id) });
    res.json({ ok: true, deleted: removed.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getCalendar(req, res) {
  try {
    const tasks = readTasks();
    const days = parseInt(req.query.days) || 30;

    const scheduledTasks = tasks.filter(t => t.schedule && t.scheduleEnabled);
    const events = [];

    for (const task of scheduledTasks) {
      const runs = computeFutureRuns(task.schedule, days);
      for (const runDate of runs) {
        events.push({
          taskId: task.id,
          title: task.title,
          schedule: task.schedule,
          scheduleDescription: describeSchedule(task.schedule),
          date: runDate,
          priority: task.priority,
        });
      }
    }

    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getRunHistory(req, res) {
  try {
    const tasks = readTasks();
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    res.json(task.runHistory || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function toggleSchedule(req, res) {
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[idx];
    task.scheduleEnabled = !task.scheduleEnabled;
    task.updatedAt = new Date().toISOString();

    if (task.scheduleEnabled && task.schedule) {
      task.scheduledAt = computeNextRun(task.schedule);
    }

    tasks[idx] = task;
    writeTasks(tasks);
    broadcast('task:updated', task);
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function getCapacity(req, res) {
  try {
    const tasks = readTasks();
    const running = tasks.filter(t => t.status === 'running').length;
    const queued = tasks.filter(t => t.status === 'queued').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const total = tasks.length;

    res.json({
      running,
      queued,
      pending,
      completed,
      failed,
      total,
      available: Math.max(0, 5 - running), // default max concurrency of 5
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function reportStatusCheck(req, res) {
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[idx];
    const { status, progress, message } = req.body;

    task.lastStatusCheck = {
      timestamp: new Date().toISOString(),
      status: status || task.status,
      progress: progress ?? null,
      message: message || null,
    };
    task.updatedAt = new Date().toISOString();

    tasks[idx] = task;
    writeTasks(tasks);
    broadcast('task:status-check', { taskId: task.id, ...task.lastStatusCheck });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
