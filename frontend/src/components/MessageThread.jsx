import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import { getMessages, sendMessage } from '../lib/api';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (diffDays === 0) return timeStr;
  if (diffDays === 1) return `Yesterday ${timeStr}`;
  if (diffDays < 7) {
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${timeStr}`;
  }
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${timeStr}`;
}

function groupMessagesByDate(messages) {
  const groups = [];
  let currentDate = null;

  for (const msg of messages) {
    const msgDate = new Date(msg.created_at || msg.sent_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groups.push({ type: 'date', label: msgDate });
    }

    groups.push({ type: 'message', data: msg });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message, isOwnMessage }) {
  const isUnread = !message.read && !message.read_at && !isOwnMessage;

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] sm:max-w-[65%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        {/* Sender name */}
        {!isOwnMessage && (
          <p className="mb-1 ml-1 text-xs font-medium text-slate-500">
            {message.sender_name || message.sender?.full_name || 'Unknown'}
          </p>
        )}

        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-4 py-2.5 ${
            isOwnMessage
              ? 'bg-primary-600 text-white'
              : isUnread
                ? 'bg-blue-50 text-slate-900 ring-1 ring-blue-200'
                : 'bg-slate-100 text-slate-900'
          } ${isOwnMessage ? 'rounded-br-md' : 'rounded-bl-md'}`}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body || message.content}</p>
        </div>

        {/* Timestamp */}
        <p
          className={`mt-1 text-[11px] ${
            isOwnMessage ? 'mr-1 text-right text-slate-400' : 'ml-1 text-slate-400'
          }`}
        >
          {formatMessageTime(message.created_at || message.sent_at)}
          {isUnread && (
            <span className="ml-2 inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
          )}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date Separator
// ---------------------------------------------------------------------------

function DateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <MessageSquare className="h-8 w-8 text-slate-400" />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-600">No messages yet.</p>
      <p className="mt-1 text-sm text-slate-400">
        Send a message to start the conversation.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MessageThread({ caseId, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    // Use a short delay to allow DOM to update
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    });
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!caseId) return;
    try {
      const data = await getMessages(caseId);
      const list = Array.isArray(data) ? data : data?.items ?? data?.messages ?? [];
      setMessages(list);
      setError(null);
    } catch (err) {
      // Only set error on initial load, not polling failures
      if (loading) {
        setError(err.message || 'Failed to load messages');
      }
    } finally {
      setLoading(false);
    }
  }, [caseId, loading]);

  // Initial fetch
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0 && !loading) {
      scrollToBottom(loading ? 'auto' : 'smooth');
    }
  }, [messages.length, loading, scrollToBottom]);

  // Supabase realtime subscription with polling fallback
  useEffect(() => {
    if (!caseId) return;

    let subscription;
    let useFallbackPolling = true;

    try {
      subscription = supabase
        .channel(`messages:case_id=eq.${caseId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `case_id=eq.${caseId}`,
          },
          (payload) => {
            if (payload.new) {
              setMessages((prev) => {
                // Avoid duplicates
                const exists = prev.some((m) => m.id === payload.new.id);
                if (exists) return prev;
                return [...prev, payload.new];
              });
              scrollToBottom();
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            useFallbackPolling = false;
            // Clear polling if realtime is working
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        });
    } catch {
      // Realtime not available, use polling
    }

    // Fallback: poll every 10 seconds
    pollIntervalRef.current = setInterval(() => {
      if (useFallbackPolling) {
        fetchMessages();
      }
    }, 10000);

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [caseId, fetchMessages, scrollToBottom]);

  // Send message handler
  const handleSend = useCallback(async () => {
    const body = newMessage.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    // Optimistic update
    const optimisticMsg = {
      id: `optimistic_${Date.now()}`,
      case_id: caseId,
      sender_id: currentUserId,
      sender_name: 'You',
      body,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage('');
    scrollToBottom();

    try {
      const result = await sendMessage(caseId, body);
      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...optimisticMsg, ...result, _optimistic: false }
            : m
        )
      );
    } catch (err) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setError(err.message || 'Failed to send message');
      setNewMessage(body); // Restore the message
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [newMessage, sending, caseId, currentUserId, scrollToBottom]);

  // Handle enter key (send on Enter, newline on Shift+Enter)
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  const handleTextareaChange = useCallback((e) => {
    setNewMessage(e.target.value);
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  const groupedItems = groupMessagesByDate(messages);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <MessageSquare className="h-5 w-5 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">Messages</h3>
        {messages.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {messages.length}
          </span>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-5 py-4"
        style={{ minHeight: '300px', maxHeight: '500px' }}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {groupedItems.map((item, idx) => {
              if (item.type === 'date') {
                return <DateSeparator key={`date-${idx}`} label={item.label} />;
              }

              const msg = item.data;
              const isOwnMessage =
                msg.sender_id === currentUserId || msg._optimistic;

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwnMessage={isOwnMessage}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-xs text-red-600 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-slate-200 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
