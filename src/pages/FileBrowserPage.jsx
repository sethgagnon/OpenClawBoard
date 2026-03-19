import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileImage,
  File,
  Download,
  Pencil,
  Eye,
  Save,
  Loader2,
  Home,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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

const EXT_LANG_MAP = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'docker',
  makefile: 'makefile',
};

const CODE_EXTENSIONS = new Set(Object.keys(EXT_LANG_MAP));
const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']);
const TEXT_EXTENSIONS = new Set(['txt', 'log', 'env', 'gitignore', 'editorconfig', 'prettierrc', 'eslintrc', 'cfg', 'conf']);
const BINARY_EXTENSIONS = new Set(['zip', 'tar', 'gz', 'bz2', 'rar', '7z', 'exe', 'dll', 'so', 'dylib', 'bin', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'mp3', 'mp4', 'avi', 'mov', 'woff', 'woff2', 'ttf', 'eot', 'otf']);

function getExt(name) {
  if (!name) return '';
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getFileType(name) {
  const ext = getExt(name);
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (BINARY_EXTENSIONS.has(ext)) return 'binary';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  // Default: treat as text if no extension or unknown
  return ext ? 'text' : 'text';
}

function FileIcon({ name, isDir, isOpen }) {
  if (isDir) {
    return isOpen ? (
      <FolderOpen className="h-4 w-4 shrink-0 text-purple-400" />
    ) : (
      <Folder className="h-4 w-4 shrink-0 text-purple-400" />
    );
  }
  const ext = getExt(name);
  if (MARKDOWN_EXTENSIONS.has(ext)) return <FileText className="h-4 w-4 shrink-0 text-blue-400" />;
  if (CODE_EXTENSIONS.has(ext)) return <FileCode className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (IMAGE_EXTENSIONS.has(ext)) return <FileImage className="h-4 w-4 shrink-0 text-amber-400" />;
  return <File className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

// ---------------------------------------------------------------------------
// Tree Node component
// ---------------------------------------------------------------------------
function TreeNode({ node, depth = 0, selectedPath, onSelect }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = node.type === 'directory' || !!node.children;
  const isSelected = node.path === selectedPath;

  const handleClick = () => {
    if (isDir) {
      setExpanded((prev) => !prev);
    } else {
      onSelect(node);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'text-foreground hover:bg-accent'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <FileIcon name={node.name} isDir={isDir} isOpen={expanded} />
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && expanded && node.children && (
        <div>
          {node.children
            .slice()
            .sort((a, b) => {
              // Directories first, then alphabetical
              const aDir = a.type === 'directory' || !!a.children;
              const bDir = b.type === 'directory' || !!b.children;
              if (aDir !== bDir) return aDir ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree skeleton
// ---------------------------------------------------------------------------
function TreeSkeleton() {
  return (
    <div className="space-y-1.5 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 16 + 8}px` }}>
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-3.5" style={{ width: `${60 + Math.random() * 80}px` }} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------
function Breadcrumb({ path, onNavigate }) {
  if (!path) return null;
  const parts = path.split('/').filter(Boolean);

  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
      </button>
      {parts.map((part, i) => {
        const fullPath = parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        return (
          <span key={fullPath} className="flex items-center gap-1">
            <span className="text-muted-foreground/50">/</span>
            {isLast ? (
              <span className="font-medium text-foreground">{part}</span>
            ) : (
              <button
                onClick={() => onNavigate(fullPath)}
                className="rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Viewer
// ---------------------------------------------------------------------------
function ContentViewer({ file, content, editMode, onContentChange }) {
  const fileType = getFileType(file.name);
  const ext = getExt(file.name);

  if (editMode) {
    return (
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        className="h-full w-full resize-none bg-transparent p-6 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        spellCheck={false}
      />
    );
  }

  if (fileType === 'markdown') {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  if (fileType === 'code') {
    const lang = EXT_LANG_MAP[ext] || 'text';
    return (
      <div className="h-full overflow-auto">
        <SyntaxHighlighter
          language={lang}
          style={oneDark}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            minHeight: '100%',
            fontSize: '13px',
          }}
          showLineNumbers
        >
          {content}
        </SyntaxHighlighter>
      </div>
    );
  }

  if (fileType === 'binary') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <File className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Binary file preview not available</p>
        <a
          href={`/api/files/download?path=${encodeURIComponent(file.path)}`}
          download
        >
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </a>
      </div>
    );
  }

  // Plain text
  return (
    <div className="h-full overflow-auto p-6">
      <pre className="whitespace-pre-wrap font-mono text-sm text-foreground">{content}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File Browser Page
// ---------------------------------------------------------------------------
export default function FileBrowserPage() {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch file tree
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet('/files')
      .then((data) => {
        if (!cancelled) setTree(data);
      })
      .catch(() => {
        if (!cancelled) setTree(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Load file content
  const handleSelectFile = useCallback(async (file) => {
    setSelectedFile(file);
    setEditMode(false);
    setDirty(false);
    setLoadingContent(true);

    const fileType = getFileType(file.name);
    if (fileType === 'binary') {
      setContent('');
      setLoadingContent(false);
      return;
    }

    try {
      const data = await apiGet(`/files/content?path=${encodeURIComponent(file.path)}`);
      setContent(typeof data === 'string' ? data : data.content || '');
    } catch {
      setContent('');
    } finally {
      setLoadingContent(false);
    }
  }, []);

  // Save file
  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await apiPut('/files/content', { path: selectedFile.path, content });
      setDirty(false);
    } catch {
      // error silently handled
    } finally {
      setSaving(false);
    }
  }, [selectedFile, content]);

  // Breadcrumb navigation (no-op for tree but clears selection)
  const handleBreadcrumbNavigate = useCallback(() => {
    setSelectedFile(null);
    setContent('');
    setEditMode(false);
    setDirty(false);
  }, []);

  const fileType = selectedFile ? getFileType(selectedFile.name) : null;
  const isTextFile = fileType && fileType !== 'binary' && fileType !== 'image';

  // Normalize tree to array for rendering
  const treeNodes = useMemo(() => {
    if (!tree) return [];
    return Array.isArray(tree) ? tree : tree.children ? tree.children : [tree];
  }, [tree]);

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">File Browser</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and view workspace files
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left panel: File tree */}
        <Card className="flex w-72 shrink-0 flex-col overflow-hidden">
          <div className="border-b px-3 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Explorer
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <TreeSkeleton />
            ) : treeNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Folder className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No files found</p>
              </div>
            ) : (
              treeNodes.map((node) => (
                <TreeNode
                  key={node.path || node.name}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile?.path}
                  onSelect={handleSelectFile}
                />
              ))
            )}
          </div>
        </Card>

        {/* Right panel: Content */}
        <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedFile ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Breadcrumb path={selectedFile.path} onNavigate={handleBreadcrumbNavigate} />
                  <div className="flex items-center gap-2">
                    {selectedFile.size != null && (
                      <Badge variant="secondary" className="text-[10px]">
                        {formatBytes(selectedFile.size)}
                      </Badge>
                    )}
                    {selectedFile.modified && (
                      <span className="text-[11px] text-muted-foreground">
                        Modified {relativeTime(selectedFile.modified)}
                      </span>
                    )}
                    {dirty && (
                      <Badge variant="warning" className="text-[10px]">
                        unsaved
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {isTextFile && (
                    <Button
                      variant={editMode ? 'secondary' : 'ghost'}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setEditMode((p) => !p)}
                    >
                      {editMode ? (
                        <>
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </>
                      ) : (
                        <>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </>
                      )}
                    </Button>
                  )}
                  {editMode && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={saving || !dirty}
                      onClick={handleSave}
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                  )}
                  <a
                    href={`/api/files/download?path=${encodeURIComponent(selectedFile.path)}`}
                    download
                  >
                    <Button variant="ghost" size="sm" className="gap-1.5">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {loadingContent ? (
                  <div className="space-y-3 p-6">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/6" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/6" />
                  </div>
                ) : (
                  <ContentViewer
                    file={selectedFile}
                    content={content}
                    editMode={editMode}
                    onContentChange={(val) => {
                      setContent(val);
                      setDirty(true);
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <FileText className="mb-3 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">
                Select a file to view its contents
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Browse the file tree on the left to get started
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
