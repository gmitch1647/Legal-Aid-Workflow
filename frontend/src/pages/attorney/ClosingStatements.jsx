import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Download,
  Eye,
  FileSignature,
  FileText,
  Loader2,
  MessageSquare,
  Bot,
  User,
  Plus,
  RefreshCw,
  Send,
  Upload,
  X,
} from 'lucide-react';
import {
  createAttorney,
  createClosingStatement,
  createConversation,
  downloadClosingStatement,
  getAttorneys,
  getCases,
  getClosingStatements,
  getClosingStatementSettlementSource,
  getConversation,
  getConversations,
  saveDownloadedBlob,
  sendClosingStatementForSignature,
  streamAgentMessage,
  uploadSettlementForClosingStatement,
} from '../../lib/api';

const emptyForm = {
  case_number: '',
  adverse_party: '',
  account_reference: '',
  gross_settlement_amount: '',
  client_payout_amount: '',
  paralegal_fee_amount: '0.00',
  court_cost_amount: '0.00',
  service_of_process_cost_amount: '0.00',
  attorney_id: '',
  non_monetary_terms: '',
  signer_name: '',
  signer_email: '',
};

const emptyAttorney = {
  full_name: '',
  bar_number: '',
  firm_name: '',
  address: '',
  phone: '',
  email: '',
};

