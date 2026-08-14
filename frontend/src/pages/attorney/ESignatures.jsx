import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PenLine, Send, Download, Clock, Clock3, CheckCircle2, XCircle,
  AlertCircle, Loader2, RefreshCw, Eye, Bell, FileText,
  ChevronDown, ChevronRight, X, Search, User, Upload, Trash2,
  FolderOpen, LockKeyhole, ExternalLink, CreditCard, KeyRound, ShieldCheck,
} from 'lucide-react';
import {
  getEsignConfig, getEsignTemplates, sendSignatureRequest,
  sendDocumentForSignature, createSigningSession, testSigningStorage,
  deleteSigningSession,
  getGroupedSignatureDashboard, getSignatureRequest, remindSigner,
  cancelSignatureRequest, downloadOriginalAttachment, downloadSignedDocument, getCases,
  sendOiseEngagementContract, notifyW9Signer, getAllPayoutInformationRequests,
  revealPayoutInformation, cancelPayoutInformationRequest, markPayoutPaymentSent,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';
import PayoutInformationRequestModal from '../../components/PayoutInformationRequestModal';

const STATUS_MAP = {
  awaiting_signature: { label: 'Awaiting Signature', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
  viewed: { label: 'Viewed', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: Eye },
  signed: { label: 'Signed', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  complete: { label: 'Complete', color: 'text-emerald-700 bg-emerald-100 border-emerald-300', icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'text-slate-500 bg-slate-50 border-slate-200', icon: XCircle },
};

const PENDING_STATUSES = new Set([
  'awaiting_signature', 'viewed', 'awaiting_submission', 'awaiting_review',
]);
const COMPLETE_STATUSES = new Set(['signed', 'complete']);

function documentStatus(status) {
  return STATUS_MAP[status] || STATUS_MAP.awaiting_signature;
}

function documentMatchesFilter(document, filter) {
  if (filter === 'all') return true;
  if (filter === 'pending') return PENDING_STATUSES.has(document.status);
  if (filter === 'complete') return COMPLETE_STATUSES.has(document.status);
  return true;
}

function formattedDate(value) {
  if (!value) return null;
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export default function ESignatures() {
  const navigate = useNavigate();
  const [configured, setConfigured] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [summary, setSummary] = useState({ documents: 0, groups: 0, pending: 0, complete: 0 });
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalMode, setSendModalMode] = useState('upload');
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [payoutCase, setPayoutCase] = useState(null);
  const [payoutNotice, setPayoutNotice] = useState('');
  const [activeWorkspace, setActiveWorkspace] = useState('documents');
  const [bankingRequests, setBankingRequests] = useState([]);
  const [bankingLoading, setBankingLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  async function loadData() {
    setLoading(true);
    setLoadError('');
    try {
      const [configResp, dashboardResp] = await Promise.all([
        getEsignConfig().catch((err) => {
          console.error('E-sign config check failed:', err);
          return { configured: false };
        }),
        getGroupedSignatureDashboard(),
      ]);
      setBankingLoading(true);
      getAllPayoutInformationRequests()
        .then((requests) => setBankingRequests(Array.isArray(requests) ? requests : requests?.data || []))
        .catch((err) => console.error('Failed to load payout request inbox:', err))
        .finally(() => setBankingLoading(false));
      const nextGroups = Array.isArray(dashboardResp?.groups) ? dashboardResp.groups : [];
      setConfigured(Boolean(configResp?.configured));
      setGroups(nextGroups);
      setSummary(dashboardResp?.summary || { documents: 0, groups: 0, pending: 0, complete: 0 });
      setExpandedGroupIds((current) => {
        const next = new Set(current);
        nextGroups.forEach((group) => next.add(group.id));
        return next;
      });
    } catch (err) {
      console.error('Failed to load grouped e-sign documents:', err);
      setGroups([]);
      setSummary({ documents: 0, groups: 0, pending: 0, complete: 0 });
      setLoadError(err.message || 'Unable to load your signed documents. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const t = await getEsignTemplates();
      setTemplates(t);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function viewDetail(id) {
    setShowDetailModal(id);
    setDetailData(null);
    try {
      const data = await getSignatureRequest(id);
      setDetailData(data);
    } catch (err) {
      console.error(err);
      setDetailData({ error: err.message || 'Unable to load signature details.' });
    }
  }

  function saveDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadOriginal(id, fileName) {
    try {
      const blob = await downloadOriginalAttachment(id);
      saveDownload(blob, fileName || `original-${id.slice(0, 8)}`);
    } catch (err) {
      alert('Original attachment download failed: ' + err.message);
    }
  }

  async function handleDownload(id) {
    try {
      const blob = await downloadSignedDocument(id);
      saveDownload(blob, `signed-${id.slice(0, 8)}.pdf`);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  }

  async function openSignedDocument(document) {
    if (document.secure_only || document.provider === 'legalflow_w9') {
      navigate(`/attorney/w9?request_id=${encodeURIComponent(document.id)}`);
      return;
    }
    if (!document.has_signed_document) {
      viewDetail(document.id);
      return;
    }
    try {
      const blob = await downloadSignedDocument(document.id);
      const url = URL.createObjectURL(blob);
      setPreview({ url, title: document.title || document.document_label || 'Signed document' });
    } catch (err) {
      alert('Could not open the signed document: ' + err.message);
    }
  }

  function closePreview() {
    setPreview(null);
  }

  function toggleGroup(groupId) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const allDocuments = useMemo(
    () => groups.flatMap((group) => group.documents || []),
    [groups],
  );

  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return groups.map((group) => {
      const groupText = [group.client?.name, group.client?.email, group.case?.label, group.case?.case_number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const groupMatches = Boolean(term) && groupText.includes(term);
      const documents = (group.documents || []).filter((document) => {
        if (!documentMatchesFilter(document, filter)) return false;
        if (!term || groupMatches) return true;
        return [document.title, document.document_label, document.signer_name, document.signer_email, document.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term);
      });
      return { ...group, documents };
    }).filter((group) => group.documents.length > 0);
  }, [groups, filter, searchTerm]);

  const counts = useMemo(() => ({
    all: allDocuments.length,
    pending: allDocuments.filter((document) => PENDING_STATUSES.has(document.status)).length,
    complete: allDocuments.filter((document) => COMPLETE_STATUSES.has(document.status)).length,
  }), [allDocuments]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">E-Signatures</h1>
          <p className="mt-1 text-sm text-slate-500">Each client and case keeps its settlement documents together, including agreements, secure W-9 status, and closing statements.</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={() => { setSendModalMode('oise_contract'); setShowSendModal(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
            <FileText className="h-4 w-4" /> Send Oise Law Contract
          </button>
          <button onClick={() => { setSendModalMode('upload'); setShowSendModal(true); if (configured) loadTemplates(); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Send className="h-4 w-4" /> Send for Signature
          </button>
        </div>
      </div>

      {!configured && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          <strong>Dropbox Sign templates are not configured.</strong> LegalFlow’s built-in upload signer remains available for agreements and closing statements.
        </div>
      )}

      {loadError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mr-2 inline h-4 w-4" /> {loadError}
        </div>
      )}
      {payoutNotice && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mr-2 inline h-4 w-4" /> {payoutNotice}
        </div>
      )}

      <div className="mb-5 flex w-fit gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button type="button" onClick={() => setActiveWorkspace('documents')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeWorkspace === 'documents' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><FileText className="mr-1.5 inline h-4 w-4" />Signature Documents</button>
        <button type="button" onClick={() => setActiveWorkspace('banking')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeWorkspace === 'banking' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><CreditCard className="mr-1.5 inline h-4 w-4" />Banking Forms</button>
      </div>

      {activeWorkspace === 'documents' ? <>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={async () => {
          setTesting(true); setTestResult(null);
          try { const result = await testSigningStorage(); setTestResult(result); }
          catch (error) { setTestResult({ error: error.message }); }
          finally { setTesting(false); }
        }} disabled={testing}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50">
          {testing ? 'Testing...' : 'Test Storage Connection'}
        </button>
        {testResult && (
          <pre className="max-w-xl overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
          {[
            { key: 'all', label: 'All', count: counts.all },
            { key: 'pending', label: 'Pending', count: counts.pending },
            { key: 'complete', label: 'Complete', count: counts.complete },
          ].map((item) => (
            <button key={item.key} onClick={() => setFilter(item.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                filter === item.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {item.label} ({item.count})
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search a client, case, document, or signer..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <PenLine className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">
            {allDocuments.length === 0 ? 'No settlement workflow documents yet' : 'No documents match the current filter'}
          </p>
          {allDocuments.length === 0 && (
            <button onClick={() => { setSendModalMode('upload'); setShowSendModal(true); if (configured) loadTemplates(); }}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
              Send your first document →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => (
            <ClientCaseGroup
              key={group.id}
              group={group}
              expanded={expandedGroupIds.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
              onOpen={openSignedDocument}
              onView={(document) => {
                if (document.secure_only || document.provider === 'legalflow_w9') {
                  navigate(`/attorney/w9?request_id=${encodeURIComponent(document.id)}`);
                } else {
                  viewDetail(document.id);
                }
              }}
              onDownload={(document) => handleDownload(document.id)}
              onRequestPayout={() => {
                if (!group.case?.id) return;
                setPayoutNotice('');
                setPayoutCase({ id: group.case.id, label: `${group.client?.name || 'Client'} — ${group.case?.label || group.case?.case_number || 'Case'}` });
              }}
              onDelete={async (document) => {
                if (!window.confirm(`Delete "${document.title}"? This cannot be undone.`)) return;
                try {
                  await deleteSigningSession(document.id);
                  loadData();
                } catch (err) {
                  alert('Delete failed: ' + err.message);
                }
              }}
            />
          ))}
        </div>
      )}

      </> : (
        <BankingFormsTab
          requests={bankingRequests}
          loading={bankingLoading}
          onRefresh={loadData}
          onOpenCase={(caseId) => navigate(`/attorney/cases/${caseId}`)}
        />
      )}

      {payoutCase && (
        <PayoutInformationRequestModal
          caseId={payoutCase.id}
          caseLabel={payoutCase.label}
          onClose={() => setPayoutCase(null)}
          onSent={() => {
            setPayoutCase(null);
            setPayoutNotice('Secure payout-information request sent. The client received a private expiring link and can complete ACH details directly without a LegalFlow account.');
          }}
        />
      )}

      {showSendModal && (
        <SendSignatureModal
          initialMode={sendModalMode}
          templates={templates}
          loadingTemplates={loadingTemplates}
          onClose={() => setShowSendModal(false)}
          onSent={() => { setShowSendModal(false); loadData(); }}
        />
      )}

      {showDetailModal && (
        <DetailModal
          requestId={showDetailModal}
          data={detailData}
          onClose={() => { setShowDetailModal(null); setDetailData(null); }}
          onCancel={async () => {
            try {
              await cancelSignatureRequest(showDetailModal);
              setShowDetailModal(null);
              loadData();
            } catch (err) { alert('Cancel failed: ' + err.message); }
          }}
          onDownloadOriginal={() => handleDownloadOriginal(showDetailModal, detailData?.source_file_name)}
          onDownload={() => handleDownload(showDetailModal)}
          onOpenSigned={() => openSignedDocument({
            id: showDetailModal,
            title: detailData?.title,
            has_signed_document: Boolean(detailData?.has_signed_document),
            provider: detailData?.provider,
            secure_only: false,
          })}
        />
      )}

      {preview && <PdfPreviewModal title={preview.title} url={preview.url} onClose={closePreview} onDownload={() => handleDownload(showDetailModal || '')} />}
    </div>
  );
}

function BankingFormsTab({ requests, loading, onRefresh, onOpenCase }) {
  const [search, setSearch] = useState('');
  const [revealingId, setRevealingId] = useState('');
  const [cancellingId, setCancellingId] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [paymentDraft, setPaymentDraft] = useState(null);
  const [markingId, setMarkingId] = useState('');
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return requests;
    return requests.filter((item) => [item.client_name, item.client_email, item.case_label, item.status, item.submission?.account_holder_name]
      .filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [requests, search]);

  async function reveal(item) {
    if (!window.confirm('Reveal this client’s ACH routing and account number now? This access is recorded in LegalFlow’s private audit trail.')) return;
    setRevealingId(item.id); setError('');
    try { setRevealed({ ...(await revealPayoutInformation(item.id)), requestId: item.id, clientName: item.client_name, caseLabel: item.case_label }); }
    catch (err) { setError(err.message || 'Could not open payout information securely.'); }
    finally { setRevealingId(''); }
  }

  async function cancel(item) {
    if (!window.confirm('Cancel this banking form request? The client will no longer be able to submit it.')) return;
    setCancellingId(item.id); setError('');
    try { await cancelPayoutInformationRequest(item.id); await onRefresh(); }
    catch (err) { setError(err.message || 'Could not cancel the banking form request.'); }
    finally { setCancellingId(''); }
  }

  async function markPaymentSent(event) {
    event.preventDefault();
    if (!paymentDraft) return;
    setMarkingId(paymentDraft.id); setError('');
    try {
      await markPayoutPaymentSent(paymentDraft.id, {
        payment_amount: paymentDraft.payment_amount === '' ? null : Number(paymentDraft.payment_amount),
        payment_reference: paymentDraft.payment_reference || null,
        payment_note: paymentDraft.payment_note || null,
      });
      setPaymentDraft(null);
      await onRefresh();
    } catch (err) {
      setError(err.message || 'Could not record the external payment status.');
    } finally {
      setMarkingId('');
    }
  }

  const submitted = requests.filter((item) => item.status === 'completed').length;
  const pending = requests.filter((item) => item.status === 'requested').length;
  return <section className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800"><CreditCard className="h-4 w-4" />Secure payout workspace</p><h2 className="mt-1 text-xl font-bold text-slate-900">Client banking forms</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Track private payout-information requests from E-Signatures. Account and routing numbers remain encrypted and require a separate audited secure view.</p></div><button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"><RefreshCw className="h-4 w-4" /> Refresh forms</button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-100 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">All forms</p><p className="mt-1 text-2xl font-bold text-slate-900">{requests.length}</p></div><div className="rounded-xl border border-amber-100 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Waiting on client</p><p className="mt-1 text-2xl font-bold text-amber-800">{pending}</p></div><div className="rounded-xl border border-emerald-100 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Submitted</p><p className="mt-1 text-2xl font-bold text-emerald-800">{submitted}</p></div></div>
    <div className="relative mt-5"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, case, or banking form status..." className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></div>
    {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mr-1 inline h-4 w-4" /> {error}</div>}
    <div className="mt-4 space-y-3">{loading ? <div className="flex items-center gap-2 rounded-xl border border-dashed border-emerald-200 bg-white px-4 py-6 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading secure banking forms…</div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-emerald-200 bg-white px-4 py-8 text-center text-sm text-slate-500">No authorized banking form requests match this view.</div> : filtered.map((item) => {
      const submittedForm = item.status === 'completed';
      const statusText = submittedForm ? 'Submitted' : item.status === 'cancelled' ? 'Cancelled' : 'Waiting on client';
      const statusClass = submittedForm ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : item.status === 'cancelled' ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-800';
      return <article key={item.id} className="rounded-xl border border-emerald-100 bg-white p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-start gap-3">{submittedForm ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{item.client_name || 'Client'}</p><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusText}</span></div><p className="mt-1 text-sm text-slate-600">{item.case_label || 'Case'}{item.client_email ? ` · ${item.client_email}` : ''}</p><p className="mt-1 text-sm text-slate-500">{submittedForm && item.submission ? `${item.submission.account_holder_name || 'Account holder'} · ${item.submission.account_ownership === 'business' ? 'Business' : 'Personal'} · ${item.submission.account_type === 'savings' ? 'Savings' : 'Checking'} ending in ${item.submission.account_number_last4 || '••••'}${item.submission.submitted_at ? ` · submitted ${formattedDate(item.submission.submitted_at)}` : ''}` : item.status === 'cancelled' ? 'The request was cancelled.' : item.due_date ? `Requested by ${formattedDate(`${item.due_date}T00:00:00`)}` : 'The client has not completed the private banking form yet.'}</p></div></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => onOpenCase(item.case_id)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open case</button>{submittedForm && <button type="button" onClick={() => reveal(item)} disabled={revealingId === item.id} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60">{revealingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}View securely</button>}{item.payment_access?.can_mark_payment_sent && <button type="button" onClick={() => setPaymentDraft({ id: item.id, clientName: item.client_name, caseLabel: item.case_label, payment_amount: '', payment_reference: '', payment_note: '' })} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Mark payment sent</button>}{item.payment_access?.status === 'payment_marked_sent' && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Payment marked sent</span>}{item.status === 'requested' && <button type="button" onClick={() => cancel(item)} disabled={cancellingId === item.id} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60">{cancellingId === item.id ? 'Cancelling…' : 'Cancel request'}</button>}</div></div></article>;
    })}</div>
    {paymentDraft && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Mark external payment sent"><form onSubmit={markPaymentSent} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">External payment record</p><h3 className="mt-1 text-lg font-bold text-slate-900">Mark payment sent</h3><p className="mt-1 text-sm text-slate-500">{paymentDraft.clientName || 'Client'} · {paymentDraft.caseLabel || 'Case'}</p></div><button type="button" onClick={() => setPaymentDraft(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-950">LegalFlow will only record this status. It will not initiate, transfer, or move any money.</p><div className="mt-4 grid gap-3"><label className="text-sm font-medium text-slate-700">Payment amount <span className="font-normal text-slate-400">(optional)</span><input inputMode="decimal" value={paymentDraft.payment_amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, payment_amount: event.target.value })} placeholder="0.00" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-slate-700">Payment reference <span className="font-normal text-slate-400">(optional)</span><input value={paymentDraft.payment_reference} onChange={(event) => setPaymentDraft({ ...paymentDraft, payment_reference: event.target.value })} placeholder="Confirmation or transfer reference" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-slate-700">Payment note <span className="font-normal text-slate-400">(optional)</span><textarea value={paymentDraft.payment_note} onChange={(event) => setPaymentDraft({ ...paymentDraft, payment_note: event.target.value })} rows={3} maxLength={1000} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPaymentDraft(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button><button disabled={markingId === paymentDraft.id} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{markingId === paymentDraft.id && <Loader2 className="h-4 w-4 animate-spin" />}{markingId === paymentDraft.id ? 'Recording…' : 'Mark payment sent'}</button></div></form></div>}
    {revealed && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Secure banking form details"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700"><KeyRound className="h-3.5 w-3.5" />Audited secure view</p><h3 className="mt-1 text-lg font-bold text-slate-900">{revealed.clientName || 'Client'} banking details</h3><p className="mt-1 text-sm text-slate-500">{revealed.caseLabel || 'Case'}</p></div><button type="button" onClick={() => setRevealed(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-3 text-sm"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Account holder</p><p className="mt-1 font-semibold text-slate-900">{revealed.account_holder_name}</p></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Ownership</p><p className="mt-1 font-semibold capitalize text-slate-900">{revealed.account_ownership}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Type</p><p className="mt-1 font-semibold capitalize text-slate-900">{revealed.account_type}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Bank</p><p className="mt-1 font-semibold text-slate-900">{revealed.bank_name || 'Not provided'}</p></div></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">Routing number</p><p className="mt-1 font-mono text-base font-bold tracking-wide text-slate-950">{revealed.routing_number}</p></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">Account number</p><p className="mt-1 font-mono text-base font-bold tracking-wide text-slate-950">{revealed.account_number}</p></div></div><div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />This view is recorded in LegalFlow’s private audit trail. Do not copy these details into messages, notes, or ordinary documents.</div><div className="mt-5 flex justify-end"><button type="button" onClick={() => setRevealed(null)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Close secure view</button></div></div></div>}
  </section>;
}

function ClientCaseGroup({ group, expanded, onToggle, onOpen, onView, onDownload, onRequestPayout, onDelete }) {
  const counts = group.document_counts || {};
  const clientName = group.client?.name || 'Unassigned client';
  const caseLabel = group.case?.label || 'Unassigned case';

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={onToggle} aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-700"><FolderOpen className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-slate-900">{clientName}</span>
            {group.case?.id ? <span className="text-xs text-slate-500">{caseLabel}</span> : <span className="text-xs text-amber-700">{caseLabel}</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {counts.total || group.documents?.length || 0} document{(counts.total || group.documents?.length || 0) === 1 ? '' : 's'}
            {counts.complete ? ` · ${counts.complete} complete` : ''}
            {counts.pending ? ` · ${counts.pending} pending` : ''}
          </p>
        </div>
        {expanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3">
          {group.case?.id && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
              <p className="text-xs leading-5 text-emerald-950">Need to prepare this client for payout? Send their encrypted ACH form directly from this case group.</p>
              <button type="button" onClick={onRequestPayout} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"><CreditCard className="h-3.5 w-3.5" />Request payout information</button>
            </div>
          )}
          {group.documents.map((document) => (
            <SignatureDocumentRow
              key={`${document.provider}-${document.id}`}
              document={document}
              onOpen={onOpen}
              onView={onView}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SignatureDocumentRow({ document, onOpen, onView, onDownload, onDelete }) {
  const status = documentStatus(document.status);
  const StatusIcon = status.icon;
  const isPending = PENDING_STATUSES.has(document.status);
  const isW9 = document.secure_only || document.provider === 'legalflow_w9';
  const isViewOnly = Boolean(document.review_only) || document.document_type === 'credit_disclosure';
  const date = formattedDate(document.signed_at || document.sent_at || document.created_at);

  function openFromKeyboard(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(document);
    }
  }

  return (
    <article role="button" tabIndex={0} onClick={() => onOpen(document)} onKeyDown={openFromKeyboard}
      className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:shadow">
      <div className={`rounded-lg border p-2 ${status.color}`}><StatusIcon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{document.title}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.color}`}>{status.label}</span>
          {isW9 && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700"><LockKeyhole className="h-3 w-3" /> Protected record</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-slate-600">{document.document_label || document.document_type || 'Document'}</span>
          {document.signer_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{document.signer_name}</span>}
          {date && <span>{date}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => onView(document)}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" title={isW9 ? 'Open secure W-9 record' : 'View document details'}>
          {isW9 ? <LockKeyhole className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        {isPending && !isW9 && !isViewOnly && <ReminderBtn id={document.id} />}
        {isPending && isW9 && <W9NotificationBtn id={document.id} />}
        {document.has_signed_document && !isW9 && (
          <button type="button" onClick={() => onDownload(document)}
            className="rounded-lg p-2 text-blue-500 hover:bg-blue-50 hover:text-blue-700" title="Download signed PDF">
            <Download className="h-4 w-4" />
          </button>
        )}
        {document.provider === 'legalflow' && (
          <button type="button" onClick={() => onDelete(document)}
            className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500" title="Delete document">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}

function PdfPreviewModal({ title, url, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Signed document preview">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{title}</p><p className="mt-0.5 text-xs text-slate-500">Signed document preview</p></div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close document preview"><X className="h-5 w-5" /></button>
        </div>
        <iframe title={title} src={url} className="min-h-0 flex-1 bg-slate-100" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reminder Button
// ---------------------------------------------------------------------------

function ReminderBtn({ id }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleRemind() {
    setSending(true);
    try {
      await remindSigner(id);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      alert('Reminder failed: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <button onClick={handleRemind} disabled={sending || sent}
      className={`p-2 rounded-lg ${sent ? 'text-emerald-500 bg-emerald-50' : 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'}`}
      title={sent ? 'Reminder sent!' : 'Send reminder'}>
      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle2 className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
    </button>
  );
}

function W9NotificationBtn({ id }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleNotify() {
    setSending(true);
    try {
      await notifyW9Signer(id);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      alert('Could not notify the client about the W-9: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <button onClick={handleNotify} disabled={sending || sent}
      className={`p-2 rounded-lg ${sent ? 'text-emerald-500 bg-emerald-50' : 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50'}`}
      title={sent ? 'W-9 notification sent!' : 'Notify client to complete W-9'}>
      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle2 className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Send Signature Modal
// ---------------------------------------------------------------------------

function SendSignatureModal({ initialMode = 'upload', templates, loadingTemplates, onClose, onSent }) {
  const [mode, setMode] = useState(initialMode);
  const [confirmingOiseSend, setConfirmingOiseSend] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Please sign this document');
  const [message, setMessage] = useState('Please review and sign the attached document at your earliest convenience.');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [docType, setDocType] = useState('settlement');
  const [caseId, setCaseId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    setMode(initialMode);
    setConfirmingOiseSend(false);
  }, [initialMode]);

  async function loadClients() {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('full_name');
      setClients(data || []);
    } catch (err) { console.error(err); }
  }

  async function pickClient(client) {
    setSignerName(client.full_name || '');
    setSignerEmail(client.email || '');
    setSelectedClientId(client.id);
    setClientSearch('');
    setCaseId('');
    setCases([]);
    setLoadingCases(true);
    setError('');
    try {
      const result = await getCases({ client_id: client.id });
      const caseRows = Array.isArray(result) ? result : (result?.cases || result?.data || []);
      setCases(caseRows);
      if (caseRows.length === 1) setCaseId(String(caseRows[0].id));
    } catch (err) {
      setCases([]);
      setError(err.message || 'Could not load the cases for this client.');
    } finally {
      setLoadingCases(false);
    }
  }

  function handleFileDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (f) {
      const valid = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!valid.includes(f.type) && !f.name.match(/\.(pdf|docx)$/i)) {
        setError('Only PDF and DOCX files are supported');
        return;
      }
      if (f.size > 20 * 1024 * 1024) {
        setError('File too large (max 20 MB)');
        return;
      }
      setUploadedFile(f);
      setError('');
      if (!title) setTitle(f.name.replace(/\.(pdf|docx)$/i, ''));
    }
  }

  async function handleSend() {
    if (mode === 'oise_contract') {
      if (!selectedClientId || !caseId) {
        setError('Select the client and the case that should receive the Oise Law contract.');
        return;
      }
      if (!confirmingOiseSend) {
        setConfirmingOiseSend(true);
        return;
      }
      setSending(true);
      setError('');
      try {
        await sendOiseEngagementContract(caseId);
        onSent();
      } catch (err) {
        setError(err.message || 'Could not send the Oise Law representation agreement.');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!signerName || !signerEmail) { setError('Signer name and email required'); return; }
    if (mode === 'upload' && !uploadedFile) { setError('Upload a document'); return; }
    if (mode === 'template' && !selectedTemplate) { setError('Select a template'); return; }

    setSending(true);
    setError('');
    try {
      if (mode === 'upload') {
        const fd = new FormData();
        fd.append('file', uploadedFile);
        fd.append('signer_name', signerName);
        fd.append('signer_email', signerEmail);
        fd.append('title', title || `${DOC_TYPES.find(d => d.value === docType)?.label || 'Document'} — ${signerName}`);
        fd.append('document_type', docType);
        fd.append('message', message);
        if (caseId) fd.append('case_id', caseId);
        if (selectedClientId) fd.append('client_id', selectedClientId);
        await createSigningSession(fd);
      } else {
        await sendSignatureRequest({
          template_id: selectedTemplate,
          title: title || `${DOC_TYPES.find(d => d.value === docType)?.label || 'Document'} — ${signerName}`,
          subject,
          message,
          signer_name: signerName,
          signer_email: signerEmail,
          document_type: docType,
          case_id: caseId || null,
          client_id: selectedClientId || null,
        });
      }
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const DOC_TYPES = [
    { value: 'settlement', label: 'Settlement Agreement' },
    { value: 'engagement_letter', label: 'Engagement Letter' },
    { value: 'retainer', label: 'Retainer Agreement' },
    { value: 'authorization', label: 'Authorization Form' },
    { value: 'hipaa', label: 'HIPAA Release' },
    { value: 'w9', label: 'W-9' },
    { value: 'affidavit', label: 'Affidavit' },
    { value: 'general', label: 'General Document' },
  ];

  const filteredClients = clients.filter(c =>
    !clientSearch || (c.full_name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(clientSearch.toLowerCase())
  );

  const selectedClient = clients.find((client) => String(client.id) === String(selectedClientId));
  const canSend = mode === 'oise_contract'
    ? Boolean(selectedClientId && caseId)
    : signerName && signerEmail && (mode === 'upload' ? uploadedFile : selectedTemplate);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Send for Signature</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => { setMode('upload'); setConfirmingOiseSend(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                mode === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Upload className="w-4 h-4" /> Upload Document
            </button>
            <button onClick={() => { setMode('template'); setConfirmingOiseSend(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                mode === 'template' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <FileText className="w-4 h-4" /> Use Template
            </button>
            <button onClick={() => { setMode('oise_contract'); setConfirmingOiseSend(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                mode === 'oise_contract' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <FileText className="w-4 h-4" /> Oise Contract
            </button>
          </div>

          {/* Upload, template, or fixed Oise contract selector */}
          {mode === 'oise_contract' ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
              <p className="font-semibold">Oise Law Group PC Representation Agreement</p>
              <p className="mt-1 text-xs leading-5 text-indigo-800">LegalFlow will use the approved unsigned Oise contract template. The client will receive dedicated signature and date fields; the original template remains unchanged.</p>
            </div>
          ) : mode === 'upload' ? (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Document (PDF or DOCX) *</label>
              {uploadedFile ? (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-blue-900 truncate">{uploadedFile.name}</div>
                    <div className="text-xs text-blue-600">{(uploadedFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button onClick={() => setUploadedFile(null)} className="text-blue-400 hover:text-blue-600"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition cursor-pointer"
                  onClick={() => document.getElementById('esign-file-input').click()}
                >
                  <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Drop your settlement agreement here or <span className="text-blue-600 font-medium">browse</span></p>
                  <p className="text-xs text-slate-400 mt-1">PDF or DOCX, up to 20 MB</p>
                  <input id="esign-file-input" type="file" accept=".pdf,.docx" className="hidden" onChange={handleFileDrop} />
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2">Signature, name, and date fields will be added automatically at the bottom of the document.</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Template *</label>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3 border border-amber-200">
                  No templates found. Create templates in your Dropbox Sign dashboard first.
                </div>
              ) : (
                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Select template --</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Document type */}
          {mode !== 'oise_contract' && <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Document Type</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>}

          {/* Client picker */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Select Client</label>
            <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {clientSearch && filteredClients.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg">
                {filteredClients.slice(0, 8).map(c => (
                  <button key={c.id} onClick={() => pickClient(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium">{c.full_name}</span>
                    <span className="text-slate-400 text-xs">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Case picker — always show after client is selected */}
          {selectedClientId && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Link to Case *</label>
              {loadingCases ? (
                <p className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading this client’s cases…</p>
              ) : cases.length > 0 ? (
                <select value={caseId} onChange={(e) => setCaseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Select a case --</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.plaintiff_name || c.client_name || 'Untitled'} — {c.status || 'Case'} ({c.created_at ? new Date(c.created_at).toLocaleDateString() : 'No date'})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 border border-amber-200">
                  No cases found for this client.
                </p>
              )}
            </div>
          )}

          {mode === 'oise_contract' && selectedClient && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <strong>Selected client:</strong> {selectedClient.full_name || 'Client'} · {selectedClient.email || 'No email on file'}
            </div>
          )}

          {/* Signer details */}
          {mode !== 'oise_contract' && <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Signer Name *</label>
              <input value={signerName} onChange={(e) => setSignerName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Signer Email *</label>
              <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>}

          {/* Title / Subject / Message */}
          {mode !== 'oise_contract' && <>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-generated if empty"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Email Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Email Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
            </div>
          </>}

          {mode === 'oise_contract' && confirmingOiseSend && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Confirm contract delivery</p>
              <p className="mt-1 text-xs leading-5">Selecting <strong>Send Contract for Signature</strong> will email the Oise Law representation agreement to this client. LegalFlow will then move the case to Doc Sent for Signature after the invitation is accepted for delivery.</p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 inline mr-1" /> {error}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button onClick={handleSend} disabled={sending || !canSend}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : mode === 'oise_contract' ? (
              confirmingOiseSend ? <><Send className="w-4 h-4" /> Send Contract for Signature</> : <><FileText className="w-4 h-4" /> Review Contract Send</>
            ) : <><Send className="w-4 h-4" /> Send for Signature</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Modal
// ---------------------------------------------------------------------------

function DetailModal({ requestId, data, onClose, onCancel, onDownloadOriginal, onDownload }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Signature Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {!data ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Title</div>
                <div className="text-sm font-medium text-slate-900">{data.title}</div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Status</div>
                <div className="flex items-center gap-2">
                  {data.is_complete ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Complete
                    </span>
                  ) : data.has_error ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                      <XCircle className="w-3 h-3" /> Error
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3 h-3" /> Pending
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Signers</div>
                <div className="space-y-2">
                  {(data.signatures || []).map((s, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <User className="w-4 h-4 text-slate-400" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{s.signer_name}</div>
                        <div className="text-xs text-slate-500">{s.signer_email}</div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        s.status === 'signed' ? 'bg-emerald-100 text-emerald-700' :
                        s.status === 'declined' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {s.status === 'signed' ? 'Signed' : s.status === 'declined' ? 'Declined' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {data?.provider === 'legalflow' && data?.signing_audit && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Signing Audit</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-slate-500">Signer IP</dt>
                    <dd className="font-mono text-slate-700 break-all">{data.signing_audit.ip_address || 'Not captured'}</dd>
                    <dt className="text-slate-500">Signed at</dt>
                    <dd className="text-slate-700">{data.signing_audit.signed_at ? new Date(data.signing_audit.signed_at).toLocaleString() : 'Not recorded'}</dd>
                    <dt className="text-slate-500">Placement</dt>
                    <dd className="text-slate-700">{data.signing_audit.signature_placement?.strategy === 'detected_execution_block' ? 'Detected execution block' : 'Signing fallback'}</dd>
                  </dl>
                </div>
              )}

              {data.created_at && (
                <div className="text-xs text-slate-400">
                  Sent: {new Date(typeof data.created_at === 'number' ? data.created_at * 1000 : data.created_at).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex justify-between">
          <div>
            {data && !data.is_complete && !data.has_error && (
              <button onClick={onCancel}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                Cancel Request
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {data?.has_source_attachment && (
              <button onClick={onDownloadOriginal}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Original
              </button>
            )}
            {data?.is_complete && (
              <button onClick={onDownload}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Signed PDF
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
