import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Bell,
  PlusCircle,
  ChevronRight,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import { useAuth } from '../../App';
import { getCases, getNotifications, markNotificationRead } from '../../lib/api';
import { formatDistanceToNow, parseISO } from 'date-fns';

// ---------------------------------------------------------------------------
// Status stage mapping
// ---------------------------------------------------------------------------
const STAGES = ['Received', 'Being Reviewed', 'In Progress', 'Draft Ready', 'Completed'];

function mapStatusToStageIndex(status) {
  switch (status) {
    case 'submitted':
      return 0;
    case 'approved_for_processing':
      return 1;
    case 'agents_processing':
      return 2;
    case 'draft_ready':
    case 'attorney_review':
      return 3;
    case 'approved':
    case 'filed':
    case 'closed':
      return 4;
    default:
      return 0;
  }
}

function stageColor(stageIdx, activeIdx) {
  if (stageIdx < activeIdx) return 'bg-emerald-500';
  if (stageIdx === activeIdx) return 'bg-blue-500';
  return 'bg-slate-200';
}

function stageLabelColor(stageIdx, activeIdx) {
  if (stageIdx < activeIdx) return 'text-emerald-600 font-medium';
  if (stageIdx === activeIdx) return 'text-blue-600 font-semibold';
  return 'text-slate-400';
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------
function CaseProgressBar({ status }) {
  const activeIdx = mapStatusToStageIndex(status);

  return (
    <div className="mt-3">
      {/* Bar segments */}
      <div className="flex gap-1">
        {STAGES.map((stage, idx) => (
          <div
            key={stage}
            className={`h-2 flex-1 rounded-full transition-colors duration-300 ${stageColor(idx, activeIdx)}`}
          />
        ))}
      </div>
      {/* Labels */}
      <div className="mt-1.5 flex justify-between">
        {STAGES.map((stage, idx) => (
          <span
            key={stage}
            className={`text-[10px] sm:text-xs leading-tight text-center flex-1 ${stageLabelColor(idx, activeIdx)}`}
          >
            {stage}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Case Card
// ---------------------------------------------------------------------------
function CaseCard({ caseItem, onClick }) {
  const defendants =
    caseItem.defendants?.map((d) => d.name || d.defendant_name).join(', ') ||
    caseItem.defendant_names ||
    'Unknown Defendant';
  const submittedDate = caseItem.created_at
    ? formatDistanceToNow(parseISO(caseItem.created_at), { addSuffix: true })
    : '';

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900 truncate">{defendants}</h3>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            <span>Submitted {submittedDate}</span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </div>
      <CaseProgressBar status={caseItem.status} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Notification Item
// ---------------------------------------------------------------------------
function NotificationItem({ notification, onMarkRead }) {
  const isUnread = !notification.read && !notification.read_at;
  const timeAgo = notification.created_at
    ? formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true })
    : '';

  return (
    <div
      className={`flex items-start gap-3 rounded-lg px-4 py-3 transition-colors ${
        isUnread ? 'bg-blue-50 border-l-4 border-blue-500' : 'bg-white border-l-4 border-transparent'
      }`}
    >
      <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${isUnread ? 'text-blue-500' : 'text-slate-400'}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isUnread ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
          {notification.message || notification.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{timeAgo}</p>
      </div>
      {isUnread && (
        <button
          onClick={() => onMarkRead(notification.id)}
          className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          Mark read
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------
function EmptyState({ onSubmit }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-16 text-center">
      <Inbox className="mx-auto h-12 w-12 text-slate-300" />
      <h3 className="mt-4 text-lg font-semibold text-slate-700">
        You haven't submitted any cases yet
      </h3>
      <p className="mt-2 text-sm text-slate-500">
        Click below to get started. We'll walk you through the process step by step.
      </p>
      <button
        onClick={onSubmit}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <PlusCircle className="h-4 w-4" />
        Submit New Case
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------
export default function ClientDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const [casesRes, notifRes] = await Promise.all([getCases(), getNotifications()]);

        if (!mounted) return;

        const casesList = Array.isArray(casesRes) ? casesRes : casesRes?.items ?? casesRes?.results ?? [];
        const notifList = Array.isArray(notifRes) ? notifRes : notifRes?.items ?? notifRes?.results ?? [];

        setCases(casesList);
        setNotifications(notifList.slice(0, 10));
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleMarkRead(id) {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n))
      );
    } catch {
      // Non-critical
    }
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  // Loading state
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {firstName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track your cases and stay updated on their progress.
          </p>
        </div>
        <button
          onClick={() => navigate('/client/submit')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <PlusCircle className="h-4 w-4" />
          Submit New Case
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Cases Section */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Your Cases</h2>
            {cases.length > 0 && (
              <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {cases.length}
              </span>
            )}
          </div>

          {cases.length === 0 ? (
            <EmptyState onSubmit={() => navigate('/client/submit')} />
          ) : (
            <div className="space-y-4">
              {cases.map((c) => (
                <CaseCard
                  key={c.id}
                  caseItem={c}
                  onClick={() => navigate(`/client/cases/${c.id}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Notifications Panel */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">You're all caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkRead={handleMarkRead}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
