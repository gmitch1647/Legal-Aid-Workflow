import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, FolderSync, Loader2, RefreshCw } from 'lucide-react';
import { getCases, getDocuments } from '../../lib/api';
import DocumentExchangePanel from '../../components/DocumentExchangePanel';

export default function ReferralAttorneyDocumentExchange() {
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [error, setError] = useState('');

  const loadCases = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await getCases();
      const list = Array.isArray(result) ? result : result?.items || result?.cases || [];
      setCases(list);
      setSelectedCaseId((current) => current || list[0]?.id || '');
    } catch (loadError) {
      setError(loadError.message || 'Could not load your referral cases.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocuments = useCallback(async (caseId) => {
    if (!caseId) {
      setDocuments([]);
      return;
    }
    try {
      setLoadingDocuments(true);
      const result = await getDocuments(caseId);
      setDocuments(Array.isArray(result) ? result : result?.documents || result?.items || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load documents for this referral case.');
    } finally {
      setLoadingDocuments(false);
    }
  }, []);

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { loadDocuments(selectedCaseId); }, [selectedCaseId, loadDocuments]);

  if (loading) return <div className="flex h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document Exchange</h1>
          <p className="mt-1 text-sm text-slate-500">Send drafts, completed responses, and comments directly to Esther for cases you referred.</p>
        </div>
        <button onClick={loadCases} className="btn-secondary gap-2"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}

      {!cases.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"><FolderSync className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm text-slate-500">Your document threads will appear after you submit a referral.</p></div> : <>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="label">Select referral case</label>
          <select className="input" value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>
            {cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.plaintiff_name || caseItem.client_name || 'Client'} — {caseItem.status?.replaceAll('_', ' ') || 'Submitted'}</option>)}
          </select>
        </div>
        {loadingDocuments ? <div className="rounded-xl border border-slate-200 bg-white p-12 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600" /></div> : <DocumentExchangePanel caseId={selectedCaseId} documents={documents} onRefreshDocuments={() => loadDocuments(selectedCaseId)} />}
      </>}
    </div>
  );
}
