import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightbulb,
  AlertTriangle,
  AlertCircle,
  Info,
  Zap,
  Brain,
  Clock,
  DollarSign,
  Cpu,
  Settings,
  FileCode,
  Calendar,
  MemoryStick,
  ChevronDown,
  ChevronRight,
  Sparkles,
  BarChart3,
  Search,
  Play,
  X,
  ArrowRight,
  Activity,
  Target,
  TrendingUp,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';

/* ─── Constants ─── */

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: AlertCircle, label: 'Critical' },
  error: { color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: AlertCircle, label: 'Error' },
  warning: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: AlertTriangle, label: 'Warning' },
  info: { color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', icon: Info, label: 'Info' },
};

const CATEGORY_ICONS = {
  memory: MemoryStick,
  cost: DollarSign,
  skills: Zap,
  cron: Calendar,
  config: Settings,
  performance: Activity,
  workspace: Layers,
  'code-quality': FileCode,
  'project-structure': Target,
  dependencies: Cpu,
};

const TYPE_BADGES = {
  'Create Skill': { color: 'bg-purple-500/15 text-purple-400', label: 'Create Skill' },
  'Edit Skill': { color: 'bg-blue-500/15 text-blue-400', label: 'Edit Skill' },
  'Adjust Cron': { color: 'bg-amber-500/15 text-amber-400', label: 'Adjust Cron' },
  'Change Model': { color: 'bg-emerald-500/15 text-emerald-400', label: 'Change Model' },
  'Create Task': { color: 'bg-cyan-500/15 text-cyan-400', label: 'Create Task' },
  'Update Memory': { color: 'bg-pink-500/15 text-pink-400', label: 'Update Memory' },
  'Config Change': { color: 'bg-zinc-500/15 text-zinc-400', label: 'Config Change' },
};

const ACTION_ROUTES = {
  'create-skill': '/skills',
  'adjust-cron': '/cron',
  'change-model': '/settings',
  'config-change': '/settings',
  'view-agents': '/agentcare/agents',
  'view-files': '/files',
};

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
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/* ─── Health Score Ring (SVG) ─── */

