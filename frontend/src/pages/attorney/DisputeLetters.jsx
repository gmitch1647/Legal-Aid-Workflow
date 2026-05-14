import React, { useState, useRef } from 'react';
import {
  FileText, Send, Download, Copy, RefreshCw, Plus, X, Upload,
  Loader2, CheckCircle2, AlertCircle, Scale, Mail, User,
} from 'lucide-react';
import {
  getDefendants, startDraft, getDraftStatus, getDraftResult,
  uploadDraftDocument, downloadDraftDocx, reviseDraft,
  getCases, getDocuments,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';

const DISPUTE_TYPES = [
  { value: 'initial_dispute', label: 'Initial Dispute', desc: 'First dispute to CRA about inaccurate item' },
  { value: 'second_dispute', label: 'Second/Follow-up Dispute', desc: 'After first dispute was verified as accurate' },
  { value: 'method_of_verification', label: 'Method of Verification Request', desc: 'Demand how they verified under §1681i(a)(7)' },
  { value: 'reinsertion_dispute', label: 'Reinsertion Dispute', desc: 'Item deleted then reinserted without notice' },
  { value: 'furnisher_dispute', label: 'Furnisher Direct Dispute', desc: 'Dispute sent to the furnisher after CRA fails' },
  { value: 'mixed_file', label: 'Mixed File Dispute', desc: "Another person's info on your report" },
  { value: 'identity_theft', label: 'Identity Theft Dispute', desc: 'Fraudulent accounts' },
  { value: 'obsolete_info', label: 'Obsolete Information', desc: 'Items older than 7/10 years per §1681c' },
  { value: 'forbearance', label: 'Forbearance/Administrative Dispute', desc: 'Delinquency during approved forbearance' },
  { value: 'debt_validation', label: 'Debt Validation Letter', desc: 'FDCPA §1692g validation request' },
  { value: 'cease_and_desist', label: 'Cease and Desist', desc: 'FDCPA §1692c(c) stop communication' },
];

const BUREAUS = [
  { value: 'equifax', label: 'Equifax', address: 'P.O. Box 740256, Atlanta, GA 30374' },
  { value: 'experian', label: 'Experian', address: 'P.O. Box 4500, Allen, TX 75013' },
  { value: 'transunion', label: 'TransUnion', address: 'P.O. Box 2000, Chester, PA 19016' },
  { value: 'chex_systems', label: 'Chex Systems', address: '7805 Hudson Road, Suite 100, Woodbury, MN 55125' },
  { value: 'furnisher', label: 'Furnisher/Creditor (specify below)', address: '' },
  { value: 'debt_collector', label: 'Debt Collector (specify below)', address: '' },
];

export default function DisputeLetters() {
  // Client selection
  const [clientMode, setClientMode] = useState(''); // 'existing' | 'new'
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDocs, setClientDocs] = useState([]);
  const [clientCases, setClientCases] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

  async function loadClients() {
    setLoadingClients(true);
    try {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('full_name');
      setClients(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClients(false);
    }
  }

  async function handleSelectClient(clientId) {
    setSelectedClientId(clientId);
    if (!clientId) {
      setSelectedClient(null);
      setClientDocs([]);
      setClientCases([]);
      return;
    }

    const client = clients.find(c => c.id === clientId);
    setSelectedClient(client);

    // Auto-fill ALL client info
    if (client) {
      setClientName(client.full_name || '');
      setClientAddress(
        [client.address, client.county, client.state].filter(Boolean).join(', ')
      );
      // Parse DOB from case_facts if available later
    }

    // Load client's cases and documents
    try {
      const casesData = await getCases({ client_id: clientId });
      const casesList = Array.isArray(casesData) ? casesData : casesData?.data || [];
      const clientSpecific = casesList.filter(c => c.client_id === clientId);
      setClientCases(clientSpecific);

      // Load docs from all cases
      const allDocs = [];
      for (const c of clientSpecific.slice(0, 10)) {
        try {
          const docs = await getDocuments(c.id);
          const docList = Array.isArray(docs) ? docs : docs?.documents || [];
          docList.forEach(d => allDocs.push({ ...d, case_id: c.id }));
        } catch {}
      }
      setClientDocs(allDocs);
    } catch (err) {
      console.error(err);
    }
  }

  // Add a client file to the dispute attachments
  function attachClientDoc(doc) {
    const already = uploadedDocs.some(d => d.storage_path === doc.storage_path);
    if (already) return;
    setUploadedDocs(prev => [...prev, {
      name: doc.file_name || doc.name || 'Document',
      storage_path: doc.storage_path,
      fromClient: true,
    }]);
  }

  // Form state
  const [disputeType, setDisputeType] = useState('');
  const [sendTo, setSendTo] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientSSNLast4, setClientSSNLast4] = useState('');
  const [clientDOB, setClientDOB] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [creditorName, setCreditorName] = useState('');
  const [whatIsWrong, setWhatIsWrong] = useState('');
  const [whatShouldShow, setWhatShouldShow] = useState('');
  const [priorDisputeDate, setPriorDisputeDate] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Output state
  const [outputState, setOutputState] = useState('idle');
  const [sessionId, setSessionId] = useState(null);
  const [letterText, setLetterText] = useState('');
  const [letterVersion, setLetterVersion] = useState(1);
  const [error, setError] = useState(null);
  const [revisionInput, setRevisionInput] = useState('');
  const [revising, setRevising] = useState(false);
  const pollRef = useRef(null);

  function handleBureauSelect(value) {
    setSendTo(value);
    const bureau = BUREAUS.find(b => b.value === value);
    if (bureau && bureau.address) {
      setRecipientName(bureau.label);
      setRecipientAddress(bureau.address);
    } else {
      setRecipientName('');
      setRecipientAddress('');
    }
  }

  async function handleFiles(fileList) {
    if (!fileList) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      try {
        const result = await uploadDraftDocument(file);
        setUploadedDocs(prev => [...prev, { name: file.name, storage_path: result.storage_path }]);
      } catch (err) { console.error(err); }
    }
    setUploading(false);
  }

  async function handleGenerate() {
    if (!disputeType || !clientName) return;
    setOutputState('running');
    setError(null);

    const disputeLabel = DISPUTE_TYPES.find(d => d.value === disputeType)?.label || disputeType;
    const caseFacts = [
      `DISPUTE TYPE: ${disputeLabel}`,
      `SEND TO: ${recipientName || sendTo}`,
      recipientAddress ? `RECIPIENT ADDRESS: ${recipientAddress}` : '',
      `\nCLIENT: ${clientName}`,
      clientAddress ? `CLIENT ADDRESS: ${clientAddress}` : '',
      clientSSNLast4 ? `SSN LAST 4: ${clientSSNLast4}` : '',
      clientDOB ? `DOB: ${clientDOB}` : '',
      `\nDISPUTED ITEM:`,
      creditorName ? `Creditor/Furnisher: ${creditorName}` : '',
      accountNumber ? `Account Number: ${accountNumber}` : '',
      whatIsWrong ? `What Is Inaccurate: ${whatIsWrong}` : '',
      whatShouldShow ? `What It Should Show: ${whatShouldShow}` : '',
      priorDisputeDate ? `Prior Dispute Date: ${priorDisputeDate}` : '',
      additionalDetails ? `\nADDITIONAL DETAILS:\n${additionalDetails}` : '',
    ].filter(Boolean).join('\n');

    try {
      const { session_id } = await startDraft({
        plaintiff_name: clientName,
        plaintiff_county: '',
        defendants: recipientName ? [{ name: recipientName, entity_type: 'CRA' }] : [],
        case_facts: caseFacts,
        damages_description: '',
        jury_demand: false,
        mode: 'fast',
        document_type: 'dispute_letter',
        document_urls: uploadedDocs.map(d => d.storage_path),
      });
      setSessionId(session_id);

      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const status = await getDraftStatus(session_id);
          if (status.overall_status === 'complete') {
            clearInterval(poll);
            const result = await getDraftResult(session_id);
            setLetterText(result.complaint_text);
            setLetterVersion(result.version || 1);
            setOutputState('complete');
          } else if (status.overall_status === 'error') {
            clearInterval(poll);
            setError(status.pipeline_error || 'Generation failed');
            setOutputState('error');
          }
        } catch (err) { console.error(err); }
      }, 2000);
      pollRef.current = poll;
    } catch (err) {
      setError(err.message);
      setOutputState('error');
    }
  }

  async function handleRevision() {
    if (!revisionInput.trim() || !sessionId || revising) return;
    setRevising(true);
    try {
      const result = await reviseDraft(sessionId, revisionInput, letterText);
      if (result.revised_complaint && result.was_revised !== false) {
        setLetterText(result.revised_complaint);
        setLetterVersion(result.version || letterVersion + 1);
      }
      setRevisionInput('');
    } catch (err) {
      setError(err.message);
    } finally {
      setRevising(false);
    }
  }

  async function handleCopy() {
    try { await navigator.clipboard.writeText(letterText); } catch {}
  }

  async function handleDownload() {
    if (!sessionId) return;
    try {
      const blob = await downloadDraftDocx(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dispute_letter_v${letterVersion}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setOutputState('idle');
    setSessionId(null);
    setLetterText('');
    setError(null);
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-slate-900">Dispute Letter Generator</h1>
        <p className="text-sm text-slate-500 mt-1">FCRA · FDCPA · Credit Bureau Disputes · Furnisher Disputes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-5">
        {/* LEFT — Form */}
        <div className="space-y-5">
          {/* Dispute Type */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-3">DISPUTE TYPE</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DISPUTE_TYPES.map(dt => (
                <button key={dt.value} onClick={() => setDisputeType(dt.value)}
                  className={`rounded-lg border-2 p-3 text-left transition ${
                    disputeType === dt.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <div className="text-sm font-semibold text-slate-900">{dt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{dt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Send To */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-2">SEND TO</div>
            <select value={sendTo} onChange={(e) => handleBureauSelect(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3">
              <option value="">— Select recipient —</option>
              {BUREAUS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            {(sendTo === 'furnisher' || sendTo === 'debt_collector') && (
              <div className="grid grid-cols-1 gap-2">
                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Recipient name (e.g. Midland Credit Management)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="Recipient address"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>

          {/* Client Selection */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-3">CLIENT</div>

            {/* Mode selector */}
            {!clientMode && (
              <div className="flex gap-3">
                <button onClick={() => { setClientMode('existing'); loadClients(); }}
                  className="flex-1 flex items-center gap-2 justify-center rounded-lg border-2 border-slate-200 p-4 hover:border-blue-400 hover:bg-blue-50 transition">
                  <User className="w-5 h-5 text-blue-600" />
                  <div className="text-left">
                    <div className="text-sm font-semibold text-slate-900">Existing Client</div>
                    <div className="text-[10px] text-slate-500">Pick from your client list</div>
                  </div>
                </button>
                <button onClick={() => setClientMode('new')}
                  className="flex-1 flex items-center gap-2 justify-center rounded-lg border-2 border-slate-200 p-4 hover:border-blue-400 hover:bg-blue-50 transition">
                  <Plus className="w-5 h-5 text-emerald-600" />
                  <div className="text-left">
                    <div className="text-sm font-semibold text-slate-900">New Client</div>
                    <div className="text-[10px] text-slate-500">Enter info manually</div>
                  </div>
                </button>
              </div>
            )}

            {/* Existing client picker */}
            {clientMode === 'existing' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Select Client</label>
                  <button onClick={() => { setClientMode(''); setSelectedClient(null); setClientDocs([]); setClientCases([]); }}
                    className="text-xs text-slate-400 hover:text-slate-600">Change</button>
                </div>
                {loadingClients ? (
                  <div className="flex items-center gap-2 py-4 justify-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading clients...</div>
                ) : (
                  <select value={selectedClientId} onChange={(e) => handleSelectClient(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Select a client —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
                    ))}
                  </select>
                )}

                {/* Selected client info card */}
                {selectedClient && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="text-sm font-semibold text-slate-900">{selectedClient.full_name}</div>
                    <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                      {selectedClient.email && <div>Email: {selectedClient.email}</div>}
                      {selectedClient.phone && <div>Phone: {selectedClient.phone}</div>}
                      {selectedClient.address && <div>Address: {selectedClient.address}</div>}
                      {selectedClient.county && <div>County: {selectedClient.county}, {selectedClient.state}</div>}
                    </div>

                    {/* Client documents — click to attach */}
                    {clientDocs.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <div className="text-[10px] font-semibold uppercase text-blue-700 mb-1.5">
                          Client Documents ({clientDocs.length}) — click to attach
                        </div>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {clientDocs.map((doc, i) => {
                            const isAttached = uploadedDocs.some(d => d.storage_path === doc.storage_path);
                            return (
                              <button
                                key={doc.id || i}
                                onClick={() => attachClientDoc(doc)}
                                disabled={isAttached}
                                className={`w-full flex items-center gap-2 text-xs rounded p-2 text-left transition ${
                                  isAttached
                                    ? 'bg-blue-100 border border-blue-300 opacity-60'
                                    : 'bg-white border border-slate-100 hover:bg-emerald-50 hover:border-emerald-300 cursor-pointer'
                                }`}
                              >
                                <FileText className={`w-3.5 h-3.5 shrink-0 ${isAttached ? 'text-blue-500' : 'text-slate-400'}`} />
                                <span className="truncate flex-1 text-slate-700">{doc.file_name || doc.name}</span>
                                <span className="text-[9px] text-slate-400 shrink-0">{(doc.document_category || 'other').replace(/_/g, ' ')}</span>
                                {isAttached ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                ) : (
                                  <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Client cases */}
                    {clientCases.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <div className="text-[10px] font-semibold uppercase text-blue-700 mb-1.5">Cases ({clientCases.length})</div>
                        <div className="space-y-1">
                          {clientCases.slice(0, 5).map(c => (
                            <div key={c.id} className="text-xs bg-white rounded p-1.5 text-slate-700">
                              {c.plaintiff_name || c.client_name || 'Case'} — <span className="text-slate-400">{c.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Editable fields (pre-filled from client) */}
                {selectedClient && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={clientSSNLast4} onChange={(e) => setClientSSNLast4(e.target.value)} placeholder="SSN last 4 digits" maxLength={4}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="date" value={clientDOB} onChange={(e) => setClientDOB(e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>
            )}

            {/* New client form */}
            {clientMode === 'new' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">New Client</label>
                  <button onClick={() => setClientMode('')} className="text-xs text-slate-400 hover:text-slate-600">Change</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client full name *"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Client address"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input value={clientSSNLast4} onChange={(e) => setClientSSNLast4(e.target.value)} placeholder="SSN last 4 digits" maxLength={4}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="date" value={clientDOB} onChange={(e) => setClientDOB(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
          </div>

          {/* Disputed Item */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-2">DISPUTED ITEM</div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={creditorName} onChange={(e) => setCreditorName(e.target.value)} placeholder="Creditor/Furnisher name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <textarea value={whatIsWrong} onChange={(e) => setWhatIsWrong(e.target.value)} rows={3}
                placeholder="What is inaccurate? (e.g. 'Shows 90 days late for April 2025 but account was in forbearance')"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              <textarea value={whatShouldShow} onChange={(e) => setWhatShouldShow(e.target.value)} rows={2}
                placeholder="What should it show instead? (e.g. 'Current/Paid as agreed — forbearance covered this period')"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              {(disputeType === 'second_dispute' || disputeType === 'method_of_verification' || disputeType === 'reinsertion_dispute') && (
                <input type="date" value={priorDisputeDate} onChange={(e) => setPriorDisputeDate(e.target.value)}
                  placeholder="Prior dispute date"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
              <textarea value={additionalDetails} onChange={(e) => setAdditionalDetails(e.target.value)} rows={3}
                placeholder="Additional details, context, or specific instructions for the letter..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-2">SUPPORTING DOCUMENTS</div>
            <div onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 transition">
              <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
              <div className="text-xs text-slate-600">{uploading ? 'Uploading...' : 'Click to upload credit reports, prior dispute letters, etc.'}</div>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.png,.jpg" onChange={(e) => handleFiles(e.target.files)} className="hidden" />
            </div>
            {uploadedDocs.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1.5">
                  Attached to Dispute ({uploadedDocs.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {uploadedDocs.map((d, i) => (
                    <span key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs ${
                      d.fromClient ? 'bg-blue-50 border border-blue-200 text-blue-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      <FileText className="w-3 h-3" />
                      <span className="max-w-[150px] truncate">{d.name}</span>
                      {d.fromClient && <span className="text-[9px] text-blue-500">client file</span>}
                      <button onClick={() => setUploadedDocs(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Generate */}
          <button onClick={handleGenerate} disabled={!disputeType || !clientName || outputState === 'running'}
            className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl transition disabled:opacity-60"
            style={{ background: outputState === 'running' ? '#1e5ea8' : '#2563eb' }}>
            {outputState === 'running' ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating dispute letter...</>
              : <><Mail className="w-5 h-5" /> Generate Dispute Letter</>}
          </button>
        </div>

        {/* RIGHT — Output */}
        <div className="lg:sticky lg:top-4 lg:h-fit">
          {outputState === 'idle' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-center py-16 text-slate-400">
              <Mail className="w-10 h-10 mx-auto mb-3" />
              <div className="text-sm font-medium text-slate-600">Your dispute letter will appear here</div>
              <div className="text-xs text-slate-400 mt-1">Select a dispute type and fill in the details</div>
            </div>
          )}

          {outputState === 'running' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
              <div className="text-sm font-medium text-slate-900">Generating your dispute letter...</div>
              <div className="text-xs text-slate-500 mt-1">This usually takes 10-15 seconds</div>
            </div>
          )}

          {outputState === 'error' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2"><AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleGenerate} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Retry</button>
                <button onClick={handleReset} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm">Start Over</button>
              </div>
            </div>
          )}

          {outputState === 'complete' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-blue-700">Letter Ready (v{letterVersion})</span>
                  </div>
                  <button onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                    <Download className="w-3.5 h-3.5" /> Download .docx
                  </button>
                </div>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 max-h-[500px] overflow-y-auto mb-4">
                  <pre className="text-xs text-slate-800 whitespace-pre-wrap font-serif leading-relaxed">{letterText}</pre>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCopy} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs hover:bg-slate-50">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                  <button onClick={handleReset} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs hover:bg-slate-50">
                    <RefreshCw className="w-3.5 h-3.5" /> New Letter
                  </button>
                </div>
              </div>

              {/* Revision */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900 mb-2">Edit Letter</div>
                <div className="flex items-end gap-2">
                  <textarea value={revisionInput} onChange={(e) => setRevisionInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRevision(); }}}
                    placeholder="Tell the drafter what to change..." rows={2} disabled={revising}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60" />
                  <button onClick={handleRevision} disabled={!revisionInput.trim() || revising}
                    className="shrink-0 bg-blue-600 text-white p-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {revising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
