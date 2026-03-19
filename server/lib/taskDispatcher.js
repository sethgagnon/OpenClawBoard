import { readTasks, writeTasks } from '../lib/fileStore.js';
import { readSettings } from '../lib/fileStore.js';
import { logActivity } from '../lib/fileStore.js';
import { broadcast } from '../broadcast.js';
import { invokeOpenclawAgent } from '../lib/openclaw.js';

const activeRuns = new Map(); // taskId → { emitter, output }

function buildTaskPrompt(task) {
  const lines = [
    `You are working on a task from the OpenClawBoard Kanban board.`,
    ``,
    `## Task: ${task.title}`,
  ];

  if (task.description) {
    lines.push(``, `## Description`, task.description);
  }

  if (task.skills?.length) {
    lines.push(``, `## Required Skills`, task.skills.join(', '));
  }

  lines.push(
    ``,
    `## Instructions`,
    `- Complete the task described above.`,
    `- Be thorough and produce high-quality output.`,
    `- When finished, provide a clear summary of what was accomplished.`,
  );

  return lines.join('\n');
}

function updateTask(taskId, updates) {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null;

  const task = tasks[idx];
  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  tasks[idx] = task;
  writeTasks(tasks);
  return task;
}

export function dispatchTask(taskId) {
  // Don't double-dispatch
  if (activeRuns.has(taskId)) {
    return { error: 'Task is already running' };
  }

  const tasks = readTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status === 'running') return { error: 'Task is already running' };

  // Check concurrency
  const settings = readSettings();
  const maxConcurrent = settings.maxConcurrentTasks || 5;
  const runningCount = tasks.filter(t => t.status === 'running').length;
  if (runningCount >= maxConcurrent) {
    return { error: `Max concurrency reached (${maxConcurrent}). Wait for a running task to finish.` };
  }

  // Move to in-progress
  const updated = updateTask(taskId, {
    status: 'in-progress',
    startedAt: new Date().toISOString(),
    pickedUp: true,
    subagentId: 'openclawboard-dispatch',
    error: null,
    result: null,
  });

  logActivity('agent', 'task.dispatched', { taskId, title: task.title });
  broadcast('task:running', updated);

  // Spawn agent
  const prompt = buildTaskPrompt(task);
  const timeout = 10 * 60 * 1000; // 10 minutes
  const emitter = invokeOpenclawAgent(prompt, { timeout });

  const run = { emitter, output: '' };
  activeRuns.set(taskId, run);

  emitter.on('data', (chunk) => {
    run.output += chunk;
    broadcast('task:progress', {
      taskId,
      chunk,
      outputLength: run.output.length,
    });
  });

  emitter.on('error', (errMsg) => {
    // stderr output — log but don't fail yet (agent may still complete)
    broadcast('task:progress', {
      taskId,
      stderr: errMsg,
    });
  });

  emitter.on('close', ({ code }) => {
    activeRuns.delete(taskId);
    const now = new Date().toISOString();
    const success = code === 0;

    const completedTask = updateTask(taskId, {
      status: success ? 'done' : 'failed',
      completedAt: now,
      pickedUp: false,
      result: success ? run.output.trim() : null,
      error: success ? null : `Agent exited with code ${code}`,
    });

    if (completedTask) {
      // Record in run history
      const tasks = readTasks();
      const idx = tasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        tasks[idx].runHistory = tasks[idx].runHistory || [];
        tasks[idx].runHistory.push({
          startedAt: task.startedAt || updated.startedAt,
          completedAt: now,
          duration: new Date(now) - new Date(updated.startedAt),
          result: success ? (run.output.trim().slice(0, 500) || 'Completed') : null,
          error: success ? null : `Exit code ${code}`,
          subagentId: 'openclawboard-dispatch',
          success,
        });
        writeTasks(tasks);
      }

      logActivity('agent', 'task.completed', {
        taskId,
        title: task.title,
        success,
        duration: new Date(now) - new Date(updated.startedAt),
      });
      broadcast('task:completed', completedTask);
    }
  });

  return { ok: true, task: updated };
}

export function cancelTask(taskId) {
  const run = activeRuns.get(taskId);
  if (!run) return { error: 'Task is not currently running' };

  run.emitter.kill();
  activeRuns.delete(taskId);

  const updated = updateTask(taskId, {
    status: 'todo',
    pickedUp: false,
    subagentId: null,
    error: 'Cancelled by user',
  });

  logActivity('user', 'task.cancelled', { taskId });
  broadcast('task:updated', updated);
  return { ok: true, task: updated };
}

export function getActiveRuns() {
  const runs = {};
  for (const [taskId, run] of activeRuns) {
    runs[taskId] = { outputLength: run.output.length };
  }
  return runs;
}
