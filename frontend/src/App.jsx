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
  Mail,
  PenLine,
  FileKey,
  DollarSign,
  BarChart3,
  FileSignature,
  FolderSync,
  Search,
  UserRound,
} from 'lucide-react';
import {
  supabase,
  getCurrentUser,
  getUserProfile,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  onAuthStateChange,
} from './lib/supabase';
import { getCases, getNotifications, markNotificationRead } from './lib/api';

// ---------------------------------------------------------------------------
// Lazy-loaded page components
// ---------------------------------------------------------------------------
const Login = React.lazy(() => import('./pages/Login'));
const IntakeForm = React.lazy(() => import('./pages/IntakeForm'));
const CaseReferralForm = React.lazy(() => import('./pages/CaseReferralForm'));
const SignDocument = React.lazy(() => import('./pages/SignDocument'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const Terms = React.lazy(() => import('./pages/Terms'));
const QuickBooksCallback = React.lazy(() => import('./pages/QuickBooksCallback'));
const W9Form = React.lazy(() => import('./pages/W9Form'));
const PayoutInformationForm = React.lazy(() => import('./pages/PayoutInformationForm'));

// Attorney pages
const AttorneyDashboard = React.lazy(() => import('./pages/attorney/Dashboard'));
const CasePipeline = React.lazy(() => import('./pages/attorney/CasePipeline'));
const CaseDetail = React.lazy(() => import('./pages/attorney/CaseDetail'));
const ClientList = React.lazy(() => import('./pages/attorney/ClientList'));
const ClientProfile = React.lazy(() => import('./pages/attorney/ClientProfile'));
const ReferralPartnerProfile = React.lazy(() => import('./pages/attorney/ReferralPartnerProfile'));
const ReferralAttorneyWorkspace = React.lazy(() => import('./pages/attorney/ReferralAttorneyWorkspace'));
const ReferralAttorneyPipeline = React.lazy(() => import('./pages/attorney/ReferralAttorneyPipeline'));
const ReferralAttorneyClients = React.lazy(() => import('./pages/attorney/ReferralAttorneyClients'));
const ReferralAttorneyDocuments = React.lazy(() => import('./pages/attorney/ReferralAttorneyDocuments'));
const ReferralAttorneyWorkspaces = React.lazy(() => import('./pages/attorney/ReferralAttorneyWorkspaces'));
const Communications = React.lazy(() => import('./pages/attorney/Communications'));
const AttorneySettings = React.lazy(() => import('./pages/attorney/Settings'));
const AgentChat = React.lazy(() => import('./pages/attorney/AgentChat'));
const DraftComplaint = React.lazy(() => import('./pages/attorney/DraftComplaint'));
const CalendarPage = React.lazy(() => import('./pages/attorney/Calendar'));
const CommissionsPage = React.lazy(() => import('./pages/attorney/Commissions'));
const FormsPage = React.lazy(() => import('./pages/attorney/Forms'));
const DisputeLetters = React.lazy(() => import('./pages/attorney/DisputeLetters'));
const ESignatures = React.lazy(() => import('./pages/attorney/ESignatures'));
const W9Requests = React.lazy(() => import('./pages/attorney/W9Requests'));
const ClosingStatements = React.lazy(() => import('./pages/attorney/ClosingStatements'));
const SettlementCenter = React.lazy(() => import('./pages/attorney/SettlementCenter'));
const AttorneyPayouts = React.lazy(() => import('./pages/attorney/AttorneyPayouts'));
const PayoutOverview = React.lazy(() => import('./pages/attorney/PayoutOverview'));
const DocumentExchange = React.lazy(() => import('./pages/attorney/DocumentExchange'));

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
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 8000));
        const auth = async () => {
          const authUser = await getCurrentUser();
          if (mounted) await loadProfile(authUser);
        };
        await Promise.race([auth(), timeout]);
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
    const target = ['attorney', 'staff_attorney', 'affiliate'].includes(profile.role) ? '/attorney/dashboard' : '/client/dashboard';
    return <Navigate to={target} replace />;
  }

  return children || <Outlet />;
}

// ---------------------------------------------------------------------------
// Root Redirect
// ---------------------------------------------------------------------------
function AttorneyRolePage({ allowedRoles, children }) {
  const { profile } = useAuth();
  if (!allowedRoles.includes(profile?.role)) {
    return <Navigate to={profile?.role === 'affiliate' ? '/attorney/referral-workspace' : '/attorney/dashboard'} replace />;
  }
  return children;
}

