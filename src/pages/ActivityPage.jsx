import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Activity,
  Plus,
  RefreshCw,
  CheckCircle2,
  Edit3,
  Archive,
  Play,
  Terminal,
  Zap,
  BarChart3,
  Flame,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ─── Helpers ─── */

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const ACTION_CONFIG = {
  task_created: { icon: Plus, label: 'Created', color: 'text-purple-400', badgeVariant: 'default' },
  task_updated: { icon: Edit3, label: 'Updated', color: 'text-blue-400', badgeVariant: 'secondary' },
  task_completed: { icon: CheckCircle2, label: 'Completed', color: 'text-emerald-400', badgeVariant: 'success' },
  task_pickup: { icon: Play, label: 'Picked up', color: 'text-amber-400', badgeVariant: 'warning' },
  task_run: { icon: Terminal, label: 'Run', color: 'text-cyan-400', badgeVariant: 'secondary' },
  task_archived: { icon: Archive, label: 'Archived', color: 'text-zinc-400', badgeVariant: 'outline' },
};

function getActionConfig(action) {
  return ACTION_CONFIG[action] || { icon: Zap, label: action, color: 'text-muted-foreground', badgeVariant: 'outline' };
}

/* ─── Heatmap ─── */

const HEATMAP_LEVELS = [
  'bg-muted/40',
  'bg-purple-500/20',
  'bg-purple-500/40',
  'bg-purple-500/60',
  'bg-purple-500/80',
  'bg-purple-500',
];

const HEATMAP_COLORS = [
  '#1e1b2e',
  'rgba(168,85,247,0.2)',
  'rgba(168,85,247,0.4)',
  'rgba(168,85,247,0.6)',
  'rgba(168,85,247,0.8)',
  'rgba(168,85,247,1)',
];

