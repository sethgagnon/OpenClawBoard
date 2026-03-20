import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  HeartHandshake,
  DollarSign,
  Clock,
  Columns3,
  Activity,
  Brain,
  FolderOpen,
  Sparkles,
  Lightbulb,
  Terminal,
  Settings,
  Menu,
  X,
  Search,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { apiPost } from '@/lib/api';
import SearchDialog from '@/components/SearchDialog';
import NotificationCenter from '@/components/NotificationCenter';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agentcare', label: 'AgentCare', icon: HeartHandshake },
  { to: '/cost', label: 'Cost', icon: DollarSign },
  { to: '/cron', label: 'Cron', icon: Clock },
  { to: '/kanban', label: 'Kanban', icon: Columns3 },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/files', label: 'Files', icon: FolderOpen },
  { to: '/skills', label: 'Skills', icon: Sparkles },
  { to: '/suggestions', label: 'Suggestions', icon: Lightbulb },
  { to: '/terminal', label: 'Terminal', icon: Terminal },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function getPageTitle(pathname) {
  if (pathname === '/') return 'Dashboard';
  const match = navItems.find(
    (item) => item.to !== '/' && pathname.startsWith(item.to)
  );
  return match ? match.label : 'OpenClawBoard';
}

export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pageTitle = getPageTitle(pathname);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Cmd+K handler
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } catch {
      // ignore
    }
    navigate('/login', { replace: true });
  }, [navigate]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn(
        'flex h-14 shrink-0 items-center border-b px-4',
        collapsed ? 'justify-center' : 'gap-3'
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 text-xs font-bold text-white">
          OC
        </div>
        {!collapsed && (
          <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-sm font-bold text-transparent">
            OpenClawBoard
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  collapsed && 'justify-center px-2',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className={cn(
        'shrink-0 border-t p-3',
        collapsed ? 'flex flex-col items-center gap-2' : 'space-y-2'
      )}>
        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform', collapsed && 'rotate-180')} />
          {!collapsed && 'Collapse'}
        </button>

        {!collapsed && (
          <p className="px-2 text-[10px] text-muted-foreground/50">v0.1.0</p>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — mobile */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r bg-card transition-transform duration-200 md:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Close button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute right-2 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        {sidebarContent}
      </aside>

      {/* Sidebar — desktop */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r bg-card transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur-sm">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Page title */}
          <h1 className="text-sm font-semibold text-foreground">{pageTitle}</h1>

          <div className="flex-1" />

          {/* Search trigger */}
          <button
            className="flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="ml-2 hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
              {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}K
            </kbd>
          </button>

          {/* Notification bell */}
          <NotificationCenter />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Global Search */}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
