import { useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { submitPayoutInformation } from '../lib/api';

function statusLabel(status) {
  if (status === 'completed') return 'Submitted';
  if (status === 'cancelled') return 'Cancelled';
  return 'Action needed';
}

export default function ClientPayoutInformationCard({ requests, onSubmitted }) {
  const [formByRequest, setFormByRequest] = useState({});
  const [submittingId, setSubmittingId] = useState('');
  const [showNumbersByRequest, setShowNumbersByRequest] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeRequests = (requests || []).filter((item) => item.status !== 'cancelled');

  function currentForm(requestId) {
    return formByRequest[requestId] || {
      account_holder_name: '',
      account_ownership: '',
      account_type: 'checking',
      bank_name: '',
      routing_number: '',
      account_number: '',
      confirm_account_number: '',
      authorized: false,
    };
  }

  function update(requestId, field, value) {
    setFormByRequest((current) => ({
      ...current,
      [requestId]: { ...currentForm(requestId), [field]: value },
    }));
  }

  async function submit(event, payoutRequest) {
    event.preventDefault();
    const form = currentForm(payoutRequest.id);
    setError('');
    setSuccess('');
    if (!form.account_holder_name.trim()) {
      setError('Enter the name shown on the bank account.');
      return;
    }
    if (!form.account_ownership) {
      setError('Please select whether this is a personal or business account.');
      return;
    }
    if (form.account_number !== form.confirm_account_number) {
      setError('The account numbers do not match. Please review them before submitting.');
      return;
    }
    setSubmittingId(payoutRequest.id);
    try {
      const { confirm_account_number, ...submission } = form;
      const result = await submitPayoutInformation(payoutRequest.id, submission);
      setFormByRequest((current) => ({ ...current, [payoutRequest.id]: undefined }));
      setSuccess(`Your payment information was submitted securely. Your account ending in ${result.account_number_last4} is on file for this payout request.`);
      onSubmitted?.(payoutRequest.id, result);
    } catch (err) {
      setError(err.message || 'Your payout information could not be submitted securely. Please try again.');
    } finally {
      setSubmittingId('');
    }
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700"><CreditCard className="h-5 w-5" /></div>
        <div>
          <h2 className="font-semibold text-slate-900">Payout information</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">When your LegalFlow team asks for it, submit your ACH payment information here so the attorney can send your settlement proceeds.</p>
        </div>
      </div>

      {(error || success) && <div className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}{error || success}</div>}

      {activeRequests.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-emerald-200 bg-white/75 px-3 py-4 text-sm text-slate-500">There are no payout-information requests for this case right now.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {activeRequests.map((request) => {
            const form = currentForm(request.id);
            const isCompleted = request.status === 'completed';
            const showNumbers = Boolean(showNumbersByRequest[request.id]);
            return (
              <div key={request.id} className="rounded-xl border border-emerald-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">Secure ACH payment form</p>
                    {request.message && <p className="mt-1 text-sm text-slate-600">{request.message}</p>}
                    {request.due_date && <p className="mt-1 text-xs text-slate-500">Requested by {new Date(`${request.due_date}T00:00:00`).toLocaleDateString()}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{statusLabel(request.status)}</span>
                </div>

                {isCompleted ? (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Your payment information has been submitted securely{request.submission?.account_number_last4 ? ` for the account ending in ${request.submission.account_number_last4}` : ''}. Contact your legal team if anything changes.</span></div>
                ) : (
                  <form onSubmit={(event) => submit(event, request)} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" autoComplete="off">
                    <label className="sm:col-span-2 text-sm font-medium text-slate-700">Name shown on bank account <span className="text-red-600">*</span>
                      <input required value={form.account_holder_name} onChange={(event) => update(request.id, 'account_holder_name', event.target.value)} autoComplete="name" placeholder="Full legal name or business name" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">Is this a personal or business account? <span className="text-red-600">*</span>
                      <select required value={form.account_ownership} onChange={(event) => update(request.id, 'account_ownership', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"><option value="" disabled>Select account ownership</option><option value="personal">Personal account</option><option value="business">Business account</option></select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">Account type
                      <select value={form.account_type} onChange={(event) => update(request.id, 'account_type', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"><option value="checking">Checking</option><option value="savings">Savings</option></select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">Bank name <span className="font-normal text-slate-400">(optional)</span>
                      <input value={form.bank_name} onChange={(event) => update(request.id, 'bank_name', event.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">Routing number
                      <input required inputMode="numeric" pattern="[0-9]{9}" maxLength={9} value={form.routing_number} onChange={(event) => update(request.id, 'routing_number', event.target.value.replace(/\D/g, '').slice(0, 9))} type={showNumbers ? 'text' : 'password'} autoComplete="off" placeholder="9 digits" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">Account number
                      <input required inputMode="numeric" minLength={4} maxLength={17} value={form.account_number} onChange={(event) => update(request.id, 'account_number', event.target.value.replace(/\D/g, '').slice(0, 17))} type={showNumbers ? 'text' : 'password'} autoComplete="off" placeholder="Your bank account number" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">Confirm account number
                      <input required inputMode="numeric" minLength={4} maxLength={17} value={form.confirm_account_number} onChange={(event) => update(request.id, 'confirm_account_number', event.target.value.replace(/\D/g, '').slice(0, 17))} type={showNumbers ? 'text' : 'password'} autoComplete="off" placeholder="Re-enter account number" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                    </label>
                    <label className="sm:col-span-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={showNumbers} onChange={(event) => setShowNumbersByRequest((current) => ({ ...current, [request.id]: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />{showNumbers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showNumbers ? 'Hide' : 'Show'} routing and account numbers while typing</label>
                    <label className="sm:col-span-2 flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700"><input required type="checkbox" checked={form.authorized} onChange={(event) => update(request.id, 'authorized', event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" /><span>I confirm that this payment information is correct and authorize the attorney to use it solely to send my client payout.</span></label>
                    <div className="sm:col-span-2 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="flex max-w-xl items-start gap-2 text-xs leading-5 text-slate-500"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />Your routing and account numbers are encrypted before storage. Do not enter this information in messages or email.</p><button disabled={submittingId === request.id || !form.authorized || !form.account_holder_name.trim() || !form.account_ownership} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{submittingId === request.id && <Loader2 className="h-4 w-4 animate-spin" />}{submittingId === request.id ? 'Submitting securely…' : 'Submit securely'}</button></div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-white/70 p-3 text-xs leading-5 text-emerald-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />You can also use the private email link sent by your legal team—no LegalFlow account is required. Your account and routing numbers are not shown in emails or regular case documents.</div>
    </section>
  );
}
