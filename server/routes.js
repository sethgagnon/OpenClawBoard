import { Router } from 'express';
import path from 'path';
import { __dirname } from './config.js';
import { dispatchTask, cancelTask, getActiveRuns, getOpenclawHeartbeatInterval } from './lib/taskDispatcher.js';

// Controllers
import { getSystemMetrics } from './controllers/system.js';
import { getActivity, getActivityHeatmap, getActivityChart, getTime } from './controllers/activity.js';
import {
  listTasks, createTask, updateTask, reorderTasks,
  runTask, getTaskQueue, pickupTask, completeTask, deleteTask, bulkDeleteTasks,
  getCalendar, getRunHistory, toggleSchedule, getCapacity, reportStatusCheck,
} from './controllers/tasks.js';
import { getUsage, getUsageHistory, getUsageBreakdown, getDetectedProviders } from './controllers/usage.js';
import { listAgents, getAgent, getAgentSessions, getAgentSession } from './controllers/agents.js';
import { listModels, setModel, getHeartbeat, postHeartbeat } from './controllers/models.js';
import { listSkills, toggleSkill, createSkill, getSkillContent, deleteSkill } from './controllers/skills.js';
import { listFiles, getFileContent, updateFileContent, downloadFile } from './controllers/files.js';
import { listMemory, getMemoryFile, updateMemoryFile } from './controllers/memory.js';
import { getSettings, postSettings } from './controllers/settings.js';
import { listCronJobs, getCronRuns, triggerCronJob, getUpcomingCrons } from './controllers/cron.js';
import {
  getNotifications, markNotificationRead, markAllRead,
} from './controllers/notifications.js';
import { searchFiles } from './controllers/search.js';
import {
  getSuggestions, getSuggestionInsights, runDeepAnalysis, getSuggestionHistory, applySuggestion,
} from './controllers/suggestions.js';
import { getTerminalCommands, execTerminalCommand } from './controllers/terminal.js';

const router = Router();

// System
router.get('/api/system/metrics', getSystemMetrics);
router.get('/api/time', getTime);

// Agents
router.get('/api/agents', listAgents);
router.get('/api/agents/:name', getAgent);
router.get('/api/agents/:name/sessions', getAgentSessions);
router.get('/api/agents/:name/sessions/:id', getAgentSession);

// Tasks (Kanban)
router.get('/api/tasks', listTasks);
router.post('/api/tasks', createTask);
router.put('/api/tasks/:id', updateTask);
router.post('/api/tasks/reorder', reorderTasks);
router.post('/api/tasks/:id/run', runTask);
router.get('/api/tasks/queue', getTaskQueue);
router.get('/api/tasks/capacity', getCapacity);
router.post('/api/tasks/:id/pickup', pickupTask);
router.post('/api/tasks/:id/complete', completeTask);
router.post('/api/tasks/:id/status-check', reportStatusCheck);
router.get('/api/tasks/:id/history', getRunHistory);
router.post('/api/tasks/:id/schedule-toggle', toggleSchedule);
router.delete('/api/tasks/:id', deleteTask);
router.post('/api/tasks/bulk-delete', bulkDeleteTasks);
router.get('/api/calendar', getCalendar);

// Task Dispatch (agent execution)
router.post('/api/tasks/:id/dispatch', (req, res) => {
  const result = dispatchTask(req.params.id);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
router.post('/api/tasks/:id/cancel', (req, res) => {
  const result = cancelTask(req.params.id);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
router.get('/api/tasks/active-runs', (req, res) => {
  res.json(getActiveRuns());
});
router.get('/api/tasks/heartbeat-info', (req, res) => {
  res.json({ interval: getOpenclawHeartbeatInterval() });
});

// Usage / Cost
router.get('/api/usage', getUsage);
router.get('/api/usage/history', getUsageHistory);
router.get('/api/usage/breakdown', getUsageBreakdown);
router.get('/api/usage/providers', getDetectedProviders);

// Activity
router.get('/api/activity', getActivity);
router.get('/api/activity/heatmap', getActivityHeatmap);
router.get('/api/activity/chart', getActivityChart);

// Models & Heartbeat
router.get('/api/models', listModels);
router.post('/api/model', setModel);
router.get('/api/heartbeat', getHeartbeat);
router.post('/api/heartbeat', postHeartbeat);

// Skills
router.get('/api/skills', listSkills);
router.post('/api/skills/:id/toggle', toggleSkill);
router.post('/api/skills/create', createSkill);
router.get('/api/skills/:id/content', getSkillContent);
router.delete('/api/skills/:id', deleteSkill);

// Files
router.get('/api/files', listFiles);
router.get('/api/files/content', getFileContent);
router.put('/api/files/content', updateFileContent);
router.get('/api/files/download', downloadFile);

// Memory
router.get('/api/memory', listMemory);
router.get('/api/memory/file', getMemoryFile);
router.put('/api/memory/file', updateMemoryFile);

// Cron
router.get('/api/cron', listCronJobs);
router.get('/api/cron/upcoming', getUpcomingCrons);
router.get('/api/cron/:id/runs', getCronRuns);
router.post('/api/cron/:id/trigger', triggerCronJob);

// Notifications
router.get('/api/notifications', getNotifications);
router.post('/api/notifications/:id/read', markNotificationRead);
router.post('/api/notifications/read-all', markAllRead);

// Search
router.get('/api/search', searchFiles);

// Suggestions
router.get('/api/suggestions', getSuggestions);
router.get('/api/suggestions/insights', getSuggestionInsights);
router.post('/api/suggestions/analyze', runDeepAnalysis);
router.get('/api/suggestions/history', getSuggestionHistory);
router.post('/api/suggestions/:id/apply', applySuggestion);

// Terminal
router.get('/api/terminal/commands', getTerminalCommands);
router.post('/api/terminal/exec', execTerminalCommand);

// Settings
router.get('/api/settings', getSettings);
router.post('/api/settings', postSettings);

// SPA fallback
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

export default router;
