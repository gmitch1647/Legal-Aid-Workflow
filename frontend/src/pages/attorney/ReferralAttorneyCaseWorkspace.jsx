import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, FileText, Loader2, MessageCircle, Send } from 'lucide-react';
import { getCases, getDocumentAccessUrl, getDocuments, getMessages, sendMessage } from '../../lib/api';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ReferralAttorneyCaseWorkspace() {
  const { caseId } = useParams();
  const [caseItem, setCaseItem] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const casesResult = await getCases();
      const cases = Array.isArray(casesResult) ? casesResult : casesResult?.items || casesResult?.cases || [];
      const ownCase = cases.find((item) => item.id === caseId);
      if (!ownCase) {
        setCaseItem(null);
        return;
      }
      setCaseItem(ownCase);
      const [documentResult, messageResult] = await Promise.all([getDocuments(caseId), getMessages(caseId)]);
      setDocuments(Array.isArray(documentResult) ? documentResult : documentResult?.documents || documentResult?.items || []);
      setMessages(Array.isArray(messageResult) ? messageResult : messageResult?.messages || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load this referral case.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  async function openDocument(document) {
    try {
      const result = await getDocumentAccessUrl(caseId, document.id);
      window.open(result?.url || result?.access_url, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      setError(openError.message || 'Could not open this document.');
    }
  }

  async function submitMessage(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    try {
      setSending(true);
      setError('');
      const message = await sendMessage(caseId, body);
      setMessages((current) => [...current, { ...message, sender: { full_name: 'You', role: 'affiliate' } }]);
      setDraft('');
    } catch (sendError) {
      setError(sendError.message || 'Could not send the message.');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="flex h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (!caseItem) return <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900"><p className="font-semibold">Referral case unavailable</p><p className="mt-1">This case is not part of your referral workspace.</p><Link to="/attorney/clients" className="mt-4 inline-flex font-medium text-indigo-700">Return to My Clients</Link></div>;

  const clientName = caseItem.client?.full_name || caseItem.client_name || caseItem.plaintiff_name || 'Client';
  return <div className="mx-auto max-w-6xl space-y-6">
    <Link to="/attorney/clients" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700"><ArrowLeft className="h-4 w-4" />My Clients</Link>
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm font-semibold text-indigo-700">REFERRAL CASE</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{clientName}</h1><div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600"><span className="rounded-full bg-slate-100 px-3 py-1">{caseItem.status?.replaceAll('_', ' ') || 'Submitted'}</span><span className="rounded-full bg-slate-100 px-3 py-1">Submitted {formatDate(caseItem.created_at)}</span></div></div>
    {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="flex items-center gap-2 font-bold text-slate-900"><FileText className="h-5 w-5 text-indigo-600" />Case documents</h2><p className="mt-1 text-sm text-slate-500">Documents shared on this referral case.</p></div><div className="divide-y divide-slate-100">{documents.length ? documents.map((document) => <button key={document.id} onClick={() => openDocument(document)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50"><FileText className="h-5 w-5 shrink-0 text-indigo-600" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{document.file_name}</span><span className="text-xs text-slate-500">{document.document_category || 'document'}</span></button>) : <p className="p-8 text-center text-sm text-slate-500">No documents are available yet.</p>}</div></section>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="flex items-center gap-2 font-bold text-slate-900"><MessageCircle className="h-5 w-5 text-indigo-600" />Message client</h2><p className="mt-1 text-sm text-slate-500">Messages stay in this case record and notify the client.</p></div><div className="max-h-72 space-y-3 overflow-y-auto p-5">{messages.length ? messages.map((message) => <div key={message.id} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{message.sender?.full_name || 'LegalFlow user'} · {formatDate(message.created_at)}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{message.body}</p></div>) : <p className="py-6 text-center text-sm text-slate-500">No messages have been sent on this case.</p>}</div><form onSubmit={submitMessage} className="border-t border-slate-200 p-4"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="input min-h-24" placeholder={`Message ${clientName}…`} maxLength={4000} /><button type="submit" disabled={sending || !draft.trim()} className="btn-primary mt-3 gap-2"><Send className="h-4 w-4" />{sending ? 'Sending…' : 'Send message'}</button></form></section>
    </div>
  </div>;
}
