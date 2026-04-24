import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  Trash2,
  Loader2,
  Calendar as CalendarIcon,
  Clock,
  AlertCircle,
  Scale,
  FileText,
  Briefcase,
} from 'lucide-react';
import {
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCases,
} from '../../lib/api';

const EVENT_TYPES = [
  { value: 'deadline', label: 'Deadline', color: 'red' },
  { value: 'hearing', label: 'Hearing', color: 'purple' },
  { value: 'filing', label: 'Filing Date', color: 'blue' },
  { value: 'discovery_cutoff', label: 'Discovery Cutoff', color: 'amber' },
  { value: 'deposition', label: 'Deposition', color: 'indigo' },
  { value: 'mediation', label: 'Mediation', color: 'teal' },
  { value: 'trial', label: 'Trial', color: 'red' },
  { value: 'conference', label: 'Conference', color: 'cyan' },
  { value: 'statute_of_limitations', label: 'Statute of Limitations', color: 'red' },
  { value: 'reminder', label: 'Reminder', color: 'slate' },
  { value: 'other', label: 'Other', color: 'slate' },
];

const EVENT_COLORS = {
  red: 'bg-red-100 text-red-700 border-red-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const DOT_COLORS = {
  red: 'bg-red-500', purple: 'bg-purple-500', blue: 'bg-blue-500',
  amber: 'bg-amber-500', indigo: 'bg-indigo-500', teal: 'bg-teal-500',
  cyan: 'bg-cyan-500', slate: 'bg-slate-400', green: 'bg-green-500',
  emerald: 'bg-emerald-500',
};

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formType, setFormType] = useState('deadline');
  const [formCaseId, setFormCaseId] = useState('');
  const [formColor, setFormColor] = useState('blue');
  const [saving, setSaving] = useState(false);

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsData, casesData] = await Promise.all([
        getCalendarEvents(monthStr),
        getCases().catch(() => []),
      ]);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      const casesList = Array.isArray(casesData) ? casesData : casesData?.data || [];
      setCases(casesList);
    } catch (err) {
      console.error('Failed to load calendar:', err);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => { loadData(); }, [loadData]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  }

  function openAddEvent(date = null) {
    setEditingEvent(null);
    setFormTitle('');
    setFormDesc('');
    setFormDate(date || `${year}-${String(month+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`);
    setFormTime('');
    setFormType('deadline');
    setFormCaseId('');
    setFormColor('blue');
    setShowAddEvent(true);
  }

  function openEditEvent(event) {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDesc(event.description || '');
    setFormDate(event.event_date);
    setFormTime(event.event_time || '');
    setFormType(event.event_type);
    setFormCaseId(event.case_id || '');
    setFormColor(event.color || 'blue');
    setShowAddEvent(true);
  }

  async function handleSaveEvent() {
    if (!formTitle.trim() || !formDate) return;
    setSaving(true);
    try {
      const data = {
        title: formTitle.trim(),
        description: formDesc.trim() || null,
        event_date: formDate,
        event_time: formTime || null,
        event_type: formType,
        case_id: formCaseId || null,
        color: EVENT_TYPES.find(t => t.value === formType)?.color || formColor,
      };
      if (editingEvent) {
        await updateCalendarEvent(editingEvent.id, data);
      } else {
        await createCalendarEvent(data);
      }
      setShowAddEvent(false);
      await loadData();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(id) {
    if (!window.confirm('Delete this event?')) return;
    try {
      await deleteCalendarEvent(id);
      await loadData();
      setSelectedDate(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function handleToggleComplete(event) {
    try {
      await updateCalendarEvent(event.id, { is_completed: !event.is_completed });
      await loadData();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  function getEventsForDay(day) {
    if (!day) return [];
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => e.event_date === dateStr);
  }

  const selectedDateStr = selectedDate ? `${year}-${String(month+1).padStart(2,'0')}-${String(selectedDate).padStart(2,'0')}` : null;
  const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  // Upcoming events (next 14 days from today)
  const upcomingEvents = events
    .filter(e => {
      const d = new Date(e.event_date);
      const diff = (d - today) / 86400000;
      return diff >= -1 && diff <= 14 && !e.is_completed;
    })
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  const isToday = (day) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500 mt-1">Case deadlines, hearings, and important dates</p>
        </div>
        <button
          onClick={() => openAddEvent()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" /> Add Event
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Calendar grid */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition">
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </button>
            <h2 className="text-lg font-bold text-slate-900">{monthNames[month]} {year}</h2>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition">
              <ChevronRight className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 uppercase py-2">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              const dayEvents = getEventsForDay(day);
              const isSelected = day === selectedDate;
              return (
                <div
                  key={i}
                  onClick={() => day && setSelectedDate(day === selectedDate ? null : day)}
                  className={`min-h-[80px] rounded-lg p-1.5 text-sm cursor-pointer transition border ${
                    !day ? 'bg-transparent border-transparent cursor-default' :
                    isSelected ? 'bg-blue-50 border-blue-300' :
                    isToday(day) ? 'bg-emerald-50 border-emerald-200' :
                    'bg-white border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  {day && (
                    <>
                      <div className={`text-xs font-semibold mb-1 ${
                        isToday(day) ? 'text-emerald-700' : 'text-slate-700'
                      }`}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map(e => (
                          <div
                            key={e.id}
                            className={`text-[9px] px-1 py-0.5 rounded truncate border ${
                              EVENT_COLORS[e.color] || EVENT_COLORS.blue
                            } ${e.is_completed ? 'line-through opacity-50' : ''}`}
                          >
                            {e.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[9px] text-slate-400 px-1">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Selected day events */}
          {selectedDate && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 text-sm">
                  {monthNames[month]} {selectedDate}, {year}
                </h3>
                <button
                  onClick={() => openAddEvent(selectedDateStr)}
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No events this day</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map(e => (
                    <div key={e.id} className={`rounded-lg border p-3 ${EVENT_COLORS[e.color] || EVENT_COLORS.blue}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold ${e.is_completed ? 'line-through opacity-60' : ''}`}>
                            {e.title}
                          </div>
                          {e.event_time && (
                            <div className="text-xs mt-0.5 flex items-center gap-1 opacity-70">
                              <Clock className="h-3 w-3" /> {e.event_time}
                            </div>
                          )}
                          {e.case_name && (
                            <div className="text-xs mt-0.5 flex items-center gap-1 opacity-70">
                              <Briefcase className="h-3 w-3" /> {e.case_name}
                            </div>
                          )}
                          {e.description && <p className="text-xs mt-1 opacity-80">{e.description}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => handleToggleComplete(e)} className="p-1 hover:bg-white/50 rounded" title={e.is_completed ? 'Mark incomplete' : 'Mark complete'}>
                            <Check className={`h-3.5 w-3.5 ${e.is_completed ? 'text-green-600' : 'opacity-40'}`} />
                          </button>
                          <button onClick={() => openEditEvent(e)} className="p-1 hover:bg-white/50 rounded">
                            <FileText className="h-3.5 w-3.5 opacity-50" />
                          </button>
                          <button onClick={() => handleDeleteEvent(e.id)} className="p-1 hover:bg-white/50 rounded">
                            <Trash2 className="h-3.5 w-3.5 opacity-50" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upcoming events */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Upcoming ({upcomingEvents.length})
            </h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No upcoming events</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map(e => {
                  const d = new Date(e.event_date);
                  const diffDays = Math.ceil((d - today) / 86400000);
                  const urgency = diffDays <= 1 ? 'text-red-600 font-bold' : diffDays <= 3 ? 'text-amber-600 font-semibold' : 'text-slate-600';
                  return (
                    <div key={e.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${DOT_COLORS[e.color] || DOT_COLORS.blue}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-900 truncate">{e.title}</div>
                        <div className={`text-[10px] ${urgency}`}>
                          {diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`}
                          {' · '}{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                        {e.case_name && <div className="text-[10px] text-slate-400">{e.case_name}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Event Modal */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {editingEvent ? 'Edit Event' : 'Add Event'}
              </h2>
              <button onClick={() => setShowAddEvent(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Discovery deadline — Equifax"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {EVENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Link to Case</label>
                <select
                  value={formCaseId}
                  onChange={(e) => setFormCaseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">— No case (general) —</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.plaintiff_name || c.client_name || 'Case'} — {c.status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setShowAddEvent(false)} className="px-4 py-2 text-sm text-slate-600">
                Cancel
              </button>
              <button
                onClick={handleSaveEvent}
                disabled={!formTitle.trim() || !formDate || saving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {editingEvent ? 'Update' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
