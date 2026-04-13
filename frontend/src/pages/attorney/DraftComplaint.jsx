import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Plus,
  X,
  Upload,
  Send,
  Download,
  Copy,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  Scale,
  Sparkles,
} from 'lucide-react';
import {
  getDefendants,
  uploadDraftDocument,
  startDraft,
  getDraftStatus,
  getDraftResult,
  reviseDraft,
  downloadDraftDocx,
} from '../../lib/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_ORDER = [
  { name: 'intake_analyst', display: 'Intake Analyst', desc: 'Reading documents and extracting facts' },
  { name: 'case_classifier', display: 'Case Classifier', desc: 'Identifying violations and statutes' },
  { name: 'legal_researcher', display: 'Legal Researcher', desc: 'Pulling statutory language and counts' },
  { name: 'damages_analyst', display: 'Damages Analyst', desc: 'Calculating damages and pleading language' },
  { name: 'complaint_drafter', display: 'Complaint Drafter', desc: 'Writing the full complaint' },
  { name: 'qa_reviewer', display: 'QA Reviewer', desc: 'Checking all counts and citations' },
  { name: 'document_formatter', display: 'Document Formatter', desc: 'Generating Word document' },
];

const COURT_OPTIONS = [
  { value: '', label: '— Recommend based on facts —' },
  { value: 'United States District Court, Northern District of Georgia, Atlanta Division', label: 'N.D. Georgia — Atlanta Division (most common)' },
  { value: 'United States District Court, Middle District of Georgia', label: 'M.D. Georgia' },
  { value: 'United States District Court, Southern District of Georgia', label: 'S.D. Georgia' },
  { value: 'Georgia State Court', label: 'Georgia State Court' },
  { value: 'AAA Arbitration', label: 'AAA Arbitration' },
  { value: 'Other', label: 'Other — specify in facts' },
];

const STATUTE_OPTIONS = [
  { value: '', label: '— Agent detects from facts —' },
  { value: 'FCRA only', label: 'FCRA only' },
  { value: 'FDCPA only', label: 'FDCPA only' },
  { value: 'TCPA only', label: 'TCPA only' },
  { value: 'FCRA + FDCPA', label: 'FCRA + FDCPA' },
  { value: 'FCRA + FDCPA + GA FBPA', label: 'FCRA + FDCPA + GA FBPA' },
  { value: 'FDCPA + GA FBPA', label: 'FDCPA + GA FBPA' },
  { value: 'All three + GA FBPA', label: 'All three + GA FBPA' },
];

