import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  FileText, Send, Download, Copy, Plus, X, Upload, Trash2,
  Loader2, CheckCircle2, AlertCircle, Mail, User, ChevronDown,
  ChevronRight, RefreshCw, Eye, Shield, FileUp, MessageSquare,
} from 'lucide-react';
import {
  startDraft, getDraftStatus, getDraftResult, downloadDraftDocx, reviseDraft,
  analyzeCreditReport, analyzeCreditReportPDF, streamDisputeChat,
  getDisputeSessions, getDisputeSession, createDisputeSession,
  updateDisputeSession, deleteDisputeSession,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { extractTextFromPDF } from '../../lib/disputer/pdfExtractor';
import { generateConsumerStatement, regenerateStatement } from '../../lib/disputer/consumerStatementGenerator';
import { analyzeAccount } from '../../lib/disputer/negativeAttributeAnalyzer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUREAUS = [
  { id: 'experian', label: 'Experian', address: 'P.O. Box 4500, Allen, TX 75013' },
  { id: 'equifax', label: 'Equifax', address: 'Equifax Information Services LLC, P.O. Box 740256, Atlanta, GA 30374' },
  { id: 'transunion', label: 'TransUnion', address: 'TransUnion Consumer Solutions, P.O. Box 2000, Chester, PA 19016' },
  { id: 'other', label: 'Other', address: '' },
];

const DISPUTE_TYPES = [
  { value: 'charge-off', label: 'Charge-Off' },
  { value: 'collection', label: 'Collection' },
  { value: 'late', label: 'Late Payment' },
  { value: 'duplicate', label: 'Duplicate Account' },
  { value: 'outdated', label: 'Outdated Information' },
  { value: 'unknown', label: 'Unknown Account' },
  { value: 'identity', label: 'Identity Theft' },
  { value: 'inquiry', label: 'Unauthorized Inquiry' },
  { value: 'bankruptcy', label: 'Bankruptcy Related' },
  { value: 'balance', label: 'Incorrect Balance' },
  { value: 'custom', label: 'Custom' },
];

const ACCOUNT_CATEGORIES = [
  { value: 'public-record', label: 'Public Records' },
  { value: 'adverse-account', label: 'Adverse Accounts' },
  { value: 'collection', label: 'Collections' },
];

// ---------------------------------------------------------------------------
// Session-storage persistence so state survives navigation
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'disputer_state';

