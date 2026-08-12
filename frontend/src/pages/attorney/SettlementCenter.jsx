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
  getAttorneys,
  getPayoutInformationRequests,
  sendCompletedSettlementPackage,
} from '../../lib/api';
import SettlementAgreementModal, { SettlementAgreementStatusModal } from './SettlementAgreementModal';
import PayoutInformationRequestModal from '../../components/PayoutInformationRequestModal';

function asRows(value, fallbackKeys = []) {
  if (Array.isArray(value)) return value;
  for (const key of fallbackKeys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function caseLabel(caseRow) {
  const client = caseRow?.client_name || caseRow?.client?.full_name || caseRow?.plaintiff_name || 'Client';
  const matterName = String(caseRow?.case_number || '').trim();
  if (/\bv\.\s+\S/i.test(matterName)) return matterName;
  const number = matterName || `Case ${(caseRow?.id || '').slice(0, 8)}`;
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
  const isCreditDisclosure = row.document_type === 'credit_disclosure';
  if (isCreditDisclosure && ['viewed', 'reviewed'].includes(row.status)) return 'complete';
  if (['signed', 'complete', 'completed', 'completed_by_all'].includes(row.status)) return 'complete';
  if (['sent', 'awaiting_signature', 'awaiting_review', 'awaiting_submission'].includes(row.status)) return 'pending';
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
  const [creditDisclosureRequests, setCreditDisclosureRequests] = useState([]);
  const [w9Requests, setW9Requests] = useState([]);
  const [closingStatements, setClosingStatements] = useState([]);
  const [payoutInformationRequests, setPayoutInformationRequests] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [agreementPanel, setAgreementPanel] = useState(null);
  const [showAttorneyDelivery, setShowAttorneyDelivery] = useState(false);
  const [showPayoutRequest, setShowPayoutRequest] = useState(false);
  const [deliveryAttorneys, setDeliveryAttorneys] = useState([]);
  const [loadingDeliveryAttorneys, setLoadingDeliveryAttorneys] = useState(false);
  const [notice, setNotice] = useState('');
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
      setCreditDisclosureRequests([]);
      setW9Requests([]);
      setClosingStatements([]);
      setPayoutInformationRequests([]);
      return;
    }
    setLoadingWorkflow(true);
    setError('');
    try {
      const [signatureRows, w9Rows, statementRows, payoutRows] = await Promise.all([
        getSignatureRequests(caseId),
        listW9Requests(caseId),
        getClosingStatements(),
        getPayoutInformationRequests(caseId),
      ]);
      const signatureRequests = asRows(signatureRows, ['requests', 'data']);
      setAgreementRequests(signatureRequests.filter((row) => ['settlement', 'settlement_agreement'].includes(row.document_type)));
      setCreditDisclosureRequests(signatureRequests.filter((row) => row.document_type === 'credit_disclosure'));
      setW9Requests(asRows(w9Rows, ['requests', 'data']));
      setClosingStatements(
        asRows(statementRows, ['statements', 'data']).filter((row) => String(row.case_id) === String(caseId)),
      );
      setPayoutInformationRequests(asRows(payoutRows, ['requests', 'data']));
    } catch (err) {
      setError(err.message || 'Unable to load the settlement checklist for this case.');
    } finally {
      setLoadingWorkflow(false);
    }
  }, []);

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { loadWorkflow(selectedCaseId); }, [selectedCaseId, loadWorkflow]);

  const agreement = agreementRequests[0] || null;
  const creditDisclosure = creditDisclosureRequests[0] || null;
  const w9 = w9Requests[0] || null;
  const closingStatement = closingStatements[0] || null;
  const payoutInformationRequest = payoutInformationRequests.find((row) => row.status !== 'cancelled') || null;
  const agreementKind = requestStatus(agreement);
  const creditDisclosureKind = requestStatus(creditDisclosure);
  const w9Kind = requestStatus(w9);
  const closingKind = closingStatus(closingStatement);
  const payoutKind = payoutInformationRequest?.status === 'completed' ? 'complete' : payoutInformationRequest?.status === 'requested' ? 'pending' : 'not_started';
  const completedSettlementPackageReady = agreementKind === 'complete' && w9Kind === 'complete';

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

  const agreementNeedsReplacement = !agreement || agreementKind === 'not_started';
  const creditDisclosureNeedsReplacement = !creditDisclosure || creditDisclosureKind === 'not_started';

  const openAgreementPanel = () => {
    setNotice('');
    setAgreementPanel(agreementNeedsReplacement ? 'agreement-send' : 'agreement-status');
  };

  const openCreditDisclosurePanel = () => {
    setNotice('');
    setAgreementPanel(creditDisclosureNeedsReplacement ? 'disclosure-send' : 'disclosure-status');
  };

  const handlePayoutRequestSent = (request) => {
    setPayoutInformationRequests((current) => [request, ...current]);
    setShowPayoutRequest(false);
    setNotice('Secure payout-information request sent. The client received a private expiring link and can submit ACH details directly without a LegalFlow account.');
  };

  const openAttorneyDelivery = async () => {
    setNotice('');
    setError('');
    setShowAttorneyDelivery(true);
    setLoadingDeliveryAttorneys(true);
    try {
      const rows = asRows(await getAttorneys(), ['attorneys', 'data']);
      setDeliveryAttorneys(rows.filter((attorney) => attorney.email));
    } catch (err) {
      setDeliveryAttorneys([]);
      setError(err.message || 'Unable to load the attorney directory.');
    } finally {
      setLoadingDeliveryAttorneys(false);
    }
  };

  const handleAttorneyDeliverySent = (result) => {
    setShowAttorneyDelivery(false);
    const recipient = result?.recipient_name || result?.recipient_email || 'the selected attorney';
    setNotice(result?.status === 'already_sent'
      ? `The completed settlement package was already sent to ${recipient}.`
      : `The signed settlement agreement was emailed to ${recipient}. The completed W-9 is available through the secure LegalFlow link in that email.`);
  };

  const handleAgreementSent = async ({ documentType, settlementSource, attachmentError } = {}) => {
    setAgreementPanel(null);
    await loadWorkflow(selectedCaseId);
    if (documentType === 'credit_disclosure') {
      setNotice('Credit disclosure sent for client review. The client received a secure link asking them to review it and make sure everything is reporting properly; no signature is required.');
      return;
    }
    if (attachmentError) {
      setNotice(`Settlement agreement sent. ${attachmentError}`);
      return;
    }
    const attachedName = settlementSource?.settlement_document?.file_name;
    setNotice(`Settlement agreement sent${attachedName ? ` and ${attachedName} is now attached for the closing statement` : ''}. The client has received a secure signing link, and the W-9 step is now ready.`);
  };

  const nextStep = useMemo(() => {
    if (agreementNeedsReplacement) return { label: agreement ? 'Send replacement settlement agreement' : 'Send settlement agreement', action: openAgreementPanel };
    if (agreementKind === 'pending') return { label: 'Review settlement agreement', action: openAgreementPanel };
    if (!w9) return { label: 'Request Form W-9', action: () => openStep('/attorney/w9') };
    if (w9Kind === 'pending') return { label: 'View Form W-9 request', action: () => openStep('/attorney/w9') };
    if (!closingStatement) return { label: 'Prepare closing statement', action: () => openStep('/attorney/closing-statements') };
    if (closingKind !== 'complete') return { label: 'Review closing statement', action: () => openStep('/attorney/closing-statements') };
    return null;
  }, [agreement, agreementKind, agreementNeedsReplacement, w9, w9Kind, closingStatement, closingKind]);

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
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">Keep the settlement agreement, secure W-9, and closing statement connected to one client and one case. Send and monitor the settlement agreement here without leaving the guided workflow.</p>
          </div>
          <button onClick={() => loadWorkflow(selectedCaseId)} disabled={!selectedCaseId || loadingWorkflow} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loadingWorkflow ? 'animate-spin' : ''}`} /> Refresh status
          </button>
        </div>
      </header>

      {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p>{error}</p></div>}
      {notice && <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p>{notice}</p></div>}

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

              {completedSettlementPackageReady && (
                <section className="flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Completed document delivery</p>
                    <h2 className="mt-1 text-lg font-bold text-indigo-950">Email the completed settlement package to an attorney</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-indigo-900/85">Choose an attorney in LegalFlow. The signed settlement agreement will be attached, and the completed W-9 will be provided through a protected LegalFlow link because it contains taxpayer information.</p>
                  </div>
                  <button onClick={openAttorneyDelivery} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800">
                    <Send className="h-4 w-4" /> Send completed documents
                  </button>
                </section>
              )}

              <section className="grid gap-4 lg:grid-cols-4">
                <StepCard
                  number="1"
                  title="Settlement agreement"
                  description="Upload the final agreement and send it for the client’s signature. The agreement remains attached to this case, and the optional credit disclosure can be sent for client review."
                  icon={Send}
                  kind={agreementKind}
                  detail={agreement ? `${agreement.title || 'Settlement agreement'}${displayDate(agreement.sent_at || agreement.created_at) ? ` · ${agreementKind === 'complete' ? 'completed' : 'sent'} ${displayDate(agreement.submitted_at || agreement.sent_at || agreement.created_at)}` : ''}` : 'No settlement-agreement signature request is attached to this case yet.'}
                  actionLabel={agreementNeedsReplacement ? (agreement ? 'Send replacement' : 'Send agreement') : 'Review agreement'}
                  onAction={openAgreementPanel}
                  secondaryLabel={creditDisclosureNeedsReplacement ? 'Send credit disclosure (if applicable)' : 'Review credit disclosure'}
                  onSecondary={openCreditDisclosurePanel}
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
                <StepCard
                  number="4"
                  title="Client payout information"
                  description="Send the client a private, expiring ACH form link they can complete directly without a LegalFlow account. Routing and account numbers are encrypted and only available through audited attorney access."
                  icon={FileKey}
                  kind={payoutKind}
                  detail={payoutInformationRequest ? (payoutInformationRequest.status === 'completed' ? `Client submitted ${payoutInformationRequest.submission?.account_type || 'bank'} information${payoutInformationRequest.submission?.account_number_last4 ? ` for the account ending in ${payoutInformationRequest.submission.account_number_last4}` : ''}.` : 'Secure ACH form sent; waiting for the client to submit it from their private email link.') : 'No secure client payout-information request has been sent yet.'}
                  actionLabel={payoutInformationRequest?.status === 'requested' ? 'Send another secure form' : 'Request payout information'}
                  onAction={() => { setNotice(''); setShowPayoutRequest(true); }}
                />
              </section>

              <p className="px-1 text-xs leading-5 text-slate-500">The optional credit disclosure can be sent from Step 1 only when that case requires it. It is delivered for client review only—no signature is collected. The W-9 can be sent while the agreement is awaiting signature. The final settlement agreement is automatically attached to the closing-statement step, where you still review and approve the distribution.</p>
            </>
          )}
        </>
      )}
      {showPayoutRequest && selectedCase && (
        <PayoutInformationRequestModal
          caseId={selectedCase.id}
          caseLabel={caseLabel(selectedCase)}
          onClose={() => setShowPayoutRequest(false)}
          onSent={handlePayoutRequestSent}
        />
      )}
      {showAttorneyDelivery && selectedCase && (
        <CompletedSettlementDeliveryModal
          caseRow={selectedCase}
          attorneys={deliveryAttorneys}
          loadingAttorneys={loadingDeliveryAttorneys}
          onClose={() => setShowAttorneyDelivery(false)}
          onSent={handleAttorneyDeliverySent}
        />
      )}
      {agreementPanel === 'agreement-send' && selectedCaseId && (
        <SettlementAgreementModal
          key={`agreement-send-${selectedCaseId}`}
          caseId={selectedCaseId}
          mode="settlement"
          onClose={() => setAgreementPanel(null)}
          onSent={handleAgreementSent}
        />
      )}
      {agreementPanel === 'agreement-status' && agreement && (
        <SettlementAgreementStatusModal
          key={`agreement-status-${agreement.id}`}
          agreement={agreement}
          onClose={() => setAgreementPanel(null)}
          onRefresh={() => loadWorkflow(selectedCaseId)}
        />
      )}
      {agreementPanel === 'disclosure-send' && selectedCaseId && (
        <SettlementAgreementModal
          key={`disclosure-send-${selectedCaseId}`}
          caseId={selectedCaseId}
          mode="credit_disclosure"
          onClose={() => setAgreementPanel(null)}
          onSent={handleAgreementSent}
        />
      )}
      {agreementPanel === 'disclosure-status' && creditDisclosure && (
        <SettlementAgreementStatusModal
          key={`disclosure-status-${creditDisclosure.id}`}
          agreement={creditDisclosure}
          onClose={() => setAgreementPanel(null)}
          onRefresh={() => loadWorkflow(selectedCaseId)}
        />
      )}
    </div>
  );
}


function CompletedSettlementDeliveryModal({ caseRow, attorneys, loadingAttorneys, onClose, onSent }) {
  const [selectedAttorneyId, setSelectedAttorneyId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const defaultAttorney = attorneys.find((attorney) => attorney.is_default && attorney.email) || attorneys[0];
    if (defaultAttorney && !selectedAttorneyId) {
      setSelectedAttorneyId(String(defaultAttorney.profile_id || defaultAttorney.id));
    }
  }, [attorneys, selectedAttorneyId]);

  const selectedAttorney = attorneys.find((attorney) => String(attorney.profile_id || attorney.id) === String(selectedAttorneyId));

  const sendPackage = async () => {
    if (!selectedAttorneyId || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await sendCompletedSettlementPackage(caseRow.id, selectedAttorneyId);
      onSent(result);
    } catch (err) {
      setError(err.message || 'Could not send the completed settlement package.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Send completed settlement documents">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Send completed settlement documents</h2>
          <p className="mt-1 text-sm text-slate-600">Choose the LegalFlow attorney who should receive the completed records for this case.</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-semibold">{caseLabel(caseRow)}</p>
            <p className="mt-1 text-xs leading-5">The signed settlement agreement will be attached. The completed Form W-9 will remain protected in LegalFlow and will be opened through a secure sign-in link in the same email.</p>
          </div>
          {loadingAttorneys ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading attorneys…</div>
          ) : attorneys.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No attorney with an email address is available in LegalFlow.</div>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Send to attorney</label>
              <select value={selectedAttorneyId} onChange={(event) => setSelectedAttorneyId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
                {attorneys.map((attorney) => {
                  const value = String(attorney.profile_id || attorney.id);
                  return <option key={value} value={value}>{attorney.full_name || 'Attorney'} — {attorney.email}</option>;
                })}
              </select>
              {selectedAttorney && <p className="mt-2 text-xs text-slate-500">The completed package will be routed to {selectedAttorney.email}.</p>}
            </div>
          )}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mr-1 inline h-4 w-4" /> {error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} disabled={sending} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button onClick={sendPackage} disabled={sending || loadingAttorneys || !selectedAttorneyId} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send documents</>}
          </button>
        </div>
      </div>
    </div>
  );
}