function RootRedirect() {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (['attorney', 'staff_attorney', 'affiliate'].includes(profile?.role)) return <Navigate to="/attorney/dashboard" replace />;
  if (profile?.role === 'client') return <Navigate to="/client/dashboard" replace />;

  return <Navigate to="/login" replace />;
}

// ---------------------------------------------------------------------------
// Loading Screen
// ---------------------------------------------------------------------------
function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-blue-600">
      <div className="text-center">
        <Scale className="mx-auto h-12 w-12 animate-pulse text-white" />
        <p className="mt-4 text-lg font-bold text-white">LegalFlow</p>
        <p className="mt-1 text-sm text-blue-200">Loading...</p>
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
// Global Client Search
// ---------------------------------------------------------------------------
function ClientProfileSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [casesData, profilesResponse] = await Promise.all([
          getCases(),
          supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('role', 'client')
            .ilike('full_name', `%${normalizedQuery}%`)
            .limit(8),
        ]);

        const matches = new Map();
        const caseList = Array.isArray(casesData) ? casesData : casesData?.items ?? casesData?.cases ?? [];
        caseList.forEach((caseRecord) => {
          const id = caseRecord.client_id || caseRecord.plaintiff_id || caseRecord.user_id;
          const fullName = caseRecord.plaintiff_name || caseRecord.client_name;
          if (!id || !fullName || !fullName.toLowerCase().includes(normalizedQuery)) return;
          matches.set(id, {
            id,
            full_name: fullName,
            email: caseRecord.client_email || caseRecord.plaintiff_email || '',
          });
        });

        if (!profilesResponse.error && Array.isArray(profilesResponse.data)) {
          profilesResponse.data.forEach((client) => {
            if (client?.id && client?.full_name) matches.set(client.id, client);
          });
        }

        if (!cancelled) {
          setResults(Array.from(matches.values()).slice(0, 8));
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function openClientProfile(clientId) {
    setQuery('');
    setResults([]);
    setOpen(false);
    navigate(`/attorney/clients/${clientId}`);
  }

  return (
    <div className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        placeholder="Search client name..."
        aria-label="Search client profiles"
        aria-expanded={open && query.trim().length >= 2}
        aria-controls="client-profile-search-results"
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-100"
      />

      {open && query.trim().length >= 2 && (
        <div
          id="client-profile-search-results"
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
              Searching clients...
            </div>
          ) : results.length ? (
            results.map((client) => (
              <button
                key={client.id}
                type="button"
                role="option"
                aria-label={`Open ${client.full_name}'s profile`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openClientProfile(client.id)}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                  <UserRound className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{client.full_name}</span>
                  {client.email && <span className="block truncate text-xs text-slate-500">{client.email}</span>}
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-slate-500">No client profiles match “{query.trim()}”.</p>
          )}
        </div>
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
  const canSearchClients = ['attorney', 'staff_attorney', 'affiliate'].includes(profile?.role);

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

      {canSearchClients && <ClientProfileSearch />}

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
const allAttorneyLinks = [
  { to: '/attorney/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/referral-workspace', label: 'Dashboard', icon: LayoutDashboard, roles: ['affiliate'] },
  { to: '/attorney/pipeline', label: 'My Case Pipeline', icon: Kanban, roles: ['affiliate'] },
  { to: '/attorney/clients', label: 'My Clients', icon: Users, roles: ['affiliate'] },
  { to: '/attorney/documents', label: 'My Case Documents', icon: FolderSync, roles: ['affiliate'] },
  { to: '/attorney/draft', label: 'Draft Complaint', icon: FileEdit, roles: ['attorney', 'staff_attorney'], affiliateFeature: 'drafter' },
  { to: '/attorney/disputes', label: 'Dispute Letters', icon: Mail, roles: ['attorney', 'staff_attorney'], affiliateFeature: 'disputer' },
  { to: '/attorney/settlements', label: 'Settlement Center', icon: FileSignature, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/esign', label: 'E-Signatures', icon: PenLine, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/document-exchange', label: 'Document Exchange', icon: FolderSync, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/pipeline', label: 'Case Pipeline', icon: Kanban, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/agents', label: 'Agent Chat', icon: MessageSquare, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/calendar', label: 'Calendar', icon: CalendarDays, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/payout-overview', label: 'Payout Overview', icon: BarChart3, roles: ['attorney'] },
  { to: '/attorney/commissions', label: 'Commissions', icon: DollarSign, roles: ['attorney'] },
  { to: '/attorney/payouts', label: 'Attorney Payouts', icon: DollarSign, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/forms', label: 'Forms', icon: FileText, roles: ['attorney'] },
  { to: '/attorney/referral-attorneys', label: 'Referral Attorneys', icon: Users, roles: ['attorney'] },
  { to: '/attorney/clients', label: 'Clients', icon: Users, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/communications', label: 'Communications', icon: MessageSquare, roles: ['attorney', 'staff_attorney'] },
  { to: '/attorney/settings', label: 'Settings', icon: Settings, roles: ['attorney'] },
];

function AttorneyHomeRedirect() {
  const { profile } = useAuth();
  return <Navigate to={profile?.role === 'affiliate' ? 'referral-workspace' : 'dashboard'} replace />;
}

function AffiliatePipelinePage() {
  const { profile } = useAuth();
  return profile?.role === 'affiliate' ? <ReferralAttorneyPipeline /> : <CasePipeline />;
}

function AffiliateClientsPage() {
  const { profile } = useAuth();
  return profile?.role === 'affiliate' ? <ReferralAttorneyClients /> : <ClientList />;
}

function AttorneyLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile } = useAuth();
  const role = profile?.role || 'attorney';

  const attorneyLinks = allAttorneyLinks.filter(link => {
    if (!link.roles.includes(role)) return false;
    return true;
  });

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
          <Route path="/intake/:slug" element={<IntakeForm />} />
          <Route path="/case-referral" element={<CaseReferralForm />} />
          <Route path="/case-referral/:referralSlug" element={<CaseReferralForm />} />
          <Route path="/sign/:token" element={<SignDocument />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/quickbooks/callback" element={<QuickBooksCallback />} />
          <Route path="/w9/:token" element={<W9Form />} />
          <Route path="/payout-information/:token" element={<PayoutInformationForm />} />

          {/* Attorney portal */}
          <Route
            path="/attorney"
            element={
              <ProtectedRoute allowedRoles={['attorney', 'staff_attorney', 'affiliate']}>
                <AttorneyLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AttorneyHomeRedirect />} />
            <Route path="dashboard" element={<AttorneyRolePage allowedRoles={['attorney', 'staff_attorney']}><AttorneyDashboard /></AttorneyRolePage>} />
            <Route path="referral-workspace" element={<AttorneyRolePage allowedRoles={['affiliate']}><ReferralAttorneyWorkspace /></AttorneyRolePage>} />
            <Route path="draft" element={<DraftComplaint />} />
            <Route path="disputes" element={<DisputeLetters />} />
            <Route path="esign" element={<AttorneyRolePage allowedRoles={['attorney', 'staff_attorney']}><ESignatures /></AttorneyRolePage>} />
            <Route path="document-exchange" element={<AttorneyRolePage allowedRoles={['attorney', 'staff_attorney']}><DocumentExchange /></AttorneyRolePage>} />
            <Route path="documents" element={<AttorneyRolePage allowedRoles={['affiliate']}><ReferralAttorneyDocuments /></AttorneyRolePage>} />
            <Route path="w9" element={<W9Requests />} />
            <Route path="closing-statements" element={<ClosingStatements />} />
            <Route path="settlements" element={<SettlementCenter />} />
            <Route path="pipeline" element={<AffiliatePipelinePage />} />
            <Route path="cases/:id" element={<AttorneyRolePage allowedRoles={['attorney', 'staff_attorney']}><CaseDetail /></AttorneyRolePage>} />
            <Route path="agents" element={<AgentChat />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="payout-overview" element={<PayoutOverview />} />
            <Route path="commissions" element={<CommissionsPage />} />
            <Route path="payouts" element={<AttorneyPayouts />} />
            <Route path="forms" element={<FormsPage />} />
            <Route path="referral-attorneys" element={<ReferralAttorneyWorkspaces />} />
            <Route path="clients" element={<AffiliateClientsPage />} />
            <Route path="clients/:id" element={<AttorneyRolePage allowedRoles={['attorney', 'staff_attorney']}><ClientProfile /></AttorneyRolePage>} />
            <Route path="referrals/:id" element={<ReferralPartnerProfile />} />
            <Route path="communications" element={<Communications />} />
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
