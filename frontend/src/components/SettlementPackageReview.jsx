import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  Loader2,
  Send,
  Upload,
  X,
} from 'lucide-react';
import {
  approveSettlementPackage,
  downloadSettlementPackageDocument,
  getCaseSettlementPackages,
  returnSettlementPackage,
  sendApprovedSettlementPackageDocument,
  submitSettlementPackage,
} from '../lib/api';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusStyle(value) {
  const map = {
    awaiting_review: 'border-amber-200 bg-amber-50 text-amber-800',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    returned: 'border-red-200 bg-red-50 text-red-700',
  };
  return map[value] || 'border-slate-200 bg-slate-50 text-slate-700';
}

function packageStatusLabel(value) {
  return ({ awaiting_review: 'Awaiting your review', approved: 'Approved & staged', returned: 'Returned for changes' })[value] || value;
}

function validFile(file) {
  return file && /\.(pdf|docx)$/i.test(file.name || '') && file.size <= MAX_FILE_BYTES;
}

function SubmissionModal({ caseRow, onClose, onSubmitted }) {
  const settlementInputRef = useRef(null);
  const disclosureInputRef = useRef(null);
  const [settlementAgreement, setSettlementAgreement] = useState(null);
  const [creditDisclosure, setCreditDisclosure] = useState(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [attorneyNotes, setAttorneyNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function chooseSettlement(file) {
    if (!validFile(file)) { setError('Choose a PDF or DOCX settlement agreement that is 20 MB or smaller.'); return; }
    setSettlementAgreement(file); setError('');
  }
  function chooseDisclosure(file) {
    if (file && !validFile(file)) { setError('Choose a PDF or DOCX credit disclosure that is 20 MB or smaller.'); return; }
    setCreditDisclosure(file || null); setError('');
  }
  async function submit() {
    if (!settlementAgreement || submitting) return;
    setSubmitting(true); setError('');
    try {
      const result = await submitSettlementPackage(caseRow.id, { settlementAgreement, creditDisclosure, settlementAmount, attorneyNotes });
      onSubmitted(result);
    } catch (err) { setError(err.message || 'Could not submit this settlement package for review.'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="submit-settlement-package-title">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div><p className="text-xs font-bold uppercase tracking-wider text-primary-700">Attorney submission</p><h2 id="submit-settlement-package-title" className="mt-1 text-xl font-bold text-slate-900">Submit settlement package for review</h2><p className="mt-1 text-sm text-slate-600">The client will not receive anything until an independent attorney approves the package.</p></div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 p-6">
          <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-950"><p className="font-bold">{caseRow.client_name || caseRow.client?.full_name || 'Client'} · {caseRow.case_number || `Case ${String(caseRow.id).slice(0, 8)}`}</p><p className="mt-1 text-xs leading-5 text-primary-900/80">After approval, LegalFlow stages the exact files below into Step 1 of this case’s Settlement Center.</p></div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Settlement agreement <span className="text-red-600">*</span></label>
            {settlementAgreement ? <SelectedFile file={settlementAgreement} onClear={() => { setSettlementAgreement(null); if (settlementInputRef.current) settlementInputRef.current.value = ''; }} /> : <UploadBox label="Drop settlement agreement here or browse" onClick={() => settlementInputRef.current?.click()} onDrop={chooseSettlement} />}
            <input ref={settlementInputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => chooseSettlement(event.target.files?.[0])} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Credit disclosure <span className="normal-case font-medium text-slate-400">(optional)</span></label>
            {creditDisclosure ? <SelectedFile file={creditDisclosure} onClear={() => { setCreditDisclosure(null); if (disclosureInputRef.current) disclosureInputRef.current.value = ''; }} /> : <UploadBox label="Drop credit disclosure here or browse" onClick={() => disclosureInputRef.current?.click()} onDrop={chooseDisclosure} />}
            <input ref={disclosureInputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => chooseDisclosure(event.target.files?.[0])} />
          </div>
          <div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Settlement amount <span className="normal-case font-medium text-slate-400">(optional)</span></label><input value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} placeholder="$0.00" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></div><div><label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Notes for reviewer <span className="normal-case font-medium text-slate-400">(optional)</span></label><textarea value={attorneyNotes} onChange={(event) => setAttorneyNotes(event.target.value)} rows={2} maxLength={5000} placeholder="Anything the reviewer should check..." className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></div></div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mr-1 inline h-4 w-4" /> {error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4"><button type="button" onClick={onClose} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" onClick={submit} disabled={!settlementAgreement || submitting} className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{submitting ? 'Submitting…' : 'Submit for review'}</button></div>
      </div>
    </div>
  );
}

function UploadBox({ label, onClick, onDrop }) {
  return <div onClick={onClick} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop(event.dataTransfer?.files?.[0]); }} className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-5 py-6 text-center transition hover:border-primary-400 hover:bg-primary-50/40"><Upload className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700">{label}</p><p className="mt-1 text-xs text-slate-500">PDF or DOCX · Maximum 20 MB</p></div>;
}
function SelectedFile({ file, onClear }) {
  return <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5"><FileText className="h-5 w-5 shrink-0 text-emerald-700" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-emerald-950">{file.name}</p><p className="mt-0.5 text-xs text-emerald-700">{(file.size / 1024).toFixed(0)} KB · Ready to submit</p></div><button type="button" onClick={onClear} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"><X className="h-4 w-4" /></button></div>;
}

export function PreparedSettlementPackageSendModal({ packageRow, kind, onClose, onSent }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const isSettlement = kind === 'settlement';
  const fileName = isSettlement ? packageRow.settlement_file_name : packageRow.credit_disclosure_file_name;
  async function send() {
    setSending(true); setError('');
    try { const result = await sendApprovedSettlementPackageDocument(packageRow.id, kind); onSent(result); }
    catch (err) { setError(err.message || 'Could not send the prepared document.'); }
    finally { setSending(false); }
  }
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-slate-900">Send approved {isSettlement ? 'settlement agreement' : 'credit disclosure'}</h2><p className="mt-1 text-sm text-slate-600">This sends the reviewer-approved file. It will not upload or replace the attachment.</p></div><div className="space-y-4 p-5"><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-700" /> <span className="font-semibold">Approved and staged:</span> {fileName}</div><p className="text-sm leading-6 text-slate-600">{isSettlement ? 'The client will receive a secure link to review and sign this agreement.' : 'The client will receive a secure link to review this credit disclosure. No signature or reminder is required.'}</p>{error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}</div><div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4"><button onClick={onClose} disabled={sending} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button><button onClick={send} disabled={sending} className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Sending…' : isSettlement ? 'Send for signature' : 'Send for review'}</button></div></div></div>;
}

export default function SettlementPackageReview({ caseRow, onWorkflowChanged, onNotice, onApprovedPackage }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [reviewingId, setReviewingId] = useState('');
  const [reviewComments, setReviewComments] = useState('');
  const [returningId, setReturningId] = useState('');
  const [sendTarget, setSendTarget] = useState(null);

  const loadPackages = useCallback(async () => {
    if (!caseRow?.id) return;
    try { setLoading(true); setError(''); const data = await getCaseSettlementPackages(caseRow.id); const rows = Array.isArray(data) ? data : []; setPackages(rows); onApprovedPackage?.(rows.find((row) => row.status === 'approved') || null); }
    catch (err) { setError(err.message || 'Could not load submitted settlement packages.'); }
    finally { setLoading(false); }
  }, [caseRow?.id, onApprovedPackage]);
  useEffect(() => { loadPackages(); }, [loadPackages]);

  const approve = async (packageRow) => {
    setReviewingId(packageRow.id); setError('');
    try { await approveSettlementPackage(packageRow.id, reviewComments); setReviewComments(''); await loadPackages(); await onWorkflowChanged?.(); onNotice?.('Settlement package approved. Its agreement and credit disclosure are now staged in Step 1 and ready to send.'); }
    catch (err) { setError(err.message || 'Could not approve the settlement package.'); }
    finally { setReviewingId(''); }
  };
  const returnPackage = async (packageRow) => {
    setReturningId(packageRow.id); setError('');
    try { await returnSettlementPackage(packageRow.id, reviewComments); setReviewComments(''); await loadPackages(); onNotice?.('Settlement package returned to the submitting attorney with review comments.'); }
    catch (err) { setError(err.message || 'Add review comments before returning this package.'); }
    finally { setReturningId(''); }
  };
  const openFile = async (packageRow, kind) => {
    try { const url = await downloadSettlementPackageDocument(packageRow.id, kind); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (err) { setError(err.message || 'Could not open the submitted document.'); }
  };

  const latestApproved = packages.find((row) => row.status === 'approved') || null;
  return <>
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2 text-violet-800"><ClipboardCheck className="h-5 w-5" /><p className="text-xs font-bold uppercase tracking-wider">Attorney submission & review</p></div><h2 className="mt-1 text-lg font-bold text-violet-950">Settlement package review</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-violet-950/75">Attorneys submit the settlement agreement and optional credit disclosure here. Approval stages those exact attachments in Step 1 below; approval never sends anything to the client.</p></div><button type="button" onClick={() => setShowSubmit(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"><Upload className="h-4 w-4" /> Submit package for review</button></div>
      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mr-1 inline h-4 w-4" /> {error}</div>}
      {loading ? <div className="mt-5 flex items-center gap-2 text-sm text-violet-800"><Loader2 className="h-4 w-4 animate-spin" /> Loading settlement submissions…</div> : packages.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-violet-200 bg-white/70 px-4 py-5 text-sm text-violet-900/70">No settlement package has been submitted for this case yet.</p> : <div className="mt-5 space-y-3">{packages.map((packageRow) => <article key={packageRow.id} className="rounded-xl border border-violet-100 bg-white p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">Submitted {formatDate(packageRow.submitted_at)}</p><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(packageRow.status)}`}>{packageStatusLabel(packageRow.status)}</span></div><p className="mt-1 text-sm text-slate-600">Settlement: <span className="font-medium">{packageRow.settlement_file_name}</span>{packageRow.settlement_amount ? ` · ${packageRow.settlement_amount}` : ''}</p>{packageRow.credit_disclosure_file_name && <p className="mt-1 text-sm text-slate-600">Credit disclosure: <span className="font-medium">{packageRow.credit_disclosure_file_name}</span></p>}{packageRow.attorney_notes && <p className="mt-2 text-sm italic text-slate-600">“{packageRow.attorney_notes}”</p>}{packageRow.review_comments && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-semibold">Review notes:</span> {packageRow.review_comments}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openFile(packageRow, 'settlement')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Agreement</button>{packageRow.credit_disclosure_file_name && <button type="button" onClick={() => openFile(packageRow, 'credit_disclosure')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Disclosure</button>}</div></div>{packageRow.status === 'awaiting_review' && <div className="mt-4 border-t border-slate-100 pt-4"><textarea value={reviewComments} onChange={(event) => setReviewComments(event.target.value)} rows={2} maxLength={5000} placeholder="Optional approval note, or required return comments..." className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => returnPackage(packageRow)} disabled={returningId === packageRow.id || reviewingId === packageRow.id || !reviewComments.trim()} className="rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{returningId === packageRow.id ? 'Returning…' : 'Return to attorney'}</button><button type="button" onClick={() => approve(packageRow)} disabled={reviewingId === packageRow.id || returningId === packageRow.id} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">{reviewingId === packageRow.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Approve & stage</button></div></div>}{packageRow.status === 'approved' && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-700" /> The approved documents are staged in the Settlement Center Step 1 actions below. Select the normal send action when you are ready to contact the client.</div>}</article>)}</div>}
    </section>
    {showSubmit && <SubmissionModal caseRow={caseRow} onClose={() => setShowSubmit(false)} onSubmitted={async () => { setShowSubmit(false); await loadPackages(); onNotice?.('Settlement package submitted for independent review. Nothing has been sent to the client.'); }} />}
  </>;
}
