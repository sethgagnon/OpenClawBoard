import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, FileText, Brain, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';

const CATEGORY_META = {
  memory: {
    label: 'Memory',
    icon: Brain,
    route: '/memory',
    color: 'text-purple-400',
  },
  workspace: {
    label: 'Workspace',
    icon: FileText,
    route: '/files',
    color: 'text-blue-400',
  },
  skills: {
    label: 'Skills',
    icon: Sparkles,
    route: '/skills',
    color: 'text-amber-400',
  },
};

export default function SearchDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef(null);
  const resultsListRef = useRef(null);

  // Flatten results for keyboard navigation
  const flatResults = [];
  for (const category of Object.keys(CATEGORY_META)) {
    if (results[category]?.length) {
      for (const item of results[category]) {
        flatResults.push({ ...item, category });
      }
    }
  }

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({});
      setSelectedIndex(0);
      setLoading(false);
      // Focus input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults({});
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      apiGet(`/search?q=${encodeURIComponent(query.trim())}&scope=memory,workspace,skills`)
        .then((data) => {
          setResults(data.results ?? data ?? {});
          setSelectedIndex(0);
        })
        .catch(() => {
          setResults({});
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigateToResult = useCallback(
    (item) => {
      const meta = CATEGORY_META[item.category];
      if (!meta) return;
      onOpenChange(false);
      // Build target route
      let target = meta.route;
      if (item.path) {
        target = `${meta.route}?file=${encodeURIComponent(item.path)}`;
      }
      if (item.id) {
        target = `${meta.route}/${item.id}`;
      }
      navigate(target);
    },
    [navigate, onOpenChange]
  );

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && flatResults.length > 0) {
      e.preventDefault();
      navigateToResult(flatResults[selectedIndex]);
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsListRef.current;
    if (!container) return;
    const selected = container.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  function highlightMatch(text, term) {
    if (!term || !text) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="rounded bg-primary/30 px-0.5 text-primary-foreground">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  let flatIndex = 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[15%] z-50 w-full max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2"
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Global Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search across memory, workspace, and skills
          </DialogPrimitive.Description>

          {/* Search Input */}
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory, files, skills..."
              className="flex-1 bg-transparent py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={resultsListRef}
            className="max-h-[60vh] overflow-y-auto"
          >
            {/* Empty states */}
            {!query.trim() && (
              <div className="px-4 py-10 text-center">
                <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Start typing to search across your project
                </p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Use arrow keys to navigate, Enter to select
                </p>
              </div>
            )}

            {query.trim() && !loading && flatResults.length === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No results found for &ldquo;{query}&rdquo;
                </p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Try different keywords or check the spelling
                </p>
              </div>
            )}

            {/* Grouped results */}
            {Object.entries(CATEGORY_META).map(([category, meta]) => {
              const items = results[category];
              if (!items?.length) return null;
              const Icon = meta.icon;

              return (
                <div key={category}>
                  {/* Category header */}
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-card/95 px-4 py-2 backdrop-blur-sm">
                    <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {meta.label}
                    </span>
                    <span className="text-xs text-muted-foreground/50">
                      {items.length} {items.length === 1 ? 'result' : 'results'}
                    </span>
                  </div>

                  {/* Items */}
                  {items.map((item, itemIndex) => {
                    const currentFlatIndex = flatIndex++;
                    const isSelected = currentFlatIndex === selectedIndex;

                    return (
                      <button
                        key={`${category}-${item.id ?? item.path ?? itemIndex}`}
                        data-selected={isSelected}
                        onClick={() => navigateToResult({ ...item, category })}
                        onMouseEnter={() => setSelectedIndex(currentFlatIndex)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
                          isSelected
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          {/* File path / title */}
                          <p className="truncate text-xs font-medium text-foreground">
                            {item.title ?? item.path ?? item.name ?? 'Untitled'}
                          </p>

                          {/* Matching line */}
                          {item.line && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground font-mono">
                              {item.lineNumber != null && (
                                <span className="mr-2 text-muted-foreground/50">
                                  L{item.lineNumber}
                                </span>
                              )}
                              {highlightMatch(item.line, query.trim())}
                            </p>
                          )}

                          {/* Description */}
                          {item.description && !item.line && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {highlightMatch(item.description, query.trim())}
                            </p>
                          )}
                        </div>

                        {isSelected && (
                          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {flatResults.length > 0 && (
            <div className="flex items-center gap-4 border-t px-4 py-2 text-[10px] text-muted-foreground/60">
              <span>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">&uarr;</kbd>{' '}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">&darr;</kbd>{' '}
                navigate
              </span>
              <span>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">&crarr;</kbd>{' '}
                open
              </span>
              <span>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">esc</kbd>{' '}
                close
              </span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
