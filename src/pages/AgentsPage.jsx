import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Activity, DollarSign, Clock, Cpu } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

function formatRelativeTime(dateString) {
  if (!dateString) return 'Never';
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

const statusConfig = {
  active: { color: 'bg-emerald-500', label: 'Active', variant: 'success' },
  idle: { color: 'bg-amber-500', label: 'Idle', variant: 'warning' },
  offline: { color: 'bg-zinc-500', label: 'Offline', variant: 'secondary' },
};

function AgentCardSkeleton() {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </div>
        <Skeleton className="h-3 w-24 mt-4" />
      </CardContent>
    </Card>
  );
}

function AgentCard({ agent, onClick }) {
  const status = statusConfig[agent.status] || statusConfig.offline;

  return (
    <Card
      className="border-border/50 bg-card/50 hover:bg-card/80 hover:border-purple-500/30 transition-all duration-200 cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
              <Bot className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-foreground">{agent.name}</h3>
                <span className={cn('h-2 w-2 rounded-full', status.color)} />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Cpu className="h-3 w-3" />
                {agent.model || 'Unknown model'}
              </p>
            </div>
          </div>
          <Badge variant={status.variant} className="text-[10px]">
            {status.label}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sessions</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {agent.sessionCount?.toLocaleString() ?? 0}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              ${(agent.totalCost ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
              {agent.model?.split('/').pop()?.split('-')[0] || 'N/A'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 mt-4 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Last active {formatRelativeTime(agent.lastActive)}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiGet('/agents')
      .then((data) => {
        if (!cancelled) {
          setAgents(Array.isArray(data) ? data : []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="px-3 py-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and manage your AI agents
          </p>
        </div>
        {!loading && agents.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            {agents.filter((a) => a.status === 'active').length} active
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load agents: {error}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <AgentCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No agents found</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Agents will appear here once they connect and start running sessions.
          </p>
        </div>
      )}

      {!loading && !error && agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              onClick={() => navigate(`/agents/${encodeURIComponent(agent.name)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
