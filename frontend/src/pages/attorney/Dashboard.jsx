import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  FileEdit,
  FileCheck,
  Users,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Send,
  RefreshCw,
  PlusCircle,
  FilePlus,
  Loader2,
  CalendarDays,
  Check,
} from 'lucide-react';
import { useAuth } from '../../App';
import { getCases, getCalendarEvents } from '../../lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function daysSince(dateString) {
  if (!dateString) return 0;
  const now = new Date();
  const date = new Date(dateString);
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

const STATUS_LABELS = {
  submitted: 'Submitted',
  approved_for_processing: 'Approved',
  agents_processing: 'Processing',
  draft_ready: 'Draft Ready',
  attorney_review: 'Attorney Review',
  approved: 'Approved',
  filed: 'Filed',
  closed: 'Closed',
  denied: 'Denied',
};

function statusBadgeClasses(status) {
  switch (status) {
    case 'submitted':
      return 'bg-blue-100 text-blue-700';
    case 'draft_ready':
      return 'bg-amber-100 text-amber-700';
    case 'attorney_review':
      return 'bg-purple-100 text-purple-700';
    case 'agents_processing':
      return 'bg-cyan-100 text-cyan-700';
    case 'approved':
    case 'approved_for_processing':
      return 'bg-green-100 text-green-700';
    case 'filed':
      return 'bg-emerald-100 text-emerald-700';
    case 'closed':
      return 'bg-slate-100 text-slate-600';
    case 'denied':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function activityIcon(status) {
  switch (status) {
    case 'submitted':
      return <Send className="h-4 w-4 text-blue-500" />;
    case 'approved_for_processing':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'agents_processing':
      return <RefreshCw className="h-4 w-4 text-cyan-500" />;
    case 'draft_ready':
      return <FileEdit className="h-4 w-4 text-amber-500" />;
    case 'attorney_review':
      return <AlertCircle className="h-4 w-4 text-purple-500" />;
    case 'approved':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'filed':
      return <FileCheck className="h-4 w-4 text-emerald-600" />;
    default:
      return <Clock className="h-4 w-4 text-slate-400" />;
  }
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({ icon: Icon, label, count, color, loading }) {
  const colorMap = {
    blue: {
      bg: 'bg-blue-50',
      icon: 'text-blue-600',
      border: 'border-blue-100',
    },
    amber: {
      bg: 'bg-amber-50',
      icon: 'text-amber-600',
      border: 'border-amber-100',
    },
    green: {
      bg: 'bg-green-50',
      icon: 'text-green-600',
      border: 'border-green-100',
    },
    purple: {
      bg: 'bg-purple-50',
      icon: 'text-purple-600',
      border: 'border-purple-100',
    },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`card flex items-center gap-4 border ${c.border}`}>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${c.bg}`}>
        <Icon className={`h-6 w-6 ${c.icon}`} />
      </div>
      <div>
        {loading ? (
          <div className="h-7 w-12 animate-pulse rounded bg-slate-200" />
        ) : (
          <p className="text-2xl font-bold text-slate-900">{count}</p>
        )}
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, eventsData] = await Promise.all([
        getCases(),
        getCalendarEvents().catch(() => []),
      ]);
      const list = Array.isArray(data) ? data : data?.items ?? data?.cases ?? [];
      setCases(list);
      setCalendarEvents(Array.isArray(eventsData) ? eventsData : []);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Computed stats
  const activeCases = cases.filter(
    (c) => !['closed', 'denied', 'filed'].includes(c.status)
  ).length;

  const draftsNeedingReview = cases.filter(
    (c) => c.status === 'draft_ready' || c.status === 'attorney_review'
  ).length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const filedThisMonth = cases.filter((c) => {
    if (c.status !== 'filed') return false;
    const updated = new Date(c.updated_at || c.filed_at || c.created_at);
    return updated >= startOfMonth;
  }).length;

  const uniqueClients = new Set(cases.map((c) => c.client_id || c.plaintiff_id)).size;

  // Cases requiring attention
  const attentionCases = cases
    .filter((c) => ['draft_ready', 'submitted', 'attorney_review'].includes(c.status))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, 10);

  // Recent activity - last 10 cases by update time
  const recentActivity = [...cases]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 10);

  const firstName = profile?.full_name?.split(' ')[0] || 'Counselor';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Welcome back, {firstName}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/attorney/clients')}
            className="btn-secondary gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Add New Client
          </button>
          <button
            onClick={() => navigate('/attorney/pipeline')}
            className="btn-primary gap-2"
          >
            <FilePlus className="h-4 w-4" />
            New Case
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={fetchData} className="ml-auto text-red-800 underline hover:no-underline">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Briefcase}
          label="Active Cases"
          count={activeCases}
          color="blue"
          loading={loading}
        />
        <SummaryCard
          icon={FileEdit}
          label="Drafts Pending Review"
          count={draftsNeedingReview}
          color="amber"
          loading={loading}
        />
        <SummaryCard
          icon={FileCheck}
          label="Filed This Month"
          count={filedThisMonth}
          color="green"
          loading={loading}
        />
        <SummaryCard
          icon={Users}
          label="Total Clients"
          count={uniqueClients}
          color="purple"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cases Requiring Attention */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Cases Requiring Attention</h2>
            <button
              onClick={() => navigate('/attorney/pipeline')}
              className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              View All <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
            </div>
          ) : attentionCases.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No cases require your attention right now.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {attentionCases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/attorney/cases/${c.id}`)}
                  className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-slate-50 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {c.plaintiff_name || c.client_name || 'Unknown Client'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      v. {c.defendant_names?.join(', ') || c.defendant_name || 'Unknown Defendant'}
                    </p>
                  </div>
                  <span className={`badge ${statusBadgeClasses(c.status)}`}>
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {daysSince(c.status_changed_at || c.updated_at || c.created_at)}d
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No recent activity.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentActivity.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-3 py-3 px-1"
                >
                  <div className="mt-0.5 shrink-0">{activityIcon(c.status)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{c.plaintiff_name || c.client_name || 'Client'}</span>
                      {' '}
                      <span className="text-slate-500">
                        &mdash; {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {relativeTime(c.updated_at || c.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Calendar Events */}
        <UpcomingEvents events={calendarEvents} navigate={navigate} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upcoming Events Widget
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABELS = {
  deadline: 'Deadline', hearing: 'Hearing', filing: 'Filing',
  discovery_cutoff: 'Discovery Cutoff', deposition: 'Deposition',
  mediation: 'Mediation', trial: 'Trial', conference: 'Conference',
  statute_of_limitations: 'SOL', reminder: 'Reminder', other: 'Event',
};

const EVENT_DOT_COLORS = {
  red: 'bg-red-500', purple: 'bg-purple-500', blue: 'bg-blue-500',
  amber: 'bg-amber-500', indigo: 'bg-indigo-500', teal: 'bg-teal-500',
  cyan: 'bg-cyan-500', slate: 'bg-slate-400',
};

function UpcomingEvents({ events, navigate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = events
    .filter((e) => {
      const d = new Date(e.event_date);
      const diff = (d - today) / 86400000;
      return diff >= -1 && diff <= 30 && !e.is_completed;
    })
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
    .slice(0, 10);

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-slate-400" />
          Upcoming Events
        </h2>
        <button
          onClick={() => navigate('/attorney/calendar')}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          View Calendar <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {upcoming.length === 0 ? (
        <div className="py-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">No upcoming events</p>
          <button
            onClick={() => navigate('/attorney/calendar')}
            className="mt-3 text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Add an event →
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((e) => {
            const d = new Date(e.event_date);
            const diffDays = Math.ceil((d - today) / 86400000);
            const isUrgent = diffDays <= 1;
            const isSoon = diffDays <= 3;
            return (
              <div
                key={e.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition ${
                  isUrgent
                    ? 'border-red-200 bg-red-50'
                    : isSoon
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-100 bg-white hover:bg-slate-50'
                }`}
              >
                {/* Date badge */}
                <div className={`shrink-0 w-12 text-center rounded-lg p-1.5 ${
                  isUrgent ? 'bg-red-100' : isSoon ? 'bg-amber-100' : 'bg-slate-100'
                }`}>
                  <div className={`text-[10px] uppercase font-semibold ${
                    isUrgent ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-slate-500'
                  }`}>
                    {d.toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                  <div className={`text-lg font-bold ${
                    isUrgent ? 'text-red-700' : isSoon ? 'text-amber-700' : 'text-slate-900'
                  }`}>
                    {d.getDate()}
                  </div>
                </div>

                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${EVENT_DOT_COLORS[e.color] || EVENT_DOT_COLORS.blue}`} />
                    <span className="text-sm font-semibold text-slate-900 truncate">{e.title}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      isUrgent ? 'bg-red-200 text-red-800' : isSoon ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `${diffDays} days`}
                    </span>
                    <span>{EVENT_TYPE_LABELS[e.event_type] || 'Event'}</span>
                    {e.event_time && (
                      <>
                        <span>·</span>
                        <Clock className="h-3 w-3" />
                        <span>{e.event_time}</span>
                      </>
                    )}
                  </div>
                  {e.case_name && (
                    <div className="mt-0.5 text-xs text-slate-400 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> {e.case_name}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
