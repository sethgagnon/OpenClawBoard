import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Save,
  FileText,
  Eye,
  Pencil,
  ArrowUpDown,
  Clock,
  HardDrive,
  Loader2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet, apiPut } from '@/lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Loading skeleton for file list
// ---------------------------------------------------------------------------
function FileListSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-transparent p-2">
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Page
// ---------------------------------------------------------------------------
export default function MemoryPage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'modified'
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Fetch file list
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet('/memory')
      .then((data) => {
        if (!cancelled) setFiles(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Filtered and sorted files
  const filteredFiles = useMemo(() => {
    let list = files;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      if (sortBy === 'modified') {
        return new Date(b.modified) - new Date(a.modified);
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [files, search, sortBy]);

  // Load file content
  const loadFile = useCallback(async (file) => {
    setSelectedFile(file);
    setPreviewMode(false);
    setDirty(false);
    setIsNew(false);
    setLoadingContent(true);
    try {
      const data = await apiGet(`/memory/file?path=${encodeURIComponent(file.path)}`);
      setContent(typeof data === 'string' ? data : data.content || '');
    } catch {
      setContent('');
    } finally {
      setLoadingContent(false);
    }
  }, []);

  // Save file content
  const handleSave = useCallback(async () => {
    const path = isNew ? newFileName : selectedFile?.path;
    if (!path) return;
    setSaving(true);
    try {
      await apiPut('/memory/file', { path, content });
      setDirty(false);
      if (isNew) {
        const newFile = { name: path.split('/').pop() || path, path, size: new Blob([content]).size, modified: new Date().toISOString() };
        setFiles((prev) => [...prev, newFile]);
        setSelectedFile(newFile);
        setIsNew(false);
        setNewFileName('');
      }
    } catch {
      // error silently handled
    } finally {
      setSaving(false);
    }
  }, [content, isNew, newFileName, selectedFile]);

  // New memory file
  const handleNew = useCallback(() => {
    setSelectedFile(null);
    setIsNew(true);
    setNewFileName('');
    setContent('');
    setPreviewMode(false);
    setDirty(false);
  }, []);

  const toggleSort = useCallback(() => {
    setSortBy((prev) => (prev === 'name' ? 'modified' : 'name'));
  }, []);

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Memory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse and edit agent memory files
          </p>
        </div>
        <Button onClick={handleNew} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Memory
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left panel: File list */}
        <Card className="flex w-80 shrink-0 flex-col overflow-hidden">
          {/* Search + sort bar */}
          <div className="flex items-center gap-2 border-b p-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={toggleSort}
              title={`Sort by ${sortBy === 'name' ? 'date modified' : 'name'}`}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <FileListSkeleton />
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {search ? 'No matching files' : 'No memory files yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-0.5 p-2">
                {filteredFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => loadFile(file)}
                    className={`flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors ${
                      selectedFile?.path === file.path
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <span className="truncate text-sm font-medium">{file.name}</span>
                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {formatBytes(file.size)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {relativeTime(file.modified)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort indicator */}
          <div className="border-t px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
              Sorted by {sortBy === 'name' ? 'name' : 'date modified'}
              {' '}&middot;{' '}
              {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}
            </span>
          </div>
        </Card>

        {/* Right panel: Editor / Preview */}
        <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {isNew || selectedFile ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                {isNew ? (
                  <Input
                    placeholder="filename.md"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="h-8 max-w-xs text-sm"
                    autoFocus
                  />
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium text-foreground">
                      {selectedFile.name}
                    </span>
                    {dirty && (
                      <Badge variant="warning" className="text-[10px]">
                        unsaved
                      </Badge>
                    )}
                  </div>
                )}

                <div className="ml-auto flex items-center gap-1.5">
                  {!isNew && (
                    <Button
                      variant={previewMode ? 'secondary' : 'ghost'}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setPreviewMode((p) => !p)}
                    >
                      {previewMode ? (
                        <>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5" />
                          Preview
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={saving || (!dirty && !isNew) || (isNew && !newFileName.trim())}
                    onClick={handleSave}
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-hidden">
                {loadingContent ? (
                  <div className="space-y-3 p-6">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/6" />
                  </div>
                ) : previewMode ? (
                  <div className="h-full overflow-y-auto p-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{content}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      setDirty(true);
                    }}
                    className="h-full w-full resize-none bg-transparent p-6 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    placeholder="Start writing..."
                    spellCheck={false}
                  />
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <FileText className="mb-3 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">
                Select a file to view or edit
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Or create a new memory file to get started
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
