import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Upload, Calendar, Tag, ChevronRight,
  Terminal, Monitor, Code, Sparkles, Bot, Clock,
  Trash2, HeartHandshake, Share2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { apiGet, apiDelete } from '@/lib/api';

const PROVIDER_ICONS = {
  openclaw: Terminal,
  'claude-desktop': Monitor,
  'claude-code': Code,
};

const KIND_LABELS = {
  skill: 'Skill',
  agent: 'Agent',
  'scheduled-automation': 'Automation',
};

const KIND_ICONS = {
  skill: Sparkles,
  agent: Bot,
  'scheduled-automation': Clock,
};

function ItemCard({ item, providers, onDelete }) {
  const navigate = useNavigate();
  const schedule = item.schedule;
  const platformEntries = Object.entries(item.platforms || {});
  const isShared = platformEntries.length > 1;
  const KindIcon = KIND_ICONS[item.kind] || Sparkles;

  return (
    <Card className="group relative overflow-hidden transition-colors hover:border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <KindIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <h3 className="text-sm font-semibold text-foreground truncate">{item.name}</h3>
            </div>
            {item.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
            )}
          </div>
          <button
            className="shrink-0 rounded p-0.5 text-muted-foreground/30 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            title="Delete"
            onClick={() => {
              if (window.confirm(`Delete "${item.name}"?`)) onDelete(item.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {schedule && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{schedule.humanReadable || schedule.cron}</span>
          </div>
        )}

        {/* Provider & kind badges */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px] gap-1">
            {KIND_LABELS[item.kind] || item.kind}
          </Badge>
          {platformEntries.map(([pid, pdata]) => {
            const ProvIcon = PROVIDER_ICONS[pid] || Terminal;
            const meta = providers[pid];
            return (
              <Badge
                key={pid}
                variant={pdata.status === 'active' ? 'success' : 'secondary'}
                className="text-[10px] flex items-center gap-1"
              >
                <ProvIcon className="h-3 w-3" />
                {meta?.name || pid}
              </Badge>
            );
          })}
          {isShared && (
            <Badge variant="default" className="text-[10px] gap-1">
              <Share2 className="h-3 w-3" />
              Shared
            </Badge>
          )}
        </div>

        {/* Tags */}
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 5).map(tag => (
              <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => navigate(`/agentcare/items/${item.id}`)}
        >
          <ChevronRight className="h-3 w-3" />
          View Details
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AgentCareItems() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [providers, setProviders] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [data, provs] = await Promise.all([
        apiGet('/agentcare/items'),
        apiGet('/agentcare/providers'),
      ]);
      setItems(Array.isArray(data) ? data : []);
      setProviders(provs || {});
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id) => {
    try {
      await apiDelete(`/agentcare/items/${id}`);
      setItems(prev => prev.filter(a => a.id !== id));
    } catch {}
  };

  let filtered = items;
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(s) || (a.description || '').toLowerCase().includes(s)
    );
  }
  if (providerFilter !== 'all') {
    filtered = filtered.filter(a => a.provider === providerFilter);
  }
  if (kindFilter !== 'all') {
    filtered = filtered.filter(a => a.kind === kindFilter);
  }

  const importers = Object.values(providers);

  return (
    <div className="px-3 py-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All your agents and skills across providers
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {importers.map(p => (
            <Button
              key={p.id}
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => navigate(`/agentcare/import/${p.id}`)}
            >
              <Upload className="h-4 w-4" />
              {p.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {Object.values(providers).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="skill">Skills</SelectItem>
            <SelectItem value="agent">Agents</SelectItem>
            <SelectItem value="scheduled-automation">Automations</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <HeartHandshake className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">
            {items.length === 0 ? 'No items yet' : 'No matches'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            {items.length === 0
              ? 'Import your agents and skills from a provider to get started.'
              : 'Try adjusting your filters or search term.'}
          </p>
          {items.length === 0 && importers.length > 0 && (
            <Button
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => navigate(`/agentcare/import/${importers[0].id}`)}
            >
              <Upload className="h-4 w-4" />
              Import from {importers[0].name}
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              providers={providers}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
