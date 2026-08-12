import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, CreditCard, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { getPublicPayoutInformation, submitPublicPayoutInformation } from '../lib/api';

const EMPTY_FORM = {
  account_holder_name: '',
  account_ownership: '',
  account_type: 'checking',
  bank_name: '',
  routing_number: '',
  account_number: '',
  confirm_account_number: '',
  authorized: false,
};

function displayDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function PayoutInformationForm() {
  const { token } = useParams();
  const [formRequest, setFormRequest] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getPublicPayoutInformation(token)
      .then((data) => {
        if (!active) return;
        setFormRequest(data);
        setCompleted(data.status === 'completed');
      })
      .catch((err) => active && setError(err.message || 'This secure payout form is not available.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (form.account_number !== form.confirm_account_number) {
      setError('The account numbers do not match. Please review them before submitting.');
      return;
    }
    if (!form.authorized) {
      setError('Please confirm that the payment information is correct and authorized.');
      return;
    }
    setSubmitting(true);
    try {
      const { confirm_account_number, ...payload } = form;
      await submitPublicPayoutInformation(token, payload);
      setForm(EMPTY_FORM);
      setCompleted(true);
    } catch (err) {
      setError(err.message || 'Your payment information could not be submitted securely. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-emerald-700" /></div>;
  }

  if (error && !formRequest) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50"><AlertCircle className="h-7 w-7 text-red-600" /></div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Secure payout form unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
          <p className="mt-4 text-xs leading-5 text-slate-500">Please contact your LegalFlow team if you need a new secure link.</p>
        </section>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <section className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="h-8 w-8 text-emerald-700" /></div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Payout information submitted</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your ACH payment information has been submitted securely{formRequest?.account_number_last4 ? ` for the account ending in ${formRequest.account_number_last4}` : ''}. Your legal team will use it only to process your client payout.</p>
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-xs leading-5 text-emerald-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />Your routing and account numbers are not displayed in this confirmation and are not included in regular emails or case documents.</div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <section className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 px-6 py-7 text-white sm:px-8">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-white/10 p-2.5"><CreditCard className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">LegalFlow secure form</p><h1 className="mt-1 text-2xl font-bold">Payout information</h1><p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50">Provide ACH payment information securely so your legal team can prepare your client payout. No LegalFlow account or sign-in is required.</p></div></div>
        </header>

        <form onSubmit={submit} className="space-y-5 p-5 sm:p-8" autoComplete="off">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="font-semibold">Private one-time form</p><p className="mt-1">Your routing and account numbers are encrypted before storage. Do not reply to the email with banking information.</p></div></div>
          {formRequest?.message && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"><p className="font-semibold text-slate-900">Message from your legal team</p><p className="mt-1">{formRequest.message}</p>{formRequest.due_date && <p className="mt-2 text-xs text-slate-500">Requested by {displayDate(`${formRequest.due_date}T00:00:00`)}</p>}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Name shown on bank account <span className="text-red-600">*</span><input required value={form.account_holder_name} onChange={(event) => update('account_holder_name', event.target.value)} autoComplete="name" placeholder="Full legal name or business name" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
            <label className="text-sm font-semibold text-slate-700">Is this a personal or business account? <span className="text-red-600">*</span><select required value={form.account_ownership} onChange={(event) => update('account_ownership', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"><option value="" disabled>Select account ownership</option><option value="personal">Personal account</option><option value="business">Business account</option></select></label>
            <label className="text-sm font-semibold text-slate-700">Account type<select value={form.account_type} onChange={(event) => update('account_type', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"><option value="checking">Checking</option><option value="savings">Savings</option></select></label>
            <label className="text-sm font-semibold text-slate-700">Bank name <span className="font-normal text-slate-400">(optional)</span><input value={form.bank_name} onChange={(event) => update('bank_name', event.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
            <label className="text-sm font-semibold text-slate-700">Routing number<input required inputMode="numeric" pattern="[0-9]{9}" maxLength={9} value={form.routing_number} onChange={(event) => update('routing_number', event.target.value.replace(/\D/g, '').slice(0, 9))} type={showNumbers ? 'text' : 'password'} autoComplete="off" placeholder="9 digits" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
            <label className="text-sm font-semibold text-slate-700">Account number<input required inputMode="numeric" minLength={4} maxLength={17} value={form.account_number} onChange={(event) => update('account_number', event.target.value.replace(/\D/g, '').slice(0, 17))} type={showNumbers ? 'text' : 'password'} autoComplete="off" placeholder="Your account number" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
            <label className="text-sm font-semibold text-slate-700">Confirm account number<input required inputMode="numeric" minLength={4} maxLength={17} value={form.confirm_account_number} onChange={(event) => update('confirm_account_number', event.target.value.replace(/\D/g, '').slice(0, 17))} type={showNumbers ? 'text' : 'password'} autoComplete="off" placeholder="Re-enter account number" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={showNumbers} onChange={(event) => setShowNumbers(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />{showNumbers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showNumbers ? 'Hide' : 'Show'} routing and account numbers while typing</label>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700"><input required type="checkbox" checked={form.authorized} onChange={(event) => update('authorized', event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" /><span>I confirm that this payment information is correct and authorize my legal team to use it solely to send my client payout.</span></label>
          {error && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">{formRequest?.expires_at ? `This private link expires ${displayDate(formRequest.expires_at)}.` : 'This form is available only from your private email link.'}</p><button disabled={submitting || !form.authorized || !form.account_holder_name.trim() || !form.account_ownership} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? 'Submitting securely…' : 'Submit securely'}</button></div>
        </form>
      </section>
    </main>
  );
}
