import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileKey,
  FileText,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  cancelW9Request,
  createW9Request,
  downloadCompletedW9,
  getCases,
  getW9Request,
  inspectW9Prefill,
  listW9Requests,
} from '../../lib/api';

const blankRequest = {
  signer_name: '',
  signer_email: '',
  case_id: '',
  client_id: '',
  prefilled_legal_name: '',
  prefilled_tin: '',
  prefilled_tin_type: 'ssn',
  use_detected_legal_name: false,
  use_detected_tin: false,
  title: 'Form W-9 — Taxpayer Information and Certification',
  message: 'Please complete and sign the requested Form W-9. Your taxpayer identification number is encrypted and retained only in LegalFlow’s private records.',
  expires_in_days: 14,
};

function statusStyle(status) {
  const styles = {
    awaiting_submission: 'bg-amber-50 text-amber-700 border-amber-200',
    complete: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    expired: 'bg-slate-100 text-slate-600 border-slate-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
  };
  return styles[status] || 'bg-slate-100 text-slate-600 border-slate-200';
}

function prettyStatus(status) {
  return (status || '').replace(/_/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

function sourceDescription(source) {
  if (!source) return 'not found';
  if (source.kind === 'client_profile') return 'client profile';
  if (source.kind === 'manual_attorney_entry') return 'entered privately by attorney';
  return source.file_name ? `case file: ${source.file_name}` : 'case file';
}

function formatTin(value, type) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 9);
  if (type === 'ssn') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function W9Requests() {
  const [requests, setRequests] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [form, setForm] = useState(blankRequest);
  const [detectedPrefill, setDetectedPrefill] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const requestCounts = useMemo(() => ({
    pending: requests.filter((request) => request.status === 'awaiting_submission').length,
    complete: requests.filter((request) => request.status === 'complete').length,
  }), [requests]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [requestRows, caseRows] = await Promise.all([listW9Requests(), getCases()]);
      setRequests(Array.isArray(requestRows) ? requestRows : requestRows?.data || []);
      setCases(Array.isArray(caseRows) ? caseRows : caseRows?.cases || caseRows?.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load W-9 requests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openComposer() {
    setError('');
    setSuccess('');
    setForm(blankRequest);
    setDetectedPrefill(null);
    setShowComposer(true);
  }

  async function chooseCase(caseId) {
    const matchingCase = cases.find((item) => String(item.id) === caseId);
    setError('');
    setDetectedPrefill(null);
    setForm((current) => ({
      ...current,
      case_id: caseId,
      client_id: matchingCase?.client_id || '',
      signer_name: current.signer_name || matchingCase?.client_name || matchingCase?.client?.full_name || '',
      signer_email: current.signer_email || matchingCase?.client_email || matchingCase?.client?.email || '',
      prefilled_legal_name: '',
      prefilled_tin: '',
      prefilled_tin_type: 'ssn',
      use_detected_legal_name: false,
      use_detected_tin: false,
    }));

    if (!caseId) return;

    setScanning(true);
    try {
      const candidate = await inspectW9Prefill(caseId);
      setDetectedPrefill(candidate);
      setForm((current) => {
        if (current.case_id !== caseId) return current;
        return {
          ...current,
          signer_name: current.signer_name || candidate.signer_name || '',
          signer_email: current.signer_email || candidate.signer_email || '',
          use_detected_legal_name: Boolean(candidate.legal_name),
          use_detected_tin: Boolean(candidate.tin_available),
        };
      });
    } catch (err) {
      setError(err.message || 'LegalFlow could not inspect the related case files. You can still send the W-9 without prefilled data.');
    } finally {
      setScanning(false);
    }
  }

  async function sendRequest(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSending(true);
    try {
      await createW9Request({
        ...form,
        case_id: form.case_id || null,
        client_id: form.client_id || null,
        prefilled_legal_name: form.prefilled_legal_name.trim() || null,
        prefilled_tin: form.prefilled_tin || null,
        prefilled_tin_type: form.prefilled_tin ? form.prefilled_tin_type : null,
        expires_in_days: Number(form.expires_in_days),
      });
      setForm(blankRequest);
      setDetectedPrefill(null);
      setShowComposer(false);
      setSuccess('The secure Form W-9 request was created and sent. Any selected prefill is locked for the signer.');
      await load();
    } catch (err) {
      setError(err.message || 'The W-9 request could not be created.');
    } finally {
      setSending(false);
    }
  }

  async function openDetail(id) {
    setDetailLoading(true);
    setError('');
    try {
      setDetail(await getW9Request(id));
    } catch (err) {
      setError(err.message || 'Unable to load W-9 details.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function download(request) {
    try {
      const blob = await downloadCompletedW9(request.id);
      downloadBlob(blob, `W-9_${request.signer_name || 'completed'}.pdf`);
    } catch (err) {
      setError(err.message || 'Unable to download the completed W-9.');
    }
  }

  async function cancel(request) {
    if (!window.confirm(`Cancel the pending W-9 request for ${request.signer_name}?`)) return;
    try {
      await cancelW9Request(request.id);
      if (detail?.id === request.id) setDetail(null);
      setSuccess('The pending W-9 request was cancelled.');
      await load();
    } catch (err) {
      setError(err.message || 'Unable to cancel the W-9 request.');
    }
  }

  const detectedNameActive = detectedPrefill?.legal_name && form.use_detected_legal_name;
  const detectedTinActive = detectedPrefill?.tin_available && form.use_detected_tin;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-700"><FileKey className="w-4 h-4" />Tax documentation</div>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Form W-9 Requests</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Collect taxpayer information and certification through encrypted, attorney-only LegalFlow records.</p>
        </div>
        <button onClick={openComposer} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"><Plus className="w-4 h-4" />Send Form W-9</button>
      </header>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending</p><p className="mt-1 text-2xl font-bold text-amber-700">{requestCounts.pending}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Completed</p><p className="mt-1 text-2xl font-bold text-emerald-700">{requestCounts.complete}</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3"><LockKeyhole className="w-6 h-6 text-emerald-700" /><p className="text-sm text-emerald-900">Taxpayer IDs are encrypted and never displayed in this list.</p></div>
      </div>

      {(error || success) && <div className={`rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error ? <AlertCircle className="inline mr-2 w-4 h-4" /> : <CheckCircle2 className="inline mr-2 w-4 h-4" />}{error || success}</div>}

      {showComposer && (
        <section className="rounded-2xl border border-blue-200 bg-white shadow-sm p-5 md:p-7">
          <div className="flex justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Send secure Form W-9</h2>
              <p className="mt-1 text-sm text-slate-500">Choose a case to look for an existing name and labeled taxpayer ID. No taxpayer ID is ever sent in the email.</p>
            </div>
            <button type="button" onClick={() => setShowComposer(false)} className="text-slate-400 hover:text-slate-700"><XCircle className="w-5 h-5" /></button>
          </div>

          <form onSubmit={sendRequest} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block md:col-span-2">
              <span className="block text-sm font-semibold text-slate-700">Related case <span className="font-normal text-slate-400">(optional)</span></span>
              <select value={form.case_id} onChange={(event) => chooseCase(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                <option value="">No linked case</option>
                {cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.case_number ? `${caseItem.case_number} — ` : ''}{caseItem.client_name || caseItem.title || caseItem.id}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-slate-700">Signer full name</span>
              <input required value={form.signer_name} onChange={(event) => updateForm('signer_name', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-700">Signer email</span>
              <input required type="email" value={form.signer_email} onChange={(event) => updateForm('signer_email', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>

            <section className="md:col-span-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex items-start gap-3">
                {scanning ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-indigo-700" /> : <Search className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" />}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-indigo-950">Private W-9 prefill</h3>
                  {scanning && <p className="mt-1 text-sm text-indigo-800">Checking supported text-based documents in this case…</p>}
                  {!scanning && !form.case_id && <p className="mt-1 text-sm text-indigo-800">Select a case to look for a client name and a labeled SSN or EIN. You can also type information privately below, or leave it for the signer.</p>}
                  {!scanning && form.case_id && !detectedPrefill && <p className="mt-1 text-sm text-indigo-800">No automatic result is available. You may enter attorney-held information or leave the fields for the signer.</p>}
                  {!scanning && detectedPrefill && (
                    <div className="mt-3 space-y-3 text-sm text-indigo-950">
                      {detectedPrefill.legal_name ? (
                        <label className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-white p-3 cursor-pointer">
                          <input type="checkbox" checked={form.use_detected_legal_name} onChange={(event) => updateForm('use_detected_legal_name', event.target.checked)} className="mt-1 accent-blue-600" />
                          <span><span className="font-semibold">Lock the detected name:</span> {detectedPrefill.legal_name}<span className="block mt-0.5 text-xs text-indigo-700">Source: {sourceDescription(detectedPrefill.sources?.legal_name)}</span></span>
                        </label>
                      ) : <p className="rounded-lg border border-dashed border-indigo-200 bg-white/70 p-3">No name was found automatically. Leave it blank for the signer or enter it below.</p>}
                      {detectedPrefill.tin_available ? (
                        <label className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-white p-3 cursor-pointer">
                          <input type="checkbox" checked={form.use_detected_tin} onChange={(event) => { updateForm('use_detected_tin', event.target.checked); if (event.target.checked) updateForm('prefilled_tin', ''); }} className="mt-1 accent-blue-600" />
                          <span><span className="font-semibold">Lock the detected taxpayer ID:</span> {detectedPrefill.tin_type?.toUpperCase()} ending in {detectedPrefill.tin_last4}<span className="block mt-0.5 text-xs text-indigo-700">Source: {sourceDescription(detectedPrefill.sources?.tin)}. The full number is not shown in LegalFlow.</span></span>
                        </label>
                      ) : <p className="rounded-lg border border-dashed border-indigo-200 bg-white/70 p-3">No labeled SSN or EIN was found in the scanned text-based case files.</p>}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {!detectedNameActive && (
              <label className="block md:col-span-2">
                <span className="block text-sm font-semibold text-slate-700">Prefill taxpayer legal name <span className="font-normal text-slate-400">(optional; otherwise signer enters it)</span></span>
                <input value={form.prefilled_legal_name} onChange={(event) => updateForm('prefilled_legal_name', event.target.value)} placeholder="Enter only if you want it locked on the signer form" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
            )}

            {!detectedTinActive && (
              <div className="md:col-span-2 rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800">Prefill taxpayer ID <span className="font-normal text-slate-400">(optional; otherwise signer enters it)</span></p>
                <p className="mt-1 text-xs text-slate-500">This field is private, encrypted before storage, and never sent in the request email. Do not add it unless you already have it through an authorized source.</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
                  <select value={form.prefilled_tin_type} onChange={(event) => updateForm('prefilled_tin_type', event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5">
                    <option value="ssn">Social Security Number</option>
                    <option value="ein">Employer Identification Number</option>
                  </select>
                  <input type="password" inputMode="numeric" autoComplete="off" value={formatTin(form.prefilled_tin, form.prefilled_tin_type)} onChange={(event) => updateForm('prefilled_tin', event.target.value.replace(/\D/g, '').slice(0, 9))} placeholder={form.prefilled_tin_type === 'ssn' ? '000-00-0000' : '00-0000000'} className="rounded-lg border border-slate-300 px-3 py-2.5" />
                </div>
              </div>
            )}

            <label className="block md:col-span-2"><span className="block text-sm font-semibold text-slate-700">Request title</span><input required value={form.title} onChange={(event) => updateForm('title', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
            <label className="block md:col-span-2"><span className="block text-sm font-semibold text-slate-700">Message to signer</span><textarea value={form.message} onChange={(event) => updateForm('message', event.target.value)} rows="3" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
            <label className="block"><span className="block text-sm font-semibold text-slate-700">Link expiry</span><select value={form.expires_in_days} onChange={(event) => updateForm('expires_in_days', event.target.value)} className="mt-1.5 rounded-lg border border-slate-300 px-3 py-2.5"><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option><option value="30">30 days</option></select></label>
            <div className="md:col-span-2 flex justify-end"><button disabled={sending || scanning} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{sending ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Send className="w-4 h-4" />Send secure W-9 request</>}</button></div>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-slate-900">Requests</h2><button onClick={load} className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800"><RefreshCw className="w-4 h-4" />Refresh</button></div>
        {loading ? <div className="p-12 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div> : requests.length === 0 ? <div className="p-12 text-center"><FileText className="mx-auto w-9 h-9 text-slate-300" /><p className="mt-3 font-medium text-slate-700">No W-9 requests yet</p><p className="mt-1 text-sm text-slate-500">Create a secure request when a settlement requires a completed Form W-9.</p></div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 font-semibold">Signer</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Expires / completed</th><th className="px-5 py-3 font-semibold text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{requests.map((request) => <tr key={request.id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{request.signer_name}</p><p className="text-slate-500">{request.signer_email}</p></td><td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(request.status)}`}>{prettyStatus(request.status)}</span></td><td className="px-5 py-4 text-slate-600">{request.submitted_at ? `Completed ${new Date(request.submitted_at).toLocaleDateString()}` : request.expires_at ? `Expires ${new Date(request.expires_at).toLocaleDateString()}` : '—'}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={() => openDetail(request.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">Details</button>{request.status === 'complete' && <button onClick={() => download(request)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"><Download className="w-3.5 h-3.5" />PDF</button>}{request.status === 'awaiting_submission' && <button onClick={() => cancel(request)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Cancel</button>}</div></td></tr>)}</tbody></table></div>}
      </section>

      {(detail || detailLoading) && <div className="fixed inset-0 z-50 bg-slate-950/40 p-4 flex items-center justify-center"><section className="max-w-xl w-full max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Secure W-9 record</p><h2 className="mt-1 text-xl font-bold text-slate-900">{detail?.signer_name || 'Loading…'}</h2></div><button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-700"><XCircle className="w-5 h-5" /></button></div>{detailLoading ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div> : detail && <><div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Status</p><p className="mt-1 font-semibold">{prettyStatus(detail.status)}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Taxpayer ID</p><p className="mt-1 font-semibold">{detail.submission ? `${detail.submission.tin_type.toUpperCase()} ending ${detail.submission.tin_last4}` : detail.prefilled_tin_last4 ? `${detail.prefilled_tin_type?.toUpperCase()} ending ${detail.prefilled_tin_last4} (locked)` : 'Not submitted'}</p></div></div>{detail.prefilled_legal_name && !detail.submission && <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><h3 className="font-semibold text-indigo-950">Locked prefill</h3><p className="mt-1 text-sm text-indigo-900">Name: {detail.prefilled_legal_name}</p><p className="mt-1 text-xs text-indigo-800">The signer cannot change selected prefilled fields.</p></div>}{detail.submission && <><div className="mt-5 rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-900">Submitted taxpayer information</h3><p className="mt-2 text-sm text-slate-600">{detail.submission.legal_name}{detail.submission.business_name ? ` · ${detail.submission.business_name}` : ''}</p><p className="text-sm text-slate-600">{prettyStatus(detail.submission.tax_classification)}{detail.submission.llc_tax_classification ? ` (${detail.submission.llc_tax_classification})` : ''}</p><p className="mt-2 text-sm text-slate-600">{detail.submission.address_line1}{detail.submission.address_line2 ? `, ${detail.submission.address_line2}` : ''}<br />{detail.submission.city}, {detail.submission.state} {detail.submission.zip_code}</p></div><div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex gap-2"><ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" /><div><h3 className="font-semibold text-emerald-950">Signing audit</h3><p className="mt-1 text-sm text-emerald-900">Submitted {detail.submission.submitted_at ? new Date(detail.submission.submitted_at).toLocaleString() : '—'}</p><p className="mt-1 text-sm text-emerald-900">Signer IP: {detail.submission.audit_trail?.signer_ip || 'Unavailable'} · {detail.submission.audit_trail?.ip_source || '—'}</p><p className="mt-1 text-xs text-emerald-800">The IP is retained in LegalFlow’s private audit record and is not printed on the completed Form W-9.</p></div></div></div></>}</>}</section></div>}
    </div>
  );
}
