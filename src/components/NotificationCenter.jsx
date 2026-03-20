import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  Clock,
  Bot,
  Info,
  CheckCheck,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';

const TYPE_META = {
  'task-complete': { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10', route: '/activity' },
  'cron-fail': { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10', route: '/cron' },
  'cost-threshold': { icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-400/10', route: '/cost' },
  'cron-success': { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-400/10', route: '/cron' },
  'agent-error': { icon: Bot, color: 'text-red-400', bg: 'bg-red-400/10', route: '/agentcare/agents' },
  'agent-complete': { icon: Bot, color: 'text-emerald-400', bg: 'bg-emerald-400/10', route: '/agentcare/agents' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10', route: '/' },
};

function getTypeMeta(type) {
  return TYPE_META[type] ?? TYPE_META.info;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  function handleNotificationClick(notification) {
    if (!notification.read) markRead(notification.id);
    const meta = getTypeMeta(notification.type);
    setOpen(false);
    navigate(notification.route ?? meta.route);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-xl animate-slide-in">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-10">
                <Inbox className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No notifications</p>
              </div>
            )}

            {notifications.map((notification) => {
              const meta = getTypeMeta(notification.type);
              const Icon = meta.icon;
              return (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    'flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors',
                    'hover:bg-muted/50',
                    !notification.read && 'bg-primary/[0.03]'
                  )}
                >
                  <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', meta.bg)}>
                    <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className={cn('truncate text-xs', notification.read ? 'font-normal text-muted-foreground' : 'font-medium text-foreground')}>
                        {notification.title}
                      </p>
                      {!notification.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    </div>
                    {notification.description && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{notification.description}</p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/50">
                      {relativeTime(notification.createdAt ?? notification.timestamp)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
