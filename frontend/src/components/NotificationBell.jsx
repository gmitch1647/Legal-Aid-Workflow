import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  FileText,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Scale,
  Clock,
  X,
} from 'lucide-react';
import { getNotifications, markNotificationRead } from '../lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getNotificationIcon(type) {
  switch (type) {
    case 'case_submitted':
    case 'new_case':
      return { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-100' };
    case 'message':
    case 'new_message':
      return { icon: MessageSquare, color: 'text-purple-500', bg: 'bg-purple-100' };
    case 'case_approved':
    case 'approved':
      return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' };
    case 'case_denied':
    case 'error':
      return { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100' };
    case 'draft_ready':
    case 'complaint_ready':
      return { icon: Scale, color: 'text-amber-500', bg: 'bg-amber-100' };
    case 'status_update':
    case 'pipeline_update':
      return { icon: Clock, color: 'text-cyan-500', bg: 'bg-cyan-100' };
    default:
      return { icon: Bell, color: 'text-slate-500', bg: 'bg-slate-100' };
  }
}

// ---------------------------------------------------------------------------
// Notification Item
// ---------------------------------------------------------------------------

function NotificationItem({ notification, onRead, onNavigate }) {
  const isUnread = !notification.read && !notification.read_at;
  const { icon: Icon, color, bg } = getNotificationIcon(notification.type || notification.notification_type);

  const handleClick = () => {
    if (isUnread) {
      onRead(notification.id);
    }
    // Navigate to the relevant case if case_id is present
    if (notification.case_id) {
      onNavigate(notification.case_id);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
        isUnread ? 'bg-primary-50/50' : ''
      }`}
    >
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${isUnread ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
          {notification.message || notification.title || notification.body}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {relativeTime(notification.created_at)}
        </p>
      </div>
      {isUnread && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const unreadCount = notifications.filter(
    (n) => !n.read && !n.read_at
  ).length;

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      const items = Array.isArray(data) ? data : data?.items ?? data?.notifications ?? [];
      setNotifications(items.slice(0, 20)); // Keep most recent 20
    } catch {
      // Non-critical - notifications will try again on next poll
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));
  }, [fetchNotifications]);

  // Poll every 30 seconds
  useEffect(() => {
    pollIntervalRef.current = setInterval(fetchNotifications, 30000);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open]);

  // Mark single notification as read
  const handleMarkRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n
        )
      );
    } catch {
      // Non-critical
    }
  }, []);

  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read && !n.read_at);
    try {
      await Promise.all(unread.map((n) => markNotificationRead(n.id)));
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch {
      // Non-critical
    }
  }, [notifications]);

  // Navigate to case
  const handleNavigate = useCallback(
    (caseId) => {
      setOpen(false);
      // Attempt to navigate - the App.jsx routing will handle role-based paths
      navigate(`/attorney/cases/${caseId}`);
    },
    [navigate]
  );

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {unreadCount} new
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-primary-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={handleMarkRead}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Panel footer */}
          {notifications.length > 0 && unreadCount > 0 && (
            <div className="border-t border-slate-100 px-4 py-2.5">
              <button
                onClick={handleMarkAllRead}
                className="w-full rounded-lg py-1.5 text-center text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