function Heatmap({ data }) {
  const [hoveredCell, setHoveredCell] = useState(null);

  const { grid, maxCount, weeks } = useMemo(() => {
    if (!data || Object.keys(data).length === 0) {
      return { grid: [], maxCount: 0, weeks: 0 };
    }

    const counts = Object.values(data).filter(v => v > 0);
    const max = counts.length > 0 ? Math.max(...counts) : 0;

    // Build 52 weeks x 7 days grid going back from today
    const today = new Date();
    const cells = [];
    const totalDays = 52 * 7;

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = data[dateStr] || 0;
      const dayOfWeek = (d.getDay() + 6) % 7; // Mon=0
      const weekIndex = Math.floor((totalDays - 1 - i + ((new Date(today).getDay() + 6) % 7)) / 7);

      cells.push({ date: dateStr, count, dayOfWeek, weekIndex });
    }

    // Re-map weeks properly
    const reindexed = [];
    let currentWeek = -1;
    let wk = -1;
    cells.forEach(cell => {
      if (cell.dayOfWeek === 0 || reindexed.length === 0) {
        wk++;
      }
      reindexed.push({ ...cell, weekIndex: wk });
    });

    return { grid: reindexed, maxCount: max, weeks: wk + 1 };
  }, [data]);

  function getLevel(count) {
    if (!count || count === 0) return 0;
    if (maxCount === 0) return 0;
    const ratio = count / maxCount;
    if (ratio <= 0.2) return 1;
    if (ratio <= 0.4) return 2;
    if (ratio <= 0.6) return 3;
    if (ratio <= 0.8) return 4;
    return 5;
  }

  const cellSize = 12;
  const cellGap = 2;
  const step = cellSize + cellGap;
  const labelW = 28;
  const headerH = 20;
  const svgW = labelW + weeks * step + step;
  const svgH = headerH + 7 * step + 4;
  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
  const monthLabels = useMemo(() => {
    const labels = [];
    const seen = new Set();
    grid.forEach(cell => {
      const d = new Date(cell.date);
      const month = d.toLocaleString('default', { month: 'short' });
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!seen.has(key) && cell.dayOfWeek === 0) {
        seen.add(key);
        labels.push({ label: month, weekIndex: cell.weekIndex });
      }
    });
    return labels;
  }, [grid]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Flame className="h-5 w-5 text-purple-400" />
          Activity Heatmap
        </CardTitle>
        <CardDescription>Contribution activity over the past year</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full min-w-[560px]"
            style={{ maxHeight: 160 }}
          >
            {/* Month labels */}
            {monthLabels.map((m, i) => (
              <text
                key={i}
                x={labelW + m.weekIndex * step}
                y={12}
                className="fill-muted-foreground"
                style={{ fontSize: 9 }}
              >
                {m.label}
              </text>
            ))}

            {/* Day labels */}
            {dayLabels.map((label, i) => (
              label && (
                <text
                  key={i}
                  x={labelW - 4}
                  y={headerH + i * step + cellSize - 1}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  style={{ fontSize: 9 }}
                >
                  {label}
                </text>
              )
            ))}

            {/* Cells */}
            {grid.map((cell, i) => {
              const x = labelW + cell.weekIndex * step;
              const y = headerH + cell.dayOfWeek * step;
              const level = getLevel(cell.count);
              const isHovered = hoveredCell?.date === cell.date;

              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    fill={HEATMAP_COLORS[level]}
                    stroke={isHovered ? '#a855f7' : 'transparent'}
                    strokeWidth={isHovered ? 1.5 : 0}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                  {isHovered && (
                    <g>
                      <rect
                        x={x - 40}
                        y={y - 24}
                        width={100}
                        height={18}
                        rx={4}
                        className="fill-popover stroke-border"
                        strokeWidth={0.5}
                      />
                      <text
                        x={x + cellSize / 2 + 10}
                        y={y - 12}
                        textAnchor="middle"
                        className="fill-popover-foreground"
                        style={{ fontSize: 8 }}
                      >
                        {cell.count} on {cell.date}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-3 justify-end">
          <span className="text-xs text-muted-foreground mr-1">Less</span>
          {HEATMAP_COLORS.map((color, i) => (
            <span
              key={i}
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">More</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Activity Chart ─── */

function CustomTooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-medium text-foreground">{payload[0].value} activities</p>
    </div>
  );
}

function ActivityChart({ chartData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-purple-400" />
          Activity Chart
        </CardTitle>
        <CardDescription>Activity over the past 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData && chartData.length > 0 ? (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <defs>
                  <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip content={<CustomTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#activityGradient)"
                  dot={{ fill: '#a855f7', r: 3, strokeWidth: 0 }}
                  activeDot={{ fill: '#a855f7', r: 5, strokeWidth: 2, stroke: '#1e1b2e' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
            No chart data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Live Feed ─── */

function FeedEntry({ entry }) {
  const config = getActionConfig(entry.action);
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className={cn('mt-0.5 p-1.5 rounded-md bg-muted shrink-0', config.color)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          {entry.actor && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {entry.actor}
            </Badge>
          )}
          <Badge variant={config.badgeVariant} className="text-[10px] px-1.5 py-0">
            {config.label}
          </Badge>
        </div>
        <p className="text-sm text-foreground leading-snug">{entry.description}</p>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
        {formatRelativeTime(entry.timestamp)}
      </span>
    </div>
  );
}

function LiveFeed({ entries, newEntryIds }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-400" />
              Live Feed
            </CardTitle>
            <CardDescription>Recent activity across your workspace</CardDescription>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entries && entries.length > 0 ? (
          <div className="max-h-[480px] overflow-y-auto -mx-1 px-1">
            {entries.map((entry) => (
              <div
                key={entry.id || entry.timestamp}
                className={cn(
                  'transition-colors duration-700',
                  newEntryIds?.has(entry.id) && 'bg-purple-500/5'
                )}
              >
                <FeedEntry entry={entry} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No activity yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Loading Skeleton ─── */

function ActivitySkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-56 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[120px] w-full rounded" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[240px] w-full rounded" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main Page ─── */

export default function ActivityPage() {
  const [heatmapData, setHeatmapData] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [entries, setEntries] = useState(null);
  const [newEntryIds, setNewEntryIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [heatmap, chart, feed] = await Promise.all([
        apiGet('/activity/heatmap?range=90d'),
        apiGet('/activity/chart?range=7d'),
        apiGet('/activity?limit=50'),
      ]);
      setHeatmapData(heatmap);
      setChartData(chart);
      setEntries(feed);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket for real-time feed updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/activity`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const entry = JSON.parse(event.data);
          setEntries((prev) => {
            if (!prev) return [entry];
            const updated = [entry, ...prev].slice(0, 100);
            return updated;
          });
          if (entry.id) {
            setNewEntryIds((prev) => {
              const next = new Set(prev);
              next.add(entry.id);
              return next;
            });
            setTimeout(() => {
              setNewEntryIds((prev) => {
                const next = new Set(prev);
                next.delete(entry.id);
                return next;
              });
            }, 3000);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        // WebSocket unavailable -- silent fallback
      };

      return () => {
        ws.close();
      };
    } catch {
      // WebSocket not supported or connection failed
    }
  }, []);

  return (
    <div className="px-3 py-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
        <p className="text-muted-foreground mt-1">Track workspace activity and contributions</p>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-2 text-destructive text-sm">
            <RefreshCw className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <ActivitySkeleton />
      ) : (
        <>
          <Heatmap data={heatmapData} />
          <ActivityChart chartData={chartData} />
          <LiveFeed entries={entries} newEntryIds={newEntryIds} />
        </>
      )}
    </div>
  );
}
