import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Terminal, Monitor, Code, Sparkles, Bot, Clock,
  Calendar, Tag, ShieldCheck, AlertTriangle, XCircle, Share2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet } from '@/lib/api';

const PROVIDER_ICONS = {
  openclaw: Terminal,
  'claude-desktop': Monitor,
  'claude-code': Code,
};

const KIND_LABELS = {
  skill: 'Skill',
  agent: 'Agent',
  'scheduled-automation': 'Scheduled Automation',
};

const READINESS_CONFIG = {
  ready: { label: 'Healthy', variant: 'success', icon: ShieldCheck, color: 'text-emerald-500' },
  partial: { label: 'Some Gaps', variant: 'warning', icon: AlertTriangle, color: 'text-amber-500' },
  blocked: { label: 'Critical Gaps', variant: 'destructive', icon: XCircle, color: 'text-red-500' },
};

export default function AgentCareItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [providers, setProviders] = useState({});
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet(`/agentcare/items/${id}`),
      apiGet('/agentcare/providers'),
      apiGet('/agentcare/insights/health'),
    ]).then(([itemData, provs, healthData]) => {
      setItem(itemData);
      setProviders(provs || {});
      // Find this item's health info
      const itemHealth = healthData?.itemsWithGaps?.find(h => h.id === id);
      setHealth(itemHealth || { readiness: 'ready', gaps: [], connectors: [] });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="px-3 py-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-4 w-full" />
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="px-3 py-4 sm:p-6 max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-4" onClick={() => navigate('/agentcare/items')}>
          <ArrowLeft className="h-4 w-4" /> Back to Inventory
        </Button>
        <Card className="py-12 text-center">
          <p className="text-muted-foreground">Item not found.</p>
        </Card>
      </div>
    );
  }

  const platformEntries = Object.entries(item.platforms || {});
  const isShared = platformEntries.length > 1;
  const readinessKey = health?.readiness || 'ready';
  const readiness = READINESS_CONFIG[readinessKey];
  const ReadinessIcon = readiness.icon;

  return (
    <div className="px-3 py-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/agentcare/items')}>
        <ArrowLeft className="h-4 w-4" /> Back to Inventory
      </Button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant="outline">{KIND_LABELS[item.kind] || item.kind}</Badge>
          <Badge variant="secondary">{item.provider}</Badge>
          {isShared && <Badge className="gap-1"><Share2 className="h-3 w-3" /> Shared</Badge>}
          <Badge variant={readiness.variant} className="gap-1">
            <ReadinessIcon className="h-3 w-3" />
            {readiness.label}
          </Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{item.name}</h1>
        {item.description && (
          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
        )}
      </div>

      {/* Schedule */}
      {item.schedule && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{item.schedule.humanReadable || item.schedule.cron}</p>
              {item.schedule.timezone && (
                <p className="text-xs text-muted-foreground">{item.schedule.timezone}</p>
              )}
              {item.schedule.cron && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.schedule.cron}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Where this exists */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Where this exists</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {platformEntries.map(([pid, pdata]) => {
            const ProvIcon = PROVIDER_ICONS[pid] || Terminal;
            const meta = providers[pid];
            return (
              <Card key={pid}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${meta?.color || '#888'}15` }}
                    >
                      <ProvIcon className="h-5 w-5" style={{ color: meta?.color }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{meta?.name || pid}</p>
                      <Badge
                        variant={pdata.status === 'active' ? 'success' : 'secondary'}
                        className="text-[10px]"
                      >
                        {pdata.status}
                      </Badge>
                    </div>
                  </div>
                  {pdata.lastRun && (
                    <p className="text-xs text-muted-foreground">
                      Last run: {new Date(pdata.lastRun).toLocaleString()}
                    </p>
                  )}
                  {pdata.skillPath && (
                    <p className="text-xs text-muted-foreground font-mono truncate mt-1">{pdata.skillPath}</p>
                  )}
                  {pdata.command && (
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {pdata.command} {(pdata.args || []).join(' ')}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Health / Gaps */}
      {health?.gaps?.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Compatibility</h2>
          <div className="space-y-2">
            {health.gaps.map((gap, i) => (
              <Card key={i} className={
                gap.severity === 'high' ? 'border-red-500/20' :
                gap.severity === 'medium' ? 'border-amber-500/20' : ''
              }>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge
                      variant={
                        gap.severity === 'high' ? 'destructive' :
                        gap.severity === 'medium' ? 'warning' : 'secondary'
                      }
                      className="text-[10px] shrink-0 mt-0.5"
                    >
                      {gap.severity}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{gap.category}</p>
                      <p className="text-xs text-muted-foreground mt-1">{gap.description}</p>
                      {gap.workaround && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium">Workaround:</span> {gap.workaround}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {item.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1">
                <Tag className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p>ID: <span className="font-mono">{item.id}</span></p>
          <p>Created: {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown'}</p>
          <p>Updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'Unknown'}</p>
        </CardContent>
      </Card>
    </div>
  );
}