const EMPTY_DEFENDANT = {
  id: null,
  name: '',
  entity_type: '',
  principal_address: '',
  ga_registered_agent: '',
  autoFilled: false,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DraftComplaint() {
  // ── Form state ────────────────────────────────────────────────────────
  const [plaintiffName, setPlaintiffName] = useState('');
  const [plaintiffCounty, setPlaintiffCounty] = useState('');
  const [defendants, setDefendants] = useState([{ ...EMPTY_DEFENDANT, localId: 1 }]);
  const [court, setCourt] = useState('');
  const [statutes, setStatutes] = useState('');
  const [caseFacts, setCaseFacts] = useState('');
  const [damages, setDamages] = useState('');
  const [juryDemand, setJuryDemand] = useState(true);
  const [gaClaims, setGaClaims] = useState('include');
  const [draftMode, setDraftMode] = useState('fast'); // 'fast' (~15s) or 'thorough' (~90s)
  const [uploadedDocs, setUploadedDocs] = useState([]); // { name, storage_path }
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // ── Pipeline / output state ───────────────────────────────────────────
  const [outputState, setOutputState] = useState('idle'); // idle | running | complete | error
  const [sessionId, setSessionId] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [complaintResult, setComplaintResult] = useState(null);
  const [pipelineError, setPipelineError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // ── Known defendants from DB ──────────────────────────────────────────
  const [knownDefendants, setKnownDefendants] = useState([]);
  const fileInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    loadKnownDefendants();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  async function loadKnownDefendants() {
    try {
      const data = await getDefendants();
      setKnownDefendants(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load defendants:', err);
    }
  }

  // ── Defendant card handlers ───────────────────────────────────────────
  function addDefendant() {
    setDefendants((prev) => [
      ...prev,
      { ...EMPTY_DEFENDANT, localId: Date.now() + Math.random() },
    ]);
  }

  function removeDefendant(localId) {
    setDefendants((prev) =>
      prev.length === 1
        ? prev
        : prev.filter((d) => d.localId !== localId)
    );
  }

  function updateDefendantField(localId, field, value) {
    setDefendants((prev) =>
      prev.map((d) =>
        d.localId === localId ? { ...d, [field]: value, autoFilled: false } : d
      )
    );
  }

  function selectKnownDefendant(localId, defendantIdOrOther) {
    if (defendantIdOrOther === 'other') {
      setDefendants((prev) =>
        prev.map((d) =>
          d.localId === localId
            ? { ...EMPTY_DEFENDANT, localId, autoFilled: false }
            : d
        )
      );
      return;
    }
    const known = knownDefendants.find((kd) => kd.id === defendantIdOrOther);
    if (!known) return;
    setDefendants((prev) =>
      prev.map((d) =>
        d.localId === localId
          ? {
              ...d,
              id: known.id,
              name: known.name,
              entity_type: known.entity_type || '',
              principal_address: known.principal_address || '',
              ga_registered_agent: known.ga_registered_agent || '',
              autoFilled: true,
            }
          : d
      )
    );
  }

  // ── File upload ───────────────────────────────────────────────────────
  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      try {
        const result = await uploadDraftDocument(file);
        setUploadedDocs((prev) => [
          ...prev,
          { name: file.name, storage_path: result.storage_path, size: result.size },
        ]);
      } catch (err) {
        console.error('Upload failed for', file.name, err);
      }
    }
    setUploading(false);
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeUploadedDoc(idx) {
    setUploadedDocs((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Form submission ───────────────────────────────────────────────────
  function validateForm() {
    const errors = {};
    if (!plaintiffName.trim()) errors.plaintiffName = 'Required';
    if (!plaintiffCounty.trim()) errors.plaintiffCounty = 'Required';
    if (defendants.filter((d) => d.name.trim()).length === 0) {
      errors.defendants = 'At least one defendant is required';
    }
    if (!caseFacts.trim() || caseFacts.trim().length < 20) {
      errors.caseFacts = 'Describe the facts (at least 20 characters)';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleDraftComplaint() {
    if (!validateForm()) {
      document.getElementById('draft-form-top')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setOutputState('running');
    setPipelineError(null);
    setComplaintResult(null);

    // Build the payload
    const payload = {
      plaintiff_name: plaintiffName.trim(),
      plaintiff_county: plaintiffCounty.trim(),
      defendants: defendants
        .filter((d) => d.name.trim())
        .map((d) => ({
          defendant_id: d.id,
          name: d.name,
          entity_type: d.entity_type,
          principal_address: d.principal_address,
          ga_registered_agent: d.ga_registered_agent,
        })),
      court,
      statutes,
      case_facts: caseFacts,
      damages_description: damages,
      jury_demand: juryDemand,
      georgia_claims: gaClaims,
      document_urls: uploadedDocs.map((d) => d.storage_path),
      mode: draftMode,
    };

    try {
      const { session_id } = await startDraft(payload);
      setSessionId(session_id);
      startPolling(session_id);
    } catch (err) {
      console.error('Failed to start draft:', err);
      setPipelineError(err.message || 'Failed to start drafting pipeline');
      setOutputState('error');
    }
  }

  // ── Polling loop ──────────────────────────────────────────────────────
  function startPolling(sid) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const poll = async () => {
      try {
        const status = await getDraftStatus(sid);
        setPipelineStatus(status);

        if (status.overall_status === 'complete') {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          try {
            const result = await getDraftResult(sid);
            setComplaintResult(result);
            setOutputState('complete');
          } catch (err) {
            console.error('Failed to fetch result:', err);
            setPipelineError('Pipeline completed but result could not be fetched.');
            setOutputState('error');
          }
        } else if (status.overall_status === 'error') {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          const failed = status.agents.find((a) => a.status === 'error');
          const errorMsg =
            status.pipeline_error ||
            (failed
              ? `${failed.display_name} failed: ${failed.error_message || 'unknown error'}`
              : 'Pipeline encountered an error. Check Railway logs for details.');
          setPipelineError(errorMsg);
          setOutputState('error');
        }
      } catch (err) {
        console.error('Poll failed:', err);
      }
    };

    poll(); // immediate first poll
    pollIntervalRef.current = setInterval(poll, 2000);
  }

  function handleRetry() {
    if (sessionId) {
      setOutputState('running');
      setPipelineError(null);
      startPolling(sessionId);
    } else {
      handleDraftComplaint();
    }
  }

  function handleStartOver() {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setOutputState('idle');
    setSessionId(null);
    setPipelineStatus(null);
    setComplaintResult(null);
    setPipelineError(null);
  }

  async function handleCopyText() {
    if (!complaintResult?.complaint_text) return;
    try {
      await navigator.clipboard.writeText(complaintResult.complaint_text);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  function handleDownload(url) {
    if (url) window.open(url, '_blank');
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1600px] mx-auto" id="draft-form-top">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Complaint Drafting Agent</h1>
          <p className="text-sm text-slate-500 mt-1">
            FCRA · FDCPA · TCPA · Georgia & Federal Courts
          </p>
        </div>
        <div className="flex gap-2">
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide" style={{ background: '#E1F5EE', color: '#085041' }}>
            FCRA
          </span>
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide" style={{ background: '#EEEDFE', color: '#3C3489' }}>
            FDCPA
          </span>
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide" style={{ background: '#FAEEDA', color: '#633806' }}>
            TCPA
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-5">
        {/* ═════════════ LEFT COLUMN — FORM ═════════════ */}
        <div className="space-y-5">
          {/* Plaintiff info */}
          <Card>
            <SectionLabel>PLAINTIFF INFORMATION</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
              <Input
                label="Plaintiff full legal name"
                value={plaintiffName}
                onChange={setPlaintiffName}
                placeholder="John Smith"
                required
                error={validationErrors.plaintiffName}
              />
              <Input
                label="County of residence"
                value={plaintiffCounty}
                onChange={setPlaintiffCounty}
                placeholder="e.g. Gwinnett County"
                required
                error={validationErrors.plaintiffCounty}
              />
            </div>
          </Card>

          {/* Defendants */}
          <Card>
            <SectionLabel>DEFENDANTS</SectionLabel>
            <p className="text-xs text-slate-500 mb-3 -mt-1">
              Known defendants auto-fill address and registered agent
            </p>
            {validationErrors.defendants && (
              <div className="mb-3 text-xs text-red-600">{validationErrors.defendants}</div>
            )}
            <div className="space-y-3">
              {defendants.map((d) => (
                <DefendantCard
                  key={d.localId}
                  defendant={d}
                  knownDefendants={knownDefendants}
                  canRemove={defendants.length > 1}
                  onSelectKnown={(val) => selectKnownDefendant(d.localId, val)}
                  onUpdate={(field, val) => updateDefendantField(d.localId, field, val)}
                  onRemove={() => removeDefendant(d.localId)}
                />
              ))}
            </div>
            <button
              onClick={addDefendant}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <Plus className="w-4 h-4" /> Add Defendant
            </button>
          </Card>

          {/* Court and statutes */}
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
              <div>
                <SectionLabel>FILING COURT</SectionLabel>
                <select
                  value={court}
                  onChange={(e) => setCourt(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {COURT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <SectionLabel>STATUTES AT ISSUE</SectionLabel>
                <select
                  value={statutes}
                  onChange={(e) => setStatutes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {STATUTE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* Case facts */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <SectionLabel>CASE FACTS</SectionLabel>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold uppercase tracking-wide">
                be thorough
              </span>
            </div>
            <textarea
              value={caseFacts}
              onChange={(e) => setCaseFacts(e.target.value)}
              rows={8}
              placeholder="Describe the full facts: what the defendant did, key dates, disputes sent and when, responses received, how the plaintiff was harmed, any prior notices or letters, account details, forbearance or administrative protections, specific violations you want to plead..."
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y ${
                validationErrors.caseFacts ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {validationErrors.caseFacts && (
              <div className="mt-1 text-xs text-red-600">{validationErrors.caseFacts}</div>
            )}
          </Card>

          {/* Damages */}
          <Card>
            <SectionLabel>DAMAGES SUFFERED</SectionLabel>
            <textarea
              value={damages}
              onChange={(e) => setDamages(e.target.value)}
              rows={4}
              placeholder="Credit denials, emotional distress, anxiety, lost time, therapy or medical costs, financial harm, job denials, housing denials, higher interest rates. Be specific — this feeds into every count."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </Card>

          {/* Documents */}
          <Card>
            <SectionLabel>SUPPORTING DOCUMENTS</SectionLabel>
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-300 hover:border-slate-400'
              }`}
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm text-slate-700 font-medium">
                {uploading ? 'Uploading...' : 'Click or drag to upload'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Dispute letters · credit reports · collection notices · call logs · forbearance letters · exhibits
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
            </div>
            {uploadedDocs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {uploadedDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-xs">
                    <FileText className="w-3 h-3 text-slate-500" />
                    <span className="max-w-[200px] truncate">{doc.name}</span>
                    <button
                      onClick={() => removeUploadedDoc(i)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Draft Mode */}
          <Card>
            <SectionLabel>DRAFTING MODE</SectionLabel>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setDraftMode('fast')}
                className={`flex-1 rounded-lg border-2 p-3 text-left transition ${
                  draftMode === 'fast'
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-semibold text-slate-900">⚡ Fast Draft</div>
                <div className="text-xs text-slate-500 mt-0.5">~15 seconds · 2 API calls · best for most cases</div>
              </button>
              <button
                onClick={() => setDraftMode('thorough')}
                className={`flex-1 rounded-lg border-2 p-3 text-left transition ${
                  draftMode === 'thorough'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-semibold text-slate-900">🔍 Thorough</div>
                <div className="text-xs text-slate-500 mt-0.5">~90 seconds · 7 specialized agents · complex cases</div>
              </button>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <SectionLabel>JURY DEMAND</SectionLabel>
                <RadioGroup
                  value={juryDemand ? 'yes' : 'no'}
                  onChange={(v) => setJuryDemand(v === 'yes')}
                  options={[
                    { value: 'yes', label: 'Yes — jury trial demanded' },
                    { value: 'no', label: 'No jury demand' },
                  ]}
                />
              </div>
              <div>
                <SectionLabel>GEORGIA STATE CLAIMS</SectionLabel>
                <RadioGroup
                  value={gaClaims}
                  onChange={setGaClaims}
                  options={[
                    { value: 'include', label: 'Include GA FBPA where applicable' },
                    { value: 'federal_only', label: 'Federal only' },
                    { value: 'agent_decides', label: 'Agent decides based on facts' },
                  ]}
                />
              </div>
            </div>
          </Card>

          {/* Submit */}
          <div className="pt-2">
            <hr className="border-slate-200 mb-4" />
            <button
              onClick={handleDraftComplaint}
              disabled={outputState === 'running'}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: outputState === 'running' ? '#158760' : '#1D9E75' }}
              onMouseEnter={(e) => { if (outputState !== 'running') e.currentTarget.style.background = '#158760'; }}
              onMouseLeave={(e) => { if (outputState !== 'running') e.currentTarget.style.background = '#1D9E75'; }}
            >
              {outputState === 'running' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Running agent pipeline...
                </>
              ) : (
                <>
                  Draft Complaint
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="text-xs text-slate-400 text-center mt-2">
              The agent pipeline will run automatically. Drafting typically takes 30–60 seconds.
            </p>
          </div>
        </div>

        {/* ═════════════ RIGHT COLUMN — OUTPUT ═════════════ */}
        <div className="lg:sticky lg:top-4 lg:h-fit">
          <OutputPanel
            state={outputState}
            sessionId={sessionId}
            pipelineStatus={pipelineStatus}
            complaintResult={complaintResult}
            pipelineError={pipelineError}
            onRetry={handleRetry}
            onStartOver={handleStartOver}
            onCopyText={handleCopyText}
            onDownload={handleDownload}
            onComplaintUpdate={(newText, version) => {
              setComplaintResult((prev) => ({
                ...prev,
                complaint_text: newText,
                version,
              }));
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({ children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-2">
      {children}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, required, error }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
          error ? 'border-red-400' : 'border-slate-300'
        }`}
      />
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}

function RadioGroup({ value, onChange, options }) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="radio"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="text-emerald-600 focus:ring-emerald-500"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function DefendantCard({ defendant, knownDefendants, canRemove, onSelectKnown, onUpdate, onRemove }) {
  return (
    <div className="relative rounded-lg border border-slate-200 p-4 bg-slate-50/50">
      {canRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 text-slate-400 hover:text-red-500"
          aria-label="Remove defendant"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="mb-3">
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Select known defendant
        </label>
        <select
          value={defendant.id || ''}
          onChange={(e) => onSelectKnown(e.target.value || 'other')}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">— Select a defendant —</option>
          {knownDefendants.map((kd) => (
            <option key={kd.id} value={kd.id}>
              {kd.name} ({kd.entity_type})
            </option>
          ))}
          <option value="other">Other / Enter manually</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
        <Input
          label="Full legal name"
          value={defendant.name}
          onChange={(v) => onUpdate('name', v)}
          placeholder="Defendant LLC"
        />
        <Input
          label="Entity type"
          value={defendant.entity_type}
          onChange={(v) => onUpdate('entity_type', v)}
          placeholder="CRA / Debt Collector / Furnisher"
        />
      </div>
      <div className="mt-[10px]">
        <Input
          label="Principal address"
          value={defendant.principal_address}
          onChange={(v) => onUpdate('principal_address', v)}
          placeholder="123 Main St, City, State ZIP"
        />
      </div>
      <div className="mt-[10px]">
        <Input
          label="Georgia registered agent"
          value={defendant.ga_registered_agent}
          onChange={(v) => onUpdate('ga_registered_agent', v)}
          placeholder="Corporation Service Company, ..."
        />
      </div>
      {defendant.autoFilled && (
        <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Auto-filled from database — verify before filing
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Output panel — 3 states
// ---------------------------------------------------------------------------

function OutputPanel({
  state,
  sessionId,
  pipelineStatus,
  complaintResult,
  pipelineError,
  onRetry,
  onStartOver,
  onCopyText,
  onDownload,
  onComplaintUpdate,
}) {
  if (state === 'error') {
    return (
      <Card>
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-red-900">
                Agent pipeline encountered an error
              </div>
              <div className="text-xs text-red-700 mt-1">{pipelineError}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRetry}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
          <button
            onClick={onStartOver}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
          >
            Start Over
          </button>
        </div>
      </Card>
    );
  }

  if (state === 'complete' && complaintResult) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-emerald-700">
                Draft Complete {complaintResult.version > 1 ? `(v${complaintResult.version})` : ''}
              </span>
            </div>
            <DownloadDocxButton sessionId={sessionId} version={complaintResult.version} />
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 max-h-[500px] overflow-y-auto mb-4">
            <pre className="text-xs text-slate-800 whitespace-pre-wrap font-serif leading-relaxed">
              {complaintResult.complaint_text}
            </pre>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCopyText}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition"
            >
              <Copy className="w-3.5 h-3.5" /> Copy Text
            </button>
            <button
              onClick={onStartOver}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> New Draft
            </button>
          </div>
        </Card>

        {/* Revision Chat */}
        <RevisionChat
          sessionId={sessionId}
          complaintText={complaintResult.complaint_text}
          onComplaintUpdate={onComplaintUpdate}
        />
      </div>
    );
  }

  if (state === 'running') {
    return (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-900">Agent Pipeline</div>
          <div className="text-xs text-slate-500">
            {pipelineStatus?.progress_percent ?? 0}% complete
          </div>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${pipelineStatus?.progress_percent ?? 0}%`,
              background: '#1D9E75',
            }}
          />
        </div>

        <div className="space-y-3">
          {AGENT_ORDER.map((agent, idx) => {
            const live = pipelineStatus?.agents?.find((a) => a.name === agent.name);
            const status = live?.status || 'pending';
            return (
              <AgentRow
                key={agent.name}
                number={idx + 1}
                display={agent.display}
                desc={agent.desc}
                status={status}
                elapsed={live?.elapsed_seconds}
                logMessages={live?.log_messages}
              />
            );
          })}
        </div>
      </Card>
    );
  }

  // idle
  return (
    <Card>
      <div className="text-center py-16 text-slate-400">
        <div className="inline-flex p-4 rounded-2xl bg-slate-100 mb-4">
          <FileText className="w-10 h-10" />
        </div>
        <div className="text-sm font-medium text-slate-600">
          Your drafted complaint will appear here
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Fill in the case details and click Draft Complaint to begin
        </div>
      </div>
    </Card>
  );
}

function AgentRow({ number, display, desc, status, elapsed, logMessages }) {
  const [expanded, setExpanded] = useState(false);

  let icon;
  if (status === 'complete') {
    icon = <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
  } else if (status === 'running') {
    icon = <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
  } else if (status === 'error') {
    icon = <AlertCircle className="w-5 h-5 text-red-500" />;
  } else {
    icon = <Circle className="w-5 h-5 text-slate-300" />;
  }

  const hasLogs = logMessages && logMessages.length > 0;

  return (
    <div>
      <div
        className={`flex items-start gap-3 p-2 rounded-lg ${
          status === 'running' ? 'bg-blue-50' : ''
        } ${hasLogs ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        onClick={() => hasLogs && setExpanded(!expanded)}
      >
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-900">
              {number}. {display}
            </span>
            {elapsed != null && (
              <span className="text-[10px] font-mono text-slate-500">{elapsed}s</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
        </div>
      </div>
      {expanded && hasLogs && (
        <div className="ml-8 mt-1 p-2 bg-slate-900 rounded-md">
          {logMessages.map((msg, i) => (
            <div key={i} className="text-[10px] font-mono text-emerald-400">
              &gt; {msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download .docx button — generates formatted Word doc from current complaint
// ---------------------------------------------------------------------------

function DownloadDocxButton({ sessionId, version }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!sessionId || downloading) return;
    setDownloading(true);
    try {
      const blob = await downloadDraftDocx(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `complaint_v${version || 1}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Download failed: ' + (err.message || 'Unknown error'));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium transition disabled:opacity-60"
      style={{ background: '#1D9E75' }}
    >
      {downloading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...
        </>
      ) : (
        <>
          <Download className="w-3.5 h-3.5" /> Download .docx
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Revision Chat — inline chat for iterating on the drafted complaint
// ---------------------------------------------------------------------------

function RevisionChat({ sessionId, complaintText, onComplaintUpdate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;

    const userMsg = input.trim();
    setInput('');
    setSending(true);

    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);

    try {
      const result = await reviseDraft(sessionId, userMsg, complaintText);

      const assistantMsg = result.changes_summary
        ? `${result.changes_summary}\n\n✅ Complaint updated to v${result.version}`
        : `✅ Complaint revised (v${result.version})`;

      setMessages((prev) => [...prev, { role: 'assistant', content: assistantMsg }]);

      if (result.revised_complaint && onComplaintUpdate) {
        onComplaintUpdate(result.revised_complaint, result.version);
      }
    } catch (err) {
      console.error('Revision failed:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message || 'Revision failed. Try again.'}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-semibold text-slate-900">Revision Chat</span>
        <span className="text-[10px] text-slate-400 ml-1">Ask for changes to the draft</span>
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[
            'Add a count for §1681g failure to provide file disclosure',
            'Strengthen the damages language',
            'Add Georgia FBPA count',
            'Change the court to Middle District of Georgia',
            'Add more factual detail about the dispute timeline',
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setInput(suggestion)}
              className="px-2.5 py-1 bg-slate-100 rounded-full text-[11px] text-slate-600 hover:bg-slate-200 transition truncate max-w-[280px]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="max-h-[300px] overflow-y-auto mb-3 space-y-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-blue-50 text-blue-900 ml-8'
                  : 'bg-slate-50 text-slate-800 mr-8 border border-slate-200'
              }`}
            >
              <div className="font-semibold text-[10px] uppercase tracking-wide mb-0.5 opacity-60">
                {msg.role === 'user' ? 'You' : 'Drafter'}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}

          {sending && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs mr-8">
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Revising complaint...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell the drafter what to change... (Enter to send)"
          rows={2}
          disabled={sending}
          className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="shrink-0 bg-purple-600 text-white p-2.5 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
