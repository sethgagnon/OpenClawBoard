import { useState, useEffect, useCallback } from 'react';
import {
  Sun,
  Moon,
  Globe,
  Cpu,
  FolderOpen,
  Lock,
  Info,
  Save,
  Loader2,
  Check,
  ExternalLink,
  CreditCard,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet, apiPost } from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';
import { useTimezone } from '@/contexts/TimezoneContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const HEARTBEAT_OPTIONS = [
  { value: '15', label: '15 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
  { value: '300', label: '5 minutes' },
];

// ---------------------------------------------------------------------------
// Section wrapper with save state
// ---------------------------------------------------------------------------
function SectionSaveButton({ saving, saved, dirty, onClick }) {
  return (
    <Button
      size="sm"
      className="gap-1.5"
      disabled={saving || !dirty}
      onClick={onClick}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : saved ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Save className="h-3.5 w-3.5" />
      )}
      {saved ? 'Saved' : 'Save'}
    </Button>
  );
}

function useSectionSave(section, payload) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiPost('/settings', { section, ...payload });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error silently handled
    } finally {
      setSaving(false);
    }
  }, [section, payload]);

  return { saving, saved, dirty, setDirty, save };
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { setHour12: setGlobalHour12 } = useTimezone();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [timezone, setTimezone] = useState('UTC');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [maxConcurrent, setMaxConcurrent] = useState('4');
  const [heartbeat, setHeartbeat] = useState('60');
  const [subscriptionProviders, setSubscriptionProviders] = useState([]);
  const [detectedProviders, setDetectedProviders] = useState([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Section save states
  const [tzSaving, setTzSaving] = useState(false);
  const [tzSaved, setTzSaved] = useState(false);
  const [tzDirty, setTzDirty] = useState(false);

  const [subSaving, setSubSaving] = useState(false);
  const [subSaved, setSubSaved] = useState(false);
  const [subDirty, setSubDirty] = useState(false);

  const [taskSaving, setTaskSaving] = useState(false);
  const [taskSaved, setTaskSaved] = useState(false);
  const [taskDirty, setTaskDirty] = useState(false);

  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');

  // Fetch settings
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet('/settings')
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        if (data.timezone) setTimezone(data.timezone);
        if (data.timeFormat) {
          setTimeFormat(data.timeFormat);
          setGlobalHour12(data.timeFormat === '12h');
        }
        if (Array.isArray(data.subscriptionProviders)) {
          setSubscriptionProviders(data.subscriptionProviders);
        } else if (data.subscriptionMode === 'max') {
          setSubscriptionProviders(['anthropic']);
        }
        if (data.maxConcurrentTasks) setMaxConcurrent(String(data.maxConcurrentTasks));
        if (data.heartbeatInterval) setHeartbeat(String(data.heartbeatInterval));
      })
      .catch(() => {
        if (!cancelled) setSettings({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch detected providers
  useEffect(() => {
    apiGet('/usage/providers').then((data) => {
      if (Array.isArray(data)) setDetectedProviders(data);
    }).catch(() => {});
  }, []);

  // Save handlers
  const handleSaveTimezone = useCallback(async () => {
    setTzSaving(true);
    setTzSaved(false);
    try {
      await apiPost('/settings', { section: 'timezone', timezone, timeFormat });
      setGlobalHour12(timeFormat === '12h');
      setTzSaved(true);
      setTzDirty(false);
      setTimeout(() => setTzSaved(false), 2000);
    } catch {
      // error silently handled
    } finally {
      setTzSaving(false);
    }
  }, [timezone, timeFormat, setGlobalHour12]);

  const handleSaveSubscription = useCallback(async () => {
    setSubSaving(true);
    setSubSaved(false);
    try {
      await apiPost('/settings', { subscriptionProviders });
      setSubSaved(true);
      setSubDirty(false);
      setTimeout(() => setSubSaved(false), 2000);
    } catch {
      // error silently handled
    } finally {
      setSubSaving(false);
    }
  }, [subscriptionProviders]);

  const handleSaveTaskSettings = useCallback(async () => {
    setTaskSaving(true);
    setTaskSaved(false);
    try {
      await apiPost('/settings', {
        section: 'tasks',
        maxConcurrentTasks: parseInt(maxConcurrent, 10),
        heartbeatInterval: parseInt(heartbeat, 10),
      });
      setTaskSaved(true);
      setTaskDirty(false);
      setTimeout(() => setTaskSaved(false), 2000);
    } catch {
      // error silently handled
    } finally {
      setTaskSaving(false);
    }
  }, [maxConcurrent, heartbeat]);

  const handleChangePassword = useCallback(async () => {
    setPwError('');
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }
    setPwSaving(true);
    setPwSaved(false);
    try {
      await apiPost('/settings', {
        section: 'auth',
        currentPassword,
        newPassword,
      });
      setPwSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSaved(false), 2000);
    } catch (err) {
      setPwError(err.message || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  if (loading) {
    return (
      <div className="px-3 py-4 sm:p-6">
        <div className="mb-6">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <div className="max-w-2xl space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your OpenClawBoard environment
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* ----------------------------------------------------------------- */}
        {/* 1. Appearance */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </div>
              <div>
                <CardTitle className="text-base">Appearance</CardTitle>
                <CardDescription>Customize how the dashboard looks</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">
                  Currently using {theme} mode
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleTheme}>
                {theme === 'dark' ? (
                  <>
                    <Sun className="h-3.5 w-3.5" />
                    Switch to Light
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5" />
                    Switch to Dark
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* 2. Timezone */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Globe className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Time & Timezone</CardTitle>
                <CardDescription>Set your preferred timezone and time format</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Timezone
                  </label>
                  <Select
                    value={timezone}
                    onValueChange={(val) => {
                      setTimezone(val);
                      setTzDirty(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Time Format
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={timeFormat === '12h' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setTimeFormat('12h'); setTzDirty(true); }}
                  >
                    12-hour
                    <span className="ml-1.5 text-xs opacity-70">3:00 PM</span>
                  </Button>
                  <Button
                    variant={timeFormat === '24h' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setTimeFormat('24h'); setTzDirty(true); }}
                  >
                    24-hour
                    <span className="ml-1.5 text-xs opacity-70">15:00</span>
                  </Button>
                </div>
              </div>

              <div className="flex justify-end">
                <SectionSaveButton
                  saving={tzSaving}
                  saved={tzSaved}
                  dirty={tzDirty}
                  onClick={handleSaveTimezone}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* 3. Billing Mode (per-provider) */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CreditCard className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Billing Mode</CardTitle>
                <CardDescription>Set billing type per provider — subscription providers show token usage instead of cost</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {detectedProviders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No providers detected yet. Usage data will appear after running agents.</p>
              ) : (
                <div className="space-y-2">
                  {detectedProviders.map((provider) => {
                    const isSub = subscriptionProviders.includes(provider);
                    return (
                      <div key={provider} className="flex items-center justify-between rounded-md border px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground capitalize">{provider.replace(/-/g, ' ')}</p>
                          <p className="text-xs text-muted-foreground">
                            {isSub ? 'Flat-rate subscription — shows tokens' : 'Pay-per-use — shows estimated cost'}
                          </p>
                        </div>
                        <Button
                          variant={isSub ? 'default' : 'outline'}
                          size="sm"
                          className="shrink-0 text-xs"
                          onClick={() => {
                            setSubscriptionProviders((prev) =>
                              isSub ? prev.filter((p) => p !== provider) : [...prev, provider]
                            );
                            setSubDirty(true);
                          }}
                        >
                          {isSub ? 'Subscription' : 'Pay-per-use'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end">
                <SectionSaveButton
                  saving={subSaving}
                  saved={subSaved}
                  dirty={subDirty}
                  onClick={handleSaveSubscription}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* 4. Task Settings */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Task Settings</CardTitle>
                <CardDescription>Configure task execution behavior</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Max Concurrent Tasks
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={maxConcurrent}
                    onChange={(e) => {
                      setMaxConcurrent(e.target.value);
                      setTaskDirty(true);
                    }}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
                  />
                  <Badge variant="secondary" className="min-w-[2rem] justify-center">
                    {maxConcurrent}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Maximum number of tasks that can run simultaneously
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Heartbeat Interval
                </label>
                <Select
                  value={heartbeat}
                  onValueChange={(val) => {
                    setHeartbeat(val);
                    setTaskDirty(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select interval" />
                  </SelectTrigger>
                  <SelectContent>
                    {HEARTBEAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  How often agents report their status
                </p>
              </div>

              <div className="flex justify-end">
                <SectionSaveButton
                  saving={taskSaving}
                  saved={taskSaved}
                  dirty={taskDirty}
                  onClick={handleSaveTaskSettings}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* 4. OpenClaw Info */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FolderOpen className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">OpenClaw Info</CardTitle>
                <CardDescription>Environment paths and configuration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-sm text-muted-foreground">OPENCLAW_DIR</span>
                <code className="max-w-xs truncate text-sm font-mono text-foreground">
                  {settings?.openclawDir || settings?.OPENCLAW_DIR || '~/.openclaw'}
                </code>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-sm text-muted-foreground">Workspace</span>
                <code className="max-w-xs truncate text-sm font-mono text-foreground">
                  {settings?.workspace || settings?.WORKSPACE || '~/workspace'}
                </code>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-sm text-muted-foreground">Model</span>
                <code className="text-sm font-mono text-foreground">
                  {settings?.model || settings?.currentModel || 'default'}
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* 5. Authentication */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Authentication</CardTitle>
                <CardDescription>Update your dashboard password</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Current Password
                </label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  New Password
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
              {pwError && (
                <p className="text-sm text-destructive">{pwError}</p>
              )}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
                  onClick={handleChangePassword}
                >
                  {pwSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : pwSaved ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  {pwSaved ? 'Updated' : 'Change Password'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* 6. About */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Info className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">About</CardTitle>
                <CardDescription>OpenClawBoard information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Version</span>
                <Badge variant="secondary">
                  {settings?.version || '0.1.0'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Documentation</span>
                <a
                  href="https://github.com/openclawboard/openclawboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  GitHub
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">License</span>
                <span className="text-sm text-foreground">MIT</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
