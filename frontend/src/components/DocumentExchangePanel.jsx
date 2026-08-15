import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileText, FolderSync,
  Loader2, MessageSquare, Paperclip, Send, Upload, X,
} from 'lucide-react';
import {
  addDocumentExchangeComment,
  addDocumentExchangePackage,
  createDocumentExchange,
  getDocumentAccessUrl,
  getDocumentExchanges,
  uploadDocument,
} from '../lib/api';

const TYPE_OPTIONS = [
  ['interrogatories', 'Interrogatories'],
  ['requests_for_production', 'Requests for Production'],
  ['requests_for_admission', 'Requests for Admission'],
  ['discovery_response', 'Discovery Response'],
  ['declaration', 'Declaration'],
  ['settlement_draft', 'Settlement Draft'],
  ['court_filing', 'Court Filing'],
  ['other', 'Other document'],
];

const STAGE_OPTIONS = [
  ['attorney_draft', 'Attorney draft'],
  ['owner_working_copy', 'Owner working copy'],
  ['returned_for_review', 'Returned for review'],
  ['final_attorney_version', 'Final attorney version'],
  ['filed_served', 'Filed / served'],
];

function labelFor(value, options) {
  return options.find(([key]) => key === value)?.[1] || String(value || '—').replace(/_/g, ' ');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function statusClass(status) {
  if (status === 'finalized') return 'bg-emerald-100 text-emerald-800';
  if (status === 'awaiting_owner') return 'bg-amber-100 text-amber-800';
  if (status === 'awaiting_attorney') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

function stageClass(stage) {
  if (stage === 'final_attorney_version' || stage === 'filed_served') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (stage === 'returned_for_review') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

const NEW_THREAD = {
  title: '', document_type: 'interrogatories', stage: 'attorney_draft', message: '',
};

export default function DocumentExchangePanel({ caseId, documents, onRefreshDocuments }) {
  const [threads, setThreads] = useState([]);
  const [viewerId, setViewerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newThread, setNewThread] = useState(NEW_THREAD);
  const [newSelected, setNewSelected] = useState([]);
  const [replyingTo, setReplyingTo] = useState('');
  const [replyDraft, setReplyDraft] = useState({ document_ids: [], message: '', stage: 'returned_for_review' });
  const [commentByThread, setCommentByThread] = useState({});
  const [expanded, setExpanded] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const availableDocuments = useMemo(
    () => (documents || []).filter((document) => String(document.document_category || document.category || '').toLowerCase() !== 'pii'),
    [documents],
  );

  async function loadThreads() {
    if (!caseId) return;
    setLoading(true);
    try {
      const result = await getDocumentExchanges(caseId);
      setThreads(Array.isArray(result) ? result : result?.threads || []);
      setViewerId(result?.viewer_id || '');
    } catch (err) {
      setError(err.message || 'Could not load the Document Exchange workspace.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadThreads(); }, [caseId]);
  useEffect(() => {
    const valid = new Set(availableDocuments.map((item) => item.id));
    setNewSelected((current) => current.filter((id) => valid.has(id)));
    setReplyDraft((current) => ({ ...current, document_ids: current.document_ids.filter((id) => valid.has(id)) }));
  }, [availableDocuments]);

  function toggleSelection(id, selected, setter) {
    setter((current) => selected ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }

  async function uploadWorkingFiles(fileList) {
    if (!fileList?.length) return;
    setUploading(true); setError(''); setSuccess('');
    const uploadedIds = [];
    try {
      for (const file of Array.from(fileList)) {
        const result = await uploadDocument(caseId, file, 'other');
        if (result?.id) uploadedIds.push(result.id);
      }
      await onRefreshDocuments?.();
      if (replyingTo) {
                  setReplyDraft((current) => ({ ...current, document_ids: [...new Set([...current.document_ids, ...uploadedIds])] }));

      } else {
        setNewSelected((current) => [...new Set([...current, ...uploadedIds])]);
      }
      setSuccess(`${uploadedIds.length || fileList.length} working document${(uploadedIds.length || fileList.length) === 1 ? '' : 's'} uploaded to this case and selected for the package.`);
    } catch (err) {
      setError(err.message || 'Could not upload the working document.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function submitNewThread() {
    if (!newThread.title.trim() || !newSelected.length) return;
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const result = await createDocumentExchange(caseId, {
        ...newThread,
        title: newThread.title.trim(),
        message: newThread.message.trim() || null,
        document_ids: newSelected,
      });
      const thread = result?.thread;
      if (thread) setThreads((current) => [thread, ...current]);
      setNewThread(NEW_THREAD); setNewSelected([]); setShowNew(false);
      setSuccess('Document package sent. The recipient received a secure LegalFlow notice and can return the completed draft in this same thread.');
    } catch (err) {
      setError(err.message || 'Could not send this document package.');
    } finally {
      setSubmitting(false);
    }
  }

  function startReply(thread) {
    setReplyingTo(thread.id);
    setReplyDraft({ document_ids: [], message: '', stage: 'returned_for_review' });
    setExpanded((current) => ({ ...current, [thread.id]: true }));
  }

  async function submitReply(thread) {
    if (!replyDraft.document_ids.length) return;
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const result = await addDocumentExchangePackage(caseId, thread.id, {
        ...replyDraft,
        message: replyDraft.message.trim() || null,
      });
      const updated = result?.thread;
      if (updated) setThreads((current) => current.map((item) => item.id === updated.id ? updated : item));
      setReplyingTo('');
      setReplyDraft({ document_ids: [], message: '', stage: 'returned_for_review' });
      setSuccess('New document version sent. The prior draft remains in the thread history for this case.');
    } catch (err) {
      setError(err.message || 'Could not send the returned document package.');
    } finally {
      setSubmitting(false);
    }
  }

  async function sendComment(thread) {
    const body = String(commentByThread[thread.id] || '').trim();
    if (!body) return;
    setSubmitting(true); setError('');
    try {
      const latestPackage = thread.packages?.[thread.packages.length - 1];
      const comment = await addDocumentExchangeComment(caseId, thread.id, { body, package_id: latestPackage?.id || null });
      setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, comments: [...(item.comments || []), comment] } : item));
      setCommentByThread((current) => ({ ...current, [thread.id]: '' }));
    } catch (err) {
      setError(err.message || 'Could not add the review note.');
    } finally {
      setSubmitting(false);
    }
  }

  async function openDocument(documentId) {
    setError('');
    try {
      const result = await getDocumentAccessUrl(caseId, documentId);
      if (!result?.url) throw new Error('This document is not currently available.');
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message || 'Could not open the document securely.');
    }
  }

  const selectedForNew = new Set(newSelected);
  const selectedForReply = new Set(replyDraft.document_ids);

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-800"><FolderSync className="h-4 w-4" />Document Exchange</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">Private drafts and document packages for this client’s case</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Send drafts to the assigned attorney, return completed versions, add review notes, and keep every version in one case-specific thread. Documents remain in LegalFlow; email notices direct the recipient back to this workspace.</p>
        </div>
        <button type="button" onClick={() => { setShowNew((value) => !value); setReplyingTo(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800"><Send className="h-4 w-4" />New document package</button>
      </div>

      {(error || success) && <div className={`mt-4 rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{error ? <AlertCircle className="mr-1 inline h-4 w-4" /> : <CheckCircle2 className="mr-1 inline h-4 w-4" />}{error || success}</div>}

      {(showNew || replyingTo) && <div className="mt-4 rounded-xl border border-violet-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{replyingTo ? 'Return a new draft version' : 'Create a document exchange thread'}</h3><p className="mt-1 text-sm text-slate-600">Upload working files if needed, select the documents, then send a secure in-app package to the other participant.</p></div><button type="button" onClick={() => { setShowNew(false); setReplyingTo(''); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close composer"><X className="h-4 w-4" /></button></div>

        {!replyingTo && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="sm:col-span-2 text-sm font-medium text-slate-700">Thread title<input value={newThread.title} onChange={(event) => setNewThread((current) => ({ ...current, title: event.target.value }))} maxLength={240} placeholder="Example: Interrogatories — Jada Wiggins" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-600" /></label><label className="text-sm font-medium text-slate-700">Document type<select value={newThread.document_type} onChange={(event) => setNewThread((current) => ({ ...current, document_type: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-600">{TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium text-slate-700">This package is<select value={newThread.stage} onChange={(event) => setNewThread((current) => ({ ...current, stage: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-600">{STAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}

        {replyingTo && <label className="mt-3 block text-sm font-medium text-slate-700">Returned package stage<select value={replyDraft.stage} onChange={(event) => setReplyDraft((current) => ({ ...current, stage: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-600">{STAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-slate-800">Case documents to include <span className="text-red-600">*</span></p><p className="mt-0.5 text-xs text-slate-500">PII documents are intentionally excluded from Document Exchange.</p></div><button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload working file'}</button><input ref={inputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg" className="hidden" onChange={(event) => uploadWorkingFiles(event.target.files)} /></div>
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">{availableDocuments.length === 0 ? <p className="px-2 py-3 text-sm text-slate-500">No eligible case documents are available yet. Upload a working file to start.</p> : availableDocuments.map((document) => { const selected = replyingTo ? selectedForReply.has(document.id) : selectedForNew.has(document.id); return <label key={document.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${selected ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><input type="checkbox" checked={selected} onChange={(event) => replyingTo ? toggleSelection(document.id, event.target.checked, (updater) => setReplyDraft((current) => ({ ...current, document_ids: updater(current.document_ids) }))) : toggleSelection(document.id, event.target.checked, setNewSelected)} className="h-4 w-4 rounded border-slate-300 text-violet-700 focus:ring-violet-600" /><FileText className="h-4 w-4 text-violet-600" /><span className="min-w-0 flex-1 truncate text-sm text-slate-800">{document.file_name || 'Case document'}</span><span className="text-[11px] uppercase tracking-wide text-slate-400">{String(document.document_category || 'other').replace(/_/g, ' ')}</span></label>; })}</div>
        <label className="mt-3 block text-sm font-medium text-slate-700">Message or instructions <span className="font-normal text-slate-400">(optional)</span><textarea value={replyingTo ? replyDraft.message : newThread.message} onChange={(event) => replyingTo ? setReplyDraft((current) => ({ ...current, message: event.target.value })) : setNewThread((current) => ({ ...current, message: event.target.value }))} rows={3} maxLength={4000} placeholder="Example: Please complete questions 1–8 and return this for my review." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-600" /></label>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setShowNew(false); setReplyingTo(''); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="button" disabled={submitting || (replyingTo ? !replyDraft.document_ids.length : !newThread.title.trim() || !newSelected.length)} onClick={() => replyingTo ? submitReply(threads.find((thread) => thread.id === replyingTo)) : submitNewThread()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}<Send className="h-4 w-4" />{replyingTo ? 'Send new version' : 'Send package'}</button></div>
      </div>}

      <div className="mt-4 space-y-3">{loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading document threads…</p> : threads.length === 0 ? <div className="rounded-xl border border-dashed border-violet-200 bg-white/80 p-5 text-sm text-slate-600"><p className="font-semibold text-slate-800">No document exchanges in this case yet.</p><p className="mt-1">Start a thread for interrogatories, discovery responses, settlement drafts, or any document that needs to go back and forth with the assigned attorney.</p></div> : threads.map((thread) => { const isOpen = Boolean(expanded[thread.id]); const latest = thread.packages?.[thread.packages.length - 1]; const awaitingYou = latest?.recipient_id === viewerId && thread.status !== 'finalized'; return <article key={thread.id} className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm"><button type="button" onClick={() => setExpanded((current) => ({ ...current, [thread.id]: !current[thread.id] }))} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-violet-50/40"><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold text-slate-900">{thread.title}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClass(thread.status)}`}>{thread.status === 'awaiting_owner' ? 'Awaiting you' : thread.status === 'awaiting_attorney' ? 'Awaiting attorney' : thread.status === 'finalized' ? 'Finalized' : 'Archived'}</span>{awaitingYou && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">Your review</span>}</span><span className="mt-1 block text-xs text-slate-500">{labelFor(thread.document_type, TYPE_OPTIONS)} · {thread.packages?.length || 0} version{(thread.packages?.length || 0) === 1 ? '' : 's'} · updated {formatDate(thread.last_activity_at)}</span></span>{isOpen ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-500" />}</button>{isOpen && <div className="border-t border-violet-100 px-4 pb-4 pt-3"><div className="space-y-3">{(thread.packages || []).map((pkg) => <div key={pkg.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Version {pkg.version_number} <span className={`ml-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stageClass(pkg.stage)}`}>{labelFor(pkg.stage, STAGE_OPTIONS)}</span></p><span className="text-xs text-slate-500">{pkg.sender_name} · {formatDate(pkg.sent_at)}</span></div>{pkg.message && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{pkg.message}</p>}<div className="mt-2 flex flex-wrap gap-2">{(pkg.items || []).map((item) => <button type="button" key={item.id || item.case_document_id} onClick={() => openDocument(item.case_document_id)} className="inline-flex max-w-full items-center gap-1 rounded-md border border-violet-200 bg-white px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.file_name}</span></button>)}</div></div>)}</div><div className="mt-4 border-t border-slate-100 pt-3"><p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><MessageSquare className="h-4 w-4 text-violet-700" />Review notes</p>{(thread.comments || []).length > 0 && <div className="mt-2 space-y-2">{thread.comments.map((comment) => <div key={comment.id} className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs font-semibold text-slate-700">{comment.author_name} <span className="font-normal text-slate-400">· {formatDate(comment.created_at)}</span></p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{comment.body}</p></div>)}</div>}<div className="mt-3 flex gap-2"><textarea value={commentByThread[thread.id] || ''} onChange={(event) => setCommentByThread((current) => ({ ...current, [thread.id]: event.target.value }))} rows={2} maxLength={4000} placeholder="Add a case-specific review note…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-600" /><button type="button" onClick={() => sendComment(thread)} disabled={submitting || !String(commentByThread[thread.id] || '').trim()} className="self-end rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60">Note</button></div></div><div className="mt-4 flex justify-end"><button type="button" onClick={() => startReply(thread)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800"><Send className="h-4 w-4" />{awaitingYou ? 'Return completed version' : 'Send new version'}</button></div></div>}</article>; })}</div>
    </section>
  );
}
