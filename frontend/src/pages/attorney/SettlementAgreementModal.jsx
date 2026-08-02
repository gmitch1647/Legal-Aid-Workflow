import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Send,
  Upload,
  X,
} from 'lucide-react';
import {
  createSigningSession,
  downloadOriginalAttachment,
  downloadSignedDocument,
  getCase,
  getSignatureRequest,
  remindSigner,
} from '../../lib/api';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function clientFromCase(caseData) {
  const client = caseData?.client || {};
  return {
    id: caseData?.client_id || client.id || '',
    name: client.full_name || caseData?.client_name || caseData?.plaintiff_name || '',
    email: client.email || caseData?.client_email || '',
  };
}

export default function SettlementAgreementModal({ caseId, onClose, onSent }) {
  const fileInputRef = useRef(null);
  const [caseData, setCaseData] = useState(null);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [title, setTitle] = useState('Settlement Agreement');
  const [message, setMessage] = useState('Please review and sign the attached settlement agreement at your earliest convenience.');
  const [file, setFile] = useState(null);
  const [loadingCase, setLoadingCase] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadCase() {
      setLoadingCase(true);
      setError('');
      setFile(null);
      try {
        const result = await getCase(caseId);
        if (!active) return;
        const client = clientFromCase(result);
        setCaseData(result);
        setSignerName(client.name);
        setSignerEmail(client.email);
        setTitle(client.name ? `Settlement Agreement — ${client.name}` : 'Settlement Agreement');
      } catch (err) {
        if (active) setError(err.message || 'Unable to load the selected case for this settlement agreement.');
      } finally {
        if (active) setLoadingCase(false);
      }
    }

    if (caseId) loadCase();
    return () => { active = false; };
  }, [caseId]);

  function chooseFile(candidate) {
    if (!candidate) return;
    const isSupported = candidate.type === 'application/pdf'
      || candidate.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || /\.(pdf|docx)$/i.test(candidate.name || '');

    if (!isSupported) {
      setError('Choose a PDF or DOCX settlement agreement.');
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setError('The settlement agreement is too large. Files must be 20 MB or smaller.');
      return;
    }

    setFile(candidate);
    setError('');
    if (!title || title === 'Settlement Agreement') {
      setTitle(candidate.name.replace(/\.(pdf|docx)$/i, ''));
    }
  }

  function onFileInputChange(event) {
    chooseFile(event.target.files?.[0]);
  }

  function onDrop(event) {
    event.preventDefault();
    chooseFile(event.dataTransfer?.files?.[0]);
  }

  async function sendAgreement() {
    const client = clientFromCase(caseData);
    if (!client.id) {
      setError('This case is missing its linked client. Open the case file and link a client before sending the agreement.');
      return;
    }
    if (!signerName.trim() || !signerEmail.trim()) {
      setError('A signer name and email address are required.');
      return;
    }
    if (!file) {
      setError('Upload the final settlement agreement before sending it for signature.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('signer_name', signerName.trim());
      formData.append('signer_email', signerEmail.trim());
      formData.append('title', title.trim() || 'Settlement Agreement');
      formData.append('document_type', 'settlement');
      formData.append('case_id', caseId);
      formData.append('client_id', client.id);
      formData.append('message', message.trim() || 'Please review and sign the attached settlement agreement.');
      await createSigningSession(formData);
      await onSent();
    } catch (err) {
      setError(err.message || 'Unable to send the settlement agreement for signature.');
    } finally {
      setSending(false);
    }
  }

  const caseLabel = caseData?.case_number || (caseData?.id ? `Case ${String(caseData.id).slice(0, 8)}` : 'Selected case');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="settlement-agreement-title">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-700">Settlement Center · Step 1</p>
            <h2 id="settlement-agreement-title" className="mt-1 text-xl font-bold text-slate-900">Send settlement agreement</h2>
            <p className="mt-1 text-sm text-slate-600">The agreement remains linked to this case and the workflow will update as soon as it is sent.</p>
          </div>
          <button onClick={onClose} disabled={sending} aria-label="Close settlement agreement" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 p-6">
          {loadingCase ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-12 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-primary-700" /> Loading the selected settlement case…</div>
          ) : (
            <>
              <section className="rounded-xl border border-primary-200 bg-primary-50 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
                  <div>
                    <p className="text-sm font-bold text-primary-950">{caseData?.client_name || caseData?.client?.full_name || caseData?.plaintiff_name || 'Client'} · {caseLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-primary-900/80">The client and case are already linked. You only need to upload the final agreement and confirm the signing contact.</p>
                  </div>
                </div>
              </section>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Final settlement agreement <span className="text-red-600">*</span></label>
                {file ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                    <Paperclip className="h-5 w-5 shrink-0 text-emerald-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-emerald-950">{file.name}</p>
                      <p className="mt-0.5 text-xs text-emerald-700">{(file.size / 1024).toFixed(0)} KB · Ready to send</p>
                    </div>
                    <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="rounded-lg p-1 text-emerald-700 transition hover:bg-emerald-100" aria-label="Remove selected agreement"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => fileInputRef.current?.click()} className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-5 py-7 text-center transition hover:border-primary-400 hover:bg-primary-50/40">
                    <Upload className="mx-auto h-7 w-7 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">Drop the final agreement here or <span className="text-primary-700">browse files</span></p>
                    <p className="mt-1 text-xs text-slate-500">PDF or DOCX · Maximum 20 MB</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={onFileInputChange} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Signer name <span className="text-red-600">*</span></label>
                  <input value={signerName} onChange={(event) => setSignerName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Signer email <span className="text-red-600">*</span></label>
                  <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="email" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Document title</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Message to client</label>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
              </div>

              {error && <div className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
                <button onClick={onClose} disabled={sending} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                <button onClick={sendAgreement} disabled={loadingCase || sending || !file || !signerName.trim() || !signerEmail.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending agreement…</> : <><Send className="h-4 w-4" /> Send agreement for signature</>}
                </button>
              </div>
              <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> The client receives a secure signing link. After it is sent, Settlement Center will advance to the W-9 step without taking you to the standalone E-Signatures page.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function SettlementAgreementStatusModal({ agreement, onClose, onRefresh }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadDetails() {
    setLoading(true);
    setError('');
    try {
      const result = await getSignatureRequest(agreement.id);
      setDetails(result);
    } catch (err) {
      setError(err.message || 'Unable to load the agreement status.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetails();
  }, [agreement.id]);

  const isComplete = details?.is_complete || ['signed', 'complete', 'completed', 'completed_by_all'].includes(agreement.status);
  const statusLabel = isComplete ? 'Signed' : (details?.signatures?.[0]?.status || agreement.status || 'Awaiting signature').replace(/_/g, ' ');
  const signer = details?.signatures?.[0] || {};

  async function refreshAgreement() {
    await Promise.all([loadDetails(), onRefresh?.()]);
  }

  async function handleRemind() {
    setReminding(true);
    setError('');
    setMessage('');
    try {
      await remindSigner(agreement.id);
      setMessage('A reminder was sent to the client.');
    } catch (err) {
      setError(err.message || 'Unable to send the reminder.');
    } finally {
      setReminding(false);
    }
  }

  async function handleOriginalDownload() {
    setError('');
    try {
      const blob = await downloadOriginalAttachment(agreement.id);
      downloadBlob(blob, details?.source_file_name || `settlement-agreement-${String(agreement.id).slice(0, 8)}`);
    } catch (err) {
      setError(err.message || 'The original agreement is not available for download.');
    }
  }

  async function handleSignedDownload() {
    setError('');
    try {
      const blob = await downloadSignedDocument(agreement.id);
      downloadBlob(blob, `signed-settlement-agreement-${String(agreement.id).slice(0, 8)}.pdf`);
    } catch (err) {
      setError(err.message || 'The signed agreement is not available yet.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="agreement-status-title">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-700">Settlement Center · Step 1</p>
            <h2 id="agreement-status-title" className="mt-1 text-xl font-bold text-slate-900">Settlement agreement</h2>
            <p className="mt-1 text-sm text-slate-600">Review the signature status without leaving this settlement workflow.</p>
          </div>
          <button onClick={onClose} aria-label="Close agreement status" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-primary-700" /> Updating agreement status…</div>
          ) : (
            <>
              <section className={`rounded-xl border p-4 ${isComplete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-start gap-3">
                  {isComplete ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
                  <div>
                    <p className={`text-sm font-bold ${isComplete ? 'text-emerald-950' : 'text-amber-950'}`}>{isComplete ? 'Agreement signed' : 'Awaiting client signature'}</p>
                    <p className={`mt-1 text-xs leading-5 ${isComplete ? 'text-emerald-800' : 'text-amber-800'}`}>{agreement.title || 'Settlement agreement'} · {statusLabel}</p>
                  </div>
                </div>
              </section>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Client signer</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{signer.signer_name || agreement.signer_name || 'Client'}</p>
                <p className="mt-0.5 text-sm text-slate-600">{signer.signer_email || agreement.signer_email || 'No email available'}</p>
              </div>

              {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
              {error && <div className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}

              <div className="grid gap-2 sm:grid-cols-2">
                <button onClick={refreshAgreement} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Clock3 className="h-4 w-4" /> Refresh status</button>
                {!isComplete && <button onClick={handleRemind} disabled={reminding} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3.5 py-2.5 text-sm font-semibold text-primary-800 transition hover:bg-primary-100 disabled:opacity-50">{reminding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}{reminding ? 'Sending reminder…' : 'Send reminder'}</button>}
                {details?.has_source_attachment && <button onClick={handleOriginalDownload} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Download className="h-4 w-4" /> Original agreement</button>}
                {isComplete && <button onClick={handleSignedDownload} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"><Download className="h-4 w-4" /> Signed agreement</button>}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-4"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">Close</button></div>
      </div>
    </div>
  );
}
