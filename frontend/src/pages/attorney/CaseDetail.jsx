import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  FileText,
  Download,
  Edit3,
  Save,
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Send,
  MessageSquare,
  StickyNote,
  File,
  ExternalLink,
  Loader2,
  Shield,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Upload,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../App';
import {
  getCase,
  getPipelineStatus,
  approveForProcessing,
  approveComplaint,
  requestRevision,
  denyCase,
  updateCaseStatus,
  getDocuments,
  getMessages,
  sendMessage,
  downloadComplaint,
  downloadMemo,
  getStaffAttorneys,
  assignAttorneyToClient,
  getReferralPartners,
  assignReferral,
  uploadDocument,
  deleteDocument,
} from '../../lib/api';
import AgentPipelineStatus from '../../components/AgentPipelineStatus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  submitted: 'Submitted',
  approved_for_processing: 'Approved for Processing',
  agents_processing: 'Agents Processing',
  draft_ready: 'Draft Ready',
  attorney_review: 'Attorney Review',
  approved: 'Approved',
  filed: 'Filed',
  closed: 'Closed',
  denied: 'Denied',
};

const STATUS_COLORS = {
  submitted: 'bg-blue-100 text-blue-700 border-blue-200',
  approved_for_processing: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  agents_processing: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  draft_ready: 'bg-amber-100 text-amber-700 border-amber-200',
  attorney_review: 'bg-purple-100 text-purple-700 border-purple-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  filed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
  denied: 'bg-red-100 text-red-700 border-red-200',
};

const CASE_TYPE_STYLES = {
  FCRA: 'bg-blue-100 text-blue-700 border-blue-200',
  FDCPA: 'bg-purple-100 text-purple-700 border-purple-200',
  TCPA: 'bg-green-100 text-green-700 border-green-200',
};

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function parseCaseTypes(caseType) {
  if (!caseType) return [];
  if (typeof caseType === 'string') {
    return caseType.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
  }
  if (Array.isArray(caseType)) return caseType.map((t) => t.toUpperCase());
  return [];
}

// ---------------------------------------------------------------------------
// Confirmation Modal
// ---------------------------------------------------------------------------

