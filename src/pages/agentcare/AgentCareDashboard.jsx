import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartHandshake, Upload, Terminal, Monitor, Code,
  Sparkles, Bot, Clock, BarChart3, ShieldCheck,
  ChevronRight, ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet } from '@/lib/api';

const PROVIDER_ICONS = {
  openclaw: Terminal,
  'claude-desktop': Monitor,
  'claude-code': Code,
};

const KIND_ICONS = {
  skill: Sparkles,
  agent: Bot,
  'scheduled-automation': Clock,
};

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg bg-muted/30 border px-4 py-3 text-center">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />}
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function ProviderCard({ provider, count, navigate }) {
  const Icon = PROVIDER_ICONS[provider.id] || Terminal;
  return (
    <Card className="transition-colors hover:border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${provider.color}15` }}
          >
            <Icon className="h-5 w-5" style={{ color: provider.color }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{provider.name}</h3>
            <p className="text-xs text-muted-foreground">
              {count} item{count !== 1 ? 's' : ''} imported
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {provider.capabilities?.slice(0, 4).map(cap => (
            <Badge key={cap} variant="secondary" className="text-[10px]">{cap}</Badge>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          onClick={() => navigate(`/agentcare/import/${provider.id}`)}
        >
          <Upload className="h-3.5 w-3.5" />
          Import
        </Button>
      </CardContent>
    </Card>
  );
}

function RecentItem({ item, navigate }) {
  const KindIcon = KIND_ICONS[item.kind] || Sparkles;
  return (
    <div
      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/20 cursor-pointer"
      onClick={() => navigate(`/agentcare/items/${item.id}`)}
    >
      <KindIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
      </div>
      <Badge variant="secondary" className="text-[10px] shrink-0">{item.provider}</Badge>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}

export default function AgentCareDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [providers, setProviders] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [dash, provs] = await Promise.all([
        apiGet('/agentcare/dashboard'),
        apiGet('/agentcare/providers'),
      ]);
      setDashboard(dash);
      setProviders(provs || {});
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="px-3 py-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  const d = dashboard || { total: 0, byProvider: {}, byKind: {}, health: {}, recentItems: [] };

  return (
    <div className="px-3 py-4 sm:p-6 max-w-7xl mx-auto space-y-8">
      {/* Hero */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
            <HeartHandshake className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AgentCare</h1>
            <p className="text-sm text-muted-foreground">Care for your Agents and your Skills</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total Items" value={d.total} />
        <StatCard label="Providers" value={d.providersConnected} />
        <StatCard label="Skills" value={d.byKind?.skill || 0} icon={Sparkles} />
        <StatCard label="Agents" value={d.byKind?.agent || 0} icon={Bot} />
        <StatCard label="Automations" value={d.byKind?.['scheduled-automation'] || 0} icon={Clock} />
      </div>

      {/* Health overview */}
      {d.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4 text-center">
              <ShieldCheck className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{d.health?.healthy || 0}</p>
              <p className="text-[11px] text-muted-foreground">Healthy</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 text-center">
              <ShieldCheck className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className="text-xl font-semibold text-amber-600 dark:text-amber-400">{d.health?.warning || 0}</p>
              <p className="text-[11px] text-muted-foreground">Warnings</p>
            </CardContent>
          </Card>
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4 text-center">
              <ShieldCheck className="h-5 w-5 text-red-500 mx-auto mb-1" />
              <p className="text-xl font-semibold text-red-600 dark:text-red-400">{d.health?.critical || 0}</p>
              <p className="text-[11px] text-muted-foreground">Critical</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Providers */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Providers</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.values(providers).map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              count={d.byProvider?.[p.id] || 0}
              navigate={navigate}
            />
          ))}
        </div>
      </div>

      {/* Recent items */}
      {(d.recentItems?.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent Imports</h2>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/agentcare/items')}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {d.recentItems.map(item => (
              <RecentItem key={item.id} item={item} navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card
          className="cursor-pointer transition-colors hover:border-primary/20"
          onClick={() => navigate('/agentcare/items')}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <div>
              <p className="text-sm font-semibold">Inventory</p>
              <p className="text-xs text-muted-foreground">Browse all items</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:border-primary/20"
          onClick={() => navigate('/agentcare/insights')}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-semibold">Insights</p>
              <p className="text-xs text-muted-foreground">Analytics & health</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:border-primary/20"
          onClick={() => navigate('/agentcare/agents')}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Bot className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-semibold">Agents</p>
              <p className="text-xs text-muted-foreground">Monitor agents</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {d.total === 0 && (
        <Card className="flex flex-col items-center justify-center py-12">
          <HeartHandshake className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">Get started with AgentCare</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center mb-4">
            Import your agents and skills from any supported provider to see them all in one place.
          </p>
          <div className="flex gap-2">
            {Object.values(providers).slice(0, 3).map(p => (
              <Button
                key={p.id}
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => navigate(`/agentcare/import/${p.id}`)}
              >
                <Upload className="h-3.5 w-3.5" />
                {p.name}
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
