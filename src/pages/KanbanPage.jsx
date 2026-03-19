import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, GripVertical, Calendar, User, Clock,
  AlertCircle, ChevronRight, ChevronLeft, Bot, Loader2, Square, Zap,
  CheckCircle2, Trash2, ArrowLeftRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger, DialogClose,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';

const DEFAULT_COLUMNS = [
  { id: 'backlog', label: 'Backlog', color: 'bg-zinc-500' },
  { id: 'todo', label: 'Todo', color: 'bg-blue-500' },
  { id: 'in-progress', label: 'In Progress', color: 'bg-amber-500' },
  { id: 'review', label: 'For Review', color: 'bg-red-500' },
  { id: 'done', label: 'Done', color: 'bg-emerald-500' },
];

const COLUMN_MAP = Object.fromEntries(DEFAULT_COLUMNS.map(c => [c.id, c]));

function loadColumnOrder() {
  try {
    const saved = localStorage.getItem('kanban-column-order');
    if (saved) {
      const ids = JSON.parse(saved);
      // Validate all IDs exist and include any new columns
      const valid = ids.filter(id => COLUMN_MAP[id]);
      const missing = DEFAULT_COLUMNS.filter(c => !valid.includes(c.id)).map(c => c.id);
      return [...valid, ...missing].map(id => COLUMN_MAP[id]);
    }
  } catch {}
  return DEFAULT_COLUMNS;
}

function saveColumnOrder(columns) {
  localStorage.setItem('kanban-column-order', JSON.stringify(columns.map(c => c.id)));
}

// Map backend statuses to Kanban column IDs
function resolveColumnId(status) {
  switch (status) {
    case 'pending': return 'backlog';
    case 'queued': return 'todo';
    case 'running': return 'in-progress';
    case 'completed': return 'done';
    case 'failed': return 'review';
    default: return status; // already a column ID
  }
}

const priorityConfig = {
  high: { variant: 'destructive', label: 'High' },
  medium: { variant: 'warning', label: 'Medium' },
  low: { variant: 'secondary', label: 'Low' },
};

const scheduleLabels = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

// --------------- Helpers ---------------

function parseAgentResult(result) {
  if (!result) return null;
  try {
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const payloads = parsed?.result?.payloads;
    if (Array.isArray(payloads) && payloads.length > 0) {
      return payloads[0].text || null;
    }
    if (parsed?.summary) return parsed.summary;
    return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  } catch {
    return typeof result === 'string' ? result : null;
  }
}

// --------------- Task Card (Sortable) ---------------

function SortableTaskCard({ task, onClick, onDispatch, onCancel, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskCardContent task={task} listeners={listeners} onClick={onClick} onDispatch={onDispatch} onCancel={onCancel} onDelete={onDelete} />
    </div>
  );
}

