import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FileText,
  FolderKanban,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { getCreditRepairLeadDocumentAccess, getReferralAttorneyWorkspace } from '../../lib/api';

function displayDate(value) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatLeadStatus(status) {
  return String(status || 'new').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ReferralAttorneyWorkspace() {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedCreditRepair, setCopiedCreditRepair] = useState(false);

  const loadWorkspace = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const data = await getReferralAttorneyWorkspace();
      setWorkspace(data);
    } catch (loadError) {
      setError(loadError.message || 'Your referral workspace could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const casesByStage = useMemo(() => {
    const grouped = new Map((workspace?.stages || []).map((stage) => [stage.slug, []]));
    (workspace?.cases || []).forEach((caseItem) => {
      if (!grouped.has(caseItem.status)) grouped.set(caseItem.status, []);
      grouped.get(caseItem.status).push(caseItem);
    });
    return grouped;
  }, [workspace]);

  async function copyReferralLink() {
    if (!workspace?.referral_url) return;
    try {
      await navigator.clipboard.writeText(workspace.referral_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError('Could not copy the referral link. Select and copy it from your browser address bar instead.');
    }
  }

  async function copyCreditRepairLink() {
    if (!workspace?.credit_repair_url) return;
    try {
      await navigator.clipboard.writeText(workspace.credit_repair_url);
      setCopiedCreditRepair(true);
      window.setTimeout(() => setCopiedCreditRepair(false), 2200);
    } catch {
      setError('Could not copy the Credit Repair intake link. Select and copy it from your browser address bar instead.');
    }
  }

  async function openCreditRepairDocument(leadId, documentId) {
    try {
      setError('');
      const access = await getCreditRepairLeadDocumentAccess(leadId, documentId);
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      setError(openError.message || 'Could not open this Credit Repair document.');
    }
  }

  if (loading) {
    return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  }

  if (error && !workspace) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
        <AlertCircle className="mx-auto h-8 w-8" />
        <h1 className="mt-3 text-lg font-bold">Referral Workspace Unavailable</h1>
        <p className="mt-2 text-sm">{error}</p>
        <button onClick={() => loadWorkspace()} className="mt-5 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Try Again</button>
      </div>
    );
  }

  const stageRows = workspace?.stages || [];
  const totalCases = (workspace?.cases || []).length;
  const creditRepairLeads = workspace?.credit_repair_leads || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Attorney Referral Workspace
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{workspace?.partner_name}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Manage your LegalFlow referrals from one workspace. You can see your pipeline, clients, documents, and case activity while Esther Oise handles the assigned legal work.
            </p>
          </div>
          <button onClick={() => loadWorkspace(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </section>

      {error && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}

      <section className="grid gap-4 md:grid-cols-3">
        <Link to="/attorney/pipeline" className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><FolderKanban className="h-6 w-6 text-indigo-700" /><h2 className="mt-3 font-bold text-slate-900">My Case Pipeline</h2><p className="mt-1 text-sm text-slate-600">Track every case submitted through your dedicated referral pipeline.</p></Link>
        <Link to="/attorney/clients" className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><Users className="h-6 w-6 text-indigo-700" /><h2 className="mt-3 font-bold text-slate-900">My Clients</h2><p className="mt-1 text-sm text-slate-600">Review only clients connected to your own LegalFlow referrals.</p></Link>
        <Link to="/attorney/documents" className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><FileText className="h-6 w-6 text-indigo-700" /><h2 className="mt-3 font-bold text-slate-900">My Case Documents</h2><p className="mt-1 text-sm text-slate-600">Open and upload documents for your referred cases.</p></Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Send className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-slate-900">Your Private Referral Form</h2>
              <p className="mt-1 text-sm text-slate-600">Use this link for every new client referral. New submissions go straight into your separate pipeline.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2.5 text-xs text-slate-700">{workspace?.referral_url}</code>
                <button onClick={copyReferralLink} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800">
                  {copied ? <><CheckCircle2 className="h-4 w-4" /> Copied</> : <><ClipboardCopy className="h-4 w-4" /> Copy Link</>}
                </button>
                <a href={workspace?.referral_url} target="_blank" rel="noopener" className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2.5 text-slate-700 hover:bg-slate-50" title="Open referral form"><ExternalLink className="h-4 w-4" /></a>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:min-w-48">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Users className="h-4 w-4" /> Your referrals</div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalCases}</p>
          <p className="mt-1 text-xs text-slate-500">case{totalCases === 1 ? '' : 's'} in this pipeline</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Send className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-slate-900">Your Private Credit Repair Form</h2>
              <p className="mt-1 text-sm text-slate-600">Share this link to submit Credit Repair clients. Every submission stays separate from the legal case pipeline and appears below in Credit Repair Matters.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2.5 text-xs text-slate-700">{workspace?.credit_repair_url}</code>
                <button onClick={copyCreditRepairLink} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800">
                  {copiedCreditRepair ? <><CheckCircle2 className="h-4 w-4" /> Copied</> : <><ClipboardCopy className="h-4 w-4" /> Copy Link</>}
                </button>
                <a href={workspace?.credit_repair_url} target="_blank" rel="noopener" className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2.5 text-slate-700 hover:bg-slate-50" title="Open Credit Repair form"><ExternalLink className="h-4 w-4" /></a>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm lg:min-w-48">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800"><Users className="h-4 w-4" /> Credit Repair Matters</div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{creditRepairLeads.length}</p>
          <p className="mt-1 text-xs text-slate-600">submission{creditRepairLeads.length === 1 ? '' : 's'} linked to your form</p>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-emerald-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-5 w-5 text-emerald-700" /> Credit Repair Matters</h2>
            <p className="mt-1 text-sm text-slate-500">Only clients submitted through your private Credit Repair form are shown here.</p>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 sm:inline">Partner submissions</span>
        </div>
        {!creditRepairLeads.length ? (
          <div className="p-10 text-center text-sm text-slate-500">No Credit Repair clients have been submitted through your link yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {creditRepairLeads.map((lead) => (
              <article key={lead.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{lead.full_name || 'Credit Repair client'}</p>
                  <p className="mt-1 text-sm text-slate-600">{lead.case_type || 'Credit Repair review'}{lead.adverse_party ? ` · ${lead.adverse_party}` : ''}</p>
                  <p className="mt-1 text-xs text-slate-400">Submitted {displayDate(lead.created_at)}</p>
                  {(lead.credit_repair_lead_documents || []).length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{lead.credit_repair_lead_documents.map((document) => <button key={document.id} type="button" onClick={() => openCreditRepairDocument(lead.id, document.id)} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="max-w-48 truncate">{document.file_name}</span></button>)}</div> : <p className="mt-3 text-xs text-slate-400">No documents attached</p>}
                </div>
                <span className="justify-self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 sm:justify-self-end">{formatLeadStatus(lead.status)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-900"><FolderKanban className="h-5 w-5 text-indigo-700" /> Referral Pipeline</h2>
            <p className="mt-1 text-sm text-slate-500">Cases remain separate from the firm’s main client pipeline.</p>
          </div>
          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 sm:inline">Status only</span>
        </div>

        {stageRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Your pipeline is being prepared. Please refresh shortly.</div>
        ) : (
          <div className="overflow-x-auto p-5">
            <div className="flex min-w-max gap-4 pb-2">
              {stageRows.map((stage) => {
                const cases = casesByStage.get(stage.slug) || [];
                return (
                  <div key={stage.id} className="w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <h3 className="text-sm font-bold text-slate-800">{stage.name}</h3>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{cases.length}</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {cases.map((caseItem) => (
                        <article key={caseItem.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="font-semibold text-slate-800">{caseItem.case_title || caseItem.client_name || 'Client'}</p>
                          <p className="mt-1 text-xs text-slate-500">Submitted {displayDate(caseItem.created_at)}</p>
                          <p className="mt-2 text-xs text-slate-400">LegalFlow will update the status as the case progresses.</p>
                        </article>
                      ))}
                      {!cases.length && <p className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-5 text-center text-xs text-slate-400">No referrals in this stage.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <p className="text-center text-xs leading-5 text-slate-500">This workspace is limited to your own referrals and high-level workflow status. It does not display internal LegalFlow notes, banking information, settlement records, or other firm clients.</p>
    </div>
  );
}
