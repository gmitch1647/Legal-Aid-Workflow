import { useEffect, useState } from 'react';
import { AlertCircle, CreditCard, Loader2, Send, ShieldCheck, X } from 'lucide-react';
import { createPayoutInformationRequest } from '../lib/api';

export default function PayoutInformationRequestModal({ caseId, caseLabel, onClose, onSent }) {
  const [message, setMessage] = useState('Please provide your ACH payment information so the attorney can send your settlement proceeds securely.');
  const [dueDate, setDueDate] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [caseId]);

  async function sendRequest(event) {
    event.preventDefault();
    if (!caseId || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await createPayoutInformationRequest(caseId, {
        message: message.trim() || undefined,
        due_date: dueDate || null,
      });
      onSent?.(result);
    } catch (err) {
      setError(err.message || 'Could not send the secure payout-information request.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Request secure payout information">
      <form onSubmit={sendRequest} className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700"><CreditCard className="h-3.5 w-3.5" />Secure client payout form</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Request ACH payout information</h2>
            <p className="mt-1 text-sm text-slate-600">{caseLabel || 'Selected case'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Close payout request"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p>The client will receive a private, expiring email link that opens this secure form directly. No LegalFlow account or sign-in is required. The email does not contain ACH fields and never asks the client to reply with banking information.</p></div>
          <label className="block text-sm font-semibold text-slate-700">Message to client
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={2000} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">Requested by date <span className="font-normal text-slate-400">(optional)</span>
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
          </label>
          {error && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onClose} disabled={sending} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button disabled={sending || !caseId} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Sending secure form…' : 'Send secure payout form'}</button>
        </div>
      </form>
    </div>
  );
}
