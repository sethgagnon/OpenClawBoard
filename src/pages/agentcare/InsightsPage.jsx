import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, ShieldCheck, AlertTriangle, XCircle,
  Sparkles, Bot, Clock, Terminal, Monitor, Code,
  ArrowLeft, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { apiGet } from '@/lib/api';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const PROVIDER_ICONS = {
  openclaw: Terminal,
  'claude-desktop': Monitor,
  'claude-code': Code,
};

const COLORS = ['#a855f7', '#d97706', '#3b82f6', '#10b981', '#ef4444', '#6366f1'];

function InventoryTab() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet('/agentcare/insights/inventory')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (!data) return <p className="text-muted-foreground text-sm">Failed to load inventory data.</p>;

  const categoryData = Object.entries(data.byCategory || {}).map(([name, value]) => ({ name, value }));
  const kindData = Object.entries(data.byKind || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold">{data.total}</p>
            <p className="text-xs text-muted-foreground">Total Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold">{data.sharedItems?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Shared Across Providers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold">{Object.keys(data.byProvider || {}).length}</p>
            <p className="text-xs text-muted-foreground">Providers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold">{Object.keys(data.byCategory || {}).length}</p>
            <p className="text-xs text-muted-foreground">Categories</p>
          </CardContent>
        </Card>
      </div>

      {/* Provider breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Items by Provider</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(data.capabilityMatrix || []).map((pm, i) => {
              const ProvIcon = PROVIDER_ICONS[pm.provider] || Terminal;
              return (
                <div key={pm.provider} className="flex items-center gap-3">
                  <ProvIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium w-32">{pm.providerName}</span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: data.total > 0 ? `${(pm.itemCount / data.total) * 100}%` : '0%',
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-8 text-right">{pm.itemCount}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Category chart */}
      {categoryData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Shared items */}
      {data.sharedItems?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Shared Items</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.sharedItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:border-primary/20"
                  onClick={() => navigate(`/agentcare/items/${item.id}`)}
                >
                  <span className="text-sm font-medium flex-1">{item.name}</span>
                  <div className="flex gap-1">
                    {item.providers.map(pid => (
                      <Badge key={pid} variant="secondary" className="text-[10px]">{pid}</Badge>
                    ))}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HealthTab() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet('/agentcare/insights/health')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (!data) return <p className="text-muted-foreground text-sm">Failed to load health data.</p>;

  const pieData = [
    { name: 'Healthy', value: data.healthy, color: '#10b981' },
    { name: 'Warning', value: data.warning, color: '#f59e0b' },
    { name: 'Critical', value: data.critical, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const gapCategoryData = Object.entries(data.gapsByCategory || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Health score */}
      <Card>
        <CardContent className="p-6 flex items-center gap-6">
          <div className="relative">
            <div className="h-24 w-24 rounded-full border-4 flex items-center justify-center"
              style={{
                borderColor: data.healthScore >= 80 ? '#10b981' : data.healthScore >= 50 ? '#f59e0b' : '#ef4444'
              }}
            >
              <span className="text-2xl font-bold">{data.healthScore}%</span>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Overall Health Score</h3>
            <p className="text-sm text-muted-foreground">
              {data.healthy} of {data.total} items have no compatibility gaps
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Distribution */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Status Distribution</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Gaps by Category</CardTitle></CardHeader>
          <CardContent>
            {gapCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={gapCategoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm text-muted-foreground">All clear! No gaps detected.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items with gaps */}
      {data.itemsWithGaps?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Items with Gaps</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.itemsWithGaps.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:border-primary/20"
                  onClick={() => navigate(`/agentcare/items/${item.id}`)}
                >
                  <Badge
                    variant={item.readiness === 'blocked' ? 'destructive' : 'warning'}
                    className="text-[10px] shrink-0"
                  >
                    {item.readiness}
                  </Badge>
                  <span className="text-sm font-medium flex-1 truncate">{item.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{item.provider}</Badge>
                  <span className="text-xs text-muted-foreground">{item.gapCount} gap{item.gapCount !== 1 ? 's' : ''}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsageTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet('/agentcare/insights/usage')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (!data) return <p className="text-muted-foreground text-sm">Failed to load usage data.</p>;

  const providerData = Object.entries(data.byProvider || {}).map(([name, value]) => ({ name, value }));
  const kindData = Object.entries(data.byKind || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold">{data.totalItems}</p>
            <p className="text-xs text-muted-foreground">Total Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold">{data.recentlyActive?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Recently Active</p>
          </CardContent>
        </Card>
      </div>

      {/* By provider */}
      {providerData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Items by Provider</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={providerData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {providerData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recently active */}
      {data.recentlyActive?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Recently Active</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentlyActive.slice(0, 10).map((item, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                  <Badge
                    variant={item.lastStatus === 'success' ? 'success' : item.lastStatus === 'error' ? 'destructive' : 'secondary'}
                    className="text-[10px] shrink-0"
                  >
                    {item.lastStatus}
                  </Badge>
                  <span className="text-sm font-medium flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.lastRun).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.recentlyActive?.length === 0 && (
        <Card className="py-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No recent activity data available.</p>
        </Card>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const navigate = useNavigate();

  return (
    <div className="px-3 py-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/agentcare')}>
        <ArrowLeft className="h-4 w-4" /> Back to AgentCare
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analytics and health analysis across all your providers
        </p>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Health
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-6">
          <InventoryTab />
        </TabsContent>
        <TabsContent value="health" className="mt-6">
          <HealthTab />
        </TabsContent>
        <TabsContent value="usage" className="mt-6">
          <UsageTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
