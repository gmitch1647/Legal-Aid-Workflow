import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Download,
  FileSignature,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Upload,
} from 'lucide-react';
import {
  createClosingStatement,
  downloadClosingStatement,
  getCases,
  getClosingStatements,
  saveDownloadedBlob,
  sendClosingStatementForSignature,
  uploadSettlementForClosingStatement,
} from '../../lib/api';

const emptyForm = {
  case_number: '',
  adverse_party: '',
  account_reference: '',
  gross_settlement_amount: '',
  client_payout_amount: '',
  paralegal_fee_amount: '0.00',
  non_monetary_terms: '',
  signer_name: '',
  signer_email: '',
};

function dollarsToCents(value) {
  const normalized = String(value || '').replace(/[$,\s]/g, '');
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function formatMoney(cents) {
  const amount = (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return amount;
}

function statementStatus(status) {
  if (status === 'signed') return { label: 'Signed', className: 'bg-emerald-100 text-emerald-700' };
  if (status === 'awaiting_signature') return { label: 'Awaiting signature', className: 'bg-amber-100 text-amber-700' };
  if (status === 'void') return { label: 'Void', className: 'bg-slate-100 text-slate-600' };
  return { label: 'Draft', className: 'bg-blue-100 text-blue-700' };
}

export default function ClosingStatements() {
  const [cases, setCases] = useState([]);
  const [statements, setStatements] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [settlement, setSettlement] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef(null);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId) || null,
    [cases, selectedCaseId],
  );
  const grossCents = dollarsToCents(form.gross_settlement_amount);
  const clientCents = dollarsToCents(form.client_payout_amount);
  const paralegalCents = dollarsToCents(form.paralegal_fee_amount);
  const attorneyCents = grossCents - clientCents - paralegalCents;
  const distributionValid = Boolean(form.gross_settlement_amount && form.client_payout_amount) && attorneyCents >= 0;

  const refresh = async () => {
    const [caseData, statementData] = await Promise.all([getCases(), getClosingStatements()]);
    setCases(caseData || []);
    setStatements(statementData || []);
  };

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message || 'Could not load cases and closing statements.'))
      .finally(() => setLoading(false));
  }, []);

  const resetComposer = () => {
    setSelectedCaseId('');
    setSettlement(null);
    setForm(emptyForm);
    setStatement(null);
    setError('');
    setNotice('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const chooseCase = (caseId) => {
    const caseRow = cases.find((item) => item.id === caseId);
    setSelectedCaseId(caseId);
    setSettlement(null);
    setStatement(null);
    setError('');
    setNotice('');
    setForm({
      ...emptyForm,
      case_number: caseRow?.case_number || '',
      signer_name: caseRow?.client_name || caseRow?.client?.full_name || '',
      signer_email: caseRow?.client?.email || '',
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setStatement(null);
  };

  const handleSettlementUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCaseId) return;
    setUploading(true);
    setError('');
    setNotice('');
    setStatement(null);
    try {
      const result = await uploadSettlementForClosingStatement(selectedCaseId, file);
      const suggestions = result.suggestions || {};
      setSettlement(result.settlement_document);
      setForm((previous) => ({
        ...previous,
        case_number: suggestions.case_number || previous.case_number,
        adverse_party: suggestions.adverse_party || previous.adverse_party,
        account_reference: suggestions.account_reference || previous.account_reference,
        gross_settlement_amount: suggestions.gross_settlement_amount || previous.gross_settlement_amount,
        non_monetary_terms: suggestions.non_monetary_terms || previous.non_monetary_terms,
      }));
      setNotice(result.extraction_note || 'Settlement saved. Review the proposed values before generating the statement.');
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
    if (!form.case_number.trim()) return 'Enter the case number.';
    if (!form.gross_settlement_amount.trim()) return 'Enter the gross settlement amount.';
    if (!form.client_payout_amount.trim()) return 'Enter the amount being paid to the client.';
    if (!distributionValid) return 'The client payout and paralegal fee cannot exceed the gross settlement amount.';
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
      setNotice('Closing statement generated and saved to the related case. Review or download it, then send it for signature.');
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
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Upload a settlement, confirm the client payout, and generate a case-linked closing statement for secure client signature.</p>
        </div>
        <button onClick={resetComposer} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> New statement
        </button>
      </div>

      {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p>{error}</p></div>}
      {notice && <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p>{notice}</p></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">1. Upload the settlement</h2>
          <p className="mt-1 text-sm text-slate-500">LegalFlow saves the settlement to the selected case and suggests only clearly labeled information. You remain in control of every final value.</p>
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
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading and reading settlement…' : settlement ? `Replace ${settlement.file_name}` : 'Choose PDF, DOCX, or TXT settlement'}
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" disabled={!selectedCaseId || uploading} onChange={handleSettlementUpload} className="sr-only" />
            </label>
          </div>
        </div>
      </section>

      <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${!settlement ? 'opacity-60' : ''}`}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">2. Confirm the statement details</h2>
          <p className="mt-1 text-sm text-slate-500">Enter the amount paid to the client. LegalFlow calculates the attorney-fee remainder automatically.</p>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Case number" value={form.case_number} disabled={!settlement} onChange={(value) => updateField('case_number', value)} placeholder="e.g., LF-2026-0001" />
              <TextField label="Adverse party" value={form.adverse_party} disabled={!settlement} onChange={(value) => updateField('adverse_party', value)} placeholder="Defendant or released party" />
            </div>
            <TextField label="Account or matter reference" value={form.account_reference} disabled={!settlement} onChange={(value) => updateField('account_reference', value)} placeholder="Account number or matter description" />
            <TextArea label="Non-monetary settlement terms" value={form.non_monetary_terms} disabled={!settlement} onChange={(value) => updateField('non_monetary_terms', value)} placeholder="For example: Debt waiver and tradeline deletion terms." />
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
              <div className={`mt-2 border-t pt-3 ${attorneyCents < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                <div className="flex items-center justify-between text-sm font-semibold"><span>Attorney fees paid to the firm</span><span>{formatMoney(attorneyCents)}</span></div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-300 pt-2 text-base font-bold"><span>TOTAL</span><span>{formatMoney(grossCents)}</span></div>
              </div>
              {attorneyCents < 0 && <p className="text-xs text-red-700">The payout and paralegal fee are greater than the gross settlement. Adjust the amounts before generating.</p>}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">The generated statement includes the same distribution format, case number, and client signature/date block as your example.</p>
          <button onClick={handleGenerate} disabled={!settlement || generating || !distributionValid} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {generating ? 'Generating…' : 'Generate closing statement'}
          </button>
        </div>
      </section>

      {statement && (
        <section className="rounded-2xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary-800"><CheckCircle2 className="h-5 w-5" /><h2 className="font-semibold">Closing statement ready for review</h2></div>
              <p className="mt-1 text-sm text-primary-800">Review the PDF, then send the secure signature request to {statement.signer_email}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => download(statement)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3.5 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"><Download className="h-4 w-4" /> Download PDF</button>
              <button onClick={handleSend} disabled={sending || statement.status === 'awaiting_signature'} className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-slate-400"><Send className="h-4 w-4" />{sending ? 'Sending…' : statement.status === 'awaiting_signature' ? 'Sent for signature' : 'Send for signature'}</button>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Closing statement history</h2><p className="mt-1 text-sm text-slate-500">Draft and signed statements are also filed to their related case and client document views.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{statements.length}</span></div>
        {statements.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No closing statements have been generated yet.</div> : <div className="divide-y divide-slate-100">{statements.map((row) => { const badge = statementStatus(row.status); return <div key={row.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-slate-900">{row.statement_file_name}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span></div><p className="mt-1 text-sm text-slate-500">{row.signer_name} · Case {row.case_number} · Client payout {formatMoney(row.client_payout_cents)}</p></div><div className="flex gap-2"><button onClick={() => download(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Draft</button>{row.status === 'signed' && <button onClick={() => download(row, true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Download className="h-4 w-4" /> Signed</button>}</div></div>; })}</div>}
      </section>
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
