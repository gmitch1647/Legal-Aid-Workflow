import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Kanban,
  Users,
  Settings,
  FileText,
  FileEdit,
  PlusCircle,
  LogOut,
  Bell,
  Scale,
  ChevronDown,
  Menu,
  X,
  MessageSquare,
  CalendarDays,
} from 'lucide-react';
import {
  supabase,
  getCurrentUser,
  getUserProfile,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  onAuthStateChange,
} from './lib/supabase';
import { getNotifications, markNotificationRead } from './lib/api';

// ---------------------------------------------------------------------------
// Lazy-loaded page components
// ---------------------------------------------------------------------------
const Login = React.lazy(() => import('./pages/Login'));
const IntakeForm = React.lazy(() => import('./pages/IntakeForm'));

// Attorney pages
const AttorneyDashboard = React.lazy(() => import('./pages/attorney/Dashboard'));
const CasePipeline = React.lazy(() => import('./pages/attorney/CasePipeline'));
const CaseDetail = React.lazy(() => import('./pages/attorney/CaseDetail'));
const ClientList = React.lazy(() => import('./pages/attorney/ClientList'));
const ClientProfile = React.lazy(() => import('./pages/attorney/ClientProfile'));
const AttorneySettings = React.lazy(() => import('./pages/attorney/Settings'));
const AgentChat = React.lazy(() => import('./pages/attorney/AgentChat'));
const DraftComplaint = React.lazy(() => import('./pages/attorney/DraftComplaint'));
const CalendarPage = React.lazy(() => import('./pages/attorney/Calendar'));

// Client pages
const ClientDashboard = React.lazy(() => import('./pages/client/Dashboard'));
const CaseSubmission = React.lazy(() => import('./pages/client/CaseSubmission'));
const ClientCaseDetail = React.lazy(() => import('./pages/client/CaseDetail'));

// ---------------------------------------------------------------------------
// Auth Context
// ---------------------------------------------------------------------------
const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setUser(null);
      setProfile(null);
      return;
    }
    setUser(authUser);
    try {
      const prof = await getUserProfile();
      setProfile(prof);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const authUser = await getCurrentUser();
        if (mounted) {
          await loadProfile(authUser);
        }
      } catch (err) {
        console.error('Auth init error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    const subscription = onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await loadProfile(session?.user ?? null);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password) => {
    const { user: authUser } = await supabaseSignIn(email, password);
    await loadProfile(authUser);
    return authUser;
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabaseSignOut();
    setUser(null);
    setProfile(null);
  }, []);

  const value = { user, profile, loading, signIn, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Protected Route
// ---------------------------------------------------------------------------
function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    // Redirect to appropriate portal based on actual role
    const target = profile.role === 'attorney' ? '/attorney/dashboard' : '/client/dashboard';
    return <Navigate to={target} replace />;
  }

  return children || <Outlet />;
}

// ---------------------------------------------------------------------------
// Root Redirect
// ---------------------------------------------------------------------------
function RootRedirect() {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (profile?.role === 'attorney') return <Navigate to="/attorney/dashboard" replace />;
  if (profile?.role === 'client') return <Navigate to="/client/dashboard" replace />;

  return <Navigate to="/login" replace />;
}

// ---------------------------------------------------------------------------
// Loading Screen
// ---------------------------------------------------------------------------
function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <Scale className="mx-auto h-12 w-12 animate-pulse text-primary-600" />
        <p className="mt-4 text-sm text-slate-500">Loading...</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suspense Fallback
// ---------------------------------------------------------------------------
function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Bell
// ---------------------------------------------------------------------------
function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getNotifications(true);
        if (mounted) {
          const items = Array.isArray(data) ? data : data?.items ?? [];
          setNotifications(items);
          setUnreadCount(items.length);
        }
      } catch {
        // Notifications are non-critical
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  async function handleMarkRead(id) {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No new notifications</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 border-b border-slate-50 px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700">{n.message || n.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{n.created_at}</p>
                    </div>
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="shrink-0 text-xs text-primary-600 hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top Bar
// ---------------------------------------------------------------------------
function TopBar({ onMenuToggle }) {
  const { profile, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 lg:hidden">
          <Scale className="h-6 w-6 text-primary-600" />
          <span className="text-lg font-bold text-slate-900">LegalFlow</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700">
              <span className="text-sm font-semibold">
                {profile?.full_name
                  ? profile.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                  : '??'}
              </span>
            </div>
            <span className="hidden md:inline">{profile?.full_name || 'User'}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 z-40 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <div className="border-b border-slate-100 px-4 py-2">
                  <p className="text-sm font-medium text-slate-900">{profile?.full_name}</p>
                  <p className="text-xs text-slate-400">{profile?.role}</p>
                </div>
                <button
                  onClick={async () => {
                    setUserMenuOpen(false);
                    await signOut();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function Sidebar({ links, open, onClose }) {
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2.5">
            <Scale className="h-7 w-7 text-primary-600" />
            <span className="text-xl font-bold text-slate-900">LegalFlow</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {links.map((link) => {
              const isActive =
                location.pathname === link.to ||
                (link.to !== links[0]?.to && location.pathname.startsWith(link.to));

              return (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    onClick={onClose}
                    className={`
                      flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                      ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }
                    `}
                  >
                    <link.icon className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-slate-400'}`} />
                    {link.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400 text-center">LegalFlow v1.0</p>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Attorney Layout
// ---------------------------------------------------------------------------
const attorneyLinks = [
  { to: '/attorney/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/attorney/draft', label: 'Draft Complaint', icon: FileEdit },
  { to: '/attorney/pipeline', label: 'Case Pipeline', icon: Kanban },
  { to: '/attorney/agents', label: 'Agent Chat', icon: MessageSquare },
  { to: '/attorney/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/attorney/clients', label: 'Clients', icon: Users },
  { to: '/attorney/settings', label: 'Settings', icon: Settings },
];

function AttorneyLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar links={attorneyLinks} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <React.Suspense fallback={<PageLoader />}>
            <Outlet />
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client Layout
// ---------------------------------------------------------------------------
const clientLinks = [
  { to: '/client/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/client/submit', label: 'Submit Case', icon: PlusCircle },
];

function ClientLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar links={clientLinks} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <React.Suspense fallback={<PageLoader />}>
            <Outlet />
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <AuthProvider>
      <React.Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/intake" element={<IntakeForm />} />

          {/* Attorney portal */}
          <Route
            path="/attorney"
            element={
              <ProtectedRoute allowedRoles={['attorney']}>
                <AttorneyLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AttorneyDashboard />} />
            <Route path="draft" element={<DraftComplaint />} />
            <Route path="pipeline" element={<CasePipeline />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="agents" element={<AgentChat />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="clients" element={<ClientList />} />
            <Route path="clients/:id" element={<ClientProfile />} />
            <Route path="settings" element={<AttorneySettings />} />
          </Route>

          {/* Client portal */}
          <Route
            path="/client"
            element={
              <ProtectedRoute allowedRoles={['client']}>
                <ClientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ClientDashboard />} />
            <Route path="submit" element={<CaseSubmission />} />
            <Route path="cases/:id" element={<ClientCaseDetail />} />
          </Route>

          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </AuthProvider>
  );
}
