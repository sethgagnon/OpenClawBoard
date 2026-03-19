import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Check, Save, AlertTriangle,
  CheckCircle2, Info, Calendar, Monitor, Smartphone, FileText,
  Loader2, Terminal, Play, Pause,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleCopy}>
      {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
    </Button>
  );
}

function CodeBlock({ content }) {
  return (
    <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
      <div className="absolute right-2 top-2">
        <CopyButton text={content} />
      </div>
      <pre className="p-4 pr-24 overflow-x-auto text-sm font-mono text-foreground whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  );
}

function InfoCallout({ children, icon: Icon = Info }) {
  return (
    <div className="flex gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
      <Icon className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
      <div className="text-sm text-foreground space-y-1">{children}</div>
    </div>
  );
}

function GapCard({ gap }) {
  const severityColor = { low: 'secondary', medium: 'warning', high: 'destructive' };
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={severityColor[gap.severity] || 'secondary'} className="text-[10px]">{gap.severity}</Badge>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {gap.category.replace(/-/g, ' ')}
        </span>
      </div>
      <p className="text-sm text-foreground">{gap.description}</p>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Workaround:</span> {gap.workaround}
      </p>
    </div>
  );
}

const PLATFORM_ICONS = { openclaw: Terminal, 'claude-desktop': Monitor };
const STATUS_META = {
  active: { variant: 'success', icon: Play, label: 'Active' },
  inactive: { variant: 'secondary', icon: Pause, label: 'Inactive' },
  'not-migrated': { variant: 'outline', label: 'Not set up' },
  migrated: { variant: 'default', label: 'Set up' },
  partial: { variant: 'warning', label: 'Partial' },
};

