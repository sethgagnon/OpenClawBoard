import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Workflow, Search, Filter, Plus, Download, Upload,
  Calendar, Tag, ChevronRight, Terminal, Monitor,
  Trash2, Pencil,
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
import { cn } from '@/lib/utils';

const PLATFORM_ICONS = {
  openclaw: Terminal,
  'claude-desktop': Monitor,
};

const STATUS_VARIANTS = {
  active: 'success',
  inactive: 'secondary',
  'not-migrated': 'outline',
  migrated: 'default',
  partial: 'warning',
};

function PlatformBadge({ platformId, platformData, platforms }) {
  const meta = platforms[platformId];
  if (!meta) return null;
  const Icon = PLATFORM_ICONS[platformId] || Workflow;
  return (
    <Badge
      variant={STATUS_VARIANTS[platformData.status] || 'secondary'}
      className="text-[10px] flex items-center gap-1"
    >
      <Icon className="h-3 w-3" />
      {meta.name}: {platformData.status}
    </Badge>
  );
}

function AutomationCard({ automation, platforms, onMigrate, onDelete }) {
  const navigate = useNavigate();
  const schedule = automation.schedule;
  const platformEntries = Object.entries(automation.platforms || {});
  const exportablePlatforms = Object.values(platforms).filter(p => p.exportAvailable);

  return (
    <Card className="group relative overflow-hidden transition-colors hover:border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground truncate">{automation.name}</h3>
            {automation.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{automation.description}</p>
            )}
          </div>
          <button
            className="shrink-0 rounded p-0.5 text-muted-foreground/30 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            title="Delete"
            onClick={() => {
              if (window.confirm(`Delete "${automation.name}"?`)) onDelete(automation.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Schedule */}
        {schedule && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{schedule.humanReadable || schedule.cron}</span>
            {schedule.timezone && <span className="text-[10px]">({schedule.timezone})</span>}
          </div>
        )}

        {/* Platform badges */}
        <div className="flex flex-wrap gap-1.5">
          {platformEntries.map(([pid, pdata]) => (
            <PlatformBadge key={pid} platformId={pid} platformData={pdata} platforms={platforms} />
          ))}
        </div>

        {/* Tags */}
        {automation.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {automation.tags.slice(0, 5).map(tag => (
              <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => navigate(`/automations/${automation.id}`)}
          >
            <ChevronRight className="h-3 w-3" />
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-md bg-muted/30 px-4 py-3 text-center">
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function AutomationsPage() {
  const navigate = useNavigate();
  const [automations, setAutomations] = useState([]);
  const [platforms, setPlatforms] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [items, plats, st] = await Promise.all([
        apiGet('/registry'),
        apiGet('/platforms'),
        apiGet('/registry/stats'),
      ]);
      setAutomations(Array.isArray(items) ? items : []);
      setPlatforms(plats || {});
      setStats(st);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id) => {
    try {
      await apiDelete(`/registry/${id}`);
      setAutomations(prev => prev.filter(a => a.id !== id));
    } catch {}
  };

  // Client-side filtering
  let filtered = automations;
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(s) || (a.description || '').toLowerCase().includes(s)
    );
  }
  if (platformFilter !== 'all') {
    filtered = filtered.filter(a => a.platforms?.[platformFilter]);
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter(a =>
      Object.values(a.platforms || {}).some(p => p.status === statusFilter)
    );
  }

  const importers = Object.values(platforms).filter(p => p.importAvailable);

  return (
    <div className="px-3 py-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage automations across all your AI platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          {importers.map(p => (
            <Button
              key={p.id}
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(`/import/${p.id}`)}
            >
              <Upload className="h-4 w-4" />
              Import from {p.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Automations" value={stats.total} />
          <StatCard
            label="Active on OpenClaw"
            value={stats.byPlatform?.openclaw?.active || 0}
          />
          <StatCard
            label="On Claude Desktop"
            value={(stats.byPlatform?.['claude-desktop']?.active || 0) + (stats.byPlatform?.['claude-desktop']?.migrated || 0)}
          />
          <StatCard
            label="Categories"
            value={Object.keys(stats.byCategory || {}).length}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search automations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {Object.values(platforms).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="not-migrated">Not Migrated</SelectItem>
            <SelectItem value="migrated">Migrated</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
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
          <Workflow className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">
            {automations.length === 0 ? 'No automations yet' : 'No matches'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            {automations.length === 0
              ? 'Import your automations from OpenClaw or another platform to get started.'
              : 'Try adjusting your filters or search term.'}
          </p>
          {automations.length === 0 && importers.length > 0 && (
            <Button
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => navigate(`/import/${importers[0].id}`)}
            >
              <Upload className="h-4 w-4" />
              Import from {importers[0].name}
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(a => (
            <AutomationCard
              key={a.id}
              automation={a}
              platforms={platforms}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