function ConfirmModal({ title, message, confirmLabel, confirmColor, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              confirmColor === 'red'
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
            }`}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes Modal / Input
// ---------------------------------------------------------------------------

function NotesModal({ title, placeholder, submitLabel, onSubmit, onCancel, loading }) {
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="input mt-3"
        />
        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={() => onSubmit(notes)}
            disabled={loading || !notes.trim()}
            className="btn-primary"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Message Thread
// ---------------------------------------------------------------------------

function PiiSection({ caseId, documents, onRefresh }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  const piiDocs = documents.filter(d =>
    (d.document_category || d.category || '').toLowerCase() === 'pii' ||
    (d.file_name || '').toLowerCase().includes('pii') ||
    (d.file_name || '').toLowerCase().includes('social security') ||
    (d.file_name || '').toLowerCase().includes('drivers license') ||
    (d.file_name || '').toLowerCase().includes("driver's license") ||
    (d.file_name || '').toLowerCase().includes('id card')
  );

  async function handleUpload(files) {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        await uploadDocument(caseId, file, 'pii');
      } catch (err) { console.error('PII upload failed:', err); }
    }
    setUploading(false);
    if (onRefresh) onRefresh();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDelete(doc) {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    try {
      await deleteDocument(caseId, doc.id);
      if (onRefresh) onRefresh();
    } catch (err) { alert('Delete failed: ' + err.message); }
  }

  return (
    <div className="card border-amber-200 bg-amber-50/30">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Shield className="h-5 w-5 text-amber-500" />
        PII (Personally Identifiable Information)
      </h3>
      <p className="text-xs text-slate-500 mt-1">Upload sensitive documents: SSN cards, driver's licenses, ID cards, etc.</p>

      <div className="mt-4 space-y-2">
        {piiDocs.length > 0 ? (
          piiDocs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-white p-3">
              <Shield className="h-4 w-4 shrink-0 text-amber-500" />
              <a href={doc.url || doc.file_url || '#'} target="_blank" rel="noopener noreferrer"
                className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-slate-700">{doc.file_name || 'Document'}</p>
                <p className="text-xs text-slate-400">{formatDate(doc.created_at || doc.uploaded_at)}</p>
              </a>
              <button onClick={() => handleDelete(doc)}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No PII documents uploaded.</p>
        )}
      </div>

      <div className="mt-3">
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-amber-300 rounded-lg text-xs font-medium text-amber-700 bg-white hover:bg-amber-50 disabled:opacity-50">
          <Upload className="w-3.5 h-3.5" />
          {uploading ? 'Uploading...' : 'Upload PII Document'}
        </button>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx" className="hidden"
          onChange={(e) => handleUpload(e.target.files)} />
      </div>
    </div>
  );
}

function MessageThread({ caseId }) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await getMessages(caseId);
      const list = Array.isArray(data) ? data : data?.messages ?? data?.items ?? [];
      setMessages(list);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;
    try {
      setSending(true);
      await sendMessage(caseId, newMessage.trim());
      setNewMessage('');
      await fetchMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <MessageSquare className="h-5 w-5 text-slate-400" />
        Messages
      </h3>
      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No messages yet.</p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === profile?.id || msg.user_id === profile?.id;
            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                    isOwn
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  <p className={`text-xs font-medium ${isOwn ? 'text-primary-200' : 'text-slate-500'}`}>
                    {msg.sender_name || msg.user_name || (isOwn ? 'You' : 'Client')}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{msg.body || msg.content || msg.message}</p>
                  <p className={`mt-1 text-[10px] ${isOwn ? 'text-primary-300' : 'text-slate-400'}`}>
                    {relativeTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSend} className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="btn-primary gap-1.5 px-3"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Case Detail Component
// ---------------------------------------------------------------------------

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [caseData, setCaseData] = useState(null);
  const [pipelineStatuses, setPipelineStatuses] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [approveModal, setApproveModal] = useState(false);
  const [revisionModal, setRevisionModal] = useState(false);
  const [denyModal, setDenyModal] = useState(false);

  // Attorney assignment
  const [staffAttorneys, setStaffAttorneys] = useState([]);
  const [showAssignAttorney, setShowAssignAttorney] = useState(false);
  const [assignedAttorneyId, setAssignedAttorneyId] = useState('');

  // Complaint editing
  const [editingComplaint, setEditingComplaint] = useState(false);

  // Case info editing
  const [editingCase, setEditingCase] = useState(false);
  const [editPlaintiff, setEditPlaintiff] = useState('');
  const [editCourt, setEditCourt] = useState('');
  const [editFacts, setEditFacts] = useState('');
  const [editDamages, setEditDamages] = useState('');
  const [savingCase, setSavingCase] = useState(false);

  // Assign to client
  const [showAssignClient, setShowAssignClient] = useState(false);
  const [clientsList, setClientsList] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [assigningClient, setAssigningClient] = useState(false);
  const [complaintText, setComplaintText] = useState('');

  // Notes
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Referral partner
  const [referralPartners, setReferralPartners] = useState([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [savingPartner, setSavingPartner] = useState(false);

  // Timeline expanded
  const [timelineExpanded, setTimelineExpanded] = useState(true);

  // Fetch case data
  const fetchCase = useCallback(async () => {
    try {
      setError(null);
      const data = await getCase(id);
      setCaseData(data);
      setComplaintText(data.complaint_text || data.complaint_draft || '');
      setNotes(data.attorney_notes || data.notes || []);
      setSelectedPartnerId(data.referral_partner_id || '');
    } catch (err) {
      console.error('Failed to load case:', err);
      setError(err.message || 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Fetch pipeline status
  const fetchPipeline = useCallback(async () => {
    try {
      const data = await getPipelineStatus(id);
      const statuses = Array.isArray(data) ? data : data?.agents ?? data?.statuses ?? [];
      setPipelineStatuses(statuses);
    } catch (err) {
      // Non-critical - may not exist yet
      console.debug('Pipeline status unavailable:', err.message);
    }
  }, [id]);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    try {
      const data = await getDocuments(id);
      const docs = Array.isArray(data) ? data : data?.documents ?? data?.items ?? [];
      setDocuments(docs);
    } catch (err) {
      console.debug('Documents unavailable:', err.message);
    }
  }, [id]);

  useEffect(() => {
    fetchCase();
    fetchPipeline();
    fetchDocuments();
    getStaffAttorneys().then(data => setStaffAttorneys(data || [])).catch(() => {});
    getReferralPartners().then(data => setReferralPartners(data || [])).catch(() => {});
  }, [fetchCase, fetchPipeline, fetchDocuments]);

  // Poll pipeline when agents are processing
  useEffect(() => {
    if (caseData?.status !== 'agents_processing') return;
    const interval = setInterval(async () => {
      await fetchPipeline();
      // Also refresh case to detect status changes
      try {
        const data = await getCase(id);
        setCaseData(data);
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [caseData?.status, id, fetchPipeline]);

  // Actions
  const handleApproveForProcessing = async () => {
    try {
      setActionLoading(true);
      await approveForProcessing(id);
      await fetchCase();
      await fetchPipeline();
    } catch (err) {
      setError(err.message || 'Failed to approve for processing');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveComplaint = async () => {
    try {
      setActionLoading(true);
      await approveComplaint(id);
      setApproveModal(false);
      await fetchCase();
      // Reload to show the new Complaint with Exhibits section
    } catch (err) {
      setError(err.message || 'Failed to approve complaint');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadApprovedComplaint = async () => {
    try {
      const result = await downloadComplaint(id);
      if (result?.url) {
        window.open(result.url, '_blank');
      }
    } catch (err) {
      setError(err.message || 'Failed to download complaint');
    }
  };

  const handleDownloadMemo = async () => {
    try {
      const result = await downloadMemo(id);
      if (result?.url) {
        window.open(result.url, '_blank');
      }
    } catch (err) {
      setError(err.message || 'Failed to download memo');
    }
  };

  const handleStartEditCase = () => {
    setEditPlaintiff(clientName || '');
    setEditCourt(caseData.court || caseData.court_name || '');
    setEditFacts(caseData.case_facts || caseData.facts || '');
    setEditDamages(caseData.damages_description || caseData.damages || '');
    setEditingCase(true);
  };

  const handleSaveCase = async () => {
    try {
      setSavingCase(true);
      const { supabase } = await import('../../lib/supabase');

      // Update the plaintiff name in case_facts header if it exists
      let updatedFacts = editFacts;
      if (updatedFacts.includes('=== PLAINTIFF ===')) {
        updatedFacts = updatedFacts.replace(
          /Name:\s*.*/,
          `Name: ${editPlaintiff}`
        );
      }

      const { error: updateErr } = await supabase
        .from('cases')
        .update({
          court: editCourt,
          case_facts: updatedFacts,
          damages_description: editDamages,
        })
        .eq('id', id);
      if (updateErr) throw updateErr;

      // Also update the client profile name if this is a real client
      if (caseData.client_id && editPlaintiff !== clientName) {
        try {
          await supabase
            .from('profiles')
            .update({ full_name: editPlaintiff })
            .eq('id', caseData.client_id);
        } catch {
          // Non-fatal — profile update is best-effort
        }
      }

      setEditingCase(false);
      await fetchCase();
    } catch (err) {
      setError(err.message || 'Failed to save case');
    } finally {
      setSavingCase(false);
    }
  };

  const handleOpenAssignClient = async () => {
    setShowAssignClient(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'client')
        .order('full_name');
      setClientsList(data || []);
    } catch {
      // Also load attorneys as potential assignees (for draft cases)
      try {
        const { supabase } = await import('../../lib/supabase');
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .order('full_name');
        setClientsList(data || []);
      } catch {
        setClientsList([]);
      }
    }
  };

  const handleAssignClient = async () => {
    if (!selectedClientId) return;
    try {
      setAssigningClient(true);
      const { supabase } = await import('../../lib/supabase');
      const { error: updateErr } = await supabase
        .from('cases')
        .update({ client_id: selectedClientId })
        .eq('id', id);
      if (updateErr) throw updateErr;
      setShowAssignClient(false);
      setSelectedClientId('');
      await fetchCase();
    } catch (err) {
      setError(err.message || 'Failed to assign client');
    } finally {
      setAssigningClient(false);
    }
  };

  const handleRequestRevision = async (revisionNotes) => {
    try {
      setActionLoading(true);
      await requestRevision(id, revisionNotes);
      setRevisionModal(false);
      await fetchCase();
    } catch (err) {
      setError(err.message || 'Failed to request revision');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeny = async (reason) => {
    try {
      setActionLoading(true);
      await denyCase(id, reason);
      setDenyModal(false);
      await fetchCase();
    } catch (err) {
      setError(err.message || 'Failed to deny case');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (type) => {
    try {
      const blob = type === 'complaint' ? await downloadComplaint(id) : await downloadMemo(id);
      if (blob instanceof Blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}_${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(`Failed to download ${type}: ${err.message}`);
    }
  };

  const handleSaveNote = async () => {
    if (!newNote.trim()) return;
    try {
      setSavingNote(true);
      const noteObj = {
        id: Date.now().toString(),
        text: newNote.trim(),
        author: profile?.full_name || 'Attorney',
        created_at: new Date().toISOString(),
      };
      setNotes((prev) => [...prev, noteObj]);
      setNewNote('');
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" />
          <p className="mt-3 text-sm text-slate-500">Loading case details...</p>
        </div>
      </div>
    );
  }

  if (error && !caseData) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Failed to Load Case</h2>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => navigate('/attorney/pipeline')} className="btn-secondary">
            Back to Pipeline
          </button>
          <button onClick={fetchCase} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!caseData) return null;

  const status = caseData.status || 'submitted';
  const clientName = caseData.plaintiff_name || caseData.client_name || 'Unknown Client';
  const defendants = Array.isArray(caseData.defendants)
    ? caseData.defendants
    : caseData.defendant_names
      ? caseData.defendant_names.map((n) => ({ name: n }))
      : caseData.defendant_name
        ? [{ name: caseData.defendant_name }]
        : [];
  const defendantText = defendants.map((d) => (typeof d === 'string' ? d : d.name)).join(', ') || 'Unknown';
  const caseTypes = parseCaseTypes(caseData.case_type);
  const hasComplaint = !!(caseData.complaint_text || caseData.complaint_draft);
  const revisionCount = caseData.revision_count || 0;
  const timeline = caseData.status_history || caseData.timeline || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/attorney/pipeline')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pipeline
      </button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {clientName} v. {defendantText}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`badge border ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
              {STATUS_LABELS[status] || status}
            </span>
            {caseTypes.map((type) => (
              <span
                key={type}
                className={`badge border ${CASE_TYPE_STYLES[type] || 'bg-slate-100 text-slate-600 border-slate-200'}`}
              >
                {type}
              </span>
            ))}
            {revisionCount > 0 && (
              <span
                className={`badge border ${
                  revisionCount >= 3
                    ? 'border-red-200 bg-red-100 text-red-700'
                    : 'border-amber-200 bg-amber-100 text-amber-700'
                }`}
              >
                {revisionCount >= 3 && <AlertTriangle className="mr-1 h-3 w-3" />}
                {revisionCount} revision{revisionCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleOpenAssignClient}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <User className="h-4 w-4" />
            Assign Client
          </button>
          <div className="relative">
              <button
                onClick={() => setShowAssignAttorney(!showAssignAttorney)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <Shield className="h-4 w-4" />
                Assign Attorney
              </button>
              {showAssignAttorney && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg p-3 w-64">
                  <div className="text-xs font-bold text-slate-600 mb-2">Assign Staff Attorney</div>
                  {staffAttorneys.length === 0 && (
                    <p className="text-xs text-slate-500 mb-2">No staff attorneys yet. Invite one from Settings → Attorney Team.</p>
                  )}
                  <select
                    value={assignedAttorneyId}
                    onChange={async (e) => {
                      const attId = e.target.value;
                      setAssignedAttorneyId(attId);
                      if (caseData?.client_id && attId) {
                        try {
                          await assignAttorneyToClient(caseData.client_id, attId);
                          setShowAssignAttorney(false);
                        } catch (err) { console.error(err); }
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {staffAttorneys.map(a => (
                      <option key={a.id} value={a.id}>{a.full_name}{a.bar_number ? ` (#${a.bar_number})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
          </div>
          <button
            onClick={() => navigate('/attorney/draft')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <FileText className="h-4 w-4" />
            Draft Complaint
          </button>
        </div>
      </div>

      {/* Assign Client Modal */}
      {showAssignClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Assign to Client</h2>
              <button onClick={() => setShowAssignClient(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                Link this case to a client's profile so it appears on their dashboard.
              </p>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">— Select a client —</option>
                {clientsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.email})
                  </option>
                ))}
              </select>
              {clientsList.length === 0 && (
                <p className="text-xs text-slate-400">
                  No clients found. Register a client first from the Clients page.
                </p>
              )}
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowAssignClient(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignClient}
                disabled={!selectedClientId || assigningClient}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {assigningClient ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <User className="h-3.5 w-3.5" />}
                {assigningClient ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN (2/3 width) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Case Information */}
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Case Information</h2>
              {!editingCase ? (
                <button
                  onClick={handleStartEditCase}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingCase(false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                  <button
                    onClick={handleSaveCase}
                    disabled={savingCase}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingCase ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Plaintiff</p>
                  {editingCase ? (
                    <input
                      value={editPlaintiff}
                      onChange={(e) => setEditPlaintiff(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-slate-900">{clientName}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Court</p>
                  {editingCase ? (
                    <input
                      value={editCourt}
                      onChange={(e) => setEditCourt(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-slate-900">{caseData.court || caseData.court_name || 'Not assigned'}</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Defendants</p>
                <div className="mt-2 space-y-2">
                  {defendants.length > 0 ? defendants.map((d, i) => {
                    const name = typeof d === 'string' ? d : d.name;
                    const address = typeof d === 'object' ? d.address || d.registered_address : null;
                    return (
                      <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-900">{name}</p>
                        {address && <p className="mt-1 text-xs text-slate-500">{address}</p>}
                      </div>
                    );
                  }) : (
                    <p className="text-sm text-slate-500">No defendants listed</p>
                  )}
                </div>
              </div>

              {/* Referral Partner */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Referral Partner (CRO)</p>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={selectedPartnerId}
                    onChange={async (e) => {
                      const pid = e.target.value;
                      setSelectedPartnerId(pid);
                      setSavingPartner(true);
                      try {
                        await assignReferral({ partner_id: pid, case_id: id });
                        fetchCase();
                      } catch (err) { console.error('Failed to assign partner:', err); }
                      finally { setSavingPartner(false); }
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- No referral partner --</option>
                    {referralPartners.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}{p.company ? ` (${p.company})` : ''}
                      </option>
                    ))}
                  </select>
                  {savingPartner && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                </div>
              </div>

              {caseData.statutes && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Statutes Identified</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {Array.isArray(caseData.statutes)
                      ? caseData.statutes.join(', ')
                      : caseData.statutes}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Case Facts</p>
                {editingCase ? (
                  <textarea
                    value={editFacts}
                    onChange={(e) => setEditFacts(e.target.value)}
                    rows={8}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                  />
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {caseData.case_facts || caseData.facts || 'No facts entered'}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Damages Description</p>
                {editingCase ? (
                  <textarea
                    value={editDamages}
                    onChange={(e) => setEditDamages(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                  />
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {caseData.damages_description || caseData.damages || 'No damages entered'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Agent Pipeline Status */}
          {(status === 'agents_processing' ||
            status === 'approved_for_processing' ||
            status === 'draft_ready' ||
            status === 'attorney_review' ||
            status === 'approved' ||
            status === 'filed') && (
            <AgentPipelineStatus caseId={id} statuses={pipelineStatuses} />
          )}

          {/* Complaint Draft Viewer */}
          {hasComplaint && (
            <div className="card">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Complaint Draft</h2>
                <div className="flex gap-2">
                  {!editingComplaint && (
                    <button
                      onClick={() => setEditingComplaint(true)}
                      className="btn-secondary gap-1.5 text-xs"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                  {editingComplaint && (
                    <>
                      <button
                        onClick={() => {
                          setEditingComplaint(false);
                          setComplaintText(caseData.complaint_text || caseData.complaint_draft || '');
                        }}
                        className="btn-secondary gap-1.5 text-xs"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setEditingComplaint(false);
                          // In a real app, this would save to the API
                        }}
                        className="btn-primary gap-1.5 text-xs"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save Edits
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-4">
                {editingComplaint ? (
                  <textarea
                    value={complaintText}
                    onChange={(e) => setComplaintText(e.target.value)}
                    rows={20}
                    className="input font-mono text-xs leading-relaxed"
                  />
                ) : (
                  <div className="max-h-[600px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-6">
                    <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap font-serif text-sm leading-relaxed">
                      {complaintText}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Complaint with Exhibits — shown after approval */}
          {(status === 'approved' || status === 'filed' || status === 'closed') && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-600" />
                  Complaint with Exhibits
                </h2>
                <span className="badge bg-green-100 text-green-700 border border-green-200">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Approved
                </span>
              </div>

              {/* Download buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <button
                  onClick={handleDownloadApprovedComplaint}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50 transition"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                    <Download className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-slate-900">Complaint.docx</div>
                    <div className="text-xs text-slate-500">Court-ready Word document</div>
                  </div>
                </button>
                <button
                  onClick={handleDownloadMemo}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50 transition"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                    <Download className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-slate-900">Strategy Memo.docx</div>
                    <div className="text-xs text-slate-500">Case strategy document</div>
                  </div>
                </button>
              </div>

              {/* Exhibit list */}
              {documents && documents.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
                    Exhibits
                  </h3>
                  <div className="space-y-2">
                    {documents.map((doc, i) => (
                      <div
                        key={doc.id || i}
                        className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-600">
                          {String.fromCharCode(65 + i)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {doc.file_name || doc.name || 'Document'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(doc.document_category || doc.category || 'other').replace(/_/g, ' ')}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-500 uppercase">
                          Exhibit {String.fromCharCode(65 + i)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Complaint text preview */}
              {complaintText && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900">
                      View complaint text
                    </summary>
                    <div className="mt-3 max-h-[400px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
                      <pre className="text-xs text-slate-800 whitespace-pre-wrap font-serif leading-relaxed">
                        {complaintText}
                      </pre>
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {status === 'submitted' && (
              <button
                onClick={handleApproveForProcessing}
                disabled={actionLoading}
                className="btn-primary gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Approve for Processing
              </button>
            )}

            {(status === 'draft_ready' || status === 'attorney_review') && (
              <button
                onClick={() => setApproveModal(true)}
                disabled={actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                Approve Complaint
              </button>
            )}

            {status === 'draft_ready' && (
              <button
                onClick={() => setRevisionModal(true)}
                disabled={actionLoading}
                className="btn-secondary gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Request Revision
              </button>
            )}

            {!['approved', 'filed', 'closed', 'denied'].includes(status) && (
              <button
                onClick={() => setDenyModal(true)}
                disabled={actionLoading}
                className="btn-danger gap-2"
              >
                <XCircle className="h-4 w-4" />
                Deny Case
              </button>
            )}

            {hasComplaint && (
              <>
                <button
                  onClick={() => handleDownload('complaint')}
                  className="btn-secondary gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download Complaint
                </button>
                <button
                  onClick={() => handleDownload('memo')}
                  className="btn-secondary gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download Strategy Memo
                </button>
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (1/3 width) */}
        <div className="space-y-6">
          {/* Client Info */}
          <div className="card">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <User className="h-5 w-5 text-slate-400" />
              Client Information
            </h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{clientName}</p>
                </div>
              </div>
              {(caseData.client_email || caseData.plaintiff_email) && (
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <a
                    href={`mailto:${caseData.client_email || caseData.plaintiff_email}`}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    {caseData.client_email || caseData.plaintiff_email}
                  </a>
                </div>
              )}
              {(caseData.client_phone || caseData.plaintiff_phone) && (
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <p className="text-sm text-slate-700">{caseData.client_phone || caseData.plaintiff_phone}</p>
                </div>
              )}
              {(caseData.client_address || caseData.plaintiff_address) && (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <p className="text-sm text-slate-700">{caseData.client_address || caseData.plaintiff_address}</p>
                </div>
              )}
            </div>
          </div>

          {/* Case Timeline */}
          <div className="card">
            <button
              onClick={() => setTimelineExpanded(!timelineExpanded)}
              className="flex w-full items-center justify-between"
            >
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Clock className="h-5 w-5 text-slate-400" />
                Case Timeline
              </h3>
              {timelineExpanded ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>
            {timelineExpanded && (
              <div className="mt-4 space-y-0">
                {timeline.length > 0 ? (
                  timeline.map((entry, i) => (
                    <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < timeline.length - 1 && (
                        <div className="absolute left-[9px] top-5 h-full w-0.5 bg-slate-200" />
                      )}
                      <div className="z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100">
                        <div className="h-2 w-2 rounded-full bg-primary-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {STATUS_LABELS[entry.status] || entry.status || entry.event}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(entry.created_at || entry.timestamp || entry.date)}
                        </p>
                        {entry.notes && (
                          <p className="mt-1 text-xs text-slate-500">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="space-y-0">
                    <div className="relative flex gap-3 pb-4">
                      <div className="z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100">
                        <div className="h-2 w-2 rounded-full bg-primary-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{STATUS_LABELS[status] || status}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(caseData.updated_at || caseData.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100">
                        <div className="h-2 w-2 rounded-full bg-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">Case Created</p>
                        <p className="text-xs text-slate-500">{formatDateTime(caseData.created_at)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Case Notes */}
          <div className="card">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <StickyNote className="h-5 w-5 text-slate-400" />
              Attorney Notes
            </h3>
            <div className="mt-4 space-y-3">
              {Array.isArray(notes) && notes.length > 0 ? (
                notes.map((note, i) => (
                  <div key={note.id || i} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {typeof note === 'string' ? note : note.text || note.content}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {typeof note === 'object' && note.created_at
                        ? relativeTime(note.created_at)
                        : ''}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No notes yet.</p>
              )}
              <div className="border-t border-slate-100 pt-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a private note..."
                  rows={3}
                  className="input"
                />
                <button
                  onClick={handleSaveNote}
                  disabled={!newNote.trim() || savingNote}
                  className="btn-primary mt-2 gap-1.5 text-xs"
                >
                  {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Note
                </button>
              </div>
            </div>
          </div>

          {/* PII Section */}
          <PiiSection caseId={id} documents={documents} onRefresh={fetchDocuments} />

          {/* Documents */}
          <div className="card">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <File className="h-5 w-5 text-slate-400" />
              Documents
            </h3>
            <div className="mt-4 space-y-2">
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.url || doc.file_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {doc.file_name || doc.name || doc.filename || 'Document'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {doc.category || doc.type || 'File'} &middot; {formatDate(doc.created_at || doc.uploaded_at)}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" />
                  </a>
                ))
              ) : (
                <p className="text-sm text-slate-400">No documents uploaded.</p>
              )}
            </div>
          </div>

          {/* Message Thread */}
          <MessageThread caseId={id} />
        </div>
      </div>

      {/* Modals */}
      {approveModal && (
        <ConfirmModal
          title="Approve Complaint"
          message="Are you sure you want to approve this complaint for filing? This action will advance the case to the approved stage."
          confirmLabel="Approve Complaint"
          confirmColor="green"
          loading={actionLoading}
          onConfirm={handleApproveComplaint}
          onCancel={() => setApproveModal(false)}
        />
      )}

      {revisionModal && (
        <NotesModal
          title="Request Revision"
          placeholder="Describe what changes are needed in the complaint draft..."
          submitLabel="Submit Revision Request"
          loading={actionLoading}
          onSubmit={handleRequestRevision}
          onCancel={() => setRevisionModal(false)}
        />
      )}

      {denyModal && (
        <NotesModal
          title="Deny Case"
          placeholder="Provide the reason for denying this case..."
          submitLabel="Deny Case"
          loading={actionLoading}
          onSubmit={handleDeny}
          onCancel={() => setDenyModal(false)}
        />
      )}
    </div>
  );
}
