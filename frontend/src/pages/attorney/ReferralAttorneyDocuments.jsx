import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, FileText, FolderOpen, Loader2, RefreshCw, Upload } from 'lucide-react';
import { getCases, getDocumentAccessUrl, getDocuments, uploadDocument } from '../../lib/api';

export default function ReferralAttorneyDocuments() {
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    } finally { setLoading(false); }
  }, []);

  const loadDocuments = useCallback(async (caseId) => {
    if (!caseId) { setDocuments([]); return; }
    try {
      setLoadingDocuments(true);
      const result = await getDocuments(caseId);
      setDocuments(Array.isArray(result) ? result : result?.documents || result?.items || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load case documents.');
    } finally { setLoadingDocuments(false); }
  }, []);

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { loadDocuments(selectedCaseId); }, [selectedCaseId, loadDocuments]);

  async function openDocument(document) {
    try {
      const result = await getDocumentAccessUrl(selectedCaseId, document.id);
      window.open(result?.url || result?.access_url, '_blank', 'noopener,noreferrer');
    } catch (openError) { setError(openError.message || 'Could not open this document.'); }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !selectedCaseId) return;
    try {
      setUploading(true);
      setError('');
      await uploadDocument(selectedCaseId, file, 'other');
      await loadDocuments(selectedCaseId);
    } catch (uploadError) { setError(uploadError.message || 'Could not upload this document.'); }
    finally { setUploading(false); event.target.value = ''; }
  }

  const selectedCase = cases.find((caseItem) => caseItem.id === selectedCaseId);
  if (loading) return <div className="flex h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold text-slate-900">My Case Documents</h1><p className="mt-1 text-sm text-slate-500">Documents for cases submitted through your own referral workspace.</p></div><button onClick={loadCases} className="btn-secondary gap-2"><RefreshCw className="h-4 w-4" />Refresh</button></div>
      {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {cases.length ? <><div className="rounded-xl border border-slate-200 bg-white p-4"><label className="label">Select referral case</label><select className="input" value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>{cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.plaintiff_name || caseItem.client_name || 'Client'} — {caseItem.status?.replaceAll('_', ' ') || 'Submitted'}</option>)}</select></div>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">{selectedCase?.plaintiff_name || selectedCase?.client_name || 'Case'} documents</h2><p className="mt-1 text-sm text-slate-500">Upload a file or open the documents shared on this referral case.</p></div><label className="btn-primary cursor-pointer gap-2"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload document'}<input className="hidden" type="file" disabled={uploading} onChange={handleUpload} /></label></div>{loadingDocuments ? <div className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" /></div> : documents.length ? <div className="divide-y divide-slate-100">{documents.map((document) => <button key={document.id} onClick={() => openDocument(document)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50"><FileText className="h-5 w-5 shrink-0 text-indigo-600" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{document.file_name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{document.document_category || 'document'}</span></button>)}</div> : <div className="p-12 text-center"><FolderOpen className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No documents have been added to this case yet.</p></div>}</section></> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"><FolderOpen className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm text-slate-500">Your documents will appear here after you submit a referral.</p></div>}
    </div>
  );
}
