import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, FolderKanban, Loader2, RefreshCw, Users } from 'lucide-react';
import { getReferralAttorneyWorkspace } from '../../lib/api';

function displayDate(value) {
  if (!value) return 'Recently';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReferralAttorneyPipeline() {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true); else setLoading(true);
      setError('');
      setWorkspace(await getReferralAttorneyWorkspace());
    } catch (loadError) {
      setError(loadError.message || 'Could not load your case pipeline.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byStage = useMemo(() => {
    const grouped = new Map((workspace?.stages || []).map((stage) => [stage.slug, []]));
    (workspace?.cases || []).forEach((caseItem) => {
      if (!grouped.has(caseItem.status)) grouped.set(caseItem.status, []);
      grouped.get(caseItem.status).push(caseItem);
    });
    return grouped;
  }, [workspace]);

  if (loading) return <div className="flex h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="mx-auto max-w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Case Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">Cases submitted through your Ethan Babb Referral workspace. Esther Oise works the legal stages and updates appear here.</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary gap-2"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>
      </div>

      {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}

      <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
        <FolderKanban className="h-5 w-5 shrink-0" />
        <span>This board is private to your referrals. It does not include other LegalFlow firm cases.</span>
      </div>

      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-4">
          {(workspace?.stages || []).map((stage) => {
            const cases = byStage.get(stage.slug) || [];
            return (
              <section key={stage.id} className="w-80 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <header className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h2 className="text-sm font-bold text-slate-800">{stage.name}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{cases.length}</span>
                </header>
                <div className="mt-3 space-y-3">
                  {cases.map((caseItem) => (
                    <article key={caseItem.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{caseItem.client_name || caseItem.plaintiff_name || 'Client'}</p><p className="mt-1 text-xs text-slate-500">Submitted {displayDate(caseItem.created_at)}</p></div></div>
                    </article>
                  ))}
                  {!cases.length && <p className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-8 text-center text-xs text-slate-400">No cases in this stage.</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
