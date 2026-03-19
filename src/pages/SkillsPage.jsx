import { useState, useEffect, useCallback } from 'react';
import {
  Puzzle,
  Plus,
  Trash2,
  Search,
  ToggleLeft,
  ToggleRight,
  Clock,
  Package,
  FolderCode,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ─── Helpers ─── */

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Never used';
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

const SOURCE_CONFIG = {
  bundled: { label: 'Bundled', icon: Package, variant: 'secondary' },
  managed: { label: 'Managed', icon: Wrench, variant: 'default' },
  workspace: { label: 'Workspace', icon: FolderCode, variant: 'outline' },
};

function getSourceConfig(source) {
  return SOURCE_CONFIG[source] || { label: source, icon: Puzzle, variant: 'outline' };
}

/* ─── Skill Card ─── */

function SkillCard({ skill, onToggle, onDelete, onViewDetail }) {
  const [toggling, setToggling] = useState(false);
  const sourceConfig = getSourceConfig(skill.source);
  const SourceIcon = sourceConfig.icon;

  const handleToggle = async (e) => {
    e.stopPropagation();
    setToggling(true);
    try {
      await onToggle(skill.id);
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:border-purple-500/40 relative group',
        !skill.enabled && 'opacity-60'
      )}
      onClick={() => onViewDetail(skill)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base truncate">{skill.name}</CardTitle>
              <Badge variant={sourceConfig.variant} className="text-[10px] px-1.5 py-0 gap-1 shrink-0">
                <SourceIcon className="h-3 w-3" />
                {sourceConfig.label}
              </Badge>
            </div>
            <CardDescription className="line-clamp-2 text-xs">
              {skill.description || 'No description available'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(skill.lastUsed)}
          </div>
          <div className="flex items-center gap-1">
            {skill.source === 'workspace' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(skill);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={cn(
                'transition-colors p-1 rounded-md hover:bg-muted',
                toggling && 'opacity-50 pointer-events-none'
              )}
            >
              {skill.enabled ? (
                <ToggleRight className="h-5 w-5 text-purple-500" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Detail Dialog ─── */

function SkillDetailDialog({ skill, open, onOpenChange }) {
  const [content, setContent] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    if (open && skill) {
      setLoadingContent(true);
      setContent(null);
      apiGet(`/skills/${skill.id}/content`)
        .then((data) => setContent(data.content || data.markdown || ''))
        .catch(() => setContent('Failed to load skill content.'))
        .finally(() => setLoadingContent(false));
    }
  }, [open, skill]);

  if (!skill) return null;

  const sourceConfig = getSourceConfig(skill.source);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogTitle className="flex items-center gap-2">
          {skill.name}
          <Badge variant={sourceConfig.variant} className="text-[10px] px-1.5 py-0">
            {sourceConfig.label}
          </Badge>
        </DialogTitle>
        <DialogDescription>{skill.description}</DialogDescription>
        {skill.path && (
          <code className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground break-all">
            {skill.path}
          </code>
        )}
        <div className="flex-1 overflow-y-auto border rounded-md p-4 bg-muted/30 prose prose-sm dark:prose-invert max-w-none">
          {loadingContent ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <ReactMarkdown>{content || 'No content available.'}</ReactMarkdown>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Create Skill Dialog ─── */

function CreateSkillDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    setError(null);
    try {
      await apiPost('/skills/create', { name: name.trim(), content: markdown });
      setName('');
      setMarkdown('');
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Create Workspace Skill</DialogTitle>
        <DialogDescription>
          Define a new skill for your workspace. Skills are stored as SKILL.md files.
        </DialogDescription>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="skill-name">
              Skill Name
            </label>
            <Input
              id="skill-name"
              placeholder="e.g. deploy-to-staging"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="skill-content">
              SKILL.md Content
            </label>
            <textarea
              id="skill-content"
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              placeholder="# Skill Title&#10;&#10;Description of what this skill does..."
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? 'Creating...' : 'Create Skill'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Delete Confirmation Dialog ─── */

function DeleteSkillDialog({ skill, open, onOpenChange, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      await apiDelete(`/skills/${skill.id}`);
      onOpenChange(false);
      onDeleted();
    } catch {
      // Error handled silently
    } finally {
      setDeleting(false);
    }
  };

  if (!skill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Delete Skill</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete <strong>{skill.name}</strong>? This action cannot be undone.
        </DialogDescription>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Loading Skeleton ─── */

function SkillsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48 mt-2" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-10" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Empty State ─── */

function SkillsEmpty({ source }) {
  return (
    <Card className="flex flex-col items-center justify-center py-16">
      <Puzzle className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-semibold mb-1">
        {source === 'all' ? 'No skills found' : `No ${source} skills`}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm text-center">
        {source === 'workspace'
          ? 'Create a workspace skill to get started with custom automation.'
          : 'Skills will appear here once they are available in your OpenClaw project.'}
      </p>
    </Card>
  );
}

/* ─── Main Page ─── */

export default function SkillsPage() {
  const [skills, setSkills] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [detailSkill, setDetailSkill] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteSkill, setDeleteSkill] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      const data = await apiGet('/skills');
      setSkills(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleToggle = async (skillId) => {
    await apiPost(`/skills/${skillId}/toggle`);
    setSkills((prev) =>
      prev?.map((s) => (s.id === skillId ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleViewDetail = (skill) => {
    setDetailSkill(skill);
    setDetailOpen(true);
  };

  const handleDeleteClick = (skill) => {
    setDeleteSkill(skill);
    setDeleteOpen(true);
  };

  const filteredSkills = (skills || []).filter((skill) => {
    const matchesTab = activeTab === 'all' || skill.source === activeTab;
    const matchesSearch =
      !search ||
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      (skill.description || '').toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="px-3 py-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skills Manager</h1>
          <p className="text-muted-foreground mt-1">Browse, manage, and create skills</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          Create Skill
        </Button>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-2 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="bundled">Bundled</TabsTrigger>
            <TabsTrigger value="managed">Managed</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64 sm:ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <SkillsSkeleton />
      ) : filteredSkills.length === 0 ? (
        <SkillsEmpty source={activeTab} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
              onDelete={handleDeleteClick}
              onViewDetail={handleViewDetail}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <SkillDetailDialog
        skill={detailSkill}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <CreateSkillDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchSkills}
      />
      <DeleteSkillDialog
        skill={deleteSkill}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={fetchSkills}
      />
    </div>
  );
}
