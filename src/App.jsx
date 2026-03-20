import { lazy, Suspense } from 'react';
import { Routes, Route, Outlet, Navigate } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';

// Lazy-loaded pages for code splitting
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const AgentsPage = lazy(() => import('@/pages/AgentsPage'));
const AgentDetailPage = lazy(() => import('@/pages/AgentDetailPage'));
const SessionDetailPage = lazy(() => import('@/pages/SessionDetailPage'));

// AgentCare
const AgentCareDashboard = lazy(() => import('@/pages/agentcare/AgentCareDashboard'));
const AgentCareItems = lazy(() => import('@/pages/agentcare/AgentCareItems'));
const AgentCareItemDetail = lazy(() => import('@/pages/agentcare/AgentCareItemDetail'));
const AgentCareInsights = lazy(() => import('@/pages/agentcare/InsightsPage'));
const AgentCareImport = lazy(() => import('@/pages/agentcare/ImportPage'));
const CostPage = lazy(() => import('@/pages/CostPage'));
const CronPage = lazy(() => import('@/pages/CronPage'));
const KanbanPage = lazy(() => import('@/pages/KanbanPage'));
const ActivityPage = lazy(() => import('@/pages/ActivityPage'));
const MemoryPage = lazy(() => import('@/pages/MemoryPage'));
const FileBrowserPage = lazy(() => import('@/pages/FileBrowserPage'));
const SkillsPage = lazy(() => import('@/pages/SkillsPage'));
const SuggestionsPage = lazy(() => import('@/pages/SuggestionsPage'));
const TerminalPage = lazy(() => import('@/pages/TerminalPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SetupPage = lazy(() => import('@/pages/SetupPage'));

function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

function ShellLayout() {
  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />

        {/* Routes wrapped in AppShell */}
        <Route element={<ShellLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cost" element={<CostPage />} />
          <Route path="/cron" element={<CronPage />} />
          <Route path="/kanban" element={<KanbanPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/files" element={<FileBrowserPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/suggestions" element={<SuggestionsPage />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* AgentCare */}
          <Route path="/agentcare" element={<AgentCareDashboard />} />
          <Route path="/agentcare/items" element={<AgentCareItems />} />
          <Route path="/agentcare/items/:id" element={<AgentCareItemDetail />} />
          <Route path="/agentcare/agents" element={<AgentsPage />} />
          <Route path="/agentcare/agents/:name" element={<AgentDetailPage />} />
          <Route path="/agentcare/agents/:name/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/agentcare/import/:provider" element={<AgentCareImport />} />
          <Route path="/agentcare/insights" element={<AgentCareInsights />} />

          {/* Redirects from old routes */}
          <Route path="/automations" element={<Navigate to="/agentcare/items" replace />} />
          <Route path="/automations/:id" element={<Navigate to="/agentcare/items" replace />} />
          <Route path="/agents" element={<Navigate to="/agentcare/agents" replace />} />
          <Route path="/agents/:name" element={<Navigate to="/agentcare/agents" replace />} />
          <Route path="/import/:platform" element={<Navigate to="/agentcare" replace />} />
        </Route>
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}
