import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Briefcase, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { getCases } from '../../lib/api';

function displayDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date) ? 'N/A' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReferralAttorneyClients() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true); else setLoading(true);
      setError('');
      const result = await getCases();
      setCases(Array.isArray(result) ? result : result?.items || result?.cases || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load your referred clients.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clients = useMemo(() => {
    const byId = new Map();
    cases.forEach((caseItem) => {
      const id = caseItem.client_id;
      if (!id) return;
      const current = byId.get(id) || {
        id,
        full_name: caseItem.client?.full_name || caseItem.plaintiff_name || caseItem.client_name || 'Client',
        email: caseItem.client?.email || caseItem.client_email || '',
        phone: caseItem.client?.phone || caseItem.client_phone || '',
        cases: [],
      };
      current.cases.push(caseItem);
      byId.set(id, current);
    });
    return [...byId.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [cases]);

  const shownClients = clients.filter((client) => `${client.full_name} ${client.email}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">My Clients</h1><p className="mt-1 text-sm text-slate-500">Clients connected to cases you submitted through LegalFlow.</p></div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary gap-2"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>
      </div>

      {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your clients" className="input !pl-9" /></div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {shownClients.length ? shownClients.map((client) => (
          <article key={client.id} className="border-b border-slate-100 p-5 last:border-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{client.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{client.full_name}</h2><p className="truncate text-sm text-slate-500">{client.email || 'No email recorded'}</p></div></div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"><Briefcase className="h-3.5 w-3.5" />{client.cases.length} case{client.cases.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{client.cases.map((caseItem) => <div key={caseItem.id} className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm"><p className="font-medium text-slate-800">{caseItem.plaintiff_name || client.full_name}</p><p className="mt-1 text-xs text-slate-500">{caseItem.status?.replaceAll('_', ' ') || 'Submitted'} · {displayDate(caseItem.created_at)}</p></div>)}</div>
          </article>
        )) : <div className="p-12 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No referred clients match this search.</p></div>}
      </div>
    </div>
  );
}
