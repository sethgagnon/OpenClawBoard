import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Cpu, DollarSign, Hash, Clock, Timer, Coins, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

const statusConfig = {
  active: { color: 'bg-emerald-500', label: 'Active', variant: 'success' },
  idle: { color: 'bg-amber-500', label: 'Idle', variant: 'warning' },
  offline: { color: 'bg-zinc-500', label: 'Offline', variant: 'secondary' },
};

function formatDuration(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="h-14 w-14 rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}

const sessionStatusVariant = {
  completed: 'success',
  running: 'default',
  failed: 'destructive',
  cancelled: 'warning',
};

export default function AgentDetailPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const decodedName = decodeURIComponent(name);

    apiGet(`/agents/${encodeURIComponent(decodedName)}`)
      .then((data) => { if (!cancelled) setAgent(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadingAgent(false); });

    apiGet(`/agents/${encodeURIComponent(decodedName)}/sessions`)
      .then((data) => { if (!cancelled) setSessions(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setSessions([]); })
      .finally(() => { if (!cancelled) setLoadingSessions(false); });

    return () => { cancelled = true; };
  }, [name]);

  const status = statusConfig[agent?.status] || statusConfig.offline;

  return (
    <div className="px-3 py-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        onClick={() => navigate('/agentcare/agents')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Agents
      </Button>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load agent: {error}
        </div>
      )}

      {/* Agent Header */}
      {loadingAgent ? (
        <HeaderSkeleton />
      ) : agent ? (
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Bot className="h-7 w-7 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
                <span className={cn('h-2.5 w-2.5 rounded-full', status.color)} />
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5" />
                  {agent.model || 'Unknown model'}
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  ${(agent.totalCost ?? 0).toFixed(2)} total
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Stats Row */}
      {!loadingAgent && agent && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Sessions', value: agent.sessionCount?.toLocaleString() ?? '0', icon: Hash },
            { label: 'Total Cost', value: `$${(agent.totalCost ?? 0).toFixed(2)}`, icon: DollarSign },
            { label: 'Model', value: agent.model || 'N/A', icon: Cpu },
            { label: 'Status', value: status.label, icon: Zap },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <stat.icon className="h-3.5 w-3.5" />
                  <span className="text-xs uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-lg font-semibold truncate">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Sessions Table */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <TableSkeleton />
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No sessions found for this agent.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Session ID</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tokens</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cost</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.id}
                      className="border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/agentcare/agents/${encodeURIComponent(name)}/sessions/${session.id}`)}
                    >
                      <td className="py-3 px-4 font-mono text-xs text-purple-400">
                        {String(session.id).slice(0, 8)}...
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {formatDate(session.date || session.createdAt || session.startedAt)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {formatDuration(session.duration)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {(session.tokens ?? session.totalTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums flex items-center justify-end gap-1">
                        <Coins className="h-3 w-3 text-muted-foreground" />
                        ${(session.cost ?? session.totalCost ?? 0).toFixed(4)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Badge variant={sessionStatusVariant[session.status] || 'secondary'} className="text-[10px]">
                          {session.status || 'unknown'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