function loadSaved() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function usePersisted(key, fallback) {
  const saved = loadSaved();
  return useState(saved?.[key] !== undefined ? saved[key] : fallback);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DisputeLetters() {
  const [step, setStep] = usePersisted('step', 1);

  // Step 1 — Personal Info
  const [userInfo, setUserInfo] = usePersisted('userInfo', {
    name: '', dob: '', address: '', cityStateZip: '', ssnLast4: '',
  });

  // Step 2 — Accounts
  const [accounts, setAccounts] = usePersisted('accounts', []);
  const [activeTab, setActiveTab] = usePersisted('activeTab', 'experian');

  // Step 3 — Letters
  const [letters, setLetters] = usePersisted('letters', {});
  const [generatingLetters, setGeneratingLetters] = useState(false);
  const [activeLetterTab, setActiveLetterTab] = usePersisted('activeLetterTab', 'experian');

  // Client selection
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = usePersisted('selectedClientId', '');
  const [selectedClient, setSelectedClient] = usePersisted('selectedClient', null);
  const [clientMode, setClientMode] = usePersisted('clientMode', '');
  const [loadingClients, setLoadingClients] = useState(false);

  // Database persistence
  const [currentSessionId, setCurrentSessionId] = usePersisted('currentSessionId', null);
  const [savedSessions, setSavedSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [showSavedPanel, setShowSavedPanel] = useState(false);

  // Load saved sessions on mount
  useEffect(() => {
    loadSavedSessions();
  }, []);

  async function loadSavedSessions() {
    setLoadingSessions(true);
    try {
      const data = await getDisputeSessions();
      setSavedSessions(data || []);
    } catch (err) { console.error('Failed to load dispute sessions:', err); }
    finally { setLoadingSessions(false); }
  }

  async function saveSession() {
    if (!userInfo.name) return;
    setSaving(true);
    try {
      const payload = {
        client_name: userInfo.name,
        client_dob: userInfo.dob,
        client_address: userInfo.address,
        client_city_state_zip: userInfo.cityStateZip,
        client_ssn_last4: userInfo.ssnLast4,
        client_id: selectedClientId || null,
        accounts,
        letters,
        status: Object.keys(letters).length > 0 ? 'letters_generated' : 'draft',
      };

      let result;
      if (currentSessionId) {
        result = await updateDisputeSession(currentSessionId, payload);
      } else {
        result = await createDisputeSession(payload);
        setCurrentSessionId(result.id);
      }
      setLastSaved(new Date());
      loadSavedSessions();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  async function loadSession(sessionId) {
    try {
      const data = await getDisputeSession(sessionId);
      setCurrentSessionId(data.id);
      setUserInfo({
        name: data.client_name || '',
        dob: data.client_dob || '',
        address: data.client_address || '',
        cityStateZip: data.client_city_state_zip || '',
        ssnLast4: data.client_ssn_last4 || '',
      });
      setAccounts(data.accounts || []);
      setLetters(data.letters || {});
      setSelectedClientId(data.client_id || '');
      setClientMode(data.client_id ? 'existing' : (data.client_name ? 'new' : ''));
      setStep(data.accounts?.length > 0 ? (Object.keys(data.letters || {}).length > 0 ? 3 : 2) : 1);
      setShowSavedPanel(false);
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }

  async function deleteSavedSession(sessionId) {
    if (!confirm('Delete this dispute session?')) return;
    try {
      await deleteDisputeSession(sessionId);
      if (currentSessionId === sessionId) setCurrentSessionId(null);
      loadSavedSessions();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  function startNewSession() {
    setCurrentSessionId(null);
    setAccounts([]);
    setLetters({});
    setStep(1);
    setClientMode('');
    setSelectedClient(null);
    setSelectedClientId('');
    setUserInfo({ name: '', dob: '', address: '', cityStateZip: '', ssnLast4: '' });
    setLastSaved(null);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // Persist key state to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        step, userInfo, accounts, activeTab, letters, activeLetterTab,
        selectedClientId, selectedClient, clientMode, currentSessionId,
      }));
    } catch {}
  }, [step, userInfo, accounts, activeTab, letters, activeLetterTab, selectedClientId, selectedClient, clientMode, currentSessionId]);

  async function loadClients() {
    setLoadingClients(true);
    try {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('full_name');
      setClients(data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingClients(false); }
  }

  function selectClient(clientId) {
    setSelectedClientId(clientId);
    const client = clients.find(c => c.id === clientId);
    setSelectedClient(client);
    if (client) {
      setUserInfo(prev => ({
        ...prev,
        name: client.full_name || '',
        address: client.address || '',
        cityStateZip: [client.county, client.state].filter(Boolean).join(', '),
      }));
    }
  }

  // Account management
  // PDF upload and parsing — per-bureau so you can upload multiple simultaneously
  const [parsingBureaus, setParsingBureaus] = useState({});
  const [parseError, setParseError] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(null);
  const [pasteText, setPasteText] = useState('');

  function isBureauParsing(bureau) {
    return parsingBureaus[bureau] || false;
  }

  async function handlePDFUpload(file, bureau) {
    setParsingBureaus(prev => ({ ...prev, [bureau]: true }));
    setParseError(null);
    try {
      // Try server-side PDF extraction first (most reliable for annual credit reports)
      let result;
      try {
        result = await analyzeCreditReportPDF(file, bureau);
      } catch (serverErr) {
        // Fallback to client-side extraction
        console.log('Server-side PDF extraction failed, trying client-side:', serverErr.message);
        const { text, isScanned } = await extractTextFromPDF(file);
        if (isScanned) {
          setParseError(`${bureau}: This PDF appears to be a scan. Try pasting the text manually.`);
          setParsingBureaus(prev => ({ ...prev, [bureau]: false }));
          return;
        }
        if (!text || text.length < 50) {
          setParseError(`${bureau}: Could not extract text. Try pasting the text manually.`);
          setParsingBureaus(prev => ({ ...prev, [bureau]: false }));
          return;
        }
        result = await analyzeCreditReport(text, bureau);
      }
      if (result.accounts && result.accounts.length > 0) {
        const newAccounts = result.accounts.map((a, i) => ({
          ...a,
          id: a.id || `ai-${Date.now()}-${i}`,
          bureau: a.bureau || bureau,
          customFindings: a.customFindings || [],
          includeConsumerStatement: a.includeConsumerStatement || false,
          negativeFindings: a.negativeFindings || [],
        }));
        setAccounts(prev => [...prev, ...newAccounts]);
        setParseError(null);
      } else {
        setParseError('No negative accounts found. Try adding accounts manually.');
      }
    } catch (err) {
      setParseError(`${bureau}: Analysis failed: ${err.message}`);
    } finally {
      setParsingBureaus(prev => ({ ...prev, [bureau]: false }));
    }
  }

  async function handlePasteSubmit(bureau) {
    if (!pasteText.trim()) return;
    setParsingBureaus(prev => ({ ...prev, [bureau]: true }));
    setParseError(null);
    try {
      const result = await analyzeCreditReport(pasteText, bureau);
      if (result.accounts && result.accounts.length > 0) {
        const newAccounts = result.accounts.map((a, i) => ({
          ...a,
          id: a.id || `paste-${Date.now()}-${i}`,
          bureau: a.bureau || bureau,
          customFindings: a.customFindings || [],
          includeConsumerStatement: false,
          negativeFindings: a.negativeFindings || [],
        }));
        setAccounts(prev => [...prev, ...newAccounts]);
      } else {
        setParseError('No negative accounts found in pasted text. Try adding manually.');
      }
    } catch (err) {
      setParseError(`${bureau}: Analysis failed: ${err.message}`);
    } finally {
      setParsingBureaus(prev => ({ ...prev, [bureau]: false }));
      setShowPasteModal(null);
      setPasteText('');
    }
  }

  function addAccount(bureau) {
    setAccounts(prev => [...prev, {
      id: `acc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      bureau,
      category: 'adverse-account',
      creditor: '',
      accountNumber: '',
      balance: '',
      pastDue: '',
      highBalance: '',
      creditLimit: '',
      dateOpened: '',
      dateClosed: '',
      dateUpdated: '',
      lastPaymentMade: '',
      payStatus: '',
      originalCreditor: '',
      remarks: '',
      disputeType: 'charge-off',
      negativeFindings: [],
      customFindings: [],
      includeConsumerStatement: false,
    }]);
  }

  function updateAccount(id, field, value) {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  }

  function deleteAccount(id) {
    setAccounts(prev => prev.filter(a => a.id !== id));
  }

  function addCustomFinding(id, finding) {
    setAccounts(prev => prev.map(a =>
      a.id === id ? { ...a, customFindings: [...a.customFindings, finding] } : a
    ));
  }

  function removeCustomFinding(id, idx) {
    setAccounts(prev => prev.map(a =>
      a.id === id ? { ...a, customFindings: a.customFindings.filter((_, i) => i !== idx) } : a
    ));
  }

  // Re-analyze an account's negative findings
  function reanalyzeAccount(id) {
    setAccounts(prev => prev.map(a => {
      if (a.id !== id) return a;
      return { ...a, negativeFindings: analyzeAccount(a) };
    }));
  }

  // Regenerate consumer statement for an account
  function regenerateStatementForAccount(id) {
    setAccounts(prev => prev.map(a => {
      if (a.id !== id) return a;
      const stmt = regenerateStatement(a);
      return { ...a, consumerStatement: stmt, consumerStatementSeed: Date.now().toString() };
    }));
  }

  // Regenerate all consumer statements
  function regenerateAllStatements() {
    setAccounts(prev => prev.map(a => {
      if (!a.includeConsumerStatement) return a;
      const stmt = regenerateStatement(a);
      return { ...a, consumerStatement: stmt, consumerStatementSeed: Date.now().toString() };
    }));
  }

  // Mailing modal state
  const [showMailingModal, setShowMailingModal] = useState(null); // bureau id

  // Letter generation via AI
  async function generateLetters() {
    setGeneratingLetters(true);
    const newLetters = {};

    for (const bureau of BUREAUS) {
      const bureauAccounts = accounts.filter(a => a.bureau === bureau.id);
      if (bureauAccounts.length === 0) continue;

      const accountDetails = bureauAccounts.map((a, i) => {
        const findings = [
          ...(a.negativeFindings || []).filter(f => f.selected !== false).map(f => f.description || f),
          ...(a.customFindings || []),
        ];
        return `Account ${i + 1}:
Creditor: ${a.creditor}
Account Number: ${a.accountNumber}
Balance: ${a.balance || 'N/A'}
Past Due: ${a.pastDue || 'N/A'}
Pay Status: ${a.payStatus || 'N/A'}
Date Opened: ${a.dateOpened || 'N/A'}
Date Closed: ${a.dateClosed || 'N/A'}
Original Creditor: ${a.originalCreditor || 'N/A'}
Category: ${a.category}
Dispute Type: ${a.disputeType}
Negative Findings:
${findings.length > 0 ? findings.map(f => `  - ${f}`).join('\n') : '  - None specified'}
Include Consumer Statement: ${a.includeConsumerStatement ? 'YES' : 'NO'}`;
      }).join('\n\n');

      const caseFacts = `DISPUTE TYPE: Credit Report Dispute Letter
SEND TO: ${bureau.label}
RECIPIENT ADDRESS: ${bureau.address}

CLIENT: ${userInfo.name}
CLIENT ADDRESS: ${userInfo.address}, ${userInfo.cityStateZip}
SSN LAST 4: ${userInfo.ssnLast4}
DOB: ${userInfo.dob}

NUMBER OF DISPUTED ACCOUNTS: ${bureauAccounts.length}

${accountDetails}

Generate a complete FCRA dispute letter with:
PART ONE: Dispute of each account listed above with specific inaccuracies
PART TWO: Consumer statements for accounts marked with Include Consumer Statement: YES (write unique ~100 word statements for each)`;

      try {
        const { session_id } = await startDraft({
          plaintiff_name: userInfo.name,
          plaintiff_county: '',
          defendants: [{ name: bureau.label, entity_type: 'CRA' }],
          case_facts: caseFacts,
          damages_description: '',
          jury_demand: false,
          mode: 'fast',
          document_type: 'dispute_letter',
        });

        // Poll for completion
        let complete = false;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const status = await getDraftStatus(session_id);
          if (status.overall_status === 'complete') {
            const result = await getDraftResult(session_id);
            newLetters[bureau.id] = {
              text: result.complaint_text,
              sessionId: session_id,
              version: result.version || 1,
            };
            complete = true;
            break;
          } else if (status.overall_status === 'error') {
            newLetters[bureau.id] = { text: `Error generating letter: ${status.pipeline_error || 'Unknown error'}`, error: true };
            complete = true;
            break;
          }
        }
        if (!complete) {
          newLetters[bureau.id] = { text: 'Letter generation timed out. Please try again.', error: true };
        }
      } catch (err) {
        newLetters[bureau.id] = { text: `Error: ${err.message}`, error: true };
      }
    }

    setLetters(newLetters);
    setGeneratingLetters(false);
    setStep(3);
    setActiveLetterTab(Object.keys(newLetters)[0] || 'experian');

    // Auto-save after generating letters
    if (userInfo.name) {
      try {
        const payload = {
          client_name: userInfo.name,
          client_dob: userInfo.dob,
          client_address: userInfo.address,
          client_city_state_zip: userInfo.cityStateZip,
          client_ssn_last4: userInfo.ssnLast4,
          client_id: selectedClientId || null,
          accounts,
          letters: newLetters,
          status: 'letters_generated',
        };
        let result;
        if (currentSessionId) {
          result = await updateDisputeSession(currentSessionId, payload);
        } else {
          result = await createDisputeSession(payload);
          setCurrentSessionId(result.id);
        }
        setLastSaved(new Date());
        loadSavedSessions();
      } catch (err) { console.error('Auto-save failed:', err); }
    }
  }

  async function copyLetter(bureau) {
    const letter = letters[bureau];
    if (letter?.text) {
      try { await navigator.clipboard.writeText(letter.text); } catch {}
    }
  }

  function downloadLetter(bureau) {
    const letter = letters[bureau];
    if (!letter?.text) return;
    const date = new Date().toISOString().split('T')[0];
    const blob = new Blob([letter.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dispute-letter-${bureau}-${date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const bureauCounts = BUREAUS.reduce((acc, b) => {
    acc[b.id] = accounts.filter(a => a.bureau === b.id).length;
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Credit Report Disputer</h1>
          <p className="text-sm text-slate-500 mt-1">
            {currentSessionId ? (
              <span>Editing: <strong>{userInfo.name || 'Untitled'}</strong>
                {lastSaved && <span className="text-emerald-600 ml-2">· Saved {lastSaved.toLocaleTimeString()}</span>}
              </span>
            ) : 'Analyze credit reports and generate FCRA-compliant dispute letters'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSavedPanel(!showSavedPanel)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <FileText className="w-4 h-4" /> Saved ({savedSessions.length})
          </button>
          <button onClick={saveSession} disabled={saving || !userInfo.name}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {currentSessionId ? 'Save' : 'Save New'}
          </button>
          {currentSessionId && (
            <button onClick={startNewSession}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              <Plus className="w-4 h-4" /> New
            </button>
          )}
        </div>
      </div>

      {/* Saved Sessions Panel */}
      {showSavedPanel && (
        <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">Saved Disputes</h3>
            <button onClick={() => setShowSavedPanel(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          {loadingSessions ? (
            <div className="p-6 text-center text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading...</div>
          ) : savedSessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">No saved disputes yet. Click "Save New" to save your current work.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {savedSessions.map(s => (
                <div key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-blue-50/50 cursor-pointer transition ${
                    currentSessionId === s.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                  }`}
                  onClick={() => loadSession(s.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{s.client_name}</div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                      <span>{s.account_count} account{s.account_count !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                        s.status === 'letters_generated' ? 'bg-emerald-100 text-emerald-700' :
                        s.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {s.status === 'letters_generated' ? 'Letters Ready' :
                         s.status === 'sent' ? 'Sent' : 'Draft'}
                      </span>
                      <span>·</span>
                      <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                      {s.bureau_counts && Object.entries(s.bureau_counts).map(([b, c]) => (
                        <span key={b} className="px-1 bg-slate-100 rounded text-[9px]">{b}: {c}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteSavedSession(s.id); }}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <Shield className="w-4 h-4 inline mr-1" />
        This tool helps generate FCRA dispute letters based on inaccuracies you identify. Results are not guaranteed.
        Disputes must be sent and signed by the consumer. Review every detail before mailing.
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { n: 1, label: 'Client Info' },
          { n: 2, label: 'Disputed Accounts' },
          { n: 3, label: 'Letters' },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <button
              onClick={() => s.n <= step && setStep(s.n)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                step === s.n ? 'bg-blue-600 text-white' :
                s.n < step ? 'bg-blue-100 text-blue-700 cursor-pointer' :
                'bg-slate-100 text-slate-400'
              }`}
            >
              {s.n < step ? <CheckCircle2 className="w-4 h-4" /> : <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs">{s.n}</span>}
              {s.label}
            </button>
            {i < 2 && <ChevronRight className="w-4 h-4 text-slate-300" />}
          </React.Fragment>
        ))}
      </div>

      {/* ═══════════ STEP 1 — Personal Info ═══════════ */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">Client Information</h2>

          {/* Client mode selector */}
          {!clientMode && (
            <div className="flex gap-3">
              <button onClick={() => { setClientMode('existing'); loadClients(); }}
                className="flex-1 flex items-center gap-3 rounded-lg border-2 border-slate-200 p-4 hover:border-blue-400 hover:bg-blue-50 transition">
                <User className="w-6 h-6 text-blue-600" />
                <div><div className="text-sm font-semibold">Existing Client</div><div className="text-[10px] text-slate-500">Pick from your list</div></div>
              </button>
              <button onClick={() => setClientMode('new')}
                className="flex-1 flex items-center gap-3 rounded-lg border-2 border-slate-200 p-4 hover:border-emerald-400 hover:bg-emerald-50 transition">
                <Plus className="w-6 h-6 text-emerald-600" />
                <div><div className="text-sm font-semibold">New Client</div><div className="text-[10px] text-slate-500">Enter manually</div></div>
              </button>
            </div>
          )}

          {clientMode === 'existing' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-700">Select Client</label>
                <button onClick={() => { setClientMode(''); setSelectedClient(null); }} className="text-xs text-slate-400">Change</button>
              </div>
              {loadingClients ? (
                <div className="py-4 text-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading...</div>
              ) : (
                <select value={selectedClientId} onChange={(e) => selectClient(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>)}
                </select>
              )}
            </div>
          )}

          {(clientMode === 'new' || selectedClient) && (
            <>
              {clientMode === 'new' && (
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Client Details</label>
                  <button onClick={() => setClientMode('')} className="text-xs text-slate-400">Change</button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
                  <input value={userInfo.name} onChange={(e) => setUserInfo(p => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                  <input type="date" value={userInfo.dob} onChange={(e) => setUserInfo(p => ({ ...p, dob: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                  <input value={userInfo.address} onChange={(e) => setUserInfo(p => ({ ...p, address: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">City, State, ZIP</label>
                  <input value={userInfo.cityStateZip} onChange={(e) => setUserInfo(p => ({ ...p, cityStateZip: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SSN Last 4</label>
                  <input value={userInfo.ssnLast4} onChange={(e) => setUserInfo(p => ({ ...p, ssnLast4: e.target.value }))} maxLength={4}
                    placeholder="XXXX"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button onClick={() => setStep(2)} disabled={!userInfo.name}
                className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                Next: Add Disputed Accounts →
              </button>
            </>
          )}
        </div>
      )}

      {/* ═══════════ STEP 2 — Accounts ═══════════ */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Bureau tabs */}
          <div className="flex gap-2 overflow-x-auto">
            {BUREAUS.map(b => (
              <button key={b.id} onClick={() => setActiveTab(b.id)}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === b.id ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {b.label} {bureauCounts[b.id] > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{bureauCounts[b.id]}</span>}
              </button>
            ))}
          </div>

          {/* Upload zone */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && file.type === 'application/pdf') handlePDFUpload(file, activeTab);
                }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf';
                  input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) handlePDFUpload(file, activeTab);
                  };
                  input.click();
                }}
                className="flex-1 border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition"
              >
                {isBureauParsing(activeTab) ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                    <Loader2 className="w-4 h-4 animate-spin" /> Analyzing {BUREAUS.find(b => b.id === activeTab)?.label} report with AI...
                  </div>
                ) : (
                  <>
                    <FileUp className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs text-slate-600 font-medium">Drop PDF or click to upload</div>
                    <div className="text-[10px] text-slate-400">AI analyzes the report and extracts all negative accounts automatically</div>
                  </>
                )}
              </div>
              <button onClick={() => { setShowPasteModal(activeTab); setPasteText(''); }}
                className="shrink-0 px-3 py-4 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition">
                <FileText className="w-4 h-4 mx-auto mb-1" />
                Paste Text
              </button>
            </div>
            {parseError && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {parseError}
              </div>
            )}
          </div>

          {/* Paste text modal */}
          {showPasteModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900">Paste Credit Report Text</h2>
                  <button onClick={() => setShowPasteModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 flex-1 overflow-y-auto">
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                    rows={15} placeholder="Paste the credit report text here. The parser will automatically detect accounts and extract their details..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                </div>
                <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
                  <button onClick={() => setShowPasteModal(null)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
                  <button onClick={() => handlePasteSubmit(showPasteModal)} disabled={!pasteText.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    Parse & Import Accounts
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add account button */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              {BUREAUS.find(b => b.id === activeTab)?.label} — {bureauCounts[activeTab]} account{bureauCounts[activeTab] !== 1 ? 's' : ''}
            </h3>
            <button onClick={() => addAccount(activeTab)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
              <Plus className="w-3.5 h-3.5" /> Add Manually
            </button>
          </div>

          {/* Account cards grouped by category */}
          {ACCOUNT_CATEGORIES.map(cat => {
            const catAccounts = accounts.filter(a => a.bureau === activeTab && a.category === cat.value);
            if (catAccounts.length === 0) return null;
            return (
              <div key={cat.value}>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{cat.label} ({catAccounts.length})</div>
                <div className="space-y-3">
                  {catAccounts.map(account => (
                    <AccountCard key={account.id} account={account}
                      onUpdate={(field, val) => updateAccount(account.id, field, val)}
                      onDelete={() => deleteAccount(account.id)}
                      onAddFinding={(f) => addCustomFinding(account.id, f)}
                      onRemoveFinding={(i) => removeCustomFinding(account.id, i)}
                      onReanalyze={() => reanalyzeAccount(account.id)}
                      onRegenerateStatement={() => regenerateStatementForAccount(account.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {accounts.filter(a => a.bureau === activeTab).length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No accounts added for {BUREAUS.find(b => b.id === activeTab)?.label}</p>
              <button onClick={() => addAccount(activeTab)}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">+ Add an account</button>
            </div>
          )}

          {/* Generate button */}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-5 py-3 text-sm text-slate-600 hover:text-slate-800">← Back</button>
            <button onClick={generateLetters} disabled={accounts.length === 0 || generatingLetters}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
              {generatingLetters ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating letters...</> : <><Mail className="w-4 h-4" /> Generate Dispute Letters</>}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ STEP 3 — Letters ═══════════ */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="flex gap-2 overflow-x-auto">
            {BUREAUS.filter(b => letters[b.id]).map(b => (
              <button key={b.id} onClick={() => setActiveLetterTab(b.id)}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeLetterTab === b.id ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {b.label}
              </button>
            ))}
          </div>

          {letters[activeLetterTab] && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-700">
                    {BUREAUS.find(b => b.id === activeLetterTab)?.label} Letter
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => copyLetter(activeLetterTab)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                  <button onClick={() => downloadLetter(activeLetterTab)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50">
                    <Download className="w-3.5 h-3.5" /> .txt
                  </button>
                  {letters[activeLetterTab]?.sessionId && (
                    <DownloadDocxBtn sessionId={letters[activeLetterTab].sessionId} version={letters[activeLetterTab].version} />
                  )}
                  <button onClick={() => setShowMailingModal(activeLetterTab)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50">
                    <Mail className="w-3.5 h-3.5" /> Mailing Info
                  </button>
                  <button onClick={regenerateAllStatements}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50">
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate Statements
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 max-h-[600px] overflow-y-auto mb-4">
                <pre className="text-xs text-slate-800 whitespace-pre-wrap font-serif leading-relaxed">
                  {letters[activeLetterTab].text}
                </pre>
              </div>

              {/* UI-only disclaimer (not part of the mailed letter) */}
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-xs text-amber-800">
                <Shield className="w-3.5 h-3.5 inline mr-1" />
                Review every detail before mailing. Send certified mail with return receipt.
                Bureaus have 30 days to respond under FCRA § 1681i. Keep copies of everything.
              </div>
            </div>
          )}

          {/* Dispute Chat */}
          {letters[activeLetterTab] && !letters[activeLetterTab].error && (
            <DisputeChat
              letterText={letters[activeLetterTab]?.text || ''}
              accounts={accounts.filter(a => a.bureau === activeLetterTab)}
              onLetterUpdate={(newText) => {
                setLetters(prev => ({
                  ...prev,
                  [activeLetterTab]: { ...prev[activeLetterTab], text: newText },
                }));
              }}
            />
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-5 py-3 text-sm text-slate-600">← Back to Accounts</button>
            <button onClick={startNewSession}
              className="px-5 py-3 border border-slate-300 text-sm text-slate-600 rounded-lg hover:bg-slate-50">
              <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Reset All
            </button>
          </div>
        </div>
      )}
      {/* Mailing Address Modal */}
      {showMailingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Mailing Instructions</h2>
              <button onClick={() => setShowMailingModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-xs font-bold uppercase text-blue-700 mb-2">Mail To:</div>
                <div className="text-sm text-slate-900 font-medium">{BUREAUS.find(b => b.id === showMailingModal)?.label}</div>
                <div className="text-sm text-slate-700 mt-1">{BUREAUS.find(b => b.id === showMailingModal)?.address || 'Enter address manually'}</div>
              </div>
              <div className="space-y-2 text-sm text-slate-700">
                <h3 className="font-semibold text-slate-900">Certified Mail Checklist:</h3>
                {['Print and sign the letter', 'Make a photocopy for records', 'Include copies of supporting documents (NOT originals)', 'Include copy of government-issued ID', 'Include copy of proof of address (utility bill)', 'Send via CERTIFIED MAIL with Return Receipt Requested', 'Save the receipt and tracking number', 'Bureau has 30 days from receipt to respond (§ 1681i)'].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center shrink-0">{i+1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-slate-200">
              <button onClick={() => setShowMailingModal(null)} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Got It</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Dispute Chat — streaming AI assistant for letter revisions
// ---------------------------------------------------------------------------

function DisputeChat({ letterText, accounts, onLetterUpdate }) {
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  async function handleChatSend() {
    if (!chatInput.trim() || chatSending) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatSending(true);

    const newMessages = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(newMessages);

    // Add streaming placeholder
    const streamId = `stream-${Date.now()}`;
    setChatMessages(prev => [...prev, { role: 'assistant', content: '', _streamId: streamId }]);

    try {
      const accountsContext = accounts.map((a, i) =>
        `${i + 1}. ${a.creditor} (${a.accountNumber}) — ${a.disputeType} — Balance: ${a.balance || 'N/A'} — Status: ${a.payStatus || 'N/A'}`
      ).join('\n');

      const fullText = await streamDisputeChat(
        userMsg,
        letterText,
        accountsContext,
        chatMessages.slice(-10),
        (partial) => {
          setChatMessages(prev =>
            prev.map(m => m._streamId === streamId ? { ...m, content: partial } : m)
          );
        }
      );

      // Finalize
      setChatMessages(prev =>
        prev.map(m => m._streamId === streamId ? { ...m, _streamId: undefined } : m)
      );

      // If the response contains a revised letter, update the letter
      if (fullText.includes('REVISED LETTER:')) {
        const revised = fullText.split('REVISED LETTER:')[1].trim();
        if (revised.length > 200) {
          onLetterUpdate(revised);
        }
      }

    } catch (err) {
      setChatMessages(prev =>
        prev.map(m => m._streamId === streamId
          ? { ...m, content: `Error: ${err.message}`, _streamId: undefined }
          : m
        )
      );
    } finally {
      setChatSending(false);
      if (inputRef.current) inputRef.current.focus();
    }
  }

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition">
        <MessageSquare className="w-4 h-4" /> Chat with AI — revise, edit, or ask questions about this letter
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium">Dispute Assistant</span>
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">Streaming</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-white/60 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="h-72 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {chatMessages.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-xs">
            <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>Ask me to revise the letter, add accounts, change language, or explain something.</p>
            <div className="flex flex-wrap gap-1.5 justify-center mt-3">
              {['Make it more aggressive', 'Add Metro 2 violation language', 'Rewrite the consumer statement', 'Add a demand for method of verification'].map(s => (
                <button key={s} onClick={() => { setChatInput(s); if (inputRef.current) inputRef.current.focus(); }}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-full text-[10px] text-slate-600 hover:border-blue-300 hover:text-blue-600 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-800'
            }`}>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{msg.content || (msg._streamId ? '...' : '')}</pre>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-slate-200 bg-white">
        <input
          ref={inputRef}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
          placeholder="Tell the AI what to change..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={chatSending}
        />
        <button onClick={handleChatSend} disabled={chatSending || !chatInput.trim()}
          className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
          {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// .docx Download Button
// ---------------------------------------------------------------------------

function DownloadDocxBtn({ sessionId, version }) {
  const [downloading, setDownloading] = useState(false);
  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await downloadDraftDocx(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dispute-letter-v${version || 1}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Download failed:', err); }
    finally { setDownloading(false); }
  }
  return (
    <button onClick={handleDownload} disabled={downloading}
      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
      {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} .docx
    </button>
  );
}

// ---------------------------------------------------------------------------
// Account Card Component
// ---------------------------------------------------------------------------

function AccountCard({ account, onUpdate, onDelete, onAddFinding, onRemoveFinding, onReanalyze, onRegenerateStatement }) {
  const [expanded, setExpanded] = useState(true);
  const [newFinding, setNewFinding] = useState('');

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <ChevronDown className={`w-4 h-4 text-slate-400 transition ${expanded ? '' : '-rotate-90'}`} />
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {account.creditor || 'New Account'}
              {account.accountNumber && <span className="text-slate-400 font-normal ml-2">#{account.accountNumber}</span>}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {DISPUTE_TYPES.find(d => d.value === account.disputeType)?.label} · {account.balance ? `$${account.balance}` : 'No balance'}
            </div>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Core fields */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Creditor Name</label>
              <input value={account.creditor} onChange={(e) => onUpdate('creditor', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="e.g. Capital One" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Account #</label>
              <input value={account.accountNumber} onChange={(e) => onUpdate('accountNumber', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Category</label>
              <select value={account.category} onChange={(e) => onUpdate('category', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                {ACCOUNT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Balance</label>
              <input value={account.balance} onChange={(e) => onUpdate('balance', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="$0" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Past Due</label>
              <input value={account.pastDue} onChange={(e) => onUpdate('pastDue', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="$0" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Pay Status</label>
              <input value={account.payStatus} onChange={(e) => onUpdate('payStatus', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="e.g. Charge-off" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Credit Limit</label>
              <input value={account.creditLimit} onChange={(e) => onUpdate('creditLimit', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">High Balance</label>
              <input value={account.highBalance} onChange={(e) => onUpdate('highBalance', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Original Creditor</label>
              <input value={account.originalCreditor} onChange={(e) => onUpdate('originalCreditor', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Date Opened</label>
              <input value={account.dateOpened} onChange={(e) => onUpdate('dateOpened', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="MM/YYYY" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Date Closed</label>
              <input value={account.dateClosed} onChange={(e) => onUpdate('dateClosed', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="MM/YYYY" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Last Payment</label>
              <input value={account.lastPaymentMade} onChange={(e) => onUpdate('lastPaymentMade', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="MM/YYYY" />
            </div>
          </div>

          {/* Dispute type */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Dispute Type</label>
              <select value={account.disputeType} onChange={(e) => onUpdate('disputeType', e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                {DISPUTE_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 mt-4 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={account.includeConsumerStatement}
                onChange={(e) => onUpdate('includeConsumerStatement', e.target.checked)} />
              Include 100-word statement
            </label>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Remarks / Notes</label>
            <input value={account.remarks} onChange={(e) => onUpdate('remarks', e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="e.g. AID, Account information disputed by consumer" />
          </div>

          {/* Auto-detected negative findings */}
          {account.negativeFindings && account.negativeFindings.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase text-amber-600">
                  Auto-Detected Issues ({account.negativeFindings.filter(f => f.selected !== false).length}/{account.negativeFindings.length} selected)
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    const allSelected = account.negativeFindings.every(f => f.selected !== false);
                    onUpdate('negativeFindings', account.negativeFindings.map(f => ({ ...f, selected: !allSelected })));
                  }} className="text-[10px] text-blue-600 hover:text-blue-700">
                    {account.negativeFindings.every(f => f.selected !== false) ? 'Deselect All' : 'Select All'}
                  </button>
                  {onReanalyze && (
                    <button onClick={onReanalyze} className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Re-analyze
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1 mb-2">
                {account.negativeFindings.map((f, i) => (
                  <label key={i} className={`flex items-start gap-2 rounded p-2 text-xs cursor-pointer transition ${
                    f.selected === false ? 'bg-slate-50 border border-slate-200 text-slate-400 opacity-60' :
                    f.severity === 'high' ? 'bg-red-50 border border-red-200 text-red-800' :
                    f.severity === 'medium' ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                    'bg-slate-50 border border-slate-200 text-slate-700'
                  }`}>
                    <input type="checkbox" checked={f.selected !== false}
                      onChange={() => {
                        const updated = [...account.negativeFindings];
                        updated[i] = { ...updated[i], selected: !(updated[i].selected !== false) };
                        onUpdate('negativeFindings', updated);
                      }}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                      f.selected === false ? 'bg-slate-300' :
                      f.severity === 'high' ? 'bg-red-500' : f.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                    }`} />
                    <span className={`flex-1 ${f.selected === false ? 'line-through' : ''}`}>{f.description}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Custom / manual findings */}
          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
              Additional Dispute Reasons ({account.customFindings.length})
            </label>
            {account.customFindings.length > 0 && (
              <div className="space-y-1 mb-2">
                {account.customFindings.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-800">
                    <span className="flex-1">• {f}</span>
                    <button onClick={() => onRemoveFinding(i)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={newFinding} onChange={(e) => setNewFinding(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newFinding.trim()) { onAddFinding(newFinding.trim()); setNewFinding(''); }}}
                placeholder="Add a specific inaccuracy or finding..."
                className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
              <button onClick={() => { if (newFinding.trim()) { onAddFinding(newFinding.trim()); setNewFinding(''); }}}
                disabled={!newFinding.trim()}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Consumer statement preview */}
          {account.includeConsumerStatement && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase text-purple-600">Consumer Statement Preview</label>
                {onRegenerateStatement && (
                  <button onClick={onRegenerateStatement} className="text-[10px] text-purple-600 hover:text-purple-700 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Regenerate
                  </button>
                )}
              </div>
              <p className="text-xs text-purple-900 leading-relaxed">
                {account.consumerStatement || generateConsumerStatement(account)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
