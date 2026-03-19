import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Coins, Zap, MessageSquare, User, Bot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

function formatDuration(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="border-border/50 bg-card/50">
          <CardContent className="p-4">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-6 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-start')}>
          <div className="w-full max-w-3xl space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className={cn(
            'h-6 w-6 rounded-md flex items-center justify-center',
            isUser
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-purple-500/15 text-purple-400'
          )}
        >
          {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        </div>
        <span className="text-xs font-medium text-muted-foreground capitalize">
          {message.role}
        </span>
        {(message.tokens != null || message.cost != null) && (
          <div className="flex items-center gap-3 ml-auto text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {message.tokens != null && (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {message.tokens.toLocaleString()} tokens
              </span>
            )}
            {message.cost != null && (
              <span className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                ${message.cost.toFixed(4)}
              </span>
            )}
          </div>
        )}
      </div>
      <div
        className={cn(
          'rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser
            ? 'bg-muted/40 border border-border/30 text-foreground'
            : 'bg-purple-500/5 border border-purple-500/10 text-foreground'
        )}
      >
        {message.content || (
          <span className="text-muted-foreground italic">No content</span>
        )}
      </div>
    </div>
  );
}

export default function SessionDetailPage() {
  const { name, id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiGet(`/agents/${encodeURIComponent(name)}/sessions/${id}`)
      .then((data) => { if (!cancelled) setSession(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [name, id]);

  const messages = session?.messages || [];
  const totalTokens = session?.totalTokens ?? messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
  const totalCost = session?.totalCost ?? messages.reduce((sum, m) => sum + (m.cost || 0), 0);

  return (
    <div className="px-3 py-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        onClick={() => navigate(`/agents/${encodeURIComponent(name)}`)}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {decodeURIComponent(name)}
      </Button>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load session: {error}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Session</h1>
          <span className="font-mono text-sm text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
            {String(id).slice(0, 12)}
          </span>
          {session?.status && (
            <Badge
              variant={
                session.status === 'completed' ? 'success' :
                session.status === 'running' ? 'default' :
                session.status === 'failed' ? 'destructive' : 'secondary'
              }
            >
              {session.status}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Agent: {decodeURIComponent(name)}
        </p>
      </div>

      {/* Summary Stats */}
      {loading ? (
        <SummarySkeleton />
      ) : session ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Tokens', value: totalTokens.toLocaleString(), icon: Zap },
            { label: 'Total Cost', value: `$${totalCost.toFixed(4)}`, icon: Coins },
            { label: 'Duration', value: formatDuration(session.duration), icon: Clock },
            { label: 'Messages', value: messages.length.toString(), icon: MessageSquare },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <stat.icon className="h-3.5 w-3.5" />
                  <span className="text-xs uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-lg font-semibold">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Message Timeline */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Message Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <MessagesSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No messages in this session.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <MessageBubble key={message.id || index} message={message} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
