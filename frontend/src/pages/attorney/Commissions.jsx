import React, { useState, useEffect } from 'react';
import {
  DollarSign, Plus, Check, Clock, CheckCircle2, Loader2, Trash2,
  AlertCircle, X, Search, RefreshCw, ExternalLink, Link2,
} from 'lucide-react';
import {
  getCommissions, getCommissionSummary, createCommission,
  approveCommission, markCommissionPaid, deleteCommission,
  getQuickBooksStatus, getQuickBooksAuthUrl, syncCommissionToQuickBooks,
  getReferralPartners,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';

const STATUS_COLORS = {
  pending: 'text-amber-600 bg-amber-50 border-amber-200',
  approved: 'text-blue-600 bg-blue-50 border-blue-200',
  paid: 'text-emerald-600 bg-emerald-50 border-emerald-200',
};

export default function Commissions() {
  const [commissions, setCommissions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [qbStatus, setQbStatus] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [c, s, qb] = await Promise.all([
        getCommissions(),
        getCommissionSummary(),
        getQuickBooksStatus().catch(() => null),
      ]);
      setCommissions(c);
      setSummary(s);
      setQbStatus(qb);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  const filtered = commissions.filter(c => filter === 'all' || c.status === filter);

  const totals = {
    pending: commissions.filter(c => c.status === 'pending').reduce((s, c) => s + (c.commission_amount || 0), 0),
    approved: commissions.filter(c => c.status === 'approved').reduce((s, c) => s + (c.commission_amount || 0), 0),
    paid: commissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.commission_amount || 0), 0),
  };

  async function handleApprove(id) {
    await approveCommission(id);
    loadData();
  }

  async function handleMarkPaid(id) {
    await markCommissionPaid(id);
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this commission record?')) return;
    await deleteCommission(id);
    loadData();
  }

  async function handleSyncQB(id) {
    try {
      await syncCommissionToQuickBooks(id);
      loadData();
    } catch (err) { alert('QuickBooks sync failed: ' + err.message); }
  }

  async function handleConnectQB() {
    try {
      const { auth_url } = await getQuickBooksAuthUrl();
      window.open(auth_url, '_blank', 'width=600,height=700');
    } catch (err) { alert(err.message); }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Commissions</h1>
          <p className="text-sm text-slate-500 mt-1">Track referral partner payouts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add Commission
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending', amount: totals.pending, color: 'amber' },
          { label: 'Approved', amount: totals.approved, color: 'blue' },
          { label: 'Paid', amount: totals.paid, color: 'emerald' },
        ].map(t => (
          <div key={t.label} className={`bg-white rounded-xl border border-slate-200 p-4`}>
            <div className="text-xs font-semibold uppercase text-slate-400">{t.label}</div>
            <div className={`text-2xl font-bold text-${t.color}-600 mt-1`}>
              ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>

      {/* QuickBooks status */}
      <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-700 font-bold text-xs">QB</div>
          <div>
            <div className="text-sm font-medium text-slate-900">QuickBooks Online</div>
            <div className="text-xs text-slate-500">
              {qbStatus?.connected
                ? `Connected to ${qbStatus.company_name || 'your company'}`
                : 'Not connected'}
            </div>
          </div>
        </div>
        {qbStatus?.connected ? (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Connected
          </span>
        ) : (
          <button onClick={handleConnectQB} disabled={!qbStatus?.configured}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
            <Link2 className="w-4 h-4" /> Connect QuickBooks
          </button>
        )}
      </div>

      {/* Partner summary */}
      {summary.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">By Partner</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {summary.filter(s => s.count > 0).map(s => (
              <div key={s.partner_id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{s.partner_name}</div>
                    {s.company && <div className="text-xs text-slate-500">{s.company}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900">
                      ${s.total_earned.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-slate-500">{s.count} commission{s.count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div className="flex gap-3 mt-3 text-xs">
                  <span className="text-amber-600">Pending: ${s.total_pending.toFixed(2)}</span>
                  <span className="text-blue-600">Approved: ${s.total_approved.toFixed(2)}</span>
                  <span className="text-emerald-600">Paid: ${s.total_paid.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit">
        {['all', 'pending', 'approved', 'paid'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition capitalize ${
              filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {f} ({f === 'all' ? commissions.length : commissions.filter(c => c.status === f).length})
          </button>
        ))}
      </div>

      {/* Commission list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {commissions.length === 0 ? 'No commissions yet' : 'No matching commissions'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg border ${STATUS_COLORS[c.status] || STATUS_COLORS.pending}`}>
                  {c.status === 'paid' ? <CheckCircle2 className="w-4 h-4" /> :
                   c.status === 'approved' ? <Check className="w-4 h-4" /> :
                   <Clock className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{c.partner_name}</span>
                    {c.partner_company && <span className="text-xs text-slate-400">({c.partner_company})</span>}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${STATUS_COLORS[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    {c.client_name && <span>Client: {c.client_name}</span>}
                    {c.description && <span>{c.description}</span>}
                    <span>Settlement: ${Number(c.settlement_amount || 0).toLocaleString()}</span>
                    <span>{c.fee_type === 'percentage' ? `${c.fee_value}%` : `$${c.fee_value} flat`}</span>
                    {c.created_at && <span>{new Date(c.created_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-900">
                    ${Number(c.commission_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {c.status === 'pending' && (
                    <button onClick={() => handleApprove(c.id)} title="Approve"
                      className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  {c.status === 'approved' && (
                    <button onClick={() => handleMarkPaid(c.id)} title="Mark Paid"
                      className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg">
                      <DollarSign className="w-4 h-4" />
                    </button>
                  )}
                  {qbStatus?.connected && !c.quickbooks_bill_id && c.status !== 'paid' && (
                    <button onClick={() => handleSyncQB(c.id)} title="Sync to QuickBooks"
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg text-xs font-medium">
                      QB
                    </button>
                  )}
                  {c.status === 'pending' && (
                    <button onClick={() => handleDelete(c.id)} title="Delete"
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddCommissionModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); loadData(); }} />}
    </div>
  );
}


function AddCommissionModal({ onClose, onAdded }) {
  const [partners, setPartners] = useState([]);
  const [clients, setClients] = useState([]);
  const [partnerId, setPartnerId] = useState('');
  const [clientId, setClientId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [cases, setCases] = useState([]);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [feeType, setFeeType] = useState('percentage');
  const [feeValue, setFeeValue] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOptions();
  }, []);

  async function loadOptions() {
    try {
      const p = await getReferralPartners();
      setPartners(p);
      const { data } = await supabase.from('profiles').select('id, full_name, email, referral_partner_id').eq('role', 'client').order('full_name');
      setClients(data || []);
    } catch (err) { console.error(err); }
  }

  function handlePartnerChange(pid) {
    setPartnerId(pid);
    const partner = partners.find(p => p.id === pid);
    if (partner) {
      setFeeType(partner.referral_fee_type || 'percentage');
      setFeeValue(String(partner.referral_fee_amount || ''));
    }
    // Filter clients by partner
    const partnerClients = clients.filter(c => c.referral_partner_id === pid);
    if (partnerClients.length > 0) {
      setClientId(partnerClients[0].id);
      loadCases(partnerClients[0].id);
    }
  }

  async function loadCases(cid) {
    try {
      const { data } = await supabase.from('cases').select('id, plaintiff_name, status, settlement_amount, created_at').eq('client_id', cid).order('created_at', { ascending: false });
      setCases(data || []);
      if (data?.length === 1) {
        setCaseId(data[0].id);
        if (data[0].settlement_amount) setSettlementAmount(String(data[0].settlement_amount));
      }
    } catch (err) { console.error(err); }
  }

  function handleClientChange(cid) {
    setClientId(cid);
    setCaseId('');
    setSettlementAmount('');
    if (cid) loadCases(cid);
  }

  function handleCaseChange(caseid) {
    setCaseId(caseid);
    const c = cases.find(cs => cs.id === caseid);
    if (c?.settlement_amount) setSettlementAmount(String(c.settlement_amount));
  }

  const commissionPreview = feeType === 'percentage'
    ? (parseFloat(settlementAmount || 0) * (parseFloat(feeValue || 0) / 100)).toFixed(2)
    : parseFloat(feeValue || 0).toFixed(2);

  async function handleSave() {
    if (!partnerId) { setError('Select a referral partner'); return; }
    if (!settlementAmount && feeType === 'percentage') { setError('Enter a settlement amount'); return; }

    setSaving(true);
    setError('');
    try {
      await createCommission({
        referral_partner_id: partnerId,
        case_id: caseId || null,
        client_id: clientId || null,
        description: description || null,
        settlement_amount: parseFloat(settlementAmount || 0),
        fee_type: feeType,
        fee_value: parseFloat(feeValue || 0),
      });
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const partnerClients = partnerId ? clients.filter(c => c.referral_partner_id === partnerId) : clients;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Add Commission</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Partner */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Referral Partner *</label>
            <select value={partnerId} onChange={(e) => handlePartnerChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Select partner --</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name}{p.company ? ` (${p.company})` : ''} — {p.referral_fee_type === 'percentage' ? `${p.referral_fee_amount}%` : `$${p.referral_fee_amount} flat`}
                </option>
              ))}
            </select>
          </div>

          {/* Client */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Client</label>
            <select value={clientId} onChange={(e) => handleClientChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Select client --</option>
              {partnerClients.map(c => (
                <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
              ))}
            </select>
          </div>

          {/* Case */}
          {cases.length > 0 && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Case</label>
              <select value={caseId} onChange={(e) => handleCaseChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Select case --</option>
                {cases.map(c => (
                  <option key={c.id} value={c.id}>{c.plaintiff_name || 'Untitled'} — {c.status}</option>
                ))}
              </select>
            </div>
          )}

          {/* Settlement amount */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Settlement Amount ($)</label>
            <input type="number" value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)}
              placeholder="0.00" step="0.01"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Fee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Fee Type</label>
              <select value={feeType} onChange={(e) => setFeeType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="percentage">Percentage</option>
                <option value="flat">Flat Fee</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                {feeType === 'percentage' ? 'Rate (%)' : 'Amount ($)'}
              </label>
              <input type="number" value={feeValue} onChange={(e) => setFeeValue(e.target.value)}
                placeholder={feeType === 'percentage' ? '33' : '500'} step="0.01"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Commission preview */}
          {(settlementAmount || feeType === 'flat') && feeValue && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-xs text-blue-600 font-medium">Commission Amount</div>
              <div className="text-2xl font-bold text-blue-700">${commissionPreview}</div>
              {feeType === 'percentage' && (
                <div className="text-xs text-blue-500">{feeValue}% of ${Number(settlementAmount).toLocaleString()}</div>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. FCRA settlement — Smith v. Equifax"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 inline mr-1" /> {error}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button onClick={handleSave} disabled={saving || !partnerId}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Plus className="w-4 h-4" /> Add Commission</>}
          </button>
        </div>
      </div>
    </div>
  );
}
