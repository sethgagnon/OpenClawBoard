import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, GripVertical, Calendar, User, Clock,
  AlertCircle, ChevronRight,
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
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', color: 'bg-zinc-500' },
  { id: 'todo', label: 'Todo', color: 'bg-blue-500' },
  { id: 'in-progress', label: 'In Progress', color: 'bg-amber-500' },
  { id: 'done', label: 'Done', color: 'bg-emerald-500' },
];

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

// --------------- Task Card (Sortable) ---------------

function SortableTaskCard({ task, onClick }) {
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
      <TaskCardContent task={task} listeners={listeners} onClick={onClick} />
    </div>
  );
}

function TaskCardContent({ task, listeners, onClick, overlay }) {
  const priority = priorityConfig[task.priority] || priorityConfig.low;

  return (
    <Card
      className={cn(
        'border-border/50 bg-card/80 hover:bg-card hover:border-purple-500/20 transition-all cursor-pointer group',
        overlay && 'shadow-2xl border-purple-500/30 rotate-2'
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
            <p className="text-sm font-medium text-foreground leading-snug truncate">
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant={priority.variant} className="text-[10px]">
                {priority.label}
              </Badge>
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --------------- Column ---------------

function KanbanColumn({ column, tasks, onTaskClick }) {
  const taskIds = tasks.map((t) => t.id);

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] sm:min-w-[280px] sm:w-[280px] shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={cn('h-2.5 w-2.5 rounded-full', column.color)} />
        <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
        <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
          {tasks.length}
        </span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 min-h-[120px] rounded-lg bg-muted/20 border border-border/30 border-dashed p-2">
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

function TaskDetailDialog({ task, open, onOpenChange }) {
  if (!task) return null;
  const priority = priorityConfig[task.priority] || priorityConfig.low;
  const column = COLUMNS.find((c) => c.id === task.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{task.title}</DialogTitle>
        <DialogDescription>
          Task details and configuration
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
            {task.schedule && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Schedule</p>
                <span className="text-sm flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {scheduleLabels[task.schedule] || task.schedule}
                </span>
              </div>
            )}
            {task.agent && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Assigned Agent</p>
                <span className="text-sm flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {task.agent}
                </span>
              </div>
            )}
          </div>
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
      {COLUMNS.map((col) => (
        <div key={col.id} className="min-w-[280px] w-[280px] shrink-0 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
          <div className="space-y-2 rounded-lg bg-muted/20 border border-border/30 border-dashed p-2">
            {Array.from({ length: 3 - (COLUMNS.indexOf(col) % 2) }).map((_, i) => (
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
  for (const col of COLUMNS) {
    tasksByColumn[col.id] = tasks.filter((t) => t.status === col.id);
  }

  function findColumnForTask(taskId) {
    for (const col of COLUMNS) {
      if (tasksByColumn[col.id].some((t) => t.id === taskId)) {
        return col.id;
      }
    }
    return null;
  }

  const handleDragStart = (event) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Determine destination column
    let destColumn = null;

    // Check if dropped over a column id directly
    if (COLUMNS.some((c) => c.id === over.id)) {
      destColumn = over.id;
    } else {
      // Dropped over another task -- find which column that task is in
      destColumn = findColumnForTask(over.id);
    }

    if (!destColumn || destColumn === task.status) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: destColumn } : t))
    );

    try {
      await apiPut(`/tasks/${taskId}`, { status: destColumn });
    } catch {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: task.status } : t))
      );
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
      ) : tasks.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <ChevronRight className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No tasks yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Create your first task to get started with the Kanban board.
          </p>
          <Button
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={tasksByColumn[column.id]}
                onTaskClick={handleTaskClick}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="w-[264px]">
                <TaskCardContent task={activeTask} overlay />
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
