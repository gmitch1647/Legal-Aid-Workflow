import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, FilePlus2, Send, X } from 'lucide-react';
import { cancelDocumentRequest, createDocumentRequest, getDocumentRequests } from '../lib/api';

const STATUS_STYLE = {
  requested: 'bg-amber-50 text-amber-700 ring-amber-200',
  uploaded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default function DocumentRequestPanel({ caseId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', due_date: '' });

  const load = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const result = await getDocumentRequests(caseId);
      setRequests(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err?.message || 'Could not load document requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [caseId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const created = await createDocumentRequest(caseId, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
      });
      setRequests((current) => [created, ...current]);
      setForm({ title: '', description: '', due_date: '' });
      setShowForm(false);
    } catch (err) {
      setError(err?.message || 'Could not send the document request.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (requestId) => {
    if (!window.confirm('Cancel this document request? The client will no longer be able to upload to it.')) return;
    try {
      await cancelDocumentRequest(requestId);
      setRequests((current) => current.map((item) => item.id === requestId ? { ...item, status: 'cancelled' } : item));
    } catch (err) {
      setError(err?.message || 'Could not cancel the document request.');
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><FilePlus2 className="h-5 w-5 text-primary-600" /> Document requests</h2>
          <p className="mt-1 text-sm text-slate-500">Request files from this client and let them upload securely from their case portal.</p>
        </div>
        <button onClick={() => setShowForm((open) => !open)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800">
          {showForm ? <X className="h-4 w-4" /> : <Send className="h-4 w-4" />} {showForm ? 'Close' : 'Request document'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mt-4 grid gap-3 rounded-lg border border-primary-100 bg-primary-50/40 p-4 md:grid-cols-2">
          <label className="md:col-span-2 text-sm font-medium text-slate-700">What do you need?
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Example: Copy of your driver’s license" required className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500" />
          </label>
          <label className="md:col-span-2 text-sm font-medium text-slate-700">Instructions for the client
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Explain what to upload and any required details." className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500" />
          </label>
          <label className="text-sm font-medium text-slate-700">Requested by date
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500" />
          </label>
          <div className="flex items-end justify-end"><button disabled={saving} className="rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60">{saving ? 'Sending…' : 'Send request to client'}</button></div>
        </form>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-2">
        {loading ? <p className="text-sm text-slate-500">Loading requests…</p> : requests.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">No requested documents for this case yet.</p> : requests.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
            {item.status === 'uploaded' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Clock3 className="h-5 w-5 text-amber-500" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800">{item.title}</p>
              {item.description && <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>}
              {item.due_date && <p className="mt-1 text-xs text-slate-400">Requested by {new Date(`${item.due_date}T00:00:00`).toLocaleDateString()}</p>}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_STYLE[item.status] || STATUS_STYLE.requested}`}>{item.status === 'uploaded' ? 'Uploaded' : item.status === 'cancelled' ? 'Cancelled' : 'Waiting on client'}</span>
            {item.status === 'requested' && <button onClick={() => cancel(item.id)} className="text-xs font-medium text-slate-500 hover:text-red-600">Cancel</button>}
          </div>
        ))}
      </div>
    </section>
  );
}
