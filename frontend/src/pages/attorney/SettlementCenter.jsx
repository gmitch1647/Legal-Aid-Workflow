import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FileKey,
  FileSignature,
  FileText,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  getCases,
  getClosingStatements,
  getSignatureRequests,
  listW9Requests,
} from '../../lib/api';

function asRows(value, fallbackKeys = []) {
  if (Array.isArray(value)) return value;
  for (const key of fallbackKeys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function caseLabel(caseRow) {
  const client = caseRow?.client_name || caseRow?.client?.full_name || caseRow?.plaintiff_name || 'Client';
  const number = caseRow?.case_number || `Case ${(caseRow?.id || '').slice(0, 8)}`;
  return `${client} — ${number}`;
}

function statusDescriptor(kind) {
  const map = {
    complete: {
      label: 'Complete',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      icon: CheckCircle2,
    },
    pending: {
      label: 'Pending client',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
      icon: Clock3,
    },
    draft: {
      label: 'Ready to review',
      className: 'border-blue-200 bg-blue-50 text-blue-800',
      icon: FileText,
    },
    not_started: {
      label: 'Not started',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
      icon: Circle,
    },
  };
  return map[kind] || map.not_started;
}

function requestStatus(row) {
  if (!row) return 'not_started';
  if (['signed', 'complete', 'completed', 'completed_by_all'].includes(row.status)) return 'complete';
  if (['sent', 'awaiting_signature', 'viewed', 'awaiting_submission'].includes(row.status)) return 'pending';
  return 'not_started';
}

function closingStatus(row) {
  if (!row) return 'not_started';
  if (row.status === 'signed') return 'complete';
  if (row.status === 'awaiting_signature') return 'pending';
  if (row.status === 'draft') return 'draft';
  return 'not_started';
}

function displayDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StepCard({ number, title, description, icon: Icon, kind, detail, actionLabel, onAction, secondaryLabel, onSecondary }) {
  const status = statusDescriptor(kind);
  const StatusIcon = status.icon;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Step {number}</p>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900">{title}</h2>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          {detail && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{detail}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onAction} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-800">
              {actionLabel}
              <ChevronRight className="h-4 w-4" />
            </button>
            {secondaryLabel && onSecondary && (
              <button onClick={onSecondary} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                {secondaryLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function SettlementCenter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedCaseId = searchParams.get('case_id') || '';
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(requestedCaseId);
  const [agreementRequests, setAgreementRequests] = useState([]);
  const [w9Requests, setW9Requests] = useState([]);
  const [closingStatements, setClosingStatements] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [error, setError] = useState('');

  const selectedCase = useMemo(
    () => cases.find((caseRow) => String(caseRow.id) === String(selectedCaseId)) || null,
    [cases, selectedCaseId],
  );

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    setError('');
    try {
      const result = await getCases();
      const rows = asRows(result, ['cases', 'data']);
      setCases(rows);
      setSelectedCaseId((current) => {
        const preferred = requestedCaseId && rows.some((row) => String(row.id) === String(requestedCaseId))
          ? requestedCaseId
          : current;
        if (preferred && rows.some((row) => String(row.id) === String(preferred))) return preferred;
        return rows[0]?.id || '';
      });
    } catch (err) {
      setError(err.message || 'Unable to load cases for the settlement workspace.');
    } finally {
      setLoadingCases(false);
    }
  }, [requestedCaseId]);

  const loadWorkflow = useCallback(async (caseId) => {
    if (!caseId) {
      setAgreementRequests([]);
      setW9Requests([]);
      setClosingStatements([]);
      return;
    }
    setLoadingWorkflow(true);
    setError('');
    try {
      const [signatureRows, w9Rows, statementRows] = await Promise.all([
        getSignatureRequests(caseId),
        listW9Requests(caseId),
        getClosingStatements(),
      ]);
      setAgreementRequests(
        asRows(signatureRows, ['requests', 'data']).filter((row) => ['settlement', 'settlement_agreement'].includes(row.document_type)),
      );
      setW9Requests(asRows(w9Rows, ['requests', 'data']));
      setClosingStatements(
        asRows(statementRows, ['statements', 'data']).filter((row) => String(row.case_id) === String(caseId)),
      );
    } catch (err) {
      setError(err.message || 'Unable to load the settlement checklist for this case.');
    } finally {
      setLoadingWorkflow(false);
    }
  }, []);

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { loadWorkflow(selectedCaseId); }, [selectedCaseId, loadWorkflow]);

  const agreement = agreementRequests[0] || null;
  const w9 = w9Requests[0] || null;
  const closingStatement = closingStatements[0] || null;
  const agreementKind = requestStatus(agreement);
  const w9Kind = requestStatus(w9);
  const closingKind = closingStatus(closingStatement);

  const returnTo = selectedCaseId
    ? `/attorney/settlements?case_id=${encodeURIComponent(selectedCaseId)}`
    : '/attorney/settlements';
  const openStep = (path) => {
    const params = new URLSearchParams({
      case_id: selectedCaseId,
      return_to: returnTo,
      workflow: 'settlement',
    });
    navigate(`${path}?${params.toString()}`);
  };

  const nextStep = useMemo(() => {
    if (!agreement) return { label: 'Send settlement agreement', action: () => openStep('/attorney/esign') };
    if (agreementKind === 'pending') return { label: 'View settlement agreement', action: () => openStep('/attorney/esign') };
    if (!w9) return { label: 'Request Form W-9', action: () => openStep('/attorney/w9') };
    if (w9Kind === 'pending') return { label: 'View Form W-9 request', action: () => openStep('/attorney/w9') };
    if (!closingStatement) return { label: 'Prepare closing statement', action: () => openStep('/attorney/closing-statements') };
    if (closingKind !== 'complete') return { label: 'Review closing statement', action: () => openStep('/attorney/closing-statements') };
    return null;
  }, [agreement, agreementKind, w9, w9Kind, closingStatement, closingKind]);

  if (loadingCases) {
    return <div className="flex min-h-[360px] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settlement workspace…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button onClick={() => navigate(selectedCaseId ? `/attorney/cases/${selectedCaseId}` : '/attorney/pipeline')} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        {selectedCaseId ? 'Back to case' : 'Back to pipeline'}
      </button>

      <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 px-6 py-7 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-200">Case-centered settlement workflow</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Settlement Center</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">Keep the settlement agreement, secure W-9, and closing statement connected to one client and one case. Each action opens with the correct case already selected.</p>
          </div>
          <button onClick={() => loadWorkflow(selectedCaseId)} disabled={!selectedCaseId || loadingWorkflow} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loadingWorkflow ? 'animate-spin' : ''}`} /> Refresh status
          </button>
        </div>
      </header>

      {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p>{error}</p></div>}

      {cases.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <FileText className="mx-auto h-9 w-9 text-slate-300" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">No cases are ready to select</h2>
          <p className="mt-2 text-sm text-slate-600">Create or assign a client case before starting a settlement workflow.</p>
          <button onClick={() => navigate('/attorney/pipeline')} className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-800">Open case pipeline <ChevronRight className="h-4 w-4" /></button>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0 flex-1">
                <label className="block text-sm font-semibold text-slate-800">Settlement case</label>
                <select value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
                  {cases.map((caseRow) => <option key={caseRow.id} value={caseRow.id}>{caseLabel(caseRow)}</option>)}
                </select>
              </div>
              {selectedCase && <button onClick={() => navigate(`/attorney/cases/${selectedCase.id}`)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Open case file <ChevronRight className="h-4 w-4" /></button>}
            </div>
          </section>

          {loadingWorkflow ? (
            <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Refreshing settlement status…</div>
          ) : (
            <>
              {nextStep ? (
                <section className="flex flex-col gap-4 rounded-2xl border border-primary-200 bg-primary-50 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary-700">Suggested next action</p>
                    <h2 className="mt-1 text-lg font-bold text-primary-950">{nextStep.label}</h2>
                    <p className="mt-1 text-sm text-primary-900/80">LegalFlow will keep this case linked as you complete the settlement paperwork.</p>
                  </div>
                  <button onClick={nextStep.action} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800">Continue <ChevronRight className="h-4 w-4" /></button>
                </section>
              ) : (
                <section className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div><h2 className="font-bold">Settlement paperwork is complete</h2><p className="mt-1 text-sm">The agreement, W-9, and closing statement all show as complete for this case.</p></div>
                </section>
              )}

              <section className="grid gap-4 lg:grid-cols-3">
                <StepCard
                  number="1"
                  title="Settlement agreement"
                  description="Upload the final agreement and send it for the client’s signature. A signed agreement remains attached to this case."
                  icon={Send}
                  kind={agreementKind}
                  detail={agreement ? `${agreement.title || 'Settlement agreement'}${displayDate(agreement.sent_at || agreement.created_at) ? ` · ${agreementKind === 'complete' ? 'completed' : 'sent'} ${displayDate(agreement.submitted_at || agreement.sent_at || agreement.created_at)}` : ''}` : 'No settlement-agreement signature request is attached to this case yet.'}
                  actionLabel={agreement ? 'Open agreement' : 'Send agreement'}
                  onAction={() => openStep('/attorney/esign')}
                  secondaryLabel={agreementKind === 'pending' ? 'Request W-9 now' : null}
                  onSecondary={agreementKind === 'pending' ? () => openStep('/attorney/w9') : null}
                />
                <StepCard
                  number="2"
                  title="Secure Form W-9"
                  description="Request the client’s tax certification from the same case. LegalFlow keeps taxpayer IDs encrypted and attaches the completed form privately."
                  icon={FileKey}
                  kind={w9Kind}
                  detail={w9 ? `${w9.title || 'Form W-9'}${displayDate(w9.submitted_at || w9.created_at) ? ` · ${w9Kind === 'complete' ? 'completed' : 'sent'} ${displayDate(w9.submitted_at || w9.created_at)}` : ''}` : 'No W-9 request is attached to this case yet.'}
                  actionLabel={w9 ? 'Open W-9' : 'Request W-9'}
                  onAction={() => openStep('/attorney/w9')}
                />
                <StepCard
                  number="3"
                  title="Closing statement"
                  description="Upload or confirm the final settlement, review the distribution, preview the generated statement, then send it for signature."
                  icon={FileSignature}
                  kind={closingKind}
                  detail={closingStatement ? `${closingStatement.statement_file_name || 'Closing statement'}${displayDate(closingStatement.updated_at || closingStatement.created_at) ? ` · updated ${displayDate(closingStatement.updated_at || closingStatement.created_at)}` : ''}` : 'No closing statement is attached to this case yet.'}
                  actionLabel={closingStatement ? 'Open statement' : 'Prepare statement'}
                  onAction={() => openStep('/attorney/closing-statements')}
                />
              </section>

              <p className="px-1 text-xs leading-5 text-slate-500">The W-9 can be sent while the agreement is awaiting signature. The closing statement remains a separate review step because it requires the final settlement document and attorney-approved distribution.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
