import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  KeyRound,
  Loader2,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  cancelPayoutInformationRequest,
  createPayoutInformationRequest,
  getPayoutInformationRequests,
  revealPayoutInformation,
} from '../lib/api';

const STATUS_STYLE = {
  requested: 'bg-amber-50 text-amber-700 ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

function statusLabel(status) {
  if (status === 'completed') return 'Submitted';
  if (status === 'cancelled') return 'Cancelled';
  return 'Waiting on client';
}

export default function PayoutInformationPanel({ caseId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState('');
  const [revealingId, setRevealingId] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    message: 'Please provide your ACH payment information so the attorney can send your settlement proceeds securely.',
    due_date: '',
  });

  async function load() {
    if (!caseId) return;
    setLoading(true);
    try {
      const result = await getPayoutInformationRequests(caseId);
      setRequests(Array.isArray(result) ? result : result?.data || []);
    } catch (err) {
      setError(err.message || 'Could not load secure payout-information requests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [caseId]);

  async function sendRequest(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const created = await createPayoutInformationRequest(caseId, {
        message: form.message.trim() || undefined,
        due_date: form.due_date || null,
      });
      setRequests((current) => [created, ...current]);
      setShowComposer(false);
      setForm({
        message: 'Please provide your ACH payment information so the attorney can send your settlement proceeds securely.',
        due_date: '',
      });
      setSuccess('The secure payout-information form was sent to the client portal. The email contains only a login link, never banking fields.');
    } catch (err) {
      setError(err.message || 'Could not send the payout-information request.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelRequest(item) {
    if (!window.confirm('Cancel this payout-information request? The client will no longer be able to submit this form.')) return;
    setCancellingId(item.id);
    setError('');
    try {
      await cancelPayoutInformationRequest(item.id);
      setRequests((current) => current.map((request) => request.id === item.id ? { ...request, status: 'cancelled' } : request));
      setSuccess('The payout-information request was cancelled.');
    } catch (err) {
      setError(err.message || 'Could not cancel the payout-information request.');
    } finally {
      setCancellingId('');
    }
  }

  async function revealRequest(item) {
    if (!window.confirm('Reveal this client’s ACH routing and account number now? This access is recorded in LegalFlow’s private audit trail.')) return;
    setRevealingId(item.id);
    setError('');
    try {
      const data = await revealPayoutInformation(item.id);
      setRevealed({ ...data, requestId: item.id });
    } catch (err) {
      setError(err.message || 'Could not open payout information securely.');
    } finally {
      setRevealingId('');
    }
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><CreditCard className="h-5 w-5 text-emerald-700" /> Client payout information</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Send an authenticated portal form for ACH details. Account and routing numbers are encrypted, never placed in case documents, and revealed only through an audited action.</p>
        </div>
        <button onClick={() => { setShowComposer((open) => !open); setError(''); setSuccess(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
          {showComposer ? <X className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {showComposer ? 'Close' : 'Request payout information'}
        </button>
      </div>

      {showComposer && (
        <form onSubmit={sendRequest} className="mt-4 grid gap-3 rounded-lg border border-emerald-200 bg-white p-4 md:grid-cols-2">
          <label className="md:col-span-2 text-sm font-medium text-slate-700">Message to client
            <textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={3} maxLength={2000} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600" />
          </label>
          <label className="text-sm font-medium text-slate-700">Requested by date <span className="font-normal text-slate-400">(optional)</span>
            <input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600" />
          </label>
          <div className="flex items-end justify-end"><button disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Sending…' : 'Send secure form'}</button></div>
          <div className="md:col-span-2 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />The client receives a portal link, not an email form. Do not ask clients to reply with banking details by email or message.</div>
        </form>
      )}

      {(error || success) && <div className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}{error || success}</div>}

      <div className="mt-4 space-y-2">
        {loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading payout-information requests…</p> : requests.length === 0 ? <p className="rounded-lg border border-dashed border-emerald-200 bg-white/80 px-3 py-4 text-sm text-slate-500">No payout-information requests have been sent for this case.</p> : requests.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-100 bg-white p-3">
            {item.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Clock3 className="h-5 w-5 text-amber-500" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800">Secure ACH payout information</p>
              <p className="mt-0.5 text-sm text-slate-500">{item.status === 'completed' && item.submission ? `${item.submission.account_type === 'checking' ? 'Checking' : 'Savings'} account ending in ${item.submission.account_number_last4} · submitted ${item.submission.submitted_at ? new Date(item.submission.submitted_at).toLocaleDateString() : 'today'}` : item.due_date ? `Requested by ${new Date(`${item.due_date}T00:00:00`).toLocaleDateString()}` : 'Waiting for the client to complete the secure form.'}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_STYLE[item.status] || STATUS_STYLE.requested}`}>{statusLabel(item.status)}</span>
            {item.status === 'completed' && <button type="button" onClick={() => revealRequest(item)} disabled={revealingId === item.id} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60">{revealingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}View securely</button>}
            {item.status === 'requested' && <button type="button" onClick={() => cancelRequest(item)} disabled={cancellingId === item.id} className="text-xs font-semibold text-slate-500 hover:text-red-700 disabled:opacity-60">{cancellingId === item.id ? 'Cancelling…' : 'Cancel'}</button>}
          </div>
        ))}
      </div>

      {revealed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Secure payout information">
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700"><KeyRound className="h-3.5 w-3.5" />Audited secure view</p><h3 className="mt-1 text-lg font-bold text-slate-900">Client ACH payout details</h3></div>
              <button type="button" onClick={() => setRevealed(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close secure payout information"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Account holder</p><p className="mt-1 font-semibold text-slate-900">{revealed.account_holder_name}</p></div>
              <div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Account type</p><p className="mt-1 font-semibold capitalize text-slate-900">{revealed.account_type}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Bank</p><p className="mt-1 font-semibold text-slate-900">{revealed.bank_name || 'Not provided'}</p></div></div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">Routing number</p><p className="mt-1 font-mono text-base font-bold tracking-wide text-slate-950">{revealed.routing_number}</p></div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">Account number</p><p className="mt-1 font-mono text-base font-bold tracking-wide text-slate-950">{revealed.account_number}</p></div>
            </div>
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />This reveal was recorded in LegalFlow’s private audit trail. Do not copy these details into messages, notes, or ordinary case documents.</div>
            <div className="mt-5 flex justify-end"><button type="button" onClick={() => setRevealed(null)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Close secure view</button></div>
          </section>
        </div>
      )}
    </section>
  );
}
