import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Plus,
  X,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  createCommission,
  getAllPayoutInformationRequests,
  getCommissions,
  getReferralPartners,
  getCases,
  getSettlementPayoutLedgers,
  markCommissionPaid,
  markPayoutPaymentSent,
  updateCommission,
  updateSettlementPayoutLedger,
} from '../../lib/api';

const money = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const number = (value) => Number(value || 0);
const withTimeout = (promise, milliseconds = 12000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Payout data request timed out.')), milliseconds))]);

function MetricCard({ label, amount, detail, tone = 'slate', icon: Icon }) {
  const colors = {
    slate: 'border-slate-200 bg-white text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50/50 text-amber-900',
    indigo: 'border-indigo-200 bg-indigo-50/50 text-indigo-900',
  };
  const iconColors = { slate: 'bg-slate-100 text-slate-700', emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-700', indigo: 'bg-indigo-100 text-indigo-700' };
  return <article className={`rounded-2xl border p-4 shadow-sm ${colors[tone]}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium opacity-75">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{money(amount)}</p></div><div className={`rounded-xl p-2.5 ${iconColors[tone]}`}><Icon className="h-5 w-5" /></div></div>
    <p className="mt-2 text-xs leading-5 opacity-75">{detail}</p>
  </article>;
}

function StatusPill({ state }) {
  const styles = {
    'Payment sent': 'bg-emerald-100 text-emerald-800',
    'Released to attorney': 'bg-indigo-100 text-indigo-800',
    'Banking form submitted': 'bg-sky-100 text-sky-800',
    'Banking form requested': 'bg-amber-100 text-amber-800',
    'No banking form': 'bg-slate-100 text-slate-600',
    'Referral paid': 'bg-emerald-100 text-emerald-800',
    'Referral payable': 'bg-amber-100 text-amber-800',
    'No referral payout': 'bg-slate-100 text-slate-600',
  };
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${styles[state] || 'bg-slate-100 text-slate-600'}`}>{state}</span>;
}

export default function PayoutOverview() {
  const navigate = useNavigate();
  const [ledgers, setLedgers] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [partners, setPartners] = useState([]);
  const [cases, setCases] = useState([]);
  const [bankingForms, setBankingForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [showAddReferral, setShowAddReferral] = useState(false);
  const [creatingReferral, setCreatingReferral] = useState(false);
  const [newReferral, setNewReferral] = useState({ referral_partner_id: '', case_id: '', client_id: '', description: '', settlement_amount: '', fee_type: 'percentage', fee_value: '', notes: '' });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled([
        withTimeout(getSettlementPayoutLedgers()),
        withTimeout(getCommissions()),
        withTimeout(getReferralPartners()),
        withTimeout(getCases()),
        withTimeout(getAllPayoutInformationRequests()),
      ]);
      const [ledgerResult, commissionResult, partnerResult, caseResult, bankingResult] = results;
      setLedgers(ledgerResult.status === 'fulfilled' && Array.isArray(ledgerResult.value) ? ledgerResult.value : []);
      setCommissions(commissionResult.status === 'fulfilled' && Array.isArray(commissionResult.value) ? commissionResult.value : []);
      setPartners(partnerResult.status === 'fulfilled' && Array.isArray(partnerResult.value) ? partnerResult.value : []);
      setCases(caseResult.status === 'fulfilled' && Array.isArray(caseResult.value) ? caseResult.value : []);
      setBankingForms(bankingResult.status === 'fulfilled' && Array.isArray(bankingResult.value) ? bankingResult.value : []);
      if (results.some((result) => result.status === 'rejected')) setError('Some payout data could not be loaded. Available payout records remain editable; use Refresh to retry.');
    } catch (err) {
      setError(err?.message || 'Could not load the payout overview.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const data = useMemo(() => {
    const grossSettlements = ledgers.reduce((sum, item) => sum + number(item.settlement_amount), 0);
    const clientPlanned = ledgers.reduce((sum, item) => sum + number(item.client_payouts), 0);
    const attorneyRemainder = ledgers.reduce((sum, item) => sum + number(item.attorney_remainder), 0);
    const ownerExpected = ledgers.reduce((sum, item) => sum + number(item.expected_amount), 0);
    const ownerReceived = ledgers.reduce((sum, item) => sum + number(item.received_amount), 0);
    const ownerOutstanding = ledgers.reduce((sum, item) => sum + number(item.outstanding_amount), 0);
    const referralPaid = commissions.filter((item) => item.status === 'paid').reduce((sum, item) => sum + number(item.commission_amount), 0);
    const referralPayable = commissions.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + number(item.commission_amount), 0);
    const formsMarkedPaid = bankingForms.filter((item) => item.payment_access?.status === 'payment_marked_sent');
    const clientPaidRecorded = formsMarkedPaid.reduce((sum, item) => sum + number(item.payment_access?.payment_amount), 0);
    const actionCount = commissions.filter((item) => item.status !== 'paid').length
      + bankingForms.filter((item) => item.status === 'completed' && item.payment_access?.status !== 'payment_marked_sent').length
      + ledgers.filter((item) => number(item.outstanding_amount) > 0).length;

    const rows = new Map();
    const getRow = (caseId, fallbackKey) => {
      const key = caseId || fallbackKey;
      if (!rows.has(key)) rows.set(key, {
        key,
        case_id: caseId || null,
        case_name: 'Unassigned case',
        client_name: 'Client not recorded',
        settlement: 0,
        client_amount: 0,
        client_status: 'No banking form',
        referral_amount: 0,
        referral_status: 'No referral payout',
        owner_expected: 0,
        owner_received: 0,
        owner_outstanding: 0,
        attorney_remainder: 0,
        ledger_id: null,
        commission: null,
        client_form: null,
      });
      return rows.get(key);
    };

    ledgers.forEach((ledger) => {
      const row = getRow(ledger.case_id, `ledger-${ledger.id}`);
      row.case_name = ledger.case_name || row.case_name;
      row.settlement = number(ledger.settlement_amount);
      row.client_amount = number(ledger.client_payouts);
      row.owner_expected = number(ledger.expected_amount);
      row.owner_received = number(ledger.received_amount);
      row.owner_outstanding = number(ledger.outstanding_amount);
      row.attorney_remainder = number(ledger.attorney_remainder);
      row.ledger_id = ledger.id;
      row.ledger = ledger;
    });

    commissions.forEach((commission) => {
      const row = getRow(commission.case_id, `commission-${commission.id}`);
      row.client_name = commission.client_name || row.client_name;
      if (!row.settlement) row.settlement = number(commission.settlement_amount);
      row.referral_amount += number(commission.commission_amount);
      row.commission = row.commission || commission;
      row.referral_status = commission.status === 'paid' && row.referral_status !== 'Referral payable' ? 'Referral paid' : 'Referral payable';
    });

    bankingForms.forEach((form) => {
      const row = getRow(form.case_id, `form-${form.id}`);
      row.case_name = form.case_label || row.case_name;
      row.client_name = form.client_name || row.client_name;
      row.client_form = form;
      const status = form.payment_access?.status;
      if (status === 'payment_marked_sent') row.client_status = 'Payment sent';
      else if (status === 'released') row.client_status = 'Released to attorney';
      else if (form.status === 'completed') row.client_status = 'Banking form submitted';
      else if (form.status === 'requested') row.client_status = 'Banking form requested';
    });

    return {
      grossSettlements,
      clientPlanned,
      clientPaidRecorded,
      attorneyRemainder,
      ownerExpected,
      ownerReceived,
      ownerOutstanding,
      referralPaid,
      referralPayable,
      actionCount,
      rows: [...rows.values()].sort((a, b) => (b.owner_outstanding + b.referral_amount + b.client_amount) - (a.owner_outstanding + a.referral_amount + a.client_amount)),
    };
  }, [ledgers, commissions, bankingForms]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      const matchesSearch = !term || [row.case_name, row.client_name, row.client_status, row.referral_status].join(' ').toLowerCase().includes(term);
      if (!matchesSearch) return false;
      if (filter === 'clients') return row.client_amount > 0 || row.client_status !== 'No banking form';
      if (filter === 'referrals') return row.referral_amount > 0;
      if (filter === 'owner') return row.owner_expected > 0 || row.owner_received > 0;
      if (filter === 'action') return row.owner_outstanding > 0 || row.referral_status === 'Referral payable' || ['Banking form requested', 'Banking form submitted', 'Released to attorney'].includes(row.client_status);
      return true;
    });
  }, [data.rows, filter, search]);

  const recoveryProgress = data.ownerExpected > 0 ? Math.min(100, (data.ownerReceived / data.ownerExpected) * 100) : 0;

  function openEdit(row, type) {
    if (type === 'commission' && row.commission) setEditing({ type, id: row.commission.id, ...row.commission });
    if (type === 'ledger' && row.ledger) setEditing({ type, id: row.ledger.id, ...row.ledger });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setNotice(''); setError('');
    try {
      if (editing.type === 'commission') {
        await updateCommission(editing.id, { settlement_amount: number(editing.settlement_amount), fee_type: editing.fee_type, fee_value: number(editing.fee_value), commission_amount: number(editing.commission_amount), description: editing.description, notes: editing.notes, status: editing.status });
      } else {
        await updateSettlementPayoutLedger(editing.id, { settlement_amount: number(editing.settlement_amount), court_costs: number(editing.court_costs), client_payouts: number(editing.client_payouts), percentage: number(editing.percentage), notes: editing.notes });
      }
      setEditing(null); setNotice('Payout information updated.'); await load();
    } catch (err) { setError(err?.message || 'Could not update this payout.'); }
    finally { setSaving(false); }
  }

  async function markReferralPaid(row) {
    if (!row.commission?.id || !window.confirm(`Mark ${money(row.referral_amount)} paid to the referral partner?`)) return;
    setError(''); setNotice('');
    try { await markCommissionPaid(row.commission.id); setNotice('Referral payout marked paid.'); await load(); }
    catch (err) { setError(err?.message || 'Could not mark the referral payout paid.'); }
  }

  async function addReferralPayout(event) {
    event.preventDefault();
    if (!newReferral.referral_partner_id) return;
    setCreatingReferral(true); setError(''); setNotice('');
    try {
      const selectedCase = cases.find((item) => item.id === newReferral.case_id);
      await createCommission({ ...newReferral, case_id: newReferral.case_id || null, client_id: newReferral.client_id || selectedCase?.client_id || null, settlement_amount: number(newReferral.settlement_amount), fee_value: number(newReferral.fee_value) });
      setShowAddReferral(false);
      setNewReferral({ referral_partner_id: '', case_id: '', client_id: '', description: '', settlement_amount: '', fee_type: 'percentage', fee_value: '', notes: '' });
      setNotice('New referral payout added.');
      await load();
    } catch (err) { setError(err?.message || 'Could not add the referral payout.'); }
    finally { setCreatingReferral(false); }
  }

  async function markClientPaid(row) {
    if (!row.client_form?.id) return;
    const amount = window.prompt(`Client payment amount for ${row.client_name}:`, String(row.client_form.payment_access?.payment_amount || row.client_amount || ''));
    if (amount === null) return;
    setError(''); setNotice('');
    try { await markPayoutPaymentSent(row.client_form.id, { payment_amount: number(amount), payment_sent_at: new Date().toISOString() }); setNotice('Client payout marked paid.'); await load(); }
    catch (err) { setError(err?.message || 'Could not mark the client payout paid.'); }
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="overflow-hidden rounded-2xl bg-slate-950 px-6 py-6 text-white shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-200"><BarChart3 className="h-4 w-4" /> Financial command center</p><h1 className="mt-2 text-2xl font-bold">Payout Overview</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">One private view of settlement distributions, client payout progress, referral partner commissions, and the money you expect to receive from the attorney.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowAddReferral(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />Add referral payout</button><button type="button" onClick={() => navigate('/attorney/payouts')} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">Your payouts <ArrowUpRight className="h-4 w-4" /></button><button type="button" onClick={() => navigate('/attorney/commissions')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800">Referral commissions <ArrowUpRight className="h-4 w-4" /></button></div>
      </div>
      <div className="mt-6 grid gap-4 border-t border-slate-800 pt-5 md:grid-cols-3"><div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Tracked settlement base</p><p className="mt-1 text-2xl font-bold">{money(data.grossSettlements)}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Items needing attention</p><p className="mt-1 text-2xl font-bold text-amber-300">{data.actionCount}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Your payout recovery</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${recoveryProgress}%` }} /></div><p className="mt-1 text-xs text-slate-300">{recoveryProgress.toFixed(0)}% of expected owner payouts recorded as received</p></div></div>
    </header>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mr-1 inline h-4 w-4" />{error}</div>}{notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4" />{notice}</div>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Client payouts planned" amount={data.clientPlanned} detail={`${money(data.clientPaidRecorded)} has a recorded external payment amount.`} tone="emerald" icon={Users} />
      <MetricCard label="Referral partners payable" amount={data.referralPayable} detail={`${money(data.referralPaid)} is marked paid to referral partners.`} tone="amber" icon={CircleDollarSign} />
      <MetricCard label="Your expected share" amount={data.ownerExpected} detail={`${money(data.ownerReceived)} received from the attorney so far.`} tone="indigo" icon={WalletCards} />
      <MetricCard label="Your outstanding share" amount={data.ownerOutstanding} detail={`${money(data.attorneyRemainder)} is the attorney remainder in tracked ledgers.`} tone="slate" icon={Clock3} />
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-semibold text-slate-900">Case distribution tracker</h2><p className="mt-1 text-sm text-slate-500">Use this as your working queue. Amounts remain editable in Attorney Payouts and Commissions; this page organizes them in one place.</p></div><button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{[['all', 'All cases'], ['action', 'Needs attention'], ['clients', 'Client payouts'], ['referrals', 'Referral payouts'], ['owner', 'Your payouts']].map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}</div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a client or case" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 lg:max-w-xs" /></div>
      {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading consolidated payout records…</div> : visibleRows.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No payout records match this view yet.</div> : <div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Case / client</th><th className="px-4 py-3 font-semibold">Settlement</th><th className="px-4 py-3 font-semibold">Client payout</th><th className="px-4 py-3 font-semibold">Referral partner</th><th className="px-4 py-3 font-semibold">Your payout</th><th className="px-4 py-3 font-semibold">Attorney remainder</th><th className="px-4 py-3 font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map((row) => <tr key={row.key} className="hover:bg-slate-50"><td className="px-5 py-4"><button type="button" disabled={!row.case_id} onClick={() => row.case_id && navigate(`/attorney/cases/${row.case_id}`)} className={`font-semibold text-slate-900 ${row.case_id ? 'hover:text-indigo-700 hover:underline' : ''}`}>{row.case_name}</button><p className="mt-1 text-xs text-slate-500">{row.client_name}</p></td><td className="px-4 py-4 font-semibold text-slate-800">{money(row.settlement)}</td><td className="px-4 py-4"><p className="font-semibold text-slate-800">{money(row.client_amount)}</p><div className="mt-1"><StatusPill state={row.client_status} /></div></td><td className="px-4 py-4"><p className="font-semibold text-slate-800">{money(row.referral_amount)}</p><div className="mt-1"><StatusPill state={row.referral_status} /></div></td><td className="px-4 py-4"><p className="font-semibold text-indigo-800">Expected {money(row.owner_expected)}</p><p className="mt-1 text-xs text-slate-500">Received {money(row.owner_received)} · Outstanding {money(row.owner_outstanding)}</p></td><td className="px-4 py-4 font-semibold text-slate-800">{money(row.attorney_remainder)}</td><td className="px-4 py-4"><div className="flex min-w-[210px] flex-wrap gap-2">{row.commission && <><button type="button" onClick={() => openEdit(row, 'commission')} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit referral</button>{row.commission.status !== 'paid' && <button type="button" onClick={() => markReferralPaid(row)} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Mark paid</button>}</>}{row.client_form && row.client_status !== 'Payment sent' && <button type="button" onClick={() => markClientPaid(row)} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Mark client paid</button>}{row.ledger && <button type="button" onClick={() => openEdit(row, 'ledger')} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit payout</button>}</div></td></tr>)}</tbody></table></div>}
    </section>

    {showAddReferral && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={addReferralPayout} className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Add referral partner payout</h2><p className="mt-1 text-sm text-slate-500">Create a new commission record directly from the payout overview.</p></div><button type="button" onClick={() => setShowAddReferral(false)} className="text-slate-500"><X className="h-5 w-5" /></button></div><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Referral partner<select required value={newReferral.referral_partner_id} onChange={(e) => setNewReferral((v) => ({ ...v, referral_partner_id: e.target.value }))} className="mt-1 w-full rounded-lg border p-2"><option value="">Select partner</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.full_name}{partner.company ? ` — ${partner.company}` : ''}</option>)}</select></label><label className="text-sm font-medium">Case (optional)<select value={newReferral.case_id} onChange={(e) => { const selectedCase = cases.find((item) => item.id === e.target.value); setNewReferral((v) => ({ ...v, case_id: e.target.value, client_id: selectedCase?.client_id || '' })); }} className="mt-1 w-full rounded-lg border p-2"><option value="">No case selected</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.case_number || item.plaintiff_name || item.id}</option>)}</select></label><label className="text-sm font-medium">Settlement amount<input required type="number" min="0" step="0.01" value={newReferral.settlement_amount} onChange={(e) => setNewReferral((v) => ({ ...v, settlement_amount: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm font-medium">Fee type<select value={newReferral.fee_type} onChange={(e) => setNewReferral((v) => ({ ...v, fee_type: e.target.value }))} className="mt-1 w-full rounded-lg border p-2"><option value="percentage">Percentage</option><option value="flat">Flat amount</option></select></label><label className="text-sm font-medium">Fee value<input type="number" min="0" step="0.01" placeholder="Leave 0 to use partner default" value={newReferral.fee_value} onChange={(e) => setNewReferral((v) => ({ ...v, fee_value: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label></div><label className="block text-sm font-medium">Description<input value={newReferral.description} onChange={(e) => setNewReferral((v) => ({ ...v, description: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" placeholder="Referral payout description" /></label><label className="block text-sm font-medium">Notes<textarea value={newReferral.notes} onChange={(e) => setNewReferral((v) => ({ ...v, notes: e.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border p-2" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowAddReferral(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={creatingReferral} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{creatingReferral ? 'Adding…' : 'Add payout'}</button></div></form></div>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={saveEdit} className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Edit {editing.type === 'commission' ? 'referral payout' : 'owner payout'}</h2><p className="mt-1 text-sm text-slate-500">Changes recalculate the overview totals after saving.</p></div><button type="button" onClick={() => setEditing(null)} className="text-slate-500">×</button></div><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Settlement amount<input type="number" step="0.01" min="0" value={editing.settlement_amount ?? ''} onChange={(e) => setEditing((v) => ({ ...v, settlement_amount: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label>{editing.type === 'ledger' ? <><label className="text-sm font-medium">Court costs<input type="number" step="0.01" min="0" value={editing.court_costs ?? ''} onChange={(e) => setEditing((v) => ({ ...v, court_costs: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm font-medium">Client payouts<input type="number" step="0.01" min="0" value={editing.client_payouts ?? ''} onChange={(e) => setEditing((v) => ({ ...v, client_payouts: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm font-medium">Owner percentage<input type="number" step="0.01" min="0" max="100" value={editing.percentage ?? ''} onChange={(e) => setEditing((v) => ({ ...v, percentage: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label></> : <><label className="text-sm font-medium">Fee type<select value={editing.fee_type || 'percentage'} onChange={(e) => setEditing((v) => ({ ...v, fee_type: e.target.value }))} className="mt-1 w-full rounded-lg border p-2"><option value="percentage">Percentage</option><option value="flat">Flat amount</option></select></label><label className="text-sm font-medium">Fee value<input type="number" step="0.01" min="0" value={editing.fee_value ?? ''} onChange={(e) => setEditing((v) => ({ ...v, fee_value: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm font-medium">Status<select value={editing.status || 'pending'} onChange={(e) => setEditing((v) => ({ ...v, status: e.target.value }))} className="mt-1 w-full rounded-lg border p-2"><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option></select></label></>}</div>{editing.type === 'commission' && <><label className="block text-sm font-medium">Description<input value={editing.description || ''} onChange={(e) => setEditing((v) => ({ ...v, description: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><label className="block text-sm font-medium">Notes<textarea value={editing.notes || ''} onChange={(e) => setEditing((v) => ({ ...v, notes: e.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border p-2" /></label></>}{editing.type === 'ledger' && <label className="block text-sm font-medium">Notes<textarea value={editing.notes || ''} onChange={(e) => setEditing((v) => ({ ...v, notes: e.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border p-2" /></label>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save changes'}</button></div></form></div>}
    <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />This dashboard is a tracking and reconciliation view. Marking a client payment sent records an external payment status only; LegalFlow does not initiate or transfer funds.</p>
  </div>;
}