function HealthScoreRing({ score, size = 160 }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const remaining = circumference - progress;

  const color =
    score >= 80 ? '#22c55e' :
    score >= 60 ? '#eab308' :
    score >= 40 ? '#f97316' :
    '#ef4444';

  const bgColor =
    score >= 80 ? 'rgba(34,197,94,0.1)' :
    score >= 60 ? 'rgba(234,179,8,0.1)' :
    score >= 40 ? 'rgba(249,115,22,0.1)' :
    'rgba(239,68,68,0.1)';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={8}
          className="text-muted/30"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${remaining}`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">Health Score</span>
      </div>
    </div>
  );
}

/* ─── Severity Summary Bar ─── */

function SeveritySummary({ suggestions }) {
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const s of suggestions) {
    if (s.severity === 'critical' || s.severity === 'error') counts.critical++;
    else if (s.severity === 'warning') counts.warning++;
    else counts.info++;
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      {counts.critical > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-red-400 font-medium">{counts.critical} critical</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="text-amber-400 font-medium">{counts.warning} warning{counts.warning !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-blue-500" />
        <span className="text-blue-400 font-medium">{counts.info} info</span>
      </div>
    </div>
  );
}

/* ─── Quick Check Card ─── */

function QuickCheckCard({ suggestion, onAction }) {
  const sev = SEVERITY_CONFIG[suggestion.severity] || SEVERITY_CONFIG.info;
  const SevIcon = sev.icon;
  const CatIcon = CATEGORY_ICONS[suggestion.category] || Lightbulb;

  return (
    <Card className="group hover:border-purple-500/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 rounded-md p-1.5', sev.color)}>
            <CatIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={cn('text-[10px] px-1.5 py-0', sev.color)}>
                {sev.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {suggestion.category}
              </span>
            </div>
            <h4 className="text-sm font-medium text-foreground leading-snug">
              {suggestion.title}
            </h4>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {suggestion.description}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
            onClick={() => onAction(suggestion)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Insight Card ─── */

function InsightCard({ insight, onAction }) {
  const typeIcons = {
    'skill-gap': Zap,
    'cron-optimization': Calendar,
    'cost-savings': DollarSign,
    'skill-improvement': FileCode,
    'workflow-bottleneck': TrendingUp,
    'agent-utilization': Cpu,
  };
  const Icon = typeIcons[insight.type] || Lightbulb;

  return (
    <Card className="hover:border-purple-500/30 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-purple-500/10 p-2.5 shrink-0">
            <Icon className="h-5 w-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h4 className="text-sm font-semibold text-foreground">{insight.title}</h4>
              {insight.impact && (
                <Badge className="bg-purple-500/15 text-purple-400 text-[10px] px-1.5 py-0">
                  {insight.impact}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {insight.description}
            </p>

            {/* Extra details for specific insight types */}
            {insight.currentSchedule && insight.suggestedSchedule && (
              <div className="flex items-center gap-3 text-xs mb-3 p-2 rounded-md bg-muted/50">
                <div>
                  <span className="text-muted-foreground">Current: </span>
                  <code className="text-amber-400">{insight.currentSchedule}</code>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Suggested: </span>
                  <code className="text-emerald-400">{insight.suggestedSchedule}</code>
                </div>
              </div>
            )}
            {insight.correctionFrequency && (
              <div className="text-xs text-muted-foreground mb-3 p-2 rounded-md bg-muted/50">
                Correction frequency: <span className="text-foreground font-medium">{insight.correctionFrequency}</span>
              </div>
            )}
            {insight.status && (
              <div className="text-xs mb-3 p-2 rounded-md bg-muted/50">
                <span className="text-muted-foreground">Status: </span>
                <span className={cn(
                  'font-medium',
                  insight.status === 'overloaded' ? 'text-red-400' : 'text-emerald-400'
                )}>
                  {insight.status === 'overloaded' ? 'Overloaded' : 'Idle'}
                </span>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="text-purple-400 border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-300"
              onClick={() => onAction(insight)}
            >
              {insight.actionLabel || 'Take Action'}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Deep Analysis Suggestion Card ─── */

function DeepSuggestionCard({ suggestion, onAction, onDismiss }) {
  const typeBadge = TYPE_BADGES[suggestion.type] || TYPE_BADGES['Config Change'];

  return (
    <Card className="hover:border-purple-500/30 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={cn('text-[10px] px-2 py-0.5', typeBadge.color)}>
                {typeBadge.label}
              </Badge>
              {suggestion.impact && (
                <Badge className="bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0">
                  {suggestion.impact}
                </Badge>
              )}
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1.5">{suggestion.title}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
          <Button
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => onAction(suggestion)}
          >
            {getActionLabel(suggestion.type)}
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onDismiss(suggestion.id)}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function getActionLabel(type) {
  switch (type) {
    case 'Create Skill': return 'Create Skill';
    case 'Edit Skill': return 'Apply Edit';
    case 'Adjust Cron': return 'Reschedule';
    case 'Change Model': return 'Change Model';
    case 'Create Task': return 'Create Task';
    case 'Update Memory': return 'Update Memory';
    default: return 'Take Action';
  }
}

function getRouteForType(type) {
  switch (type) {
    case 'Create Skill':
    case 'Edit Skill':
      return '/skills';
    case 'Adjust Cron':
      return '/cron';
    case 'Change Model':
      return '/settings';
    case 'Create Task':
      return '/kanban';
    case 'Update Memory':
      return '/memory';
    default:
      return '/settings';
  }
}

/* ─── Streaming Progress ─── */

function StreamingProgress({ chunks, isRunning }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chunks]);

  if (!isRunning && chunks.length === 0) return null;

  return (
    <Card className="border-purple-500/20 bg-purple-500/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          {isRunning && (
            <RefreshCw className="h-4 w-4 text-purple-400 animate-spin" />
          )}
          <span className="text-sm font-medium text-purple-400">
            {isRunning ? 'Analysis in progress...' : 'Analysis complete'}
          </span>
        </div>
        <div
          ref={scrollRef}
          className="font-mono text-xs text-muted-foreground bg-black/30 rounded-md p-3 max-h-40 overflow-y-auto whitespace-pre-wrap"
        >
          {chunks.join('') || 'Waiting for output...'}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── History Entry ─── */

function HistoryEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">
            {new Date(entry.timestamp).toLocaleString()}
          </span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {entry.total} suggestion{entry.total !== 1 ? 's' : ''}
        </Badge>
      </button>
      {expanded && entry.suggestions && (
        <div className="px-3 pb-3 space-y-2">
          {entry.suggestions.map((s, i) => (
            <div key={s.id || i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30 text-xs">
              {s.type && (
                <Badge className={cn(
                  'text-[9px] px-1.5 py-0 shrink-0',
                  (TYPE_BADGES[s.type] || TYPE_BADGES['Config Change']).color
                )}>
                  {s.type}
                </Badge>
              )}
              <div className="min-w-0">
                <span className="font-medium text-foreground">{s.title}</span>
                {s.description && (
                  <p className="text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Loading Skeletons ─── */

function QuickChecksSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-16" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center py-8">
        <Skeleton className="h-40 w-40 rounded-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-8 w-28 mt-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Empty States ─── */

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted/50 p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
}

/* ─── Skill Creation Dialog ─── */

function CreateSkillDialog({ open, onOpenChange, suggestion }) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Create New Skill</DialogTitle>
        <DialogDescription>
          Pre-filled from AI suggestion. You can customize before saving.
        </DialogDescription>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <div className="mt-1 p-2 rounded-md bg-muted/50 text-sm">
              {suggestion?.title || 'New Skill'}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <div className="mt-1 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground leading-relaxed">
              {suggestion?.description || ''}
            </div>
          </div>
          {suggestion?.impact && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Expected Impact</label>
              <div className="mt-1">
                <Badge className="bg-emerald-500/10 text-emerald-400">{suggestion.impact}</Badge>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => {
              onOpenChange(false);
              navigate('/skills');
            }}
          >
            Open Skill Editor
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ─── */

export default function SuggestionsPage() {
  const navigate = useNavigate();
  const { subscribe, unsubscribe } = useSocket();

  // Tab 1: Quick Checks
  const [checks, setChecks] = useState([]);
  const [checksLoading, setChecksLoading] = useState(true);

  // Tab 2: Insights
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  // Tab 3: Deep Analysis
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [streamChunks, setStreamChunks] = useState([]);
  const [deepSuggestions, setDeepSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const currentAnalysisId = useRef(null);

  // Dialog state
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);

  // Fetch Tier 1 checks
  const fetchChecks = useCallback(async () => {
    setChecksLoading(true);
    try {
      const data = await apiGet('/suggestions');
      setChecks(data.suggestions || []);
    } catch (e) {
      console.error('Failed to fetch suggestions:', e);
    } finally {
      setChecksLoading(false);
    }
  }, []);

  // Fetch Tier 2 insights
  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const data = await apiGet('/suggestions/insights');
      setInsights(data);
    } catch (e) {
      console.error('Failed to fetch insights:', e);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  // Fetch analysis history
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await apiGet('/suggestions/history');
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchChecks();
    fetchInsights();
    fetchHistory();
  }, [fetchChecks, fetchInsights, fetchHistory]);

  // WebSocket subscriptions for streaming analysis
  useEffect(() => {
    const handleStream = (payload) => {
      const d = payload.data || payload;
      if (d.analysisId === currentAnalysisId.current) {
        setStreamChunks((prev) => [...prev, d.chunk]);
      }
    };

    const handleComplete = (payload) => {
      const d = payload.data || payload;
      if (d.analysisId === currentAnalysisId.current) {
        setAnalysisRunning(false);
        setDeepSuggestions(d.suggestions || []);
        fetchHistory();
      }
    };

    subscribe('suggestions:stream', handleStream);
    subscribe('suggestions:complete', handleComplete);

    return () => {
      unsubscribe('suggestions:stream', handleStream);
      unsubscribe('suggestions:complete', handleComplete);
    };
  }, [subscribe, unsubscribe, fetchHistory]);

  // Run deep analysis
  const runAnalysis = useCallback(async () => {
    setAnalysisRunning(true);
    setStreamChunks([]);
    setDeepSuggestions([]);
    try {
      const data = await apiPost('/suggestions/analyze');
      currentAnalysisId.current = data.analysisId;
    } catch (e) {
      console.error('Failed to start analysis:', e);
      setAnalysisRunning(false);
    }
  }, []);

  // Dismiss a suggestion
  const dismissSuggestion = useCallback(async (id) => {
    try {
      await apiPost(`/suggestions/${id}/apply`, { action: 'dismiss' });
      setDeepSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error('Failed to dismiss suggestion:', e);
    }
  }, []);

  // Handle action from Quick Check cards
  const handleCheckAction = useCallback((suggestion) => {
    const routes = {
      workspace: '/files',
      'code-quality': '/files',
      'project-structure': '/files',
      dependencies: '/files',
    };
    navigate(routes[suggestion.category] || '/files');
  }, [navigate]);

  // Handle action from Insight cards
  const handleInsightAction = useCallback((insight) => {
    const route = ACTION_ROUTES[insight.action];
    if (route) {
      navigate(route);
    }
  }, [navigate]);

  // Handle action from Deep Analysis cards
  const handleDeepAction = useCallback((suggestion) => {
    if (suggestion.type === 'Create Skill') {
      setSelectedSuggestion(suggestion);
      setSkillDialogOpen(true);
    } else {
      navigate(getRouteForType(suggestion.type));
    }
  }, [navigate]);

  return (
    <div className="px-3 py-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            Improvement Suggestions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered analysis to optimize your workflow, reduce costs, and improve agent performance.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="quick-checks" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="quick-checks" className="data-[state=active]:bg-background gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Quick Checks
          </TabsTrigger>
          <TabsTrigger value="insights" className="data-[state=active]:bg-background gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Usage Insights
          </TabsTrigger>
          <TabsTrigger value="deep-analysis" className="data-[state=active]:bg-background gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Deep Analysis
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Quick Checks ─── */}
        <TabsContent value="quick-checks">
          {checksLoading ? (
            <QuickChecksSkeleton />
          ) : checks.length === 0 ? (
            <EmptyState
              icon={Lightbulb}
              title="No issues found"
              description="Your workspace looks clean! Quick checks scan for common issues like large files, TODO comments, and missing configuration."
            />
          ) : (
            <div className="space-y-4">
              <SeveritySummary suggestions={checks} />
              <div className="grid gap-3 md:grid-cols-2">
                {checks.map((s) => (
                  <QuickCheckCard
                    key={s.id}
                    suggestion={s}
                    onAction={handleCheckAction}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 2: Usage Insights ─── */}
        <TabsContent value="insights">
          {insightsLoading ? (
            <InsightsSkeleton />
          ) : !insights ? (
            <EmptyState
              icon={BarChart3}
              title="No insights available"
              description="Insights are generated from workspace analysis. Run a scan to see optimization opportunities."
            />
          ) : (
            <div className="space-y-6">
              {/* Health Score */}
              <Card className="border-border/50">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <HealthScoreRing score={insights.healthScore} />
                    <div className="flex-1 text-center md:text-left">
                      <h3 className="text-lg font-semibold mb-1">Workspace Health</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {insights.healthScore >= 80
                          ? 'Your workspace is in great shape. Minor optimizations are available below.'
                          : insights.healthScore >= 60
                          ? 'Some improvements are recommended. Review the insights below to optimize.'
                          : 'Several issues need attention. Addressing them will significantly improve your workflow.'}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                        {Object.entries(insights.byCategory || {}).map(([cat, count]) => (
                          <div key={cat} className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">{cat}:</span>
                            <span className="font-medium text-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Insight Cards */}
              {insights.insights && insights.insights.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {insights.insights.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onAction={handleInsightAction}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No specific insights"
                  description="The workspace scan did not produce targeted insights. This typically means everything is running smoothly."
                />
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 3: Deep Analysis ─── */}
        <TabsContent value="deep-analysis">
          <div className="space-y-6">
            {/* Run Analysis Button */}
            {deepSuggestions.length === 0 && !analysisRunning && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-purple-500/10 p-6 mb-5">
                  <Brain className="h-10 w-10 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">AI-Powered Deep Analysis</h3>
                <p className="text-sm text-muted-foreground max-w-md text-center mb-6">
                  Run a comprehensive analysis of your workspace using OpenClaw.
                  Get actionable suggestions for skills to create, cron schedules to adjust,
                  models to switch, and more.
                </p>
                <Button
                  size="lg"
                  className="bg-purple-600 hover:bg-purple-700 text-white px-8 gap-2"
                  onClick={runAnalysis}
                  disabled={analysisRunning}
                >
                  <Play className="h-4 w-4" />
                  Run Deep Analysis
                </Button>
              </div>
            )}

            {/* Streaming Progress */}
            <StreamingProgress chunks={streamChunks} isRunning={analysisRunning} />

            {/* AI Suggestions */}
            {deepSuggestions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    AI Suggestions ({deepSuggestions.length})
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                    onClick={runAnalysis}
                    disabled={analysisRunning}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', analysisRunning && 'animate-spin')} />
                    Re-analyze
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {deepSuggestions.map((s) => (
                    <DeepSuggestionCard
                      key={s.id}
                      suggestion={s}
                      onAction={handleDeepAction}
                      onDismiss={dismissSuggestion}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Analysis History */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Analysis History
              </h3>
              {historyLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No analysis history yet. Run your first deep analysis above.
                </p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry) => (
                    <HistoryEntry key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Skill Dialog */}
      <CreateSkillDialog
        open={skillDialogOpen}
        onOpenChange={setSkillDialogOpen}
        suggestion={selectedSuggestion}
      />
    </div>
  );
}
