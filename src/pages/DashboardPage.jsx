import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu,
  Bot,
  DollarSign,
  Activity,
  Clock,
  Lightbulb,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// ---------------------------------------------------------------------------
// Shared hook for dashboard data fetching
// ---------------------------------------------------------------------------
function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet(url)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        /* silently fail — card shows empty state */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, loading };
}

// ---------------------------------------------------------------------------
// Status dot helper
// ---------------------------------------------------------------------------
function StatusDot({ status }) {
  const color = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-500',
    red: 'bg-red-500',
  }[status] || 'bg-muted-foreground';

  return (
    <span className={cn('inline-block h-2 w-2 rounded-full', color)} />
  );
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------
function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Card wrapper with consistent hover / link behavior
// ---------------------------------------------------------------------------
function DashboardCard({ to, icon: Icon, title, children, className }) {
  const inner = (
    <Card
      className={cn(
        'group relative overflow-hidden transition-colors hover:border-primary/30',
        className
      )}
    >
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <CardTitle className="text-sm font-medium text-foreground">
          {title}
        </CardTitle>
        {to && (
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );

  if (to) {
    return <Link to={to} className="block">{inner}</Link>;
  }
  return inner;
}

// ---------------------------------------------------------------------------
// Loading skeleton for cards
// ---------------------------------------------------------------------------
function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. System Monitor Card
// ---------------------------------------------------------------------------
function SystemMonitorCard() {
  const { data, loading } = useFetch('/system/metrics');

  function statusFor(value) {
    if (value == null) return 'green';
    if (value > 90) return 'red';
    if (value > 70) return 'yellow';
    return 'green';
  }

  function formatUptime(seconds) {
    if (!seconds) return '--';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return (
    <DashboardCard icon={Cpu} title="System">
      {loading ? (
        <CardSkeleton />
      ) : (
        <div className="space-y-3">
          {(() => {
            const cpuVal = typeof data?.cpu === 'object' ? data.cpu.usage : data?.cpu;
            const memVal = typeof data?.memory === 'object' ? data.memory.usage : data?.memory;
            const uptimeVal = typeof data?.uptime === 'object' ? (data.uptime.process ?? data.uptime.system) : data?.uptime;
            return (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">CPU</span>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <StatusDot status={statusFor(cpuVal)} />
                    {cpuVal != null ? `${Math.round(cpuVal)}%` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Memory</span>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <StatusDot status={statusFor(memVal)} />
                    {memVal != null ? `${Math.round(memVal)}%` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Uptime</span>
                  <span className="text-sm font-medium">
                    {formatUptime(uptimeVal)}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// 2. Agent Status Card
// ---------------------------------------------------------------------------
function AgentStatusCard() {
  const { data, loading } = useFetch('/agents');

  const agents = Array.isArray(data) ? data : [];
  const total = agents.length;
  const active = agents.filter(
    (a) => a.status === 'active' || a.status === 'running'
  ).length;

  return (
    <DashboardCard to="/agents" icon={Bot} title="Agents">
      {loading ? (
        <CardSkeleton />
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{total}</span>
            <span className="text-sm text-muted-foreground">total</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={active > 0 ? 'success' : 'secondary'}>
              {active} active
            </Badge>
            {total - active > 0 && (
              <Badge variant="secondary">{total - active} idle</Badge>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// 3. Cost Summary Card
// ---------------------------------------------------------------------------
function CostSummaryCard() {
  const { data, loading } = useFetch('/usage');
  const { data: settings } = useFetch('/settings');

  const subProviders = Array.isArray(settings?.subscriptionProviders)
    ? settings.subscriptionProviders
    : settings?.subscriptionMode === 'max' ? ['anthropic'] : [];
  const providers = data?.providers || [];
  const allSub = providers.length > 0 && providers.every((p) => subProviders.includes(p));

  const totalCost = data?.cost ?? 0;
  const totalTokens = data?.totalTokens ?? 0;

  const byProvider = data?.byProvider || {};
  const payPerUseCost = Object.entries(byProvider)
    .filter(([p]) => !subProviders.includes(p))
    .reduce((s, [, v]) => s + (v.cost || 0), 0);

  function fmtTokens(v) {
    if (v == null || v === 0) return '0';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  }

  function fmtCost(v) {
    if (v == null) return '--';
    return `$${Number(v).toFixed(2)}`;
  }

  const mixed = subProviders.length > 0 && !allSub;

  return (
    <DashboardCard to="/cost" icon={DollarSign} title={allSub ? 'Usage' : 'Cost'}>
      {loading ? (
        <CardSkeleton />
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">
              {allSub ? fmtTokens(totalTokens) : fmtCost(mixed ? payPerUseCost : totalCost)}
            </span>
            <span className="text-xs text-muted-foreground">
              {allSub ? 'tokens' : mixed ? 'pay-per-use' : 'total'}
            </span>
          </div>

          <div className="flex gap-4 text-xs text-muted-foreground">
            {allSub ? (
              <>
                <span>In: <span className="font-medium text-foreground">{fmtTokens(data?.input)}</span></span>
                <span>Out: <span className="font-medium text-foreground">{fmtTokens(data?.output)}</span></span>
              </>
            ) : (
              <>
                <span>Tokens: <span className="font-medium text-foreground">{fmtTokens(totalTokens)}</span></span>
                <span>Sessions: <span className="font-medium text-foreground">{data?.sessions ?? 0}</span></span>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// 4. Recent Activity Card
// ---------------------------------------------------------------------------
function RecentActivityCard() {
  const { data, loading } = useFetch('/activity?limit=5');

  const entries = Array.isArray(data) ? data.slice(0, 5) : Array.isArray(data?.items) ? data.items.slice(0, 5) : [];

  return (
    <DashboardCard to="/activity" icon={Activity} title="Recent Activity">
      {loading ? (
        <CardSkeleton />
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity yet</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div
              key={entry.id || i}
              className="flex items-start justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {entry.action || entry.type || 'Activity'}
                </p>
                {entry.actor && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {entry.actor}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {relativeTime(entry.timestamp || entry.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// 5. Cron Status Card
// ---------------------------------------------------------------------------
function CronStatusCard() {
  const { data, loading } = useFetch('/cron/upcoming');

  const upcoming = Array.isArray(data) ? data.slice(0, 3) : [];

  return (
    <DashboardCard to="/cron" icon={Clock} title="Upcoming Cron">
      {loading ? (
        <CardSkeleton />
      ) : upcoming.length === 0 ? (
        <p className="text-xs text-muted-foreground">No upcoming jobs</p>
      ) : (
        <div className="space-y-2">
          {upcoming.map((job, i) => (
            <div
              key={job.id || i}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate text-xs font-medium text-foreground">
                {job.name || job.command || `Job ${i + 1}`}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {(job.nextRun || job.date)
                  ? new Date(job.nextRun || job.date).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : job.scheduleDescription || (typeof job.schedule === 'string' ? job.schedule : '--')}
              </span>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// 6. Suggestions Card
// ---------------------------------------------------------------------------
function SuggestionsCard() {
  const { data, loading } = useFetch('/suggestions');

  const suggestions = Array.isArray(data) ? data : data?.suggestions || [];
  const top = suggestions
    .sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    })
    .slice(0, 3);

  const sevVariant = {
    critical: 'destructive',
    high: 'warning',
    medium: 'secondary',
    low: 'outline',
  };

  return (
    <DashboardCard to="/suggestions" icon={Lightbulb} title="Suggestions">
      {loading ? (
        <CardSkeleton />
      ) : top.length === 0 ? (
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <p className="text-xs text-muted-foreground">All good — no suggestions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((s, i) => (
            <div
              key={s.id || i}
              className="flex items-start justify-between gap-2"
            >
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {s.title || s.message || 'Suggestion'}
              </p>
              <Badge variant={sevVariant[s.severity] || 'secondary'} className="shrink-0 text-[10px]">
                {s.severity || 'info'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  return (
    <div className="px-3 py-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your OpenClaw environment
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SystemMonitorCard />
        <AgentStatusCard />
        <CostSummaryCard />
        <RecentActivityCard />
        <CronStatusCard />
        <SuggestionsCard />
      </div>
    </div>
  );
}