export default function AutomationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [automation, setAutomation] = useState(null);
  const [platforms, setPlatforms] = useState({});
  const [exportData, setExportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [checkedSteps, setCheckedSteps] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [auto, plats] = await Promise.all([
          apiGet(`/registry/${id}`),
          apiGet('/platforms'),
        ]);
        if (!cancelled) {
          setAutomation(auto);
          setPlatforms(plats || {});
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleGenerateExport = async (platformId) => {
    setGenerating(true);
    setError(null);
    try {
      const exp = await apiPost(`/export/${platformId}/${id}`);
      setExportData(exp);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (type) => {
    setSaving(true);
    setSaveResult(null);
    try {
      const basePath = type === 'scheduled-task'
        ? `${process.env.HOME || '~'}/.claude/scheduled-tasks`
        : `${process.env.HOME || '~'}/.claude/skills`;
      const res = await apiPost(`/export/claude-desktop/${id}/save`, { outputPath: basePath, type });
      setSaveResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStep = (idx) => {
    setCheckedSteps(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="px-3 py-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="px-3 py-4 sm:p-6 max-w-4xl mx-auto">
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-8 text-center text-destructive">
            <AlertTriangle className="h-8 w-8 mx-auto mb-3" />
            <p>{error || 'Automation not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const schedule = automation.schedule;
  const platformEntries = Object.entries(automation.platforms || {});
  const exportablePlatforms = Object.values(platforms).filter(p => p.exportAvailable);

  const gaps = exportData?.gaps;
  const readiness = gaps?.overallMigrationReadiness;
  const rb = {
    ready: { variant: 'success', label: 'Compatible' },
    partial: { variant: 'warning', label: 'Some Gaps' },
    blocked: { variant: 'destructive', label: 'Critical Gaps' },
  }[readiness] || {};

  const skillName = automation.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div className="px-3 py-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/automations')}>
        <ArrowLeft className="h-4 w-4" /> Back to Automations
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{automation.name}</h1>
        {automation.description && (
          <p className="text-sm text-muted-foreground mt-1">{automation.description}</p>
        )}
        {schedule && (
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {schedule.humanReadable || schedule.cron}
            {schedule.timezone && ` (${schedule.timezone})`}
          </p>
        )}
      </div>

      {/* Current Platform Status */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Where this runs
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {platformEntries.map(([pid, pdata]) => {
            const meta = platforms[pid];
            const Icon = PLATFORM_ICONS[pid] || Terminal;
            const sm = STATUS_META[pdata.status] || STATUS_META['not-migrated'];
            const StatusIcon = sm.icon;
            return (
              <Card key={pid} className={cn(
                'border',
                pdata.status === 'active' ? 'border-emerald-500/30 bg-emerald-500/5' :
                pdata.status === 'not-migrated' ? 'border-dashed' : ''
              )}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{meta?.name || pid}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant={sm.variant} className="text-[10px]">
                        {StatusIcon && <StatusIcon className="h-2.5 w-2.5 mr-0.5" />}
                        {sm.label}
                      </Badge>
                      {pdata.lastRun && (
                        <span className="text-[10px] text-muted-foreground">
                          Last run: {new Date(pdata.lastRun).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {saveResult && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-3 flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Saved to {saveResult.path}
          </CardContent>
        </Card>
      )}

      {/* Platform Options */}
      {exportablePlatforms.map(p => (
        <div key={p.id}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Run on {p.name}
            </h2>
            {!exportData && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => handleGenerateExport(p.id)}
                disabled={generating}
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <>Generate Options</>
                )}
              </Button>
            )}
            {exportData && readiness && (
              <Badge variant={rb.variant} className="text-xs">{rb.label}</Badge>
            )}
          </div>

          {p.localRequirements && !exportData && (
            <InfoCallout>
              <p className="font-medium">Requirements for {p.name}</p>
              <ul className="list-disc list-inside text-muted-foreground">
                {p.localRequirements.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </InfoCallout>
          )}

          {exportData && (
            <Tabs defaultValue="scheduled-task">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="scheduled-task" className="gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Scheduled Task
                </TabsTrigger>
                <TabsTrigger value="dispatch" className="gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" /> Dispatch
                </TabsTrigger>
                <TabsTrigger value="skill" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Skill File
                </TabsTrigger>
                <TabsTrigger value="gaps" className="gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Compatibility
                  {gaps?.gaps?.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{gaps.gaps.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Scheduled Task */}
              <TabsContent value="scheduled-task" className="space-y-4 mt-4">
                <InfoCallout icon={Monitor}>
                  <p className="font-medium">Run as a Claude Desktop Scheduled Task</p>
                  <p className="text-muted-foreground">
                    This sets up the automation to run automatically in Claude Desktop on a schedule.
                    Your existing OpenClaw setup is not affected.
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground mt-2">
                    <li>Open Claude Desktop → <strong>Schedule</strong> sidebar → <strong>+ New task</strong></li>
                    <li>Set name, frequency ({schedule?.humanReadable || 'your preferred schedule'}), and working folder</li>
                    <li>Paste the prompt below</li>
                    <li>Click <strong>Run now</strong> to test</li>
                    <li>Approve any permission prompts</li>
                  </ol>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Claude Desktop must be open and your computer must be awake for scheduled tasks to run.
                  </p>
                </InfoCallout>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">Task Prompt</h3>
                    <div className="flex gap-2">
                      <CopyButton text={exportData.scheduledTask} />
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleSave('scheduled-task')} disabled={saving}>
                        <Save className="h-3.5 w-3.5" /> Save to disk
                      </Button>
                    </div>
                  </div>
                  <CodeBlock content={exportData.scheduledTask} />
                </div>
              </TabsContent>

              {/* Dispatch */}
              <TabsContent value="dispatch" className="space-y-4 mt-4">
                <InfoCallout icon={Smartphone}>
                  <p className="font-medium">Run on-demand from your phone via Dispatch</p>
                  <p className="text-muted-foreground">
                    Copy this one-liner and paste it into your Dispatch thread in the Claude mobile app.
                    Claude will execute it on your computer and report back. Your OpenClaw setup is not affected.
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Requires Claude Desktop open on your computer + Claude mobile app on your phone.
                  </p>
                </InfoCallout>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">Dispatch One-Liner</h3>
                    <CopyButton text={exportData.dispatch} />
                  </div>
                  <CodeBlock content={exportData.dispatch} />
                </div>
              </TabsContent>

              {/* Skill File */}
              <TabsContent value="skill" className="space-y-4 mt-4">
                <InfoCallout icon={FileText}>
                  <p className="font-medium">Install as a Claude Code Skill</p>
                  <p className="text-muted-foreground">
                    Save this to <code className="bg-muted px-1 py-0.5 rounded text-xs">~/.claude/skills/{skillName}/SKILL.md</code> and
                    Claude Code will auto-discover it. Invoke with <code className="bg-muted px-1 py-0.5 rounded text-xs">/{skillName}</code> or
                    let Claude trigger it automatically when relevant.
                  </p>
                </InfoCallout>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">Generated SKILL.md</h3>
                    <div className="flex gap-2">
                      <CopyButton text={exportData.skill} />
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleSave('skill')} disabled={saving}>
                        <Save className="h-3.5 w-3.5" /> Save to disk
                      </Button>
                    </div>
                  </div>
                  <CodeBlock content={exportData.skill} />
                </div>
              </TabsContent>

              {/* Compatibility */}
              <TabsContent value="gaps" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="py-4 flex items-center gap-3">
                    {readiness === 'ready' ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    ) : (
                      <AlertTriangle className={cn('h-6 w-6', readiness === 'partial' ? 'text-amber-500' : 'text-red-500')} />
                    )}
                    <div>
                      <p className="text-sm font-semibold">{rb.label || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {gaps?.gaps?.length || 0} compatibility {gaps?.gaps?.length === 1 ? 'note' : 'notes'} found
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {gaps?.gaps?.length > 0 && (
                  <div className="space-y-3">
                    {gaps.gaps.map((gap, i) => <GapCard key={i} gap={gap} />)}
                  </div>
                )}

                {gaps?.connectorMapping?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Connector Mapping</h3>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">OpenClaw</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Claude Desktop</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gaps.connectorMapping.map((c, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-4 py-2">{c.openclawTool}</td>
                              <td className="px-4 py-2">{c.coworkConnector}</td>
                              <td className="px-4 py-2">
                                <Badge variant="success" className="text-[10px]">{c.status}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {gaps?.manualSteps?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Setup Checklist</h3>
                    <div className="space-y-2">
                      {gaps.manualSteps.map((step, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 rounded-md border px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => toggleStep(i)}
                        >
                          <div className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                            checkedSteps.has(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                          )}>
                            {checkedSteps.has(i) && <Check className="h-3 w-3" />}
                          </div>
                          <span className={cn(
                            'text-sm',
                            checkedSteps.has(i) ? 'text-muted-foreground line-through' : 'text-foreground'
                          )}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      ))}
    </div>
  );
}
