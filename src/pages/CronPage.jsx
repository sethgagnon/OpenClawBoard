import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  ChevronDown,
  ChevronUp,
  Zap,
  CalendarDays,
  Globe,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/contexts/TimezoneContext';

function formatRelativeTime(ms) {
  if (!ms) return 'Never';
  const diff = Date.now() - ms;
  const absDiff = Math.abs(diff);
  const future = diff < 0;
  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let label;
  if (seconds < 60) label = `${seconds}s`;
  else if (minutes < 60) label = `${minutes}m`;
  else if (hours < 24) label = `${hours}h ${minutes % 60}m`;
  else label = `${days}d ${hours % 24}h`;

  return future ? `in ${label}` : `${label} ago`;
}

function formatCountdown(dateStr) {
  if (!dateStr) return '--';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDuration(ms) {
  if (!ms) return '--';
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  if (ms < 60000) return `${s}s`;
  const m = Math.floor(ms / 60000);
  const rem = Math.floor((ms % 60000) / 1000);
  return `${m}m ${rem}s`;
}

function formatTimeStr(hour, min, hour12) {
  const h = parseInt(hour);
  const m = min.padStart(2, '0');
  if (!hour12) return `${String(h).padStart(2, '0')}:${m}`;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period}`;
}

function parseCronHumanReadable(expr, hour12 = true) {
  if (!expr) return '';
  const parts = expr.split(' ');
  if (parts.length < 5) return expr;
  const [min, hour, dom, , dow] = parts;

  if (min === '*' && hour === '*') return 'Every minute';
  if (hour === '*' && min !== '*') return `Every hour at :${min.padStart(2, '0')}`;

  // Handle multiple hours (e.g., "0 12,18 * * *")
  const hours = hour.split(',');
  const timeStr = hours.length > 1
    ? hours.map(h => formatTimeStr(h, min, hour12)).join(' & ')
    : formatTimeStr(hour, min, hour12);

  if (dom === '*' && dow === '*') return `Daily at ${timeStr}`;

  if (dow !== '*' && dom === '*') {
    const dayNames = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
    const dayRanges = dow.split(',').map(part => {
      if (part.includes('-')) {
        const [a, b] = part.split('-');
        return `${dayNames[a] || a}-${dayNames[b] || b}`;
      }
      return dayNames[part] || part;
    });
    return `${dayRanges.join(', ')} at ${timeStr}`;
  }

  return expr;
}

const JOB_COLORS = [
  '#a855f7', '#6366f1', '#ec4899', '#14b8a6', '#f59e0b',
  '#3b82f6', '#ef4444', '#22c55e', '#f97316', '#06b6d4',
  '#8b5cf6', '#d946ef',
];

/* ─── Job Card ─── */
function JobCard({ job, color, onTrigger, hour12 }) {
  const [expanded, setExpanded] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [countdown, setCountdown] = useState(formatCountdown(job.nextRun));
  const [runs, setRuns] = useState(null);

  useEffect(() => {
    if (!job.nextRun) return;
    const iv = setInterval(() => setCountdown(formatCountdown(job.nextRun)), 1000);
    return () => clearInterval(iv);
  }, [job.nextRun]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await onTrigger(job.id);
    } finally {
      setTriggering(false);
    }
  };

  const handleExpand = async () => {
    if (!expanded && runs === null) {
      try {
        const data = await apiGet(`/cron/${job.id}/runs`);
        setRuns(Array.isArray(data) ? data.slice(0, 5) : []);
      } catch {
        setRuns([]);
      }
    }
    setExpanded(!expanded);
  };

  const state = job.state || {};
  const lastRunAt = state.lastRunAtMs;
  const lastStatus = state.lastStatus || state.lastRunStatus;
  const lastOk = lastStatus === 'ok' || lastStatus === 'success';
  const tz = job.schedule?.tz;

  return (
    <Card className="relative overflow-hidden transition-colors hover:border-primary/20">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: color }} />

      <CardContent className="pl-5 pr-4 py-4 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate">{job.name}</h3>
            {job.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{job.description}</p>
            )}
          </div>
          <Badge
            variant={!job.enabled ? 'secondary' : lastStatus === 'error' ? 'destructive' : 'success'}
            className="shrink-0 flex items-center gap-1"
          >
            {!job.enabled ? (
              <><Pause className="h-3 w-3" /> Disabled</>
            ) : lastStatus === 'error' ? (
              <><AlertTriangle className="h-3 w-3" /> Error</>
            ) : (
              <><Play className="h-3 w-3" /> Active</>
            )}
          </Badge>
        </div>

        {/* Schedule */}
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              {parseCronHumanReadable(job.expression, hour12)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <code className="text-[11px] font-mono text-muted-foreground">{job.expression}</code>
            {tz && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Globe className="h-3 w-3" />
                {tz}
              </span>
            )}
          </div>
        </div>

        {/* Next / Last run */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Next Run</p>
            {job.enabled && job.nextRun ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-sm font-semibold text-foreground">{countdown}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {new Date(job.nextRun).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
                  {new Date(job.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 })}
                </p>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{job.enabled ? '--' : 'Disabled'}</span>
            )}
          </div>

          <div className="rounded-md bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Run</p>
            {lastRunAt ? (
              <>
                <div className="flex items-center gap-1.5">
                  {lastOk ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className={cn('text-sm font-semibold', lastOk ? 'text-emerald-500' : 'text-red-500')}>
                    {lastOk ? 'Success' : 'Failed'}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatRelativeTime(lastRunAt)}
                  {state.lastDurationMs ? ` · ${formatDuration(state.lastDurationMs)}` : ''}
                </p>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Never</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTrigger}
            disabled={triggering || !job.enabled}
            className="gap-1.5"
          >
            <Zap className="h-3.5 w-3.5" />
            {triggering ? 'Triggering...' : 'Run Now'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExpand}
            className="gap-1 ml-auto text-muted-foreground"
          >
            History
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Run history */}
        {expanded && (
          <div className="border-t border-border pt-3 space-y-1.5">
            {runs === null ? (
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : runs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No run history available</p>
            ) : (
              runs.map((run, i) => {
                const ok = run.status === 'ok' || run.status === 'success' || run.status === 'triggered';
                return (
                  <div key={run.id || i} className="flex items-center gap-2 text-xs rounded-md px-2 py-1.5 hover:bg-muted/30">
                    {ok ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                    )}
                    <span className="text-muted-foreground">
                      {new Date(run.startedAt || run.completedAt).toLocaleString([], { hour12, hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                      {run.trigger || run.status}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Loading Skeleton ─── */
function CronSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-12 w-full rounded-md" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
            <Skeleton className="h-9 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Empty State ─── */
function CronEmpty() {
  return (
    <Card className="flex flex-col items-center justify-center py-16">
      <Clock className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-semibold mb-1">No cron jobs configured</h3>
      <p className="text-sm text-muted-foreground max-w-sm text-center">
        Cron jobs will appear here once they are configured in your OpenClaw project.
      </p>
    </Card>
  );
}

/* ─── Main Page ─── */
export default function CronPage() {
  const { hour12 } = useTimezone();
  const [jobs, setJobs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const jobsData = await apiGet('/cron');
      setJobs(Array.isArray(jobsData) ? jobsData : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleTrigger = async (jobId) => {
    await apiPost(`/cron/${jobId}/trigger`);
    await fetchData();
  };

  const enabledCount = jobs?.filter((j) => j.enabled).length ?? 0;
  const disabledCount = jobs?.filter((j) => !j.enabled).length ?? 0;

  const filteredJobs = jobs?.filter((j) => {
    if (filter === 'active') return j.enabled;
    if (filter === 'disabled') return !j.enabled;
    return true;
  }) ?? [];

  return (
    <div className="px-3 py-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cron Jobs</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor and manage scheduled jobs</p>
        </div>
        {jobs && jobs.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{jobs.length} total</Badge>
            <Badge variant="success" className="text-xs">{enabledCount} active</Badge>
            {disabledCount > 0 && (
              <Badge variant="outline" className="text-xs">{disabledCount} disabled</Badge>
            )}
          </div>
        )}
      </div>

      {/* Filter tabs */}
      {jobs && jobs.length > 0 && (
        <div className="flex gap-1 border-b border-border pb-0">
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'disabled', label: 'Disabled' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                filter === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-2 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <CronSkeleton />
      ) : !jobs || jobs.length === 0 ? (
        <CronEmpty />
      ) : filteredJobs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No {filter} jobs found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map((job, i) => (
            <JobCard
              key={job.id}
              job={job}
              color={JOB_COLORS[i % JOB_COLORS.length]}
              onTrigger={handleTrigger}
              hour12={hour12}
            />
          ))}
        </div>
      )}
    </div>
  );
}
