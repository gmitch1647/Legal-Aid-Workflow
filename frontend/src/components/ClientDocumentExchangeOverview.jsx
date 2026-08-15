import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, FolderSync, Loader2 } from 'lucide-react';
import { getClientDocumentExchanges } from '../lib/api';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusClass(status) {
  if (status === 'finalized') return 'bg-emerald-100 text-emerald-800';
  if (status === 'awaiting_owner') return 'bg-amber-100 text-amber-800';
  if (status === 'awaiting_attorney') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

export default function ClientDocumentExchangeOverview({ clientId }) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!clientId) return undefined;
    setLoading(true);
    getClientDocumentExchanges(clientId)
      .then((result) => active && setThreads(Array.isArray(result) ? result : result?.threads || []))
      .catch((err) => active && setError(err.message || 'Could not load Document Exchange threads.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [clientId]);

  return (
    <section className="card border-violet-200 bg-violet-50/30">
      <div className="flex items-start gap-2">
        <div className="rounded-lg bg-violet-100 p-2 text-violet-700"><FolderSync className="h-4 w-4" /></div>
        <div><h3 className="text-base font-semibold text-slate-900">Document Exchange</h3><p className="mt-1 text-xs leading-5 text-slate-600">All attorney collaboration threads for this client, kept separate by case.</p></div>
      </div>
      {loading ? <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading exchanges…</p> : error ? <p className="mt-4 flex items-start gap-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p> : threads.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-violet-200 bg-white/70 px-3 py-4 text-sm text-slate-500">No document exchanges for this client yet. Start one from the appropriate case page.</p> : <div className="mt-4 space-y-2">{threads.slice(0, 8).map((thread) => { const latest = thread.packages?.[thread.packages.length - 1]; return <button type="button" key={thread.id} onClick={() => navigate(`/attorney/cases/${thread.case_id}`)} className="w-full rounded-lg border border-violet-100 bg-white px-3 py-2.5 text-left transition hover:border-violet-300 hover:bg-violet-50"><div className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{thread.title}</span><span className="mt-0.5 block text-xs text-slate-500">{thread.case_label || 'Case'} · {latest?.stage ? String(latest.stage).replace(/_/g, ' ') : 'No package yet'} · {formatDate(thread.last_activity_at)}</span></span><span className="flex shrink-0 items-center gap-1"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(thread.status)}`}>{thread.status === 'awaiting_owner' ? 'Your review' : thread.status === 'awaiting_attorney' ? 'Attorney review' : thread.status === 'finalized' ? 'Final' : 'Archived'}</span><ArrowUpRight className="h-3.5 w-3.5 text-violet-600" /></span></div></button>; })}{threads.length > 8 && <p className="px-1 pt-1 text-xs text-slate-500">Showing the 8 most recently updated of {threads.length} client document threads.</p>}</div>}
    </section>
  );
}
