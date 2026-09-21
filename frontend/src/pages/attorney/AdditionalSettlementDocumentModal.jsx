import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Mail, Paperclip, Send, Upload, X } from 'lucide-react';
import { createSigningSession, getCase } from '../../lib/api';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const DOCUMENT_TYPES = [
  { value: 'settlement', label: 'Additional Settlement Agreement' },
  { value: 'retainer', label: 'Retainer Agreement' },
  { value: 'engagement_letter', label: 'Engagement Letter' },
  { value: 'authorization', label: 'Authorization Form' },
  { value: 'hipaa', label: 'HIPAA Release' },
  { value: 'affidavit', label: 'Affidavit' },
  { value: 'general', label: 'Other Document' },
];

function clientFromCase(caseData) {
  const client = caseData?.client || {};
  return {
    id: caseData?.client_id || client.id || '',
    name: client.full_name || caseData?.client_name || caseData?.plaintiff_name || '',
    email: client.email || caseData?.client_email || '',
  };
}

function newSubmissionId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `settlement-doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AdditionalSettlementDocumentModal({ caseId, onClose, onSent }) {
  const inputRef = useRef(null);
  const submissionIdRef = useRef('');
  const [caseData, setCaseData] = useState(null);
  const [documentType, setDocumentType] = useState('settlement');
  const [file, setFile] = useState(null);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('Please review and sign the attached document at your earliest convenience.');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const documentLabel = DOCUMENT_TYPES.find((item) => item.value === documentType)?.label || 'Document';

  useEffect(() => {
    let active = true;
    async function loadCase() {
      setLoading(true);
      setError('');
      try {
        const result = await getCase(caseId);
        if (!active) return;
        const client = clientFromCase(result);
        setCaseData(result);
        setSignerName(client.name);
        setSignerEmail(client.email);
        setTitle(`${documentLabel} — ${client.name || 'Client'}`);
      } catch (err) {
        if (active) setError(err.message || 'Could not load the selected case.');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (caseId) loadCase();
    return () => { active = false; };
  }, [caseId]);

  function setType(value) {
    setDocumentType(value);
    submissionIdRef.current = '';
    const client = clientFromCase(caseData);
    const typeLabel = DOCUMENT_TYPES.find((item) => item.value === value)?.label || 'Document';
    setTitle(`${typeLabel} — ${client.name || 'Client'}`);
  }

  function chooseFile(candidate) {
    if (!candidate) return;
    const isSupported = candidate.type === 'application/pdf'
      || candidate.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || /\.(pdf|docx)$/i.test(candidate.name || '');
    if (!isSupported) {
      setError('Choose a PDF or DOCX document.');
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setError('Documents must be 20 MB or smaller.');
      return;
    }
    submissionIdRef.current = '';
    setFile(candidate);
    setError('');
  }

  async function sendDocument() {
    const client = clientFromCase(caseData);
    if (!client.id) {
      setError('This case is missing its linked client. Link the client before sending a document.');
      return;
    }
    if (!file || !signerName.trim() || !signerEmail.trim()) {
      setError('Choose the document and confirm the signer name and email first.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('signer_name', signerName.trim());
      formData.append('signer_email', signerEmail.trim());
      formData.append('title', title.trim() || `${documentLabel} — ${signerName.trim()}`);
      formData.append('document_type', documentType);
      formData.append('case_id', caseId);
      formData.append('client_id', client.id);
      formData.append('message', message.trim() || 'Please review and sign the attached document at your earliest convenience.');
      if (!submissionIdRef.current) submissionIdRef.current = newSubmissionId();
      formData.append('submission_id', submissionIdRef.current);
      const result = await createSigningSession(formData);
      await onSent?.({ documentType, documentLabel, result });
    } catch (err) {
      setError(err.message || 'Could not send this document for signature.');
    } finally {
      setSending(false);
    }
  }

  const caseLabel = caseData?.case_number || (caseData?.id ? `Case ${String(caseData.id).slice(0, 8)}` : 'Selected case');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="additional-settlement-document-title">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div><p className="text-xs font-bold uppercase tracking-wider text-primary-700">Settlement Center</p><h2 id="additional-settlement-document-title" className="mt-1 text-xl font-bold text-slate-900">Send another document</h2><p className="mt-1 text-sm text-slate-600">Add another agreement or supporting signature document without replacing the documents already sent for this case.</p></div>
          <button onClick={onClose} disabled={sending} aria-label="Close additional document sender" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 p-6">
          {loading ? <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-12 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-primary-700" /> Loading the selected case…</div> : <>
            <section className="rounded-xl border border-primary-200 bg-primary-50 p-4"><div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" /><div><p className="text-sm font-bold text-primary-950">{clientFromCase(caseData).name || 'Client'} · {caseLabel}</p><p className="mt-1 text-xs leading-5 text-primary-900/80">This new document is linked to the selected case and saved alongside its existing signature requests.</p></div></div></section>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Document type<select value={documentType} onChange={(event) => setType(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal normal-case outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">{DOCUMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <div><label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Document <span className="text-red-600">*</span></label>{file ? <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5"><Paperclip className="h-5 w-5 shrink-0 text-emerald-700" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-emerald-950">{file.name}</p><p className="mt-0.5 text-xs text-emerald-700">{(file.size / 1024).toFixed(0)} KB · Ready to send</p></div><button onClick={() => { submissionIdRef.current = ''; setFile(null); if (inputRef.current) inputRef.current.value = ''; }} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Remove selected document"><X className="h-4 w-4" /></button></div> : <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer?.files?.[0]); }} onClick={() => inputRef.current?.click()} className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-5 py-7 text-center hover:border-primary-400 hover:bg-primary-50/40"><Upload className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700">Drop a PDF or DOCX here or <span className="text-primary-700">browse files</span></p><p className="mt-1 text-xs text-slate-500">Maximum 20 MB</p></div>}<input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0])} /></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Signer name <span className="text-red-600">*</span><input value={signerName} onChange={(event) => { submissionIdRef.current = ''; setSignerName(event.target.value); }} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></label><label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Signer email <span className="text-red-600">*</span><div className="relative mt-1.5"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="email" value={signerEmail} onChange={(event) => { submissionIdRef.current = ''; setSignerEmail(event.target.value); }} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm font-normal normal-case outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></div></label></div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Document title<input value={title} onChange={(event) => { submissionIdRef.current = ''; setTitle(event.target.value); }} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Message to client<textarea value={message} onChange={(event) => { submissionIdRef.current = ''; setMessage(event.target.value); }} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></label>
            {error && <div className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
            <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> This creates a separate, auditable signature request. It does not overwrite a previous settlement agreement, W-9, or closing statement.</p>
          </>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-6 py-4 sm:flex-row sm:justify-end"><button onClick={onClose} disabled={sending} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancel</button><button onClick={sendDocument} disabled={loading || sending || !file || !signerName.trim() || !signerEmail.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50">{sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send document for signature</>}</button></div>
      </div>
    </div>
  );
}
