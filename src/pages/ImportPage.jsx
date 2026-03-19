import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Upload, Search, Check, CheckCircle2, AlertCircle,
  ChevronRight, Loader2, Calendar, ArrowLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

function StepIndicator({ current }) {
  const steps = ['Scan', 'Review', 'Confirm'];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
            i < current ? 'bg-primary text-primary-foreground' :
            i === current ? 'bg-primary text-primary-foreground' :
            'bg-muted text-muted-foreground'
          )}>
            {i < current ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <span className={cn(
            'text-sm font-medium hidden sm:inline',
            i <= current ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
          )}
        </div>
      ))}
    </div>
  );
}

function ProposedItem({ item, selected, onToggle, onEdit }) {
  const schedule = item.schedule;
  const ocStatus = item.platforms?.openclaw?.status;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 transition-colors cursor-pointer',
        selected ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-border/80',
        item._alreadyImported && 'opacity-50'
      )}
      onClick={() => !item._alreadyImported && onToggle()}
    >
      <div className={cn(
        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
      )}>
        {selected && <Check className="h-3 w-3" />}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
          <Badge variant="secondary" className="text-[10px] shrink-0">{item._source}</Badge>
          {ocStatus && (
            <Badge variant={ocStatus === 'active' ? 'success' : 'secondary'} className="text-[10px]">
              {ocStatus}
            </Badge>
          )}
          {item._alreadyImported && (
            <Badge variant="outline" className="text-[10px]">Already imported</Badge>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
        )}
        {schedule && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {schedule.humanReadable || schedule.cron}
            {schedule.timezone && ` (${schedule.timezone})`}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ImportPage() {
  const { platform } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [proposed, setProposed] = useState([]);
  const [alreadyCount, setAlreadyCount] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Check status on mount
  useEffect(() => {
    apiGet(`/import/${platform}/status`)
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [platform]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const data = await apiPost(`/import/${platform}/scan`);
      setProposed(data.proposed || []);
      setAlreadyCount(data.alreadyImported || 0);
      // Select all by default
      setSelected(new Set(data.proposed?.map((_, i) => i) || []));
      setStep(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const handleConfirm = async () => {
    setImporting(true);
    setError(null);
    try {
      const items = proposed.filter((_, i) => selected.has(i));
      const data = await apiPost(`/import/${platform}/confirm`, { selected: items });
      setResult(data);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const toggleItem = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === proposed.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(proposed.map((_, i) => i)));
    }
  };

  const platformName = platform === 'openclaw' ? 'OpenClaw' : platform;

  return (
    <div className="px-3 py-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 -ml-2"
        onClick={() => navigate('/automations')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Automations
      </Button>

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Import from {platformName}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scan your {platformName} configuration and import automations into the registry
        </p>
      </div>

      <StepIndicator current={step} />

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Step 0: Scan */}
      {step === 0 && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center text-center">
            {status ? (
              <>
                <div className={cn(
                  'h-16 w-16 rounded-2xl flex items-center justify-center mb-4',
                  status.available ? 'bg-emerald-500/10' : 'bg-red-500/10'
                )}>
                  {status.available ? (
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-8 w-8 text-red-500" />
                  )}
                </div>
                {status.available ? (
                  <>
                    <h3 className="text-lg font-semibold mb-1">{platformName} detected</h3>
                    <p className="text-sm text-muted-foreground mb-1">
                      Found {status.cronCount} cron jobs and {status.skillCount} skills
                    </p>
                    <p className="text-xs text-muted-foreground mb-6">{status.openclawDir}</p>
                    <Button onClick={handleScan} disabled={scanning} className="gap-1.5">
                      {scanning ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Scanning...</>
                      ) : (
                        <><Search className="h-4 w-4" /> Scan Now</>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold mb-1">{platformName} not found</h3>
                    <p className="text-sm text-muted-foreground">
                      Could not access the {platformName} directory. Make sure it&apos;s installed.
                    </p>
                  </>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-16 w-16 rounded-2xl mx-auto" />
                <Skeleton className="h-5 w-48 mx-auto" />
                <Skeleton className="h-4 w-64 mx-auto" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Review */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {proposed.length} automations found
              {alreadyCount > 0 && ` (${alreadyCount} already imported)`}
            </p>
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selected.size === proposed.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          <div className="space-y-2">
            {proposed.map((item, idx) => (
              <ProposedItem
                key={idx}
                item={item}
                selected={selected.has(idx)}
                onToggle={() => toggleItem(idx)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-4">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selected.size === 0 || importing}
              className="gap-1.5"
            >
              {importing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</>
              ) : (
                <><Upload className="h-4 w-4" /> Import {selected.size} Automation{selected.size !== 1 ? 's' : ''}</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && result && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Import Complete</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Successfully imported {result.imported} automation{result.imported !== 1 ? 's' : ''} into the registry
            </p>
            <div className="flex gap-3">
              <Button onClick={() => navigate('/automations')} className="gap-1.5">
                <ChevronRight className="h-4 w-4" />
                View Automations
              </Button>
              <Button variant="outline" onClick={() => { setStep(0); setProposed([]); setResult(null); }}>
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
