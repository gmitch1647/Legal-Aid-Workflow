import { useEffect, useMemo, useState } from 'react';
import { FolderSync, Loader2, Search, UsersRound } from 'lucide-react';
import { getCases, getDocuments } from '../../lib/api';
import DocumentExchangePanel from '../../components/DocumentExchangePanel';

function caseTitle(item) {
  const plaintiff = item.plaintiff_name || item.client_name || item.client?.full_name || 'Client case';
  const defendants = Array.isArray(item.defendants)
    ? item.defendants.map((defendant) => defendant?.name || defendant).filter(Boolean).join(', ')
    : item.defendant_name || item.defendants_text || '';
  return defendants ? `${plaintiff} v. ${defendants}` : plaintiff;
}

function caseSubtitle(item) {
  return [item.case_number, item.status?.replace(/_/g, ' '), item.case_type].filter(Boolean).join(' · ') || 'Case';
}

export default function DocumentExchange() {
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [error, setError] = useState('');

  const selectedCase = useMemo(() => cases.find((item) => item.id === selectedCaseId) || null, [cases, selectedCaseId]);
  const visibleCases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cases;
    return cases.filter((item) => `${caseTitle(item)} ${caseSubtitle(item)} ${item.client_name || ''}`.toLowerCase().includes(needle));
  }, [cases, query]);

  useEffect(() => {
    let active = true;
    setLoadingCases(true);
    getCases()
      .then((result) => {
        if (!active) return;
        const items = Array.isArray(result) ? result : result?.items || result?.cases || [];
        setCases(items);
        setSelectedCaseId((current) => current || items[0]?.id || '');
      })
      .catch((err) => active && setError(err.message || 'Could not load client cases.'))
      .finally(() => active && setLoadingCases(false));
    return () => { active = false; };
  }, []);

  async function refreshDocuments() {
    if (!selectedCaseId) return;
    setLoadingDocuments(true);
    try {
      const result = await getDocuments(selectedCaseId);
      setDocuments(Array.isArray(result) ? result : result?.documents || []);
    } catch (err) {
      setError(err.message || 'Could not load documents for this case.');
      setDocuments([]);
    } finally {
      setLoadingDocuments(false);
    }
  }

  useEffect(() => { refreshDocuments(); }, [selectedCaseId]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-violet-700 p-3 text-white shadow-sm"><FolderSync className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-wider text-violet-700">Attorney collaboration</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Document Exchange</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Choose a client case to send drafts, return completed versions, add review notes, and keep the full document history together in LegalFlow.</p></div></div>
          {selectedCase && <div className="rounded-xl border border-violet-100 bg-white/80 px-4 py-3 text-right"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected case</p><p className="mt-1 max-w-sm truncate text-sm font-semibold text-slate-800">{caseTitle(selectedCase)}</p></div>}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4"><div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-violet-700" /><h2 className="font-semibold text-slate-900">Client cases</h2></div><div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client or case" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-600 focus:bg-white" /></div></div>
          <div className="max-h-[calc(100vh-19rem)] overflow-y-auto p-2">{loadingCases ? <p className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading cases…</p> : visibleCases.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No client cases match your search.</p> : visibleCases.map((item) => <button type="button" key={item.id} onClick={() => { setError(''); setSelectedCaseId(item.id); }} className={`mb-1 w-full rounded-lg px-3 py-3 text-left transition ${item.id === selectedCaseId ? 'bg-violet-100 text-violet-950' : 'hover:bg-slate-50'}`}><span className="block line-clamp-2 text-sm font-semibold">{caseTitle(item)}</span><span className="mt-1 block truncate text-xs text-slate-500">{caseSubtitle(item)}</span></button>)}</div>
        </aside>

        <main>{!selectedCaseId ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Choose a client case on the left to open its Document Exchange workspace.</div> : loadingDocuments ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading case documents…</div> : <DocumentExchangePanel caseId={selectedCaseId} documents={documents} onRefreshDocuments={refreshDocuments} />}</main>
      </div>
    </div>
  );
}
