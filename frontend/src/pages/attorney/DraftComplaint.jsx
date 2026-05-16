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
  streamDraftChat,
  downloadDraftDocx,
  listDrafts,
  listDraftVersions,
  restoreDraftVersion,
  getCases,
  getCase,
  getDocuments,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';

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
  const [draftMode, setDraftMode] = useState('fast');
  const [documentType, setDocumentType] = useState('complaint');
  const [motionType, setMotionType] = useState('');
  const [discoveryType, setDiscoveryType] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState([]); // { name, storage_path }
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // ── Client / Case linking ─────────────────────────────────────────────
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [clientCases, setClientCases] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [existingComplaint, setExistingComplaint] = useState('');

  async function loadClients() {
    setLoadingClients(true);
    try {
      const { data } = await supabase.from('profiles').select('id, full_name, email, county, state, address').eq('role', 'client').order('full_name');
      setClients(data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingClients(false); }
  }

  async function selectClient(clientId) {
    setSelectedClientId(clientId);
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setPlaintiffName(client.full_name || '');
      setPlaintiffCounty(client.county || '');
    }
    // Load client's cases
    try {
      const cases = await getCases({ client_id: clientId });
      setClientCases(Array.isArray(cases) ? cases : []);
    } catch (err) {
      console.error('Failed to load client cases:', err);
      setClientCases([]);
    }
  }

  async function selectCase(caseId) {
    try {
      const caseData = await getCase(caseId);
      setSelectedCase(caseData);

      // Auto-fill case facts if available
      if (caseData.case_facts && !caseFacts) {
        setCaseFacts(caseData.case_facts);
      }
      if (caseData.damages_description && !damages) {
        setDamages(caseData.damages_description);
      }

      // Load existing complaint if there is one
      const { data: complaints } = await supabase
        .from('complaints')
        .select('complaint_text, version')
        .eq('case_id', caseId)
        .eq('is_current', true)
        .limit(1);
      if (complaints && complaints[0]) {
        setExistingComplaint(complaints[0].complaint_text || '');
      }

      // Load case documents for drag-over context
      try {
        const docs = await getDocuments(caseId);
        if (docs && docs.length > 0) {
          setUploadedDocs(prev => [
            ...prev,
            ...docs.map(d => ({ name: d.file_name, storage_path: d.storage_path, size: d.file_size, fromCase: true }))
          ]);
        }
      } catch {}
    } catch (err) {
      console.error('Failed to load case:', err);
    }
  }

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

  // ── Recent drafts ─────────────────────────────────────────────────────
  const [recentDrafts, setRecentDrafts] = useState([]);
  const [showDraftsList, setShowDraftsList] = useState(false);

  async function loadRecentDrafts() {
    try {
      const data = await listDrafts();
      setRecentDrafts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load recent drafts:', err);
    }
  }

  async function handleOpenDraft(draft) {
    setShowDraftsList(false);
    setSessionId(draft.session_id);
    setOutputState('running');
    try {
      const result = await getDraftResult(draft.session_id);
      setComplaintResult(result);
      setOutputState('complete');
    } catch (err) {
      console.error('Failed to open draft:', err);
      setOutputState('idle');
      alert('Could not open this draft: ' + (err.message || 'Unknown error'));
    }
  }

  useEffect(() => {
    loadKnownDefendants();
    loadRecentDrafts();
    loadClients();
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
      case_facts: (
        (documentType === 'motion' && motionType ? `MOTION TYPE: ${motionType}\n\n` : '') +
        (documentType === 'discovery' && discoveryType ? `DISCOVERY TYPE: ${discoveryType}\n\n` : '') +
        caseFacts +
        (existingComplaint && documentType !== 'complaint'
          ? `\n\n=== EXISTING COMPLAINT ON FILE (use as reference for facts, parties, and counts) ===\n${existingComplaint.slice(0, 15000)}`
          : '')
      ),
      damages_description: damages,
      jury_demand: juryDemand,
      georgia_claims: gaClaims,
      document_urls: uploadedDocs.map((d) => d.storage_path),
      mode: draftMode,
      document_type: documentType,
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
          <h1 className="text-2xl font-medium text-slate-900">Legal Document Drafter</h1>
          <p className="text-sm text-slate-500 mt-1">
            Complaints · Motions · Discovery · Demand Letters
          </p>
        </div>        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => { setShowDraftsList(true); loadRecentDrafts(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <FileText className="w-4 h-4" />
            Recent Drafts ({recentDrafts.length})
          </button>
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

      {/* Recent Drafts Modal */}
      {showDraftsList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Recent Drafts</h2>
              <button
                onClick={() => setShowDraftsList(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {recentDrafts.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No drafts yet. Create your first complaint below.
                </div>
              ) : (
                recentDrafts.map((draft) => (
                  <button
                    key={draft.session_id}
                    onClick={() => handleOpenDraft(draft)}
                    className="w-full text-left p-3 rounded-lg hover:bg-slate-50 border-b border-slate-100 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-slate-900 truncate">
                          {draft.plaintiff_name}
                          {draft.defendants && draft.defendants.length > 0 && (
                            <span className="font-normal text-slate-500">
                              {' '}v. {draft.defendants.slice(0, 3).join(', ')}
                              {draft.defendants.length > 3 ? ` +${draft.defendants.length - 3}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                          <span>
                            {draft.created_at
                              ? new Date(draft.created_at).toLocaleDateString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                  hour: 'numeric', minute: '2-digit',
                                })
                              : ''}
                          </span>
                          {draft.version && <span>· v{draft.version}</span>}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                          draft.status === 'draft_ready' ? 'bg-amber-100 text-amber-700' :
                          draft.status === 'approved' || draft.status === 'filed' ? 'bg-green-100 text-green-700' :
                          draft.status === 'error' ? 'bg-red-100 text-red-700' :
                          draft.status === 'agents_processing' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {draft.status?.replace(/_/g, ' ') || 'draft'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-5">
        {/* ═════════════ LEFT COLUMN — FORM ═════════════ */}
        <div className="space-y-5">
          {/* Document Type Selector */}
          <Card>
            <SectionLabel>DOCUMENT TYPE</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: 'complaint', label: 'Complaint', icon: '📄', desc: 'Federal complaint' },
                { value: 'motion', label: 'Motion', icon: '⚖️', desc: 'Motions & responses' },
                { value: 'discovery', label: 'Discovery', icon: '🔍', desc: 'Interrogatories, RFPs, RFAs' },
                { value: 'demand_letter', label: 'Demand Letter', icon: '✉️', desc: 'Pre-litigation demand' },
              ].map((dt) => (
                <button
                  key={dt.value}
                  onClick={() => setDocumentType(dt.value)}
                  className={`rounded-lg border-2 p-3 text-left transition ${
                    documentType === dt.value
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-lg mb-1">{dt.icon}</div>
                  <div className="text-sm font-semibold text-slate-900">{dt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{dt.desc}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* Client / Case Selector */}
          <Card>
            <SectionLabel>LINK TO CLIENT</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Select Client (auto-fills info)</label>
                <select value={selectedClientId} onChange={(e) => selectClient(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Manual entry —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>)}
                </select>
              </div>
              {clientCases.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Existing Case (loads complaint + docs)</label>
                  <select value={selectedCase?.id || ''} onChange={(e) => e.target.value && selectCase(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— New draft (no case) —</option>
                    {clientCases.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.case_facts ? c.case_facts.slice(0, 50) + '...' : c.status} ({new Date(c.created_at).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {existingComplaint && documentType !== 'complaint' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Existing complaint loaded — will be used as reference for {documentType} drafting.
              </div>
            )}
            {selectedCase && (
              <div className="mt-2 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <FileText className="w-3.5 h-3.5" />
                Case linked — documents and facts loaded. Switch document type above to draft discovery, motions, etc.
              </div>
            )}
          </Card>

          {/* Plaintiff info */}
          <Card>
            <SectionLabel>{documentType === 'demand_letter' ? 'CLIENT INFORMATION' : 'PLAINTIFF INFORMATION'}</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
              <Input
                label={documentType === 'demand_letter' ? 'Client full legal name' : 'Plaintiff full legal name'}
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

          {/* Case facts / instructions — changes based on document type */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <SectionLabel>
                {documentType === 'complaint' ? 'CASE FACTS' :
                 documentType === 'motion' ? 'MOTION DETAILS' :
                 documentType === 'discovery' ? 'DISCOVERY INSTRUCTIONS' :
                 'DEMAND DETAILS'}
              </SectionLabel>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold uppercase tracking-wide">
                be thorough
              </span>
            </div>

            {/* Motion type dropdown */}
            {documentType === 'motion' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Type of Motion</label>
                <select
                  value={motionType}
                  onChange={(e) => setMotionType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">— Select motion type —</option>
                  <option value="Motion to Compel Discovery">Motion to Compel Discovery</option>
                  <option value="Motion for Default Judgment">Motion for Default Judgment</option>
                  <option value="Opposition to Motion to Dismiss">Opposition to Motion to Dismiss</option>
                  <option value="Motion for Summary Judgment">Motion for Summary Judgment</option>
                  <option value="Motion for Sanctions">Motion for Sanctions</option>
                  <option value="Motion in Limine">Motion in Limine</option>
                  <option value="Motion to Strike">Motion to Strike</option>
                  <option value="Motion for Protective Order">Motion for Protective Order</option>
                  <option value="Motion to Extend Deadline">Motion to Extend Deadline</option>
                  <option value="Motion for Leave to Amend">Motion for Leave to Amend Complaint</option>
                  <option value="Opposition to Summary Judgment">Opposition to Summary Judgment</option>
                  <option value="Reply Brief">Reply Brief</option>
                  <option value="Other">Other (specify below)</option>
                </select>
              </div>
            )}

            {/* Discovery type dropdown */}
            {documentType === 'discovery' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Type of Discovery</label>
                <select
                  value={discoveryType}
                  onChange={(e) => setDiscoveryType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">— Select discovery type —</option>
                  <option value="Interrogatories (First Set)">Interrogatories (First Set)</option>
                  <option value="Requests for Production of Documents">Requests for Production of Documents</option>
                  <option value="Requests for Admission">Requests for Admission</option>
                  <option value="Interrogatories + RFPs (Combined)">Interrogatories + RFPs (Combined)</option>
                  <option value="Subpoena Duces Tecum">Subpoena Duces Tecum</option>
                  <option value="Deposition Notice">Deposition Notice</option>
                  <option value="Responses to Interrogatories">Responses to Interrogatories</option>
                  <option value="Responses to RFPs">Responses to Requests for Production</option>
                  <option value="Responses to RFAs">Responses to Requests for Admission</option>
                  <option value="Other">Other (specify below)</option>
                </select>
              </div>
            )}

            <textarea
              value={caseFacts}
              onChange={(e) => setCaseFacts(e.target.value)}
              rows={8}
              placeholder={
                documentType === 'complaint'
                  ? "Describe the full facts: what the defendant did, key dates, disputes sent and when, responses received, how the plaintiff was harmed, any prior notices or letters, account details, forbearance or administrative protections, specific violations you want to plead..."
                  : documentType === 'motion'
                    ? "Case number:\nWhat are the key facts supporting this motion?\nWhat arguments do you want to make?\nWhat relief are you seeking?\nRelevant procedural history (deadlines, prior motions, court orders)...\nAny specific case law to cite?"
                    : documentType === 'discovery'
                      ? "Which defendant is this directed to?\nCase number (if filed):\nWhat specific information are you seeking?\nKey topics to cover (dispute procedures, account records, communication logs, training materials, Metro 2 data, e-OSCAR records)...\nAny specific time period to cover?\nAny prior discovery issues?"
                      : "What are you demanding?\nWhat violations occurred?\nWhat is the deadline for response?\nSettlement amount (if any)?\nBrief factual background..."
              }
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y ${
                validationErrors.caseFacts ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {validationErrors.caseFacts && (
              <div className="mt-1 text-xs text-red-600">{validationErrors.caseFacts}</div>
            )}
          </Card>

          {/* Damages — only show for complaints and demand letters */}
          {(documentType === 'complaint' || documentType === 'demand_letter') && (
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
          )}

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
            <div className="flex items-center gap-2">
              <VersionHistoryButton
                sessionId={sessionId}
                currentVersion={complaintResult.version}
                onRestore={(text, version) => {
                  if (onComplaintUpdate) onComplaintUpdate(text, version);
                }}
              />
              <DownloadDocxButton sessionId={sessionId} version={complaintResult.version} />
            </div>
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
// Version History button — list/restore previous complaint versions
// ---------------------------------------------------------------------------

function VersionHistoryButton({ sessionId, currentVersion, onRestore }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);

  async function loadVersions() {
    setLoading(true);
    try {
      const data = await listDraftVersions(sessionId);
      setVersions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load versions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(version) {
    if (!window.confirm(`Restore version ${version}? This will replace the current complaint (but keep all versions in history).`)) return;
    try {
      const result = await restoreDraftVersion(sessionId, version);
      if (onRestore && result.complaint_text) {
        onRestore(result.complaint_text, result.new_version);
      }
      setOpen(false);
    } catch (err) {
      alert('Restore failed: ' + (err.message || 'Unknown error'));
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); loadVersions(); }}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition"
        title="View version history"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        v{currentVersion || 1}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Version History</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {loading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8 text-slate-400">No versions found.</div>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.id}
                    className={`p-3 border-b border-slate-100 hover:bg-slate-50 ${
                      v.is_current ? 'bg-emerald-50/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                          Version {v.version}
                          {v.is_current && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold uppercase">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {v.created_at ? new Date(v.created_at).toLocaleString() : ''} · {v.length} chars
                        </div>
                      </div>
                      {!v.is_current && (
                        <button
                          onClick={() => handleRestore(v.version)}
                          className="px-3 py-1 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-700"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 font-serif line-clamp-3">
                      {v.preview}...
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
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
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      try {
        const result = await uploadDraftDocument(file);
        setAttachments((prev) => [
          ...prev,
          { name: file.name, storage_path: result.storage_path },
        ]);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachment(idx) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    if ((!input.trim() && attachments.length === 0) || sending) return;

    const userMsg = input.trim() || `(Analyze ${attachments.length} attached file${attachments.length > 1 ? 's' : ''})`;
    const currentAttachments = attachments;
    setInput('');
    setAttachments([]);
    setSending(true);

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMsg, attachments: currentAttachments.map((a) => a.name) },
    ]);

    // Add streaming placeholder
    const streamId = `stream-${Date.now()}`;
    setMessages((prev) => [...prev, { role: 'assistant', content: '', _streamId: streamId }]);

    try {
      const fullText = await streamDraftChat(
        sessionId,
        userMsg,
        complaintText,
        currentAttachments.map((a) => a.storage_path),
        messages.slice(-10),
        (partial) => {
          setMessages((prev) =>
            prev.map((m) => m._streamId === streamId ? { ...m, content: partial } : m)
          );
        }
      );

      // Finalize stream message
      setMessages((prev) =>
        prev.map((m) => m._streamId === streamId ? { ...m, _streamId: undefined } : m)
      );

      // If the response contains a revised complaint, update it
      if (fullText.includes('REVISED COMPLAINT:')) {
        const revised = fullText.split('REVISED COMPLAINT:')[1].trim();
        if (revised.length > 1000 && onComplaintUpdate) {
          onComplaintUpdate(revised);
          // Append a note to the message
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              const summary = fullText.split('REVISED COMPLAINT:')[0].trim();
              return [...prev.slice(0, -1), { ...last, content: (summary || '✅ Complaint revised.') + '\n\n✅ Complaint updated above.' }];
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('Chat failed:', err);
      setMessages((prev) =>
        prev.map((m) => m._streamId === streamId
          ? { ...m, content: `Error: ${err.message}`, _streamId: undefined }
          : m
        )
      );
    } finally {
      setSending(false);
      if (inputRef.current) inputRef.current.focus();
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
        <span className="text-sm font-semibold text-slate-900">Draft Assistant</span>
        <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">Streaming</span>
        <span className="text-[10px] text-slate-400 ml-1">Revise, ask questions, discuss case law</span>
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[
            'Add a count for §1681g failure to provide file disclosure',
            'What case law supports the §1681i(a)(5)(B) reinsertion claim?',
            'Do you think we have a strong willfulness argument here?',
            'What discovery should I request from the CRA?',
            'Strengthen the damages language',
            'Add Georgia FBPA count',
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
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {msg.attachments.map((name, i) => (
                    <span key={i} className="text-[9px] bg-white/60 rounded px-1.5 py-0.5 flex items-center gap-1">
                      <FileText className="w-2.5 h-2.5" />
                      {name}
                    </span>
                  ))}
                </div>
              )}
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

      {/* Attachment pills */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 border border-purple-200 rounded-full text-xs">
              <FileText className="w-3 h-3 text-purple-500" />
              <span className="max-w-[150px] truncate text-purple-900">{a.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="text-purple-400 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || uploading}
          title="Attach files for the drafter to analyze"
          className="shrink-0 p-2.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={attachments.length > 0
            ? "Add context (or send to analyze the attachment)..."
            : "Ask a question, request a revision, or discuss strategy..."}
          rows={2}
          disabled={sending}
          className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={(!input.trim() && attachments.length === 0) || sending}
          className="shrink-0 bg-purple-600 text-white p-2.5 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
