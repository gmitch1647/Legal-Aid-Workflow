import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, DollarSign, LockKeyhole, Plus, Save, WalletCards } from 'lucide-react';
import {
  createSettlementPayoutLedger,
  getCases,
  getSettlementPayoutLedgers,
  getSettlementPayouts,
  recordSettlementPayout,
  updateSettlementPayoutLedger,
} from '../../lib/api';

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);

export default function AttorneyPayouts() {
  const [ledgers, setLedgers] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ case_id: '', settlement_amount: '', court_costs: '', attorney_paid_costs: '', percentage: '35', notes: '' });
  const [openLedgerId, setOpenLedgerId] = useState(null);
  const [payments, setPayments] = useState({});
  const [paymentForms, setPaymentForms] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [ledgerData, caseData] = await Promise.all([getSettlementPayoutLedgers(), getCases()]);
      setLedgers(Array.isArray(ledgerData) ? ledgerData : []);
      setCases(Array.isArray(caseData) ? caseData : []);
    } catch (err) {
      setError(err?.message || 'Could not load private payout tracking.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => ledgers.reduce((summary, item) => ({
    expected: summary.expected + Number(item.expected_amount || 0),
    received: summary.received + Number(item.received_amount || 0),
    outstanding: summary.outstanding + Number(item.outstanding_amount || 0),
  }), { expected: 0, received: 0, outstanding: 0 }), [ledgers]);

  const createLedger = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.case_id || form.settlement_amount === '') return;
    setSaving(true);
    try {
      await createSettlementPayoutLedger({
        case_id: form.case_id,
        settlement_amount: Number(form.settlement_amount),
        court_costs: Number(form.court_costs || 0),
        attorney_paid_costs: Number(form.attorney_paid_costs || 0),
        percentage: Number(form.percentage || 0),
        notes: form.notes || null,
      });
      setForm({ case_id: '', settlement_amount: '', court_costs: '', attorney_paid_costs: '', percentage: '35', notes: '' });
      await load();
    } catch (err) {
      setError(err?.message || 'Could not create the private payout record.');
    } finally {
      setSaving(false);
    }
  };

  const saveLedger = async (ledger) => {
    setError('');
    try {
      const updated = await updateSettlementPayoutLedger(ledger.id, {
        settlement_amount: Number(ledger.settlement_amount || 0),
        court_costs: Number(ledger.court_costs || 0),
        attorney_paid_costs: Number(ledger.attorney_paid_costs || 0),
        percentage: Number(ledger.percentage || 0),
        notes: ledger.notes || null,
      });
      setLedgers((current) => current.map((item) => item.id === ledger.id ? { ...item, ...updated } : item));
      await load();
    } catch (err) {
      setError(err?.message || 'Could not update the payout calculation.');
    }
  };

  const openPayments = async (ledgerId) => {
    if (openLedgerId === ledgerId) {
      setOpenLedgerId(null);
      return;
    }
    setOpenLedgerId(ledgerId);
    setError('');
    try {
      const result = await getSettlementPayouts(ledgerId);
      setPayments((current) => ({ ...current, [ledgerId]: Array.isArray(result) ? result : [] }));
      setPaymentForms((current) => ({ ...current, [ledgerId]: current[ledgerId] || { amount: '', paid_on: today(), payment_method: '', reference: '', notes: '' } }));
    } catch (err) {
      setError(err?.message || 'Could not load payout history.');
    }
  };

  const addPayment = async (ledgerId) => {
    const payment = paymentForms[ledgerId];
    if (!payment?.amount || !payment?.paid_on) return;
    setError('');
    try {
      const created = await recordSettlementPayout(ledgerId, { ...payment, amount: Number(payment.amount) });
      setPayments((current) => ({ ...current, [ledgerId]: [created, ...(current[ledgerId] || [])] }));
      setPaymentForms((current) => ({ ...current, [ledgerId]: { amount: '', paid_on: today(), payment_method: '', reference: '', notes: '' } }));
      await load();
    } catch (err) {
      setError(err?.message || 'Could not record this payout.');
    }
  };

  const updateLedgerField = (id, field, value) => setLedgers((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const updatePaymentField = (id, field, value) => setPaymentForms((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><Calculator className="h-6 w-6 text-primary-600" /> Attorney Payouts</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Private tracking for your own arrangement with the attorney. This is separate from client settlement figures, Closing Statements, and client access.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"><LockKeyhole className="h-3.5 w-3.5" /> Only visible to you</span>
      </div>

        <div className="grid gap-4 md:grid-cols-3">
        {[['Expected share after costs', totals.expected, 'text-primary-700'], ['Received from attorney', totals.received, 'text-emerald-700'], ['Still outstanding', totals.outstanding, 'text-amber-700']].map(([label, amount, style]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${style}`}>{money(amount)}</p></div>)}
      </div>

      <form onSubmit={createLedger} className="rounded-xl border border-primary-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-5 w-5 text-primary-600" /><h2 className="font-semibold text-slate-900">Add settlement payout calculation</h2></div>
        <p className="mb-4 text-sm text-slate-500">Enter the settlement, court costs, and costs paid out to the attorney. LegalFlow subtracts both costs first, then applies your editable percentage to the remaining amount.</p>
        <div className="grid gap-4 md:grid-cols-5">
          <label className="md:col-span-2 text-sm font-medium text-slate-700">Case<select required value={form.case_id} onChange={(e) => setForm({ ...form, case_id: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Select a case</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.case_number || item.plaintiff_name || `Case ${item.id.slice(0, 8)}`}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Settlement amount<input type="number" min="0" step="0.01" required value={form.settlement_amount} onChange={(e) => setForm({ ...form, settlement_amount: e.target.value })} placeholder="0.00" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="text-sm font-medium text-slate-700">Court costs<input type="number" min="0" step="0.01" value={form.court_costs} onChange={(e) => setForm({ ...form, court_costs: e.target.value })} placeholder="0.00" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="text-sm font-medium text-slate-700">Costs paid to attorney<input type="number" min="0" step="0.01" value={form.attorney_paid_costs} onChange={(e) => setForm({ ...form, attorney_paid_costs: e.target.value })} placeholder="0.00" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <label className="text-sm font-medium text-slate-700">Your percentage<input type="number" min="0" max="100" step="0.01" required value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><span className="mt-1 block text-xs text-slate-400">Defaults to 35%; editable per case.</span></label>
          <label className="md:col-span-3 text-sm font-medium text-slate-700">Private notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional arrangement or payment notes" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <div className="flex items-end"><button disabled={saving} className="w-full rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60">{saving ? 'Saving…' : 'Create calculation'}</button></div>
        </div>
      </form>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Your private payout records</h2></div>
        {loading ? <p className="p-5 text-sm text-slate-500">Loading payout records…</p> : ledgers.length === 0 ? <p className="p-5 text-sm text-slate-500">No private settlement payout calculations yet.</p> : <div className="divide-y divide-slate-100">{ledgers.map((ledger) => (
          <div key={ledger.id} className="p-5">
            <div className="grid gap-3 md:grid-cols-6 md:items-end">
              <div className="md:col-span-2"><p className="font-semibold text-slate-900">{ledger.case_name}</p><p className="mt-1 text-xs text-slate-500">Net to split {money(ledger.net_split_amount)} · Expected {money(ledger.expected_amount)} · Received {money(ledger.received_amount)} · Outstanding {money(ledger.outstanding_amount)}</p></div>
              <label className="text-xs font-medium text-slate-600">Settlement amount<input type="number" min="0" step="0.01" value={ledger.settlement_amount ?? ''} onChange={(e) => updateLedgerField(ledger.id, 'settlement_amount', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Court costs<input type="number" min="0" step="0.01" value={ledger.court_costs ?? ''} onChange={(e) => updateLedgerField(ledger.id, 'court_costs', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Attorney costs<input type="number" min="0" step="0.01" value={ledger.attorney_paid_costs ?? ''} onChange={(e) => updateLedgerField(ledger.id, 'attorney_paid_costs', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Your percentage<input type="number" min="0" max="100" step="0.01" value={ledger.percentage ?? ''} onChange={(e) => updateLedgerField(ledger.id, 'percentage', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
              <button onClick={() => saveLedger(ledger)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Save className="h-4 w-4" /> Save calculation</button>
              <button onClick={() => openPayments(ledger.id)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"><WalletCards className="h-4 w-4" /> Payouts {openLedgerId === ledger.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
            </div>
            {openLedgerId === ledger.id && <div className="mt-4 rounded-lg bg-slate-50 p-4"><h3 className="font-medium text-slate-800">Record amount received from attorney</h3><div className="mt-3 grid gap-3 md:grid-cols-5"><input type="number" min="0" step="0.01" placeholder="Amount received" value={paymentForms[ledger.id]?.amount || ''} onChange={(e) => updatePaymentField(ledger.id, 'amount', e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /><input type="date" value={paymentForms[ledger.id]?.paid_on || today()} onChange={(e) => updatePaymentField(ledger.id, 'paid_on', e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /><input placeholder="Method" value={paymentForms[ledger.id]?.payment_method || ''} onChange={(e) => updatePaymentField(ledger.id, 'payment_method', e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /><input placeholder="Reference" value={paymentForms[ledger.id]?.reference || ''} onChange={(e) => updatePaymentField(ledger.id, 'reference', e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /><button onClick={() => addPayment(ledger.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Record payout</button></div><div className="mt-3 space-y-2">{(payments[ledger.id] || []).length === 0 ? <p className="text-sm text-slate-500">No payments recorded yet.</p> : (payments[ledger.id] || []).map((payment) => <div key={payment.id} className="flex justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><span>{new Date(`${payment.paid_on}T00:00:00`).toLocaleDateString()} {payment.payment_method ? `· ${payment.payment_method}` : ''}</span><span className="font-semibold text-emerald-700">{money(payment.amount)}</span></div>)}</div></div>}
          </div>
        ))}</div>}
      </section>
    </div>
  );
}