function TaskCardContent({ task, listeners, onClick, overlay, onDispatch, onCancel, onDelete }) {
  const priority = priorityConfig[task.priority] || priorityConfig.low;
  const isRunning = task.status === 'in-progress' && task.pickedUp;

  return (
    <Card
      className={cn(
        'border-border/50 bg-card/80 hover:bg-card hover:border-purple-500/20 transition-all cursor-pointer group',
        overlay && 'shadow-2xl border-purple-500/30 rotate-2',
        isRunning && 'border-amber-500/30 bg-amber-500/5'
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {listeners && (
            <button
              className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
              {...listeners}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <p className="text-sm font-medium text-foreground leading-snug truncate">
                {task.title}
              </p>
              {onDelete && !overlay && (
                <button
                  className="shrink-0 rounded p-0.5 text-muted-foreground/30 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  title="Delete task"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete "${task.title}"?`)) onDelete(task.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {task.source?.channel && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                via {task.source.channel}{task.source.sender ? ` · ${task.source.sender}` : ''}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant={priority.variant} className="text-[10px]">
                {priority.label}
              </Badge>
              {isRunning && (
                <Badge variant="warning" className="text-[10px] flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Agent working
                </Badge>
              )}
              {task.schedule && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {scheduleLabels[task.schedule] || task.schedule}
                </span>
              )}
              {task.agent && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  {task.agent}
                </span>
              )}
            </div>
            {/* Completed result preview */}
            {(task.status === 'done' || task.status === 'completed') && task.result && (
              <div className="mt-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 px-2 py-1.5">
                <p className="text-[10px] text-emerald-500 font-medium flex items-center gap-1 mb-0.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Agent completed
                </p>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {parseAgentResult(task.result)?.slice(0, 120) || 'Done'}
                </p>
              </div>
            )}
            {/* Failed / Review result */}
            {(task.status === 'failed' || task.status === 'review') && task.error && (
              <div className="mt-2 rounded-md bg-red-500/5 border border-red-500/20 px-2 py-1.5 space-y-1">
                <p className="text-[10px] text-red-500 font-medium flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Needs review
                </p>
                {task.recommendation && (
                  <p className="text-[10px] text-muted-foreground">
                    {task.recommendation}
                  </p>
                )}
              </div>
            )}
            {/* Dispatch / Cancel / Retry buttons */}
            {(task.status === 'backlog' || task.status === 'todo') && onDispatch && (
              <button
                className="mt-2 flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                onClick={(e) => { e.stopPropagation(); onDispatch(task.id); }}
              >
                <Bot className="h-3 w-3" />
                Run with Agent
              </button>
            )}
            {(task.status === 'review' || task.status === 'failed') && onDispatch && (
              <button
                className="mt-2 flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
                onClick={(e) => { e.stopPropagation(); onDispatch(task.id); }}
              >
                <Zap className="h-3 w-3" />
                Retry
              </button>
            )}
            {isRunning && onCancel && (
              <button
                className="mt-2 flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
                onClick={(e) => { e.stopPropagation(); onCancel(task.id); }}
              >
                <Square className="h-3 w-3" />
                Cancel
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --------------- Column ---------------

function KanbanColumn({ column, tasks, onTaskClick, onDispatch, onCancel, onDelete, onMoveLeft, onMoveRight, isFirst, isLast }) {
  const taskIds = tasks.map((t) => t.id);
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] sm:min-w-[280px] sm:w-[280px] shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1 group/col">
        <span className={cn('h-2.5 w-2.5 rounded-full', column.color)} />
        <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
        <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
          {tasks.length}
        </span>
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/col:opacity-100 transition-opacity">
          {!isFirst && (
            <button
              onClick={onMoveLeft}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Move column left"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
          {!isLast && (
            <button
              onClick={onMoveRight}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Move column right"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex flex-col gap-2 min-h-[120px] rounded-lg border border-dashed p-2 transition-colors',
            isOver ? 'bg-primary/10 border-primary/40' : 'bg-muted/20 border-border/30'
          )}
        >
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              Drop tasks here
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
                onDispatch={onDispatch}
                onCancel={onCancel}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// --------------- Task Form ---------------

function TaskForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('backlog');
  const [schedule, setSchedule] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        schedule: schedule || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Title <span className="text-destructive">*</span>
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title..."
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Priority</label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="backlog">Backlog</SelectItem>
              <SelectItem value="todo">Todo</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="review">For Review</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Schedule (optional)</label>
        <Select value={schedule} onValueChange={setSchedule}>
          <SelectTrigger>
            <SelectValue placeholder="No schedule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No schedule</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!title.trim() || submitting}>
          {submitting ? 'Creating...' : 'Create Task'}
        </Button>
      </div>
    </form>
  );
}

// --------------- Task Detail Dialog ---------------

function formatDurationMs(ms) {
  if (!ms) return '--';
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  if (ms < 60000) return `${s}s`;
  const m = Math.floor(ms / 60000);
  const rem = Math.floor((ms % 60000) / 1000);
  return `${m}m ${rem}s`;
}

function TaskDetailDialog({ task, open, onOpenChange }) {
  if (!task) return null;
  const priority = priorityConfig[task.priority] || priorityConfig.low;
  const column = COLUMN_MAP[resolveColumnId(task.status)];
  const agentResult = parseAgentResult(task.result);
  const lastRun = task.runHistory?.length > 0 ? task.runHistory[task.runHistory.length - 1] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogTitle>{task.title}</DialogTitle>
        <DialogDescription>
          Task details and agent output
        </DialogDescription>
        <div className="space-y-4 pt-2">
          {task.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Description</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Priority</p>
              <Badge variant={priority.variant}>{priority.label}</Badge>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Status</p>
              <div className="flex items-center gap-2">
                {column && <span className={cn('h-2 w-2 rounded-full', column.color)} />}
                <span className="text-sm">{column?.label || task.status}</span>
              </div>
            </div>
            {task.source?.channel && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Source</p>
                <span className="text-sm capitalize">{task.source.channel}{task.source.sender ? ` · ${task.source.sender}` : ''}</span>
              </div>
            )}
            {task.completedAt && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Completed</p>
                <span className="text-sm text-muted-foreground">{new Date(task.completedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Agent Result */}
          {agentResult && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                Agent Result
              </p>
              <div className="rounded-md border bg-muted/30 px-4 py-3">
                <p className="text-sm text-foreground whitespace-pre-wrap">{agentResult}</p>
              </div>
            </div>
          )}

          {/* Error */}
          {task.error && (
            <div>
              <p className="text-xs font-medium text-destructive uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Error
              </p>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive whitespace-pre-wrap">{task.error}</p>
              </div>
            </div>
          )}

          {/* Recommendation */}
          {task.recommendation && (
            <div>
              <p className="text-xs font-medium text-amber-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Recommended Action
              </p>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-sm text-foreground">{task.recommendation}</p>
              </div>
            </div>
          )}

          {/* Run History */}
          {task.runHistory?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Run History ({task.runHistory.length})
              </p>
              <div className="space-y-1.5">
                {[...task.runHistory].reverse().map((run, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs rounded-md bg-muted/30 px-3 py-2">
                    {run.success ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    )}
                    <span className="text-muted-foreground">
                      {run.completedAt ? new Date(run.completedAt).toLocaleString() : '--'}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {formatDurationMs(run.duration)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {task.createdAt && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Created</p>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {new Date(task.createdAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --------------- Loading Skeleton ---------------

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {DEFAULT_COLUMNS.map((col) => (
        <div key={col.id} className="min-w-[280px] w-[280px] shrink-0 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
          <div className="space-y-2 rounded-lg bg-muted/20 border border-border/30 border-dashed p-2">
            {Array.from({ length: 3 - (DEFAULT_COLUMNS.indexOf(col) % 2) }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------- Main Page ---------------

export default function KanbanPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [columns, setColumns] = useState(loadColumnOrder);

  const { subscribe, unsubscribe } = useSocket();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchTasks = useCallback(() => {
    apiGet('/tasks')
      .then((data) => setTasks(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // WebSocket real-time updates
  useEffect(() => {
    const handleTaskUpdate = (payload) => {
      if (payload.task) {
        setTasks((prev) => {
          const idx = prev.findIndex((t) => t.id === payload.task.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = payload.task;
            return next;
          }
          return [...prev, payload.task];
        });
      }
    };

    const handleTaskDelete = (payload) => {
      if (payload.id) {
        setTasks((prev) => prev.filter((t) => t.id !== payload.id));
      }
    };

    subscribe('task:update', handleTaskUpdate);
    subscribe('task:create', handleTaskUpdate);
    subscribe('task:delete', handleTaskDelete);

    return () => {
      unsubscribe('task:update', handleTaskUpdate);
      unsubscribe('task:create', handleTaskUpdate);
      unsubscribe('task:delete', handleTaskDelete);
    };
  }, [subscribe, unsubscribe]);

  const tasksByColumn = {};
  for (const col of columns) {
    tasksByColumn[col.id] = tasks.filter((t) => resolveColumnId(t.status) === col.id);
  }

  function findColumnForTask(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) return resolveColumnId(task.status);
    return null;
  }

  const handleDragStart = (event) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      // Store the original status before any drag-over mutations
      setActiveTask({ ...task, _originalStatus: task.status });
    }
  };

  const handleDragEnd = async (event) => {
    const draggedTask = activeTask;
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !draggedTask) return;

    const taskId = active.id;
    const originalColumn = resolveColumnId(draggedTask._originalStatus);

    // Determine destination column
    let destColumn = null;
    if (columns.some((c) => c.id === over.id)) {
      destColumn = over.id;
    } else {
      destColumn = findColumnForTask(over.id);
    }

    if (!destColumn || destColumn === originalColumn) {
      // Revert the optimistic drag-over update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: draggedTask._originalStatus } : t))
      );
      return;
    }

    // Optimistic update already happened in handleDragOver — now persist
    try {
      // If dragged to In Progress, dispatch to agent instead of just updating status
      if (destColumn === 'in-progress' && originalColumn !== 'in-progress') {
        await apiPost(`/tasks/${taskId}/dispatch`);
      } else {
        await apiPut(`/tasks/${taskId}`, { status: destColumn });
      }
    } catch (err) {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: draggedTask._originalStatus } : t))
      );
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeCol = findColumnForTask(activeId);
    let overCol = COLUMNS.some((c) => c.id === overId) ? overId : findColumnForTask(overId);

    if (activeCol && overCol && activeCol !== overCol) {
      setTasks((prev) =>
        prev.map((t) => (t.id === activeId ? { ...t, status: overCol } : t))
      );
    }
  };

  const handleCreateTask = async (taskData) => {
    const schedule = taskData.schedule === 'none' ? undefined : taskData.schedule;
    const created = await apiPost('/tasks', { ...taskData, schedule });
    if (created) {
      setTasks((prev) => [...prev, created]);
    }
    setCreateOpen(false);
  };

  const handleTaskClick = (task) => {
    setDetailTask(task);
    setDetailOpen(true);
  };

  const handleDispatch = async (taskId) => {
    try {
      await apiPost(`/tasks/${taskId}/dispatch`);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleCancel = async (taskId) => {
    try {
      await apiPost(`/tasks/${taskId}/cancel`);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleMoveColumn = (colId, direction) => {
    setColumns((prev) => {
      const idx = prev.findIndex(c => c.id === colId);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      saveColumnOrder(next);
      return next;
    });
  };

  const handleDelete = async (taskId) => {
    try {
      await apiDelete(`/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  return (
    <div className="px-3 py-4 sm:p-6 max-w-full mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kanban Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize and track tasks across your workflow
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              Add a new task to the board.
            </DialogDescription>
            <TaskForm
              onSubmit={handleCreateTask}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load tasks: {error}
        </div>
      )}

      {loading ? (
        <BoardSkeleton />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((column, idx) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={tasksByColumn[column.id] || []}
                onTaskClick={handleTaskClick}
                onDispatch={handleDispatch}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onMoveLeft={() => handleMoveColumn(column.id, -1)}
                onMoveRight={() => handleMoveColumn(column.id, 1)}
                isFirst={idx === 0}
                isLast={idx === columns.length - 1}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="w-[264px]">
                <TaskCardContent task={activeTask} overlay onDispatch={null} onCancel={null} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskDetailDialog
        task={detailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
