import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Terminal as TerminalIcon, Loader2 } from 'lucide-react';

const PROMPT = 'openclawboard> ';
const PURPLE = '\x1b[35m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export default function TerminalPage() {
  const termRef = useRef(null);
  const terminalRef = useRef(null);
  const inputRef = useRef('');
  const cursorPosRef = useRef(0);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);

  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [autocomplete, setAutocomplete] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Fetch allowed commands
  useEffect(() => {
    apiGet('/terminal/commands')
      .then((data) => {
        setCommands(data.commands ?? data ?? []);
      })
      .catch(() => {
        setCommands([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!termRef.current || loading) return;

    const term = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e4e4e7',
        cursor: '#a855f7',
        cursorAccent: '#0a0a0f',
        selectionBackground: '#a855f740',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 1000,
      convertEol: true,
    });

    term.open(termRef.current);
    terminalRef.current = term;

    // Welcome message
    term.writeln(`${BOLD}${PURPLE}OpenClawBoard Terminal${RESET}`);
    term.writeln(`${DIM}Type a command or click a chip above. Tab to autocomplete.${RESET}`);
    term.writeln('');
    writePrompt(term);

    return () => {
      term.dispose();
      terminalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Handle terminal input
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    const disposable = term.onData((data) => {
      handleInput(data);
    });

    return () => disposable.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, commands, executing]);

  function writePrompt(term) {
    term.write(`${PURPLE}${PROMPT}${RESET}`);
  }

  function clearCurrentLine() {
    const term = terminalRef.current;
    if (!term) return;
    // Move to start of input, clear to end of line
    const len = inputRef.current.length;
    const pos = cursorPosRef.current;
    // Move cursor to end of input
    if (pos < len) {
      term.write(`\x1b[${len - pos}C`);
    }
    // Delete all input characters
    for (let i = 0; i < len; i++) {
      term.write('\b \b');
    }
  }

  function redrawInput() {
    const term = terminalRef.current;
    if (!term) return;
    term.write(inputRef.current);
    // Move cursor back if not at end
    const diff = inputRef.current.length - cursorPosRef.current;
    if (diff > 0) {
      term.write(`\x1b[${diff}D`);
    }
  }

  const handleInput = useCallback(
    (data) => {
      const term = terminalRef.current;
      if (!term || executing) return;

      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        const code = char.charCodeAt(0);

        // Enter
        if (code === 13) {
          setShowAutocomplete(false);
          term.writeln('');
          const cmd = inputRef.current.trim();
          if (cmd) {
            historyRef.current.unshift(cmd);
            historyIndexRef.current = -1;
            executeCommand(cmd);
          } else {
            writePrompt(term);
          }
          inputRef.current = '';
          cursorPosRef.current = 0;
          return;
        }

        // Backspace
        if (code === 127) {
          if (cursorPosRef.current > 0) {
            clearCurrentLine();
            const pos = cursorPosRef.current;
            inputRef.current =
              inputRef.current.slice(0, pos - 1) + inputRef.current.slice(pos);
            cursorPosRef.current = pos - 1;
            redrawInput();
            updateAutocomplete();
          }
          continue;
        }

        // Tab — autocomplete
        if (code === 9) {
          const input = inputRef.current;
          if (input.length > 0) {
            const matches = commands.filter((c) => {
              const name = typeof c === 'string' ? c : c.name;
              return name.startsWith(input);
            });
            if (matches.length === 1) {
              const match = typeof matches[0] === 'string' ? matches[0] : matches[0].name;
              clearCurrentLine();
              inputRef.current = match;
              cursorPosRef.current = match.length;
              redrawInput();
              setShowAutocomplete(false);
            } else if (matches.length > 1) {
              // Find common prefix
              const names = matches.map((c) => (typeof c === 'string' ? c : c.name));
              let prefix = names[0];
              for (const name of names) {
                while (!name.startsWith(prefix)) {
                  prefix = prefix.slice(0, -1);
                }
              }
              if (prefix.length > input.length) {
                clearCurrentLine();
                inputRef.current = prefix;
                cursorPosRef.current = prefix.length;
                redrawInput();
              }
              setAutocomplete(names);
              setShowAutocomplete(true);
            }
          }
          continue;
        }

        // Escape sequences (arrows)
        if (code === 27) {
          // Check for escape sequence
          if (i + 2 < data.length && data[i + 1] === '[') {
            const arrow = data[i + 2];
            i += 2;
            // Up arrow — history
            if (arrow === 'A') {
              if (historyRef.current.length > 0 && historyIndexRef.current < historyRef.current.length - 1) {
                historyIndexRef.current++;
                clearCurrentLine();
                inputRef.current = historyRef.current[historyIndexRef.current];
                cursorPosRef.current = inputRef.current.length;
                redrawInput();
              }
              continue;
            }
            // Down arrow — history
            if (arrow === 'B') {
              if (historyIndexRef.current > 0) {
                historyIndexRef.current--;
                clearCurrentLine();
                inputRef.current = historyRef.current[historyIndexRef.current];
                cursorPosRef.current = inputRef.current.length;
                redrawInput();
              } else if (historyIndexRef.current === 0) {
                historyIndexRef.current = -1;
                clearCurrentLine();
                inputRef.current = '';
                cursorPosRef.current = 0;
              }
              continue;
            }
            // Left arrow
            if (arrow === 'D') {
              if (cursorPosRef.current > 0) {
                cursorPosRef.current--;
                term.write('\x1b[D');
              }
              continue;
            }
            // Right arrow
            if (arrow === 'C') {
              if (cursorPosRef.current < inputRef.current.length) {
                cursorPosRef.current++;
                term.write('\x1b[C');
              }
              continue;
            }
          }
          setShowAutocomplete(false);
          continue;
        }

        // Regular character
        if (code >= 32) {
          clearCurrentLine();
          const pos = cursorPosRef.current;
          inputRef.current =
            inputRef.current.slice(0, pos) + char + inputRef.current.slice(pos);
          cursorPosRef.current = pos + 1;
          redrawInput();
          updateAutocomplete();
        }
      }
    },
    [commands, executing]
  );

  function updateAutocomplete() {
    const input = inputRef.current;
    if (input.length === 0) {
      setShowAutocomplete(false);
      return;
    }
    const matches = commands
      .map((c) => (typeof c === 'string' ? c : c.name))
      .filter((name) => name.startsWith(input) && name !== input);
    if (matches.length > 0 && matches.length <= 8) {
      setAutocomplete(matches);
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
    }
  }

  async function executeCommand(command) {
    const term = terminalRef.current;
    if (!term) return;

    setExecuting(true);
    try {
      const data = await apiPost('/terminal/exec', { command });
      const output = data.output ?? data.result ?? '';
      if (output) {
        term.writeln(`${GREEN}${output}${RESET}`);
      }
      if (data.error) {
        term.writeln(`${RED}Error: ${data.error}${RESET}`);
      }
    } catch (err) {
      term.writeln(`${RED}Error: ${err.message}${RESET}`);
    } finally {
      setExecuting(false);
      term.writeln('');
      writePrompt(term);
    }
  }

  function handleChipClick(command) {
    const term = terminalRef.current;
    if (!term || executing) return;

    const name = typeof command === 'string' ? command : command.name;
    clearCurrentLine();
    inputRef.current = name;
    cursorPosRef.current = name.length;
    redrawInput();
    setShowAutocomplete(false);
    term.focus();
  }

  if (loading) {
    return (
      <div className="px-3 py-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Command Palette */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center gap-3">
            <TerminalIcon className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Command Palette</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              Safe Commands
            </Badge>
            {executing && (
              <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="flex flex-wrap gap-2">
            {commands.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No commands available. Check server configuration.
              </span>
            )}
            {commands.map((cmd) => {
              const name = typeof cmd === 'string' ? cmd : cmd.name;
              const desc = typeof cmd === 'string' ? null : cmd.description;
              return (
                <button
                  key={name}
                  onClick={() => handleChipClick(cmd)}
                  disabled={executing}
                  title={desc || name}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-mono transition-colors',
                    'bg-background text-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Terminal */}
      <Card className="relative flex-1 overflow-hidden">
        {/* Autocomplete overlay */}
        {showAutocomplete && autocomplete.length > 0 && (
          <div className="absolute bottom-16 left-4 z-10 rounded-md border bg-popover p-1 shadow-lg">
            {autocomplete.map((name) => (
              <button
                key={name}
                onClick={() => {
                  const term = terminalRef.current;
                  if (!term) return;
                  clearCurrentLine();
                  inputRef.current = name;
                  cursorPosRef.current = name.length;
                  redrawInput();
                  setShowAutocomplete(false);
                  term.focus();
                }}
                className="block w-full rounded px-3 py-1 text-left text-xs font-mono text-foreground hover:bg-primary/10 hover:text-primary"
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div
          ref={termRef}
          className="h-full w-full p-3 [&_.xterm-viewport]:!overflow-y-auto"
          style={{ minHeight: '400px' }}
        />
      </Card>
    </div>
  );
}
