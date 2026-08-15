import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Send, Upload } from 'lucide-react';
import {
  getDiscoveryDocumentDeliveries,
  sendDiscoveryDocumentsToAttorney,
  uploadDocument,
} from '../lib/api';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function fileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DiscoveryDeliveryPanel({ caseId, documents, onRefreshDocuments }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const inputRef = useRef(null);

  const discoveryDocuments = useMemo(() => (documents || []).filter((document) => String(document.document_category || document.category || '').toLowerCase() === 'discovery'), [documents]);
  const selectedDocuments = useMemo(() => discoveryDocuments.filter((document) => selectedIds.includes(document.id)), [discoveryDocuments, selectedIds]);

  async function loadHistory() {
    if (!caseId) return;
    setLoadingHistory(true);
    try {
      const result = await getDiscoveryDocumentDeliveries(caseId);
      setDeliveries(Array.isArray(result) ? result : result?.data || []);
    } catch (err) {
      setError(err.message || 'Could not load discovery delivery history.');
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => { loadHistory(); }, [caseId]);
  useEffect(() => { setSelectedIds((current) => current.filter((id) => discoveryDocuments.some((item) => item.id === id))); }, [discoveryDocuments]);

  function toggleDocument(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function uploadDiscovery(files) {
    if (!files?.length) return;
    setUploading(true); setError(''); setSuccess('');
    const uploadedIds = [];
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadDocument(caseId, file, 'discovery');
        if (uploaded?.id) uploadedIds.push(uploaded.id);
      }
      await onRefreshDocuments?.();
      setSelectedIds((current) => [...new Set([...current, ...uploadedIds])]);
      setSuccess(`${uploadedIds.length || files.length} discovery document${(uploadedIds.length || files.length) === 1 ? '' : 's'} uploaded. Select them below and send when ready.`);
    } catch (err) {
      setError(err.message || 'Could not upload the discovery document.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function sendSelected() {
    if (!selectedIds.length) return;
    setSending(true); setError(''); setSuccess('');
    try {
      const result = await sendDiscoveryDocumentsToAttorney(caseId, selectedIds, message.trim());
      setSuccess(`${result.document_count || selectedIds.length} discovery document${(result.document_count || selectedIds.length) === 1 ? '' : 's'} sent to ${result.recipient_name || 'the assigned attorney'} by email. The delivery is saved in this case.`);
      setSelectedIds([]);
      setMessage('');
      setShowComposer(false);
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Could not send discovery documents to the assigned attorney.');
    } finally {
      setSending(false);
    }
  }

  return <section className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-800"><Send className="h-4 w-4" />Discovery delivery</p>
        <h2 className="mt-1 text-base font-semibold text-slate-900">Upload and send discovery to the assigned attorney</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Upload documents here as <strong>Discovery</strong>, select the files you want to send, and LegalFlow attaches them directly to an email for the client’s assigned attorney. Each delivery stays recorded in this case.</p>
      </div>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload discovery'}</button>
      <input ref={inputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg" className="hidden" onChange={(event) => uploadDiscovery(event.target.files)} />
    </div>

    {(error || success) && <div className={`mt-4 rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{error ? <AlertCircle className="mr-1 inline h-4 w-4" /> : <CheckCircle2 className="mr-1 inline h-4 w-4" />}{error || success}</div>}

    <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Discovery files in this case</h3><p className="mt-1 text-xs text-slate-500">Choose up to 10 files, with a combined attachment size of 20 MB or less.</p></div>{selectedDocuments.length > 0 && <button type="button" onClick={() => setShowComposer(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800"><Send className="h-4 w-4" />Send {selectedDocuments.length} to attorney</button>}</div>
      <div className="mt-3 space-y-2">{discoveryDocuments.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">No discovery documents have been uploaded yet. Use <strong>Upload discovery</strong> above to add the files you received.</p> : discoveryDocuments.map((document) => <label key={document.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${selectedIds.includes(document.id) ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><input type="checkbox" checked={selectedIds.includes(document.id)} onChange={() => toggleDocument(document.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-600" /><FileText className="h-4 w-4 shrink-0 text-indigo-600" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{document.file_name || 'Discovery document'}</span><span className="mt-0.5 block text-xs text-slate-500">{fileSize(document.file_size)}{document.created_at ? ` · uploaded ${formatDate(document.created_at)}` : ''}</span></span></label>)}</div>
    </div>

    {showComposer && <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Confirm discovery delivery</h3><p className="mt-1 text-sm text-slate-600">The selected files will be attached directly to an email for the assigned attorney. No expiring document links or banking information are included.</p></div><button type="button" onClick={() => setShowComposer(false)} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button></div><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={2000} placeholder="Optional note to the attorney" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setShowComposer(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="button" onClick={sendSelected} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60">{sending && <Loader2 className="h-4 w-4 animate-spin" />}{sending ? 'Sending…' : `Send ${selectedDocuments.length} document${selectedDocuments.length === 1 ? '' : 's'}`}</button></div></div>}

    <div className="mt-4 border-t border-indigo-100 pt-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-indigo-700" /><h3 className="font-semibold text-slate-900">Delivery history</h3></div>{loadingHistory ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading deliveries…</p> : deliveries.length === 0 ? <p className="mt-3 text-sm text-slate-500">No discovery deliveries have been sent from this case yet.</p> : <div className="mt-3 space-y-2">{deliveries.map((delivery) => <div key={delivery.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-slate-800">{delivery.document_count || delivery.items?.length || 0} document{(delivery.document_count || delivery.items?.length || 0) === 1 ? '' : 's'} sent to {delivery.recipient_email}</p><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${delivery.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : delivery.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{delivery.status === 'sent' ? 'Sent' : delivery.status === 'failed' ? 'Failed' : 'Sending'}</span></div><p className="mt-1 text-xs text-slate-500">{formatDate(delivery.sent_at || delivery.created_at)}{delivery.items?.length ? ` · ${delivery.items.map((item) => item.file_name).join(', ')}` : ''}</p>{delivery.failure_reason && <p className="mt-1 text-xs text-red-700">{delivery.failure_reason}</p>}</div>)}</div>}</div>
  </section>;
}
