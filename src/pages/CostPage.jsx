import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { DollarSign, Zap, TrendingUp, Hash, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

function StatCard({ label, value, icon: Icon, loading }) {
  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-4">
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-7 w-28" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-xs uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-64 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}

function fmtTokens(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm p-3 shadow-xl text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.name.toLowerCase().includes('token')
            ? Number(entry.value).toLocaleString() + ' tokens'
            : `$${Number(entry.value).toFixed(4)}`}
        </p>
      ))}
    </div>
  );
};

export default function CostPage() {
  const [range, setRange] = useState('7d');
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('cost');
  const [sortDir, setSortDir] = useState('desc');
  const [subProviders, setSubProviders] = useState([]);

  const fetchData = useCallback(async (r) => {
    setLoading(true);
    try {
      const [usageData, historyData, breakdownData, settingsData] = await Promise.all([
        apiGet('/usage').catch(() => null),
        apiGet(`/usage/history?range=${r}`).catch(() => []),
        apiGet(`/usage/breakdown?range=${r}`).catch(() => []),
        apiGet('/settings').catch(() => ({})),
      ]);
      setUsage(usageData);
      setHistory(Array.isArray(historyData) ? historyData : []);
      setBreakdown(Array.isArray(breakdownData) ? breakdownData : []);
      const sp = settingsData?.subscriptionProviders;
      setSubProviders(Array.isArray(sp) ? sp : (settingsData?.subscriptionMode === 'max' ? ['anthropic'] : []));
    } catch {
      // errors handled per-request above
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(range);
  }, [range, fetchData]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedBreakdown = [...breakdown].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
    return aVal < bVal ? 1 : -1;
  });

  // Compute totals, splitting by subscription vs pay-per-use
  const byProvider = usage?.byProvider || {};
  const providers = usage?.providers || [];
  const allSub = providers.length > 0 && providers.every((p) => subProviders.includes(p));
  const noneSub = subProviders.length === 0;
  const mixed = !allSub && !noneSub;

  const payPerUseCost = Object.entries(byProvider)
    .filter(([p]) => !subProviders.includes(p))
    .reduce((s, [, v]) => s + (v.cost || 0), 0);

  const subTokens = Object.entries(byProvider)
    .filter(([p]) => subProviders.includes(p))
    .reduce((s, [, v]) => s + (v.input || 0) + (v.output || 0) + (v.cacheRead || 0), 0);

  const totalCost = usage?.cost ?? 0;
  const totalTokens = usage?.totalTokens ?? 0;
  const sessionCount = usage?.sessions ?? 0;
  const days = history.length || 1;

  function SortIcon({ field }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  // For charts: show cost for pay-per-use view, tokens for all-subscription view
  const chartShowTokens = allSub;

  return (
    <div className="px-3 py-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {allSub ? 'Usage Analytics' : 'Cost Analytics'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {allSub
              ? 'Track token usage across all agents and providers'
              : mixed
                ? 'Track spending and token usage across providers'
                : 'Track spending and token usage across all agents'}
          </p>
        </div>
        <Tabs value={range} onValueChange={setRange}>
          <TabsList>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="90d">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {allSub ? (
          <>
            <StatCard label="Total Tokens" value={fmtTokens(totalTokens)} icon={Zap} loading={loading} />
            <StatCard label="Input Tokens" value={fmtTokens(usage?.input ?? 0)} icon={Zap} loading={loading} />
            <StatCard label="Avg Daily Tokens" value={fmtTokens(Math.round(totalTokens / days))} icon={TrendingUp} loading={loading} />
            <StatCard label="Sessions" value={sessionCount.toLocaleString()} icon={Hash} loading={loading} />
          </>
        ) : mixed ? (
          <>
            <StatCard label="Pay-per-use Cost" value={`$${payPerUseCost.toFixed(2)}`} icon={DollarSign} loading={loading} />
            <StatCard label="Subscription Tokens" value={fmtTokens(subTokens)} icon={Zap} loading={loading} />
            <StatCard label="Total Tokens" value={fmtTokens(totalTokens)} icon={TrendingUp} loading={loading} />
            <StatCard label="Sessions" value={sessionCount.toLocaleString()} icon={Hash} loading={loading} />
          </>
        ) : (
          <>
            <StatCard label="Total Cost" value={`$${totalCost.toFixed(2)}`} icon={DollarSign} loading={loading} />
            <StatCard label="Total Tokens" value={fmtTokens(totalTokens)} icon={Zap} loading={loading} />
            <StatCard label="Avg Daily Cost" value={`$${(totalCost / days).toFixed(2)}`} icon={TrendingUp} loading={loading} />
            <StatCard label="Sessions" value={sessionCount.toLocaleString()} icon={Hash} loading={loading} />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Area Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                {chartShowTokens ? 'Token Usage Over Time' : 'Cost Over Time'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                  No data available for this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={chartShowTokens
                      ? history.map(d => ({ ...d, tokens: (d.input || 0) + (d.output || 0) + (d.cacheRead || 0) }))
                      : history
                    }
                    margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={chartShowTokens ? (v) => fmtTokens(v) : (v) => `$${v}`}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey={chartShowTokens ? 'tokens' : 'cost'}
                      name={chartShowTokens ? 'Tokens' : 'Cost'}
                      stroke="#a855f7"
                      strokeWidth={2}
                      fill="url(#costGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bar Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Daily Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                  No data available for this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={chartShowTokens
                      ? history.map(d => ({ ...d, tokens: (d.input || 0) + (d.output || 0) + (d.cacheRead || 0) }))
                      : history
                    }
                    margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={chartShowTokens ? (v) => fmtTokens(v) : (v) => `$${v}`}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}
                    />
                    <Bar
                      dataKey={chartShowTokens ? 'tokens' : 'cost'}
                      name={chartShowTokens ? 'Tokens' : 'Cost'}
                      fill="#a855f7"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Breakdown Table */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Breakdown by Provider</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton />
          ) : breakdown.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No breakdown data available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {[
                      { key: 'agent', label: 'Agent', align: 'left' },
                      { key: 'provider', label: 'Provider', align: 'left' },
                      { key: 'sessions', label: 'Sessions', align: 'right' },
                      { key: 'input', label: 'Input', align: 'right' },
                      { key: 'output', label: 'Output', align: 'right' },
                      { key: 'cost', label: 'Cost / Billing', align: 'right' },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className={cn(
                          'py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none',
                          col.align === 'right' ? 'text-right' : 'text-left'
                        )}
                        onClick={() => handleSort(col.key)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          <SortIcon field={col.key} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedBreakdown.map((row, idx) => {
                    const isSub = subProviders.includes(row.provider);
                    return (
                      <tr key={idx} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">{row.agent || '-'}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="capitalize">{(row.provider || 'unknown').replace(/-/g, ' ')}</span>
                            {isSub && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sub</Badge>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">{(row.sessions ?? 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right tabular-nums">{fmtTokens(row.input ?? 0)}</td>
                        <td className="py-3 px-4 text-right tabular-nums">{fmtTokens(row.output ?? 0)}</td>
                        <td className="py-3 px-4 text-right tabular-nums font-medium text-purple-400">
                          {isSub
                            ? fmtTokens((row.input || 0) + (row.output || 0) + (row.cacheRead || 0)) + ' tokens'
                            : `$${(row.cost ?? 0).toFixed(4)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