function dollarsToCents(value) {
  const normalized = String(value || '').replace(/[$,\s]/g, '');
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function statementStatus(status) {
  if (status === 'signed') return { label: 'Signed', className: 'bg-emerald-100 text-emerald-700' };
  if (status === 'awaiting_signature') return { label: 'Awaiting signature', className: 'bg-amber-100 text-amber-700' };
  if (status === 'void') return { label: 'Void', className: 'bg-slate-100 text-slate-600' };
  return { label: 'Draft', className: 'bg-blue-100 text-blue-700' };
}

export default function ClosingStatements() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const settlementCaseId = searchParams.get('case_id') || '';
  const returnTo = searchParams.get('return_to') || '';
  const [cases, setCases] = useState([]);
  const [attorneys, setAttorneys] = useState([]);
  const [statements, setStatements] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [settlement, setSettlement] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadingSavedSettlement, setLoadingSavedSettlement] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [showAddAttorney, setShowAddAttorney] = useState(false);
  const [newAttorney, setNewAttorney] = useState(emptyAttorney);
  const [savingAttorney, setSavingAttorney] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [draftChatOpen, setDraftChatOpen] = useState(false);
  const [draftConversation, setDraftConversation] = useState(null);
  const [draftMessages, setDraftMessages] = useState([]);
  const [draftChatInput, setDraftChatInput] = useState('');
  const [draftChatLoading, setDraftChatLoading] = useState(false);
  const [draftChatSending, setDraftChatSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const previewRequestRef = useRef(0);
  const settlementSourceRequestRef = useRef(0);

  const defaultAttorneyId = useMemo(
    () => attorneys.find((attorney) => attorney.is_default)?.id || '',
    [attorneys],
  );
  const selectedAttorney = useMemo(
    () => attorneys.find((attorney) => attorney.id === form.attorney_id) || null,
    [attorneys, form.attorney_id],
  );
  const currentCaseStatements = useMemo(
    () => statements.filter((item) => selectedCaseId && String(item.case_id) === String(selectedCaseId)),
    [selectedCaseId, statements],
  );
  const nextStatementVersion = useMemo(() => {
    const latest = currentCaseStatements.reduce(
      (highest, item) => Math.max(highest, Number(item.version) || 1),
      0,
    );
    return latest + 1;
  }, [currentCaseStatements]);
  const grossCents = dollarsToCents(form.gross_settlement_amount);
  const clientCents = dollarsToCents(form.client_payout_amount);
  const paralegalCents = dollarsToCents(form.paralegal_fee_amount);
  const courtCostCents = dollarsToCents(form.court_cost_amount);
  const serviceCostCents = dollarsToCents(form.service_of_process_cost_amount);
  const attorneyCents = grossCents - clientCents - paralegalCents - courtCostCents - serviceCostCents;
  const distributionValid = Boolean(form.gross_settlement_amount && form.client_payout_amount) && attorneyCents >= 0;

  const refresh = async () => {
    const [caseData, statementData, attorneyData] = await Promise.all([
      getCases(),
      getClosingStatements(),
      getAttorneys(),
    ]);
    const attorneyList = Array.isArray(attorneyData) ? attorneyData : [];
    const defaultId = attorneyList.find((attorney) => attorney.is_default)?.id || '';
    setCases(caseData || []);
    setStatements(statementData || []);
    setAttorneys(attorneyList);
    if (defaultId) {
      setForm((previous) => (previous.attorney_id ? previous : { ...previous, attorney_id: defaultId }));
    }
  };

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message || 'Could not load cases, attorneys, and closing statements.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!settlementCaseId || selectedCaseId || cases.length === 0) return;
    const matchingCase = cases.find((item) => String(item.id) === String(settlementCaseId));
    if (!matchingCase) return;
    chooseCase(String(matchingCase.id));
  }, [settlementCaseId, selectedCaseId, cases, defaultAttorneyId]);

  useEffect(() => {
    if (!preview?.bytes || !previewCanvasRef.current) return undefined;

    let cancelled = false;
    let loadingTask = null;
    let pdfDocument = null;
    const renderTasks = [];
    const container = previewCanvasRef.current;
    // This container is intentionally rendered without React children. PDF.js owns
    // only the canvases inside it, so clearing it cannot remove a React-managed node.
    container.replaceChildren();

    const renderPreview = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs',
          import.meta.url,
        ).toString();
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(preview.bytes) });
        pdfDocument = await loadingTask.promise;
        if (cancelled || container !== previewCanvasRef.current) return;

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          if (cancelled || container !== previewCanvasRef.current) return;
          const page = await pdfDocument.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.25 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.maxWidth = `${viewport.width}px`;
          canvas.style.margin = '0 auto 12px';
          canvas.style.display = 'block';
          canvas.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.18)';
          canvas.style.borderRadius = '4px';
          container.appendChild(canvas);
          const renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }
      } catch (err) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          setPreviewError(err.message || 'LegalFlow could not render this PDF preview.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    renderPreview();
    return () => {
      cancelled = true;
      renderTasks.forEach((task) => task.cancel?.());
      loadingTask?.destroy?.();
      pdfDocument?.destroy?.();
      container.replaceChildren();
    };
  }, [preview?.bytes]);

  const applySettlementSource = (result, { notice = '' } = {}) => {
    const suggestions = result?.suggestions || {};
    if (!result?.settlement_document) return false;
    setSettlement(result.settlement_document);
    setForm((previous) => ({
      ...previous,
      case_number: suggestions.case_number || previous.case_number,
      adverse_party: suggestions.adverse_party || previous.adverse_party,
      account_reference: suggestions.account_reference || previous.account_reference,
      gross_settlement_amount: suggestions.gross_settlement_amount || previous.gross_settlement_amount,
      non_monetary_terms: suggestions.non_monetary_terms || previous.non_monetary_terms,
    }));
    if (notice) setNotice(notice);
    return true;
  };

  const loadSavedSettlement = async (caseId) => {
    if (!caseId) return;
    const requestId = settlementSourceRequestRef.current + 1;
    settlementSourceRequestRef.current = requestId;
    setLoadingSavedSettlement(true);
    try {
      const result = await getClosingStatementSettlementSource(caseId);
      if (settlementSourceRequestRef.current !== requestId) return;
      applySettlementSource(result, {
        notice: result?.settlement_document
          ? 'A settlement already attached to this case has been selected and used to prefill the closing statement. Review every value before generating.'
          : '',
      });
    } catch (err) {
      if (settlementSourceRequestRef.current === requestId) {
        setError(err.message || 'Could not load the saved settlement for this case. You can upload it below instead.');
      }
    } finally {
      if (settlementSourceRequestRef.current === requestId) setLoadingSavedSettlement(false);
    }
  };

  const resetComposer = () => {
    settlementSourceRequestRef.current += 1;
    setSelectedCaseId('');
    setSettlement(null);
    setForm({ ...emptyForm, attorney_id: form.attorney_id || defaultAttorneyId });
    setStatement(null);
    setDraftChatOpen(false);
    setDraftConversation(null);
    setDraftMessages([]);
    setDraftChatInput('');
    setError('');
    setNotice('');
    setLoadingSavedSettlement(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const restartStatement = () => {
    const caseToReuse = selectedCaseId || settlementCaseId;
    if (caseToReuse && cases.some((item) => String(item.id) === String(caseToReuse))) {
      chooseCase(String(caseToReuse));
      setNotice('A fresh closing-statement draft is ready. The selected case and its saved settlement have been reloaded; update the details and generate a new version when ready.');
      return;
    }
    resetComposer();
    setNotice('A fresh closing-statement draft is ready. Choose a case to continue.');
  };

  const reloadCurrentCase = async () => {
    setError('');
    setNotice('');
    try {
      await refresh();
      if (selectedCaseId) {
        await loadSavedSettlement(selectedCaseId);
        setNotice('The current case, attorney list, and saved settlement were refreshed. You can continue editing or start a new statement.');
      } else {
        setNotice('The case list and attorney letterheads were refreshed.');
      }
    } catch (err) {
      setError(err.message || 'Could not refresh the closing-statement workspace.');
    }
  };

  const editGeneratedStatement = () => {
    setStatement(null);
    setError('');
    setNotice('The generated draft remains in the history below. You can now revise this statement’s details and generate a new version.');
  };

  const chooseCase = (caseId) => {
    const caseRow = cases.find((item) => item.id === caseId);
    const linkedAdverseParty = (caseRow?.defendants || [])
      .map((defendant) => defendant?.name?.trim())
      .filter(Boolean)
      .join(', ');
    setSelectedCaseId(caseId);
    setSettlement(null);
    setStatement(null);
    setDraftChatOpen(false);
    setDraftConversation(null);
    setDraftMessages([]);
    setDraftChatInput('');
    setError('');
    setNotice('');
    setForm({
      ...emptyForm,
      attorney_id: form.attorney_id || defaultAttorneyId,
      case_number: caseRow?.case_number || '',
      adverse_party: linkedAdverseParty,
      signer_name: caseRow?.client_name || caseRow?.client?.full_name || '',
      signer_email: caseRow?.client?.email || '',
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    void loadSavedSettlement(caseId);
  };

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setStatement(null);
  };

  const applyDraftDetail = (content) => {
    const detail = String(content || '').trim();
    if (!detail) return;
    setForm((previous) => {
      const existing = String(previous.non_monetary_terms || '').trim();
      if (existing.includes(detail)) return previous;
      return {
        ...previous,
        non_monetary_terms: existing ? `${existing}\n\n${detail}` : detail,
      };
    });
    setStatement(null);
    setNotice('The selected drafting-chat detail was added to Additional settlement terms. Review and edit it before generating the Closing Statement.');
  };

  const openDraftChat = async () => {
    if (!selectedCaseId || !settlement) {
      setError('Choose a case and attach its settlement before opening the Closing Statement drafting chat.');
      return;
    }
    setError('');
    setDraftChatOpen(true);
    setDraftChatLoading(true);
    try {
      const caseConversations = await getConversations(selectedCaseId);
      const existing = (caseConversations || []).find((item) => item.agent_type === 'closing_statement_drafter');
      const conversation = existing || await createConversation(
        'closing_statement_drafter',
        selectedCaseId,
        `Closing Statement — ${form.case_number || 'Case'}`,
      );
      const fullConversation = existing ? await getConversation(existing.id) : { ...conversation, messages: [] };
      setDraftConversation(conversation);
      setDraftMessages(fullConversation.messages || []);
    } catch (err) {
      setError(err.message || 'Could not open the Closing Statement drafting chat.');
      setDraftChatOpen(false);
    } finally {
      setDraftChatLoading(false);
    }
  };

  const handleDraftChatSend = async () => {
    const requestedDetail = draftChatInput.trim();
    if (!requestedDetail || !draftConversation?.id || draftChatSending) return;
    const statementFacts = [
      `Client: ${form.signer_name || 'Not entered'}`,
      `Adverse party: ${form.adverse_party || 'Not entered'}`,
      `Gross settlement: ${formatMoney(grossCents)}`,
      `Client proceeds: ${formatMoney(clientCents)}`,
      `Additional settlement terms already included: ${form.non_monetary_terms || 'None'}`,
    ].join('\n');
    const prompt = [
      'Help draft an optional additional Closing Statement detail using only the verified facts below and the attorney\'s request.',
      'Do not change or invent settlement amounts, parties, confidentiality obligations, or legal conclusions.',
      'Return a concise, attorney-reviewable paragraph only; the attorney must explicitly choose whether to add it to the statement.',
      '',
      'Verified Closing Statement facts:',
      statementFacts,
      '',
      `Attorney request: ${requestedDetail}`,
    ].join('\n');
    const optimisticUserMessage = {
      role: 'user',
      content: requestedDetail,
      created_at: new Date().toISOString(),
    };
    const streamId = `closing-draft-${Date.now()}`;
    setDraftMessages((previous) => [
      ...previous,
      optimisticUserMessage,
      { role: 'assistant', content: '', created_at: new Date().toISOString(), _streamId: streamId },
    ]);
    setDraftChatInput('');
    setDraftChatSending(true);
    try {
      await streamAgentMessage(draftConversation.id, prompt, (partialText) => {
        setDraftMessages((previous) => previous.map((message) => (
          message._streamId === streamId ? { ...message, content: partialText } : message
        )));
      });
      setDraftMessages((previous) => previous.map((message) => (
        message._streamId === streamId ? { ...message, _streamId: undefined } : message
      )));
    } catch (err) {
      setDraftMessages((previous) => previous.map((message) => (
        message._streamId === streamId
          ? { ...message, content: 'The drafting assistant could not respond. Please try again or add the detail directly below.', _streamId: undefined }
          : message
      )));
      setError(err.message || 'Could not send the drafting request.');
    } finally {
      setDraftChatSending(false);
    }
  };

  const handleDraftChatKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleDraftChatSend();
    }
  };

  const handleAddAttorney = async () => {
    const missing = ['full_name', 'firm_name', 'address', 'phone', 'email']
      .filter((field) => !newAttorney[field].trim());
    if (missing.length) {
      setError('Enter the attorney name, firm name, office address, phone number, and email before saving the letterhead.');
      return;
    }
    setSavingAttorney(true);
    setError('');
    try {
      const created = await createAttorney({
        ...newAttorney,
        is_default: attorneys.length === 0,
      });
      setAttorneys((previous) => [...previous, created].sort((left, right) => left.full_name.localeCompare(right.full_name)));
      setForm((previous) => ({ ...previous, attorney_id: created.id }));
      setNewAttorney(emptyAttorney);
      setShowAddAttorney(false);
      setNotice(`${created.full_name} was added and selected for this closing-statement letterhead.`);
    } catch (err) {
      setError(err.message || 'Could not save the attorney.');
    } finally {
      setSavingAttorney(false);
    }
  };

  const handleSettlementUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCaseId) return;
    settlementSourceRequestRef.current += 1;
    setLoadingSavedSettlement(false);
    setUploading(true);
    setError('');
    setNotice('');
    setStatement(null);
    try {
      const result = await uploadSettlementForClosingStatement(selectedCaseId, file);
      applySettlementSource(result, {
        notice: result.extraction_note || 'Settlement saved. Review the proposed values before generating the statement.',
      });
    } catch (err) {
      setError(err.message || 'Could not upload and read the settlement.');
      event.target.value = '';
    } finally {
      setUploading(false);
    }
  };

  const validateBeforeGenerate = () => {
    if (!selectedCaseId) return 'Choose the related case first.';
    if (!settlement?.id) return 'Upload the signed or final settlement first.';
    if (!form.attorney_id) return 'Choose the attorney whose firm letterhead should appear on the closing statement.';
    if (!form.case_number.trim()) return 'Enter the case number.';
    if (!form.gross_settlement_amount.trim()) return 'Enter the gross settlement amount.';
    if (!form.client_payout_amount.trim()) return 'Enter the amount being paid to the client.';
    if (!distributionValid) return 'The payout, paralegal fee, court costs, and service-of-process costs cannot exceed the gross settlement amount.';
    if (!form.signer_name.trim() || !form.signer_email.trim()) return 'Enter the client signer name and email address.';
    return '';
  };

  const handleGenerate = async () => {
    const validationError = validateBeforeGenerate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const result = await createClosingStatement({
        case_id: selectedCaseId,
        settlement_document_id: settlement.id,
        settlement_storage_path: settlement.storage_path,
        ...form,
      });
      setStatement(result.statement);
      const generatedVersion = result?.statement?.version || nextStatementVersion;
      setNotice(`Closing statement version ${generatedVersion} was generated and saved to the related case. Existing reports remain in history; revise the details and generate again whenever you need another version.`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not generate the closing statement.');
    } finally {
      setGenerating(false);
    }
  };

  const download = async (row, signed = false) => {
    try {
      setError('');
      const blob = await downloadClosingStatement(row.id, { signed });
      const prefix = signed ? 'signed_' : '';
      saveDownloadedBlob(blob, `${prefix}${row.statement_file_name || 'closing_statement.pdf'}`);
    } catch (err) {
      setError(err.message || 'Could not download the closing statement.');
    }
  };

  const openPreview = async (row, signed = false) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreview({ row, signed, bytes: null });
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const blob = await downloadClosingStatement(row.id, { signed });
      const bytes = await blob.arrayBuffer();
      if (previewRequestRef.current !== requestId) return;
      setPreview({ row, signed, bytes });
    } catch (err) {
      if (previewRequestRef.current !== requestId) return;
      setPreviewLoading(false);
      setPreviewError(err.message || 'Could not load the closing-statement preview.');
    }
  };

  const closePreview = () => {
    previewRequestRef.current += 1;
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError('');
  };

  const handleSend = async () => {
    if (!statement?.id) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      await sendClosingStatementForSignature(statement.id);
      const updated = { ...statement, status: 'awaiting_signature' };
      setStatement(updated);
      setNotice(`The client signature request was sent to ${statement.signer_email}.`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not send the closing statement for signature.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading closing statements…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary-700">
            <FileSignature className="h-5 w-5" />
            <span className="text-sm font-semibold">Settlement documents</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Closing Statements</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Upload a settlement, confirm the complete distribution, select the attorney letterhead, and generate a case-linked closing statement for secure client signature.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {returnTo && <button onClick={() => navigate(returnTo)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Return to Settlement Center</button>}
          <button onClick={() => setShowAddAttorney(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-800 shadow-sm hover:bg-primary-100">
            <Plus className="h-4 w-4" /> Add attorney letterhead
          </button>
          <button onClick={reloadCurrentCase} disabled={loadingSavedSettlement || uploading || generating} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={restartStatement} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
            <FileText className="h-4 w-4" /> Start new statement
          </button>
        </div>
      </div>

      {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p>{error}</p></div>}
      {notice && <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p>{notice}</p></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">1. Choose the case and letterhead</h2>
            <p className="mt-1 text-sm text-slate-500">Choose the case, then select the attorney whose firm letterhead will appear on the statement. Use <span className="font-semibold text-slate-700">Add attorney letterhead</span> above if the attorney is not listed.</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_1.2fr]">
          <label className="block text-sm font-medium text-slate-700">
            Related case
            <select value={selectedCaseId} onChange={(event) => chooseCase(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
              <option value="">Choose a case…</option>
              {cases.map((item) => <option key={item.id} value={item.id}>{item.client_name || item.client?.full_name || 'Client'} — {item.case_number || `Case ${item.id.slice(0, 8)}`}</option>)}
            </select>
          </label>
          <div>
            <p className="text-sm font-medium text-slate-700">Settlement document</p>
            <label className={`mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm font-medium transition ${selectedCaseId ? 'border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'}`}>
              {uploading || loadingSavedSettlement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading and reading settlement…' : loadingSavedSettlement ? 'Checking this case for a saved settlement…' : settlement ? `Replace ${settlement.file_name}` : 'Choose PDF, DOCX, or TXT settlement'}
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" disabled={!selectedCaseId || uploading || loadingSavedSettlement} onChange={handleSettlementUpload} className="sr-only" />
            </label>
          </div>
        </div>
        {settlement && <div className="border-t border-slate-100 bg-emerald-50 px-5 py-3 text-xs leading-5 text-emerald-900"><span className="font-semibold">Attached settlement:</span> {settlement.file_name || 'Settlement agreement'}. This case-linked document will be used for the closing statement; select it above only if you need to replace it.</div>}
        <div className="border-t border-slate-100 bg-slate-50 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Attorney letterhead</h3>
              <p className="mt-0.5 text-xs text-slate-500">Required before generating the statement. Select an existing attorney or add a new firm header.</p>
            </div>
            <button onClick={() => setShowAddAttorney(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800"><Plus className="h-4 w-4" /> Add attorney</button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm font-medium text-slate-700">
              Select attorney and firm letterhead
              <select value={form.attorney_id} onChange={(event) => updateField('attorney_id', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
                <option value="">Choose an attorney…</option>
                {attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.full_name}{attorney.firm_name ? ` — ${attorney.firm_name}` : ''}{attorney.is_default ? ' (Default)' : ''}</option>)}
              </select>
            </label>
            <button onClick={reloadCurrentCase} disabled={loadingSavedSettlement || uploading || generating} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw className="h-4 w-4" /> Refresh list
            </button>
          </div>
          {attorneys.length === 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No attorney letterheads are available yet. Use <span className="font-semibold">Refresh list</span> to load the attorneys already in LegalFlow, or choose <span className="font-semibold">Add attorney</span> to create one.</div>}
          {selectedAttorney && <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600"><p className="font-semibold text-slate-800">Header preview: {selectedAttorney.firm_name || selectedAttorney.full_name}</p><p className="mt-1 font-medium text-slate-700">{selectedAttorney.full_name}{selectedAttorney.bar_number ? ` · Bar No. ${selectedAttorney.bar_number}` : ''}</p><p className="mt-1">{selectedAttorney.address || 'Office address needed'}{selectedAttorney.phone || selectedAttorney.email ? '  |  ' : ''}{[selectedAttorney.phone, selectedAttorney.email].filter(Boolean).join('  |  ') || 'Phone and email needed'}</p><p className="mt-1 text-xs text-slate-500">The generated PDF uses this firm, address, phone, and email in the same three-line letterhead position as your reference statement.</p></div>}
          {showAddAttorney && <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50 p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-primary-900">Add attorney letterhead</h3><p className="mt-0.5 text-xs text-primary-800">These details become the firm header on each newly generated closing statement.</p></div><button onClick={() => setShowAddAttorney(false)} className="rounded-md p-1 text-primary-700 hover:bg-primary-100" aria-label="Close add attorney form"><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2"><TextField label="Attorney full name" value={newAttorney.full_name} disabled={savingAttorney} onChange={(value) => setNewAttorney((previous) => ({ ...previous, full_name: value }))} placeholder="Attorney name" /><TextField label="Bar number" value={newAttorney.bar_number} disabled={savingAttorney} onChange={(value) => setNewAttorney((previous) => ({ ...previous, bar_number: value }))} placeholder="Optional" /><TextField label="Firm name" value={newAttorney.firm_name} disabled={savingAttorney} onChange={(value) => setNewAttorney((previous) => ({ ...previous, firm_name: value }))} placeholder="Oise Law Group, P.C." /><TextField label="Firm email" type="email" value={newAttorney.email} disabled={savingAttorney} onChange={(value) => setNewAttorney((previous) => ({ ...previous, email: value }))} placeholder="firm@example.com" /><TextField label="Office phone" value={newAttorney.phone} disabled={savingAttorney} onChange={(value) => setNewAttorney((previous) => ({ ...previous, phone: value }))} placeholder="(770) 555-0100" /><TextField label="Office address" value={newAttorney.address} disabled={savingAttorney} onChange={(value) => setNewAttorney((previous) => ({ ...previous, address: value }))} placeholder="123 Main Street, City, ST 00000" /></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={handleAddAttorney} disabled={savingAttorney} className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:bg-slate-400">{savingAttorney && <Loader2 className="h-4 w-4 animate-spin" />}{savingAttorney ? 'Saving…' : 'Save and use letterhead'}</button><button onClick={() => setShowAddAttorney(false)} disabled={savingAttorney} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button></div></div>}
        </div>
      </section>

      <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${!settlement ? 'opacity-60' : ''}`}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">2. Confirm the statement details</h2>
          <p className="mt-1 text-sm text-slate-500">The gross settlement amount is suggested from the uploaded settlement when clearly stated. Enter the client payout and all fee and cost deductions; LegalFlow calculates the attorney-fee remainder automatically.</p>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Case number" value={form.case_number} disabled={!settlement} onChange={(value) => updateField('case_number', value)} placeholder="e.g., LF-2026-0001" />
              <TextField label="Adverse party" value={form.adverse_party} disabled={!settlement} onChange={(value) => updateField('adverse_party', value)} placeholder="Defendant or released party" />
            </div>
            <TextField label="Account or matter reference" value={form.account_reference} disabled={!settlement} onChange={(value) => updateField('account_reference', value)} placeholder="Account number or matter description" />
            <div className={`overflow-hidden rounded-xl border ${draftChatOpen ? 'border-primary-200 bg-primary-50/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="mt-0.5 rounded-lg bg-primary-100 p-1.5 text-primary-700"><MessageSquare className="h-4 w-4" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Closing Statement drafting chat</h3>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">Add case-specific details or ask for optional wording. You choose exactly what is added to the statement.</p>
                  </div>
                </div>
                <button type="button" onClick={() => (draftChatOpen ? setDraftChatOpen(false) : void openDraftChat())} disabled={!settlement || draftChatLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm font-semibold text-primary-700 shadow-sm hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60">
                  {draftChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                  {draftChatLoading ? 'Opening…' : draftChatOpen ? 'Hide chat' : 'Open chat'}
                </button>
              </div>
              {draftChatOpen && <div className="border-t border-primary-100 bg-white">
                <div className="max-h-80 space-y-3 overflow-y-auto p-4" aria-live="polite">
                  {draftMessages.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">Describe the additional settlement detail you need, such as a specific non-monetary term or a requested clarification. The assistant will return suggested wording; it will not change any distribution figures or add wording until you choose it.</div>}
                  {draftMessages.map((message, index) => {
                    const isAttorney = message.role === 'user';
                    const text = String(message.content || '').trim();
                    return <div key={message.id || message._streamId || `${message.role}-${index}`} className={`flex gap-2.5 ${isAttorney ? 'justify-end' : 'justify-start'}`}>
                      {!isAttorney && <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700"><Bot className="h-4 w-4" /></div>}
                      <div className={`max-w-[88%] rounded-xl px-3 py-2.5 text-sm leading-5 ${isAttorney ? 'bg-primary-700 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}>
                        <div className="whitespace-pre-wrap">{text || <span className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Drafting…</span>}</div>
                        {text && <button type="button" onClick={() => applyDraftDetail(text)} className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${isAttorney ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'}`}>
                          <Plus className="h-3.5 w-3.5" /> {isAttorney ? 'Add my detail' : 'Add suggested wording'}
                        </button>}
                      </div>
                      {isAttorney && <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600"><User className="h-4 w-4" /></div>}
                    </div>;
                  })}
                </div>
                <div className="border-t border-slate-100 p-3">
                  <label className="sr-only" htmlFor="closing-statement-draft-chat">Describe a detail for the Closing Statement</label>
                  <div className="flex items-end gap-2">
                    <textarea id="closing-statement-draft-chat" value={draftChatInput} onChange={(event) => setDraftChatInput(event.target.value)} onKeyDown={handleDraftChatKeyDown} disabled={draftChatSending || draftChatLoading} rows={3} placeholder="For example: Add that the creditor will update the account status after the agreed payment is issued." className="min-h-[76px] flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-slate-100" />
                    <button type="button" onClick={() => void handleDraftChatSend()} disabled={!draftChatInput.trim() || !draftConversation?.id || draftChatSending} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary-700 px-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                      {draftChatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Press Enter to send or Shift + Enter for a new line. Suggestions remain separate until you select <span className="font-semibold text-slate-700">Add suggested wording</span>.</p>
                </div>
              </div>}
            </div>
            <TextArea label="Additional settlement terms" value={form.non_monetary_terms} disabled={!settlement} onChange={(value) => updateField('non_monetary_terms', value)} placeholder="Attorney-reviewed wording from the drafting chat appears here. You may also enter or revise terms directly." />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Client signer name" value={form.signer_name} disabled={!settlement} onChange={(value) => updateField('signer_name', value)} placeholder="Client's legal name" />
              <TextField label="Client signer email" type="email" value={form.signer_email} disabled={!settlement} onChange={(value) => updateField('signer_email', value)} placeholder="client@example.com" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2"><Calculator className="h-5 w-5 text-primary-600" /><h3 className="font-semibold text-slate-900">Settlement distribution</h3></div>
            <div className="space-y-3">
              <MoneyField label="Gross settlement amount" value={form.gross_settlement_amount} disabled={!settlement} onChange={(value) => updateField('gross_settlement_amount', value)} />
              <MoneyField label="Amount paid to the client" value={form.client_payout_amount} disabled={!settlement} onChange={(value) => updateField('client_payout_amount', value)} />
              <MoneyField label="Paralegal fee paid to the firm" value={form.paralegal_fee_amount} disabled={!settlement} onChange={(value) => updateField('paralegal_fee_amount', value)} />
              <MoneyField label="Court costs paid to the firm" value={form.court_cost_amount} disabled={!settlement} onChange={(value) => updateField('court_cost_amount', value)} />
              <MoneyField label="Service-of-process costs paid to the firm" value={form.service_of_process_cost_amount} disabled={!settlement} onChange={(value) => updateField('service_of_process_cost_amount', value)} />
              <div className={`mt-2 border-t pt-3 ${attorneyCents < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                <div className="flex items-center justify-between text-sm font-semibold"><span>Attorney fees paid to the firm</span><span>{formatMoney(attorneyCents)}</span></div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-300 pt-2 text-base font-bold"><span>TOTAL</span><span>{formatMoney(grossCents)}</span></div>
              </div>
              {attorneyCents < 0 && <p className="text-xs text-red-700">The payout, paralegal fee, court costs, and service-of-process costs are greater than the gross settlement. Adjust the amounts before generating.</p>}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs text-slate-500">The generated statement includes the reference-style firm header, complete distribution, case number, and client signature/date block.</p>{selectedCaseId && nextStatementVersion > 1 && <p className="mt-1 text-xs font-medium text-primary-700">This will save a new Version {nextStatementVersion}. Prior closing statements stay available in history and will not block this report.</p>}</div>
          <button onClick={handleGenerate} disabled={!settlement || generating || !distributionValid} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {generating ? 'Generating…' : nextStatementVersion > 1 ? `Generate Version ${nextStatementVersion}` : 'Generate closing statement'}
          </button>
        </div>
      </section>

      {statement && (
        <section className="rounded-2xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary-800"><CheckCircle2 className="h-5 w-5" /><h2 className="font-semibold">Closing statement version {statement.version || 1} ready for review</h2></div>
              <p className="mt-1 text-sm text-primary-800">Open the protected webpage preview, review the PDF, then send the secure signature request to {statement.signer_email}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={editGeneratedStatement} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3.5 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"><FileText className="h-4 w-4" /> Edit details</button>
              <button onClick={restartStatement} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> New version</button>
              <button onClick={() => openPreview(statement)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3.5 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"><Eye className="h-4 w-4" /> View preview</button>
              <button onClick={() => download(statement)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3.5 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"><Download className="h-4 w-4" /> Download PDF</button>
              <button onClick={handleSend} disabled={sending || statement.status === 'awaiting_signature'} className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-slate-400"><Send className="h-4 w-4" />{sending ? 'Sending…' : statement.status === 'awaiting_signature' ? 'Sent for signature' : 'Send for signature'}</button>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Closing statement history</h2><p className="mt-1 text-sm text-slate-500">Draft and signed statements are also filed to their related case and client document views.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{statements.length}</span></div>
        {statements.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No closing statements have been generated yet.</div> : <div className="divide-y divide-slate-100">{statements.map((row) => { const badge = statementStatus(row.status); return <div key={row.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-slate-900">{row.statement_file_name}</p><span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">Version {row.version || 1}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span></div><p className="mt-1 text-sm text-slate-500">{row.signer_name} · Case {row.case_number} · Client payout {formatMoney(row.client_payout_cents)}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => openPreview(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Eye className="h-4 w-4" /> Draft</button><button onClick={() => download(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Download</button>{row.status === 'signed' && <><button onClick={() => openPreview(row, true)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"><Eye className="h-4 w-4" /> Signed</button><button onClick={() => download(row, true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Download className="h-4 w-4" /> Signed PDF</button></>}</div></div>; })}</div>}
      </section>

      {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Closing statement preview"><div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-900">{preview.signed ? 'Signed closing statement' : 'Closing statement'} preview</h2><p className="mt-0.5 text-sm text-slate-500">{preview.row.statement_file_name}</p></div><div className="flex items-center gap-2"><button onClick={() => download(preview.row, preview.signed)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Download</button><button onClick={closePreview} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Close preview"><X className="h-5 w-5" /></button></div></div><div className="min-h-[240px] flex-1 overflow-auto bg-slate-100 p-4"><div className="mx-auto max-w-3xl">{previewLoading && <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading PDF preview…</div>}{previewError && <div className="my-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p>{previewError}</p></div>}<div ref={previewCanvasRef} aria-live="polite" /></div></div></div></div>}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text', disabled = false }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-slate-100" /></label>;
}

function TextArea({ label, value, onChange, placeholder, disabled = false }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-slate-100" /></label>;
}

function MoneyField({ label, value, onChange, disabled }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<div className="relative mt-1.5"><span className="pointer-events-none absolute left-3 top-2.5 text-sm text-slate-500">$</span><input inputMode="decimal" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-slate-100" /></div></label>;
}
