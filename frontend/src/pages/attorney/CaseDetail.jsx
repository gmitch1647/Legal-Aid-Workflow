import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  FileText,
  FileSignature,
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
  FolderOpen,
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
  getPipelineStages,
  sendOiseEngagementContract,
  sendClientEmail,
  sendClientSMS,
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
  attachExistingDocumentAsComplaintExhibit,
  getUploadedComplaintWordDownload,
  deleteDocument,
  attachSupportingDocumentsToCase,
  getCaseSupportingDocuments,
  getSupportingDocuments,
  getSupportingDocumentAccessUrl,
} from '../../lib/api';
import AgentPipelineStatus from '../../components/AgentPipelineStatus';
import SecureDocumentLink from '../../components/SecureDocumentLink';
import DocumentRequestPanel from '../../components/DocumentRequestPanel';
import PayoutInformationPanel from '../../components/PayoutInformationPanel';
import DiscoveryDeliveryPanel from '../../components/DiscoveryDeliveryPanel';
import DocumentExchangePanel from '../../components/DocumentExchangePanel';

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

function ComplaintSection({ caseId, caseData, complaintText, setComplaintText, editingComplaint, setEditingComplaint, documents, onRefresh, onDownload }) {
  const [uploading, setUploading] = useState(false);
  const [exhibitUploadingFor, setExhibitUploadingFor] = useState(null);
  const [draggingExhibitFor, setDraggingExhibitFor] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [libraryDocuments, setLibraryDocuments] = useState([]);
  const [attachedLibraryDocuments, setAttachedLibraryDocuments] = useState([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryAttaching, setLibraryAttaching] = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState([]);
  const [openingSupportingId, setOpeningSupportingId] = useState('');
  const [libraryMessage, setLibraryMessage] = useState('');
  const [clientDocumentsOpen, setClientDocumentsOpen] = useState(false);
  const [clientDocumentsAttaching, setClientDocumentsAttaching] = useState(false);
  const [selectedClientDocumentIds, setSelectedClientDocumentIds] = useState([]);
  const [clientExhibitTargetId, setClientExhibitTargetId] = useState('');
  const [clientDocumentsMessage, setClientDocumentsMessage] = useState('');
  const fileInputRef = React.useRef(null);
  const exhibitInputRefs = React.useRef({});

  const complaintDocs = documents.filter(d => {
    const category = (d.document_category || d.category || '').toLowerCase();
    return category === 'complaint' || (category !== 'complaint_exhibit' && (d.file_name || '').toLowerCase().includes('complaint'));
  });

  const complaintExhibits = documents.filter(d =>
    Boolean(d.parent_document_id) || (d.document_category || d.category || '').toLowerCase() === 'complaint_exhibit'
  );

  const hasText = !!(caseData?.complaint_text || caseData?.complaint_draft);
  const status = caseData?.status;
  const isApproved = status === 'approved' || status === 'filed' || status === 'closed';
  const attachedLibraryIds = new Set(attachedLibraryDocuments.map((item) => item.supporting_document_id));
  const activeClientExhibitTargetId = complaintDocs.some((doc) => doc.id === clientExhibitTargetId)
    ? clientExhibitTargetId
    : complaintDocs[0]?.id || '';
  const clientDocumentCandidates = documents.filter((document) => {
    const category = String(document.document_category || document.category || '').toLowerCase();
    return Boolean(document.id)
      && category !== 'complaint'
      && category !== 'complaint_exhibit'
      && category !== 'pii'
      && !document.parent_document_id;
  });

  async function loadSupportingLibrary() {
    setLibraryLoading(true);
    try {
      const [libraryRows, attachedRows] = await Promise.all([
        getSupportingDocuments(),
        getCaseSupportingDocuments(caseId),
      ]);
      setLibraryDocuments(Array.isArray(libraryRows) ? libraryRows : libraryRows?.data || []);
      setAttachedLibraryDocuments(Array.isArray(attachedRows) ? attachedRows : attachedRows?.data || []);
    } catch (err) {
      setUploadError(err.message || 'Could not load the supporting-document library.');
    } finally {
      setLibraryLoading(false);
    }
  }

  React.useEffect(() => {
    loadSupportingLibrary();
  }, [caseId]);

  async function handleLibraryToggle() {
    const willOpen = !libraryOpen;
    setLibraryOpen(willOpen);
    setLibraryMessage('');
    if (willOpen) await loadSupportingLibrary();
  }

  function toggleLibrarySelection(documentId) {
    if (attachedLibraryIds.has(documentId)) return;
    setSelectedLibraryIds((current) => (
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    ));
  }

  async function handleAttachSupportingDocuments() {
    if (!selectedLibraryIds.length) return;
    setLibraryAttaching(true);
    setUploadError('');
    setLibraryMessage('');
    try {
      await attachSupportingDocumentsToCase(caseId, selectedLibraryIds);
      const count = selectedLibraryIds.length;
      setSelectedLibraryIds([]);
      setLibraryMessage(`${count} supporting ${count === 1 ? 'document is' : 'documents are'} now attached to this case.`);
      await loadSupportingLibrary();
    } catch (err) {
      setUploadError(err.message || 'Could not attach the selected supporting documents.');
    } finally {
      setLibraryAttaching(false);
    }
  }

  async function handleClientDocumentsToggle() {
    const willOpen = !clientDocumentsOpen;
    setClientDocumentsOpen(willOpen);
    setClientDocumentsMessage('');
    if (willOpen) {
      setSelectedClientDocumentIds([]);
      setClientExhibitTargetId(complaintDocs[0]?.id || '');
    }
  }

  function toggleClientDocumentSelection(documentId) {
    setSelectedClientDocumentIds((current) => (
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    ));
  }

  async function handleAttachClientDocumentsAsExhibits() {
    if (!activeClientExhibitTargetId || !selectedClientDocumentIds.length) return;
    setClientDocumentsAttaching(true);
    setUploadError('');
    setClientDocumentsMessage('');
    try {
      for (const documentId of selectedClientDocumentIds) {
        await attachExistingDocumentAsComplaintExhibit(caseId, activeClientExhibitTargetId, documentId);
      }
      const count = selectedClientDocumentIds.length;
      setSelectedClientDocumentIds([]);
      setClientDocumentsMessage(`${count} client ${count === 1 ? 'document is' : 'documents are'} now attached as complaint exhibits.`);
      if (onRefresh) await onRefresh();
    } catch (err) {
      setUploadError(err.message || 'Could not attach the selected client documents as exhibits.');
    } finally {
      setClientDocumentsAttaching(false);
    }
  }

  async function handleOpenSupportingDocument(document) {
    setOpeningSupportingId(document.id);
    setUploadError('');
    try {
      const { url } = await getSupportingDocumentAccessUrl(document.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setUploadError(err.message || 'Could not open the supporting document.');
    } finally {
      setOpeningSupportingId('');
    }
  }

  async function handleUpload(files) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError('');
    for (const file of Array.from(files)) {
      try {
        await uploadDocument(caseId, file, 'complaint');
      } catch (err) {
        console.error('Complaint upload failed:', err);
        setUploadError(err.message || 'Upload failed');
      }
    }
    setUploading(false);
    if (onRefresh) onRefresh();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleComplaintWordDownload(doc) {
    setUploadError('');
    try {
      const blob = await getUploadedComplaintWordDownload(caseId, doc.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(doc.file_name || 'complaint').replace(/\.[^.]+$/, '')}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setUploadError(err.message || 'Could not download the Word complaint.');
    }
  }

  async function handleExistingDocumentAttach(complaintDoc, documentId) {
    if (!documentId) return;
    setExhibitUploadingFor(complaintDoc.id);
    setUploadError('');
    try {
      await attachExistingDocumentAsComplaintExhibit(caseId, complaintDoc.id, documentId);
      if (onRefresh) onRefresh();
    } catch (err) {
      setUploadError(err.message || 'Could not attach the existing document as an exhibit.');
    } finally {
      setExhibitUploadingFor(null);
      setDraggingExhibitFor(null);
    }
  }

  async function handleExhibitUpload(complaintDoc, files) {
    if (!files?.length) return;
    setExhibitUploadingFor(complaintDoc.id);
    setUploadError('');
    for (const file of Array.from(files)) {
      try {
        await uploadDocument(caseId, file, 'complaint_exhibit', complaintDoc.id);
      } catch (err) {
        console.error('Complaint exhibit upload failed:', err);
        setUploadError(err.message || 'Exhibit upload failed');
      }
    }
    setExhibitUploadingFor(null);
    setDraggingExhibitFor(null);
    if (onRefresh) onRefresh();
    const input = exhibitInputRefs.current[complaintDoc.id];
    if (input) input.value = '';
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      await supabase.from('cases').update({ complaint_text: complaintText }).eq('id', caseId);
      setEditingComplaint(false);
      if (onRefresh) onRefresh();
    } catch (err) { console.error('Save draft failed:', err); }
    finally { setSavingDraft(false); }
  }

  async function handleDeleteDoc(doc) {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    try {
      await deleteDocument(caseId, doc.id);
      if (onRefresh) onRefresh();
    } catch (err) { alert('Delete failed: ' + err.message); }
  }

  return (
    <div className="card border-blue-200 bg-blue-50/20">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <FileText className="h-5 w-5 text-blue-500" />
          Complaint
          {isApproved && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
              Approved
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          {hasText && !editingComplaint && (
            <button onClick={() => setEditingComplaint(true)} className="btn-secondary gap-1.5 text-xs">
              <Edit3 className="h-3.5 w-3.5" /> Edit Draft
            </button>
          )}
          {editingComplaint && (
            <>
              <button onClick={() => { setEditingComplaint(false); setComplaintText(caseData.complaint_text || caseData.complaint_draft || ''); }}
                className="btn-secondary gap-1.5 text-xs">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button onClick={handleSaveDraft} disabled={savingDraft} className="btn-primary gap-1.5 text-xs">
                {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </>
          )}
          {isApproved && onDownload && (
            <button onClick={onDownload} className="btn-secondary gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Download DOCX
            </button>
          )}
        </div>
      </div>

      {/* Draft text */}
      {hasText && (
        <div className="mt-4">
          {editingComplaint ? (
            <textarea value={complaintText} onChange={(e) => setComplaintText(e.target.value)}
              rows={20} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          ) : (
            <div className="max-h-[500px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
              <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap font-serif text-sm leading-relaxed">
                {complaintText}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Uploaded complaint documents and their linked exhibits */}
      {complaintDocs.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Uploaded Complaint Files</p>
            <p className="text-[11px] text-slate-400">Complaint downloads are provided as Word documents.</p>
          </div>
          <div className="space-y-3">
            {complaintDocs.map(doc => {
              const exhibits = complaintExhibits.filter(exhibit => exhibit.parent_document_id === doc.id);
              const uploadingExhibits = exhibitUploadingFor === doc.id;
              const draggingExhibits = draggingExhibitFor === doc.id;
              return (
                <div key={doc.id} className="rounded-lg border border-blue-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">{doc.file_name || 'Complaint document'}</p>
                      <p className="text-xs text-slate-400">Uploaded {formatDate(doc.created_at)}</p>
                    </div>
                    <button
                      onClick={() => handleComplaintWordDownload(doc)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-300 bg-white px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      <Download className="h-3.5 w-3.5" /> Word
                    </button>
                    <button onClick={() => handleDeleteDoc(doc)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">Exhibits {exhibits.length ? `(${exhibits.length})` : ''}</p>
                      <button
                        type="button"
                        onClick={() => exhibitInputRefs.current[doc.id]?.click()}
                        className="text-xs font-medium text-blue-700 hover:text-blue-800"
                      >
                        Add exhibit
                      </button>
                    </div>
                    {exhibits.length > 0 && (
                      <div className="mb-2 space-y-1.5">
                        {exhibits.map(exhibit => (
                          <div key={exhibit.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2">
                            <File className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <SecureDocumentLink
                              caseId={caseId}
                              document={exhibit}
                              className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-700 hover:text-blue-700"
                              onError={setUploadError}
                            >
                              {exhibit.file_name || 'Exhibit'}
                            </SecureDocumentLink>
                            <button onClick={() => handleDeleteDoc(exhibit)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      onDragOver={(event) => { event.preventDefault(); setDraggingExhibitFor(doc.id); }}
                      onDragLeave={(event) => { event.preventDefault(); if (draggingExhibitFor === doc.id) setDraggingExhibitFor(null); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const existingDocumentId = event.dataTransfer.getData('application/x-legalflow-case-document');
                        if (existingDocumentId) {
                          handleExistingDocumentAttach(doc, existingDocumentId);
                        } else {
                          handleExhibitUpload(doc, event.dataTransfer.files);
                        }
                      }}
                      onClick={() => exhibitInputRefs.current[doc.id]?.click()}
                      className={`cursor-pointer rounded-md border border-dashed px-3 py-3 text-center transition ${draggingExhibits ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}`}
                    >
                      <Upload className={`mx-auto mb-1 h-4 w-4 ${draggingExhibits ? 'text-blue-600' : 'text-slate-400'}`} />
                      <p className="text-xs font-medium text-slate-600">{uploadingExhibits ? 'Uploading exhibit…' : 'Drag exhibits here or click to upload'}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">PDFs, Word files, images, credit reports, dispute letters, and responses</p>
                    </div>
                    <input
                      ref={(element) => { exhibitInputRefs.current[doc.id] = element; }}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.tif,.tiff,.txt"
                      className="hidden"
                      onChange={(event) => handleExhibitUpload(doc, event.target.files)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {attachedLibraryDocuments.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FolderOpen className="h-3.5 w-3.5 text-blue-600" /> Supporting Documents Attached to This Case
            </p>
            <span className="text-[11px] text-slate-400">Stored once in your library</span>
          </div>
          <div className="space-y-1.5">
            {attachedLibraryDocuments.map((attachment) => {
              const supportingDocument = attachment.supporting_documents || {};
              const opening = openingSupportingId === supportingDocument.id;
              return (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => handleOpenSupportingDocument(supportingDocument)}
                  disabled={!supportingDocument.id || opening}
                  className="flex w-full items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-left transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {opening ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" /> : <File className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{supportingDocument.file_name || 'Supporting document'}</span>
                  <span className="text-[11px] font-medium text-blue-700">Open</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Complaint and reusable-supporting-document controls */}
      <div className="mt-4">
        <div className="flex flex-wrap items-start gap-2">
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-blue-300 rounded-lg text-xs font-medium text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-50">
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Uploading...' : 'Upload Complaint Document'}
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc" className="hidden"
            onChange={(e) => handleUpload(e.target.files)} />

          <div className="relative">
            <button
              type="button"
              onClick={handleLibraryToggle}
              disabled={libraryAttaching}
              aria-expanded={libraryOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5 text-blue-600" />
              Attach from Library
              <ChevronDown className={`h-3.5 w-3.5 transition ${libraryOpen ? 'rotate-180' : ''}`} />
            </button>

            {libraryOpen && (
              <div className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Attach supporting documents</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">Select one or more reusable files to link to this case. No new storage copies are created.</p>
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {libraryLoading ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading library…</div>
                  ) : libraryDocuments.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs leading-5 text-slate-500">Your library is empty. Add reusable files from the Supporting Documents tab, then return here to attach them.</p>
                  ) : (
                    libraryDocuments.map((document) => {
                      const attached = attachedLibraryIds.has(document.id);
                      const selected = selectedLibraryIds.includes(document.id);
                      return (
                        <label
                          key={document.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2.5 transition ${attached ? 'cursor-default bg-slate-50 opacity-70' : selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected || attached}
                            disabled={attached || libraryAttaching}
                            onChange={() => toggleLibrarySelection(document.id)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-slate-700">{document.file_name}</span>
                            {document.description && <span className="mt-0.5 block truncate text-[11px] text-slate-500">{document.description}</span>}
                          </span>
                          {attached && <span className="shrink-0 text-[10px] font-semibold text-emerald-700">Attached</span>}
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-3">
                  <button type="button" onClick={() => { setLibraryOpen(false); setSelectedLibraryIds([]); }} className="text-xs font-medium text-slate-600 hover:text-slate-900">Cancel</button>
                  <button
                    type="button"
                    onClick={handleAttachSupportingDocuments}
                    disabled={!selectedLibraryIds.length || libraryAttaching}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {libraryAttaching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Attach Selected{selectedLibraryIds.length ? ` (${selectedLibraryIds.length})` : ''}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={handleClientDocumentsToggle}
              disabled={!complaintDocs.length || clientDocumentsAttaching}
              aria-expanded={clientDocumentsOpen}
              title={!complaintDocs.length ? 'Upload a complaint document before adding exhibits.' : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <File className="h-3.5 w-3.5 text-blue-600" />
              Add Client Documents as Exhibits
              <ChevronDown className={`h-3.5 w-3.5 transition ${clientDocumentsOpen ? 'rotate-180' : ''}`} />
            </button>

            {clientDocumentsOpen && (
              <div className="absolute left-0 z-30 mt-2 w-[min(24rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Add client documents as exhibits</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">Select one or more documents already attached to this case. LegalFlow links them to the complaint without creating additional storage copies.</p>
                  {complaintDocs.length > 1 && (
                    <label className="mt-3 block text-xs font-semibold text-slate-600">
                      Add exhibits to
                      <select
                        value={activeClientExhibitTargetId}
                        onChange={(event) => setClientExhibitTargetId(event.target.value)}
                        disabled={clientDocumentsAttaching}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        {complaintDocs.map((complaint) => <option key={complaint.id} value={complaint.id}>{complaint.file_name || 'Complaint document'}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {clientDocumentCandidates.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs leading-5 text-slate-500">No unattached client documents are available. Upload or request a document first, or use the supporting-document library.</p>
                  ) : (
                    clientDocumentCandidates.map((document) => {
                      const selected = selectedClientDocumentIds.includes(document.id);
                      return (
                        <label key={document.id} className={`flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2.5 transition ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={clientDocumentsAttaching}
                            onChange={() => toggleClientDocumentSelection(document.id)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-slate-700">{document.file_name || 'Client document'}</span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">{document.document_category || document.category || 'Client document'}{document.created_at ? ` · Uploaded ${formatDate(document.created_at)}` : ''}</span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-3">
                  <button type="button" onClick={() => { setClientDocumentsOpen(false); setSelectedClientDocumentIds([]); }} className="text-xs font-medium text-slate-600 hover:text-slate-900">Cancel</button>
                  <button
                    type="button"
                    onClick={handleAttachClientDocumentsAsExhibits}
                    disabled={!activeClientExhibitTargetId || !selectedClientDocumentIds.length || clientDocumentsAttaching}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {clientDocumentsAttaching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Add Selected{selectedClientDocumentIds.length ? ` (${selectedClientDocumentIds.length})` : ''}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {libraryMessage && <p className="mt-2 text-xs text-emerald-700">{libraryMessage}</p>}
        {clientDocumentsMessage && <p className="mt-2 text-xs text-emerald-700">{clientDocumentsMessage}</p>}
        {uploadError && (
          <p className="text-xs text-red-600 mt-2">Error: {uploadError}</p>
        )}
        {!hasText && complaintDocs.length === 0 && !uploadError && (
          <p className="text-xs text-slate-400 mt-2">No complaint drafted yet. Use the Drafter to create one, upload an existing complaint, or attach reusable supporting documents.</p>
        )}
      </div>
    </div>
  );
}

function CaseTypeSelector({ caseId, currentTypes, onUpdate }) {
  const types = ['FCRA', 'FDCPA', 'TCPA'];
  const [selected, setSelected] = useState(() => {
    if (!currentTypes) return [];
    if (typeof currentTypes === 'string') return currentTypes.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    if (Array.isArray(currentTypes)) return currentTypes.map(t => t.toUpperCase());
    return [];
  });
  const [saving, setSaving] = useState(false);

  async function toggle(type) {
    const next = selected.includes(type)
      ? selected.filter(t => t !== type)
      : [...selected, type];
    setSelected(next);
    setSaving(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      await supabase.from('cases').update({ case_type: next.join(',') }).eq('id', caseId);
      if (onUpdate) onUpdate();
    } catch (err) { console.error('Failed to update case type:', err); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2 items-center">
      {types.map(type => (
        <button key={type} onClick={() => toggle(type)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
            selected.includes(type)
              ? type === 'FCRA' ? 'bg-blue-100 text-blue-700 border-blue-300'
                : type === 'FDCPA' ? 'bg-purple-100 text-purple-700 border-purple-300'
                : 'bg-green-100 text-green-700 border-green-300'
              : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
          }`}>
          {type}
        </button>
      ))}
      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
    </div>
  );
}

function ContactAttorneySection({ caseId, caseData, staffAttorneys }) {
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [sendVia, setSendVia] = useState('email');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [attorney, setAttorney] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAttorney() {
      setLoading(true);
      try {
        const { supabase: sb } = await import('../../lib/supabase');
        const clientId = caseData?.client_id;
        if (!clientId) { setLoading(false); return; }

        const { data: profile } = await sb.from('profiles').select('assigned_attorney_id').eq('id', clientId).single();
        if (profile?.assigned_attorney_id) {
          const { data: atty } = await sb.from('profiles').select('id, full_name, email, phone').eq('id', profile.assigned_attorney_id).single();
          if (atty) setAttorney(atty);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    loadAttorney();
  }, [caseData?.client_id]);

  const clientName = caseData?.plaintiff_name || caseData?.client_name || 'Client';
  const caseLink = `${window.location.origin}/attorney/cases/${caseId}`;

  async function handleSend() {
    if (!message.trim()) { setError('Enter a message'); return; }
    const targetAtty = attorney;
    if (!targetAtty) { setError('No attorney assigned to this case'); return; }

    setSending(true);
    setError('');
    setSent('');
    try {
      if (sendVia === 'email' || sendVia === 'both') {
        if (!targetAtty.email) throw new Error('Attorney has no email address');
        const { sendClientEmail } = await import('../../lib/api');
        const emailSubject = subject.trim() || `Re: ${clientName} — Case Update`;
        const emailBody = `${message.trim()}\n\n---\nCase: ${clientName}\nView case: ${caseLink}`;
        await sendClientEmail({
          client_id: caseData?.client_id || caseId,
          to_email: targetAtty.email,
          subject: emailSubject,
          body: emailBody,
        });
      }
      if (sendVia === 'sms' || sendVia === 'both') {
        if (!targetAtty.phone) throw new Error('Attorney has no phone number');
        const { sendClientSMS } = await import('../../lib/api');
        const smsBody = `LegalFlow — ${clientName}: ${message.trim().slice(0, 140)}\n${caseLink}`;
        await sendClientSMS({
          client_id: caseData?.client_id || caseId,
          to_phone: targetAtty.phone,
          body: smsBody,
        });
      }
      setSent(sendVia === 'both' ? 'Email and SMS sent!' : sendVia === 'email' ? 'Email sent!' : 'SMS sent!');
      setMessage('');
      setSubject('');
      setTimeout(() => setSent(''), 5000);
    } catch (err) {
      setError(err.message || 'Failed to send');
    } finally { setSending(false); }
  }

  return (
    <div className="card border-indigo-200 bg-indigo-50/20">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Mail className="h-5 w-5 text-indigo-500" />
        Contact Assigned Attorney
      </h3>

      {loading ? (
        <div className="mt-3 text-xs text-slate-400">Loading attorney info...</div>
      ) : !attorney ? (
        <div className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg p-2 border border-amber-200">
          No attorney assigned to this case. Assign one in the Case Information section above.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Attorney info */}
          <div className="flex items-center gap-3 bg-white rounded-lg border border-indigo-100 p-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-indigo-700">
                {(attorney.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900">{attorney.full_name}</div>
              <div className="text-xs text-slate-500 flex gap-3">
                {attorney.email && <span>{attorney.email}</span>}
                {attorney.phone && <span>{attorney.phone}</span>}
              </div>
            </div>
          </div>

          {/* Send via toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {[
              { key: 'email', label: 'Email', icon: '✉' },
              { key: 'sms', label: 'Text', icon: '💬' },
              { key: 'both', label: 'Both', icon: '📨' },
            ].map(opt => (
              <button key={opt.key} onClick={() => setSendVia(opt.key)}
                className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                  sendVia === opt.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {/* Subject (email only) */}
          {(sendVia === 'email' || sendVia === 'both') && (
            <input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder={`Subject (default: Re: ${clientName} — Case Update)`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          )}

          {/* Message */}
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            rows={4} placeholder="Type your message to the attorney..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />

          {error && <p className="text-xs text-red-600">{error}</p>}
          {sent && <p className="text-xs text-emerald-600 font-medium">{sent}</p>}

          <button onClick={handleSend} disabled={sending || !message.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}
    </div>
  );
}

function DocumentsUploadSection({ caseId, documents, onRefresh }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [category, setCategory] = useState('other');
  const fileInputRef = React.useRef(null);

  const generalDocs = documents.filter(d => {
    const cat = (d.document_category || d.category || '').toLowerCase();
    return cat !== 'pii' && cat !== 'complaint';
  });

  const documentCategoryLabel = (doc) => {
    const category = String(doc.document_category || doc.category || doc.type || 'File').toLowerCase();
    if (category === 'signed_contract' || category === 'signed_engagement_agreement') return 'Signed Contract';
    if (category === 'signed_closing_statement') return 'Signed Closing Statement';
    return category.replace(/_/g, ' ');
  };

  const categories = [
    { value: 'credit_report', label: 'Credit Report' },
    { value: 'dispute_letter', label: 'Dispute Letter' },
    { value: 'bureau_response', label: 'Bureau Response' },
    { value: 'collection_notice', label: 'Collection Notice' },
    { value: 'call_log', label: 'Call Log' },
    { value: 'other', label: 'Other' },
  ];

  async function handleUpload(files) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError('');
    for (const file of Array.from(files)) {
      try {
        await uploadDocument(caseId, file, category);
      } catch (err) {
        console.error('Upload failed:', err);
        setUploadError(err.message || 'Upload failed');
      }
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
    <div className="card">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <File className="h-5 w-5 text-slate-400" />
        Documents ({generalDocs.length})
      </h3>

      {/* Upload */}
      <div className="mt-3 flex items-center gap-2">
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
          {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50">
          <Upload className="w-3.5 h-3.5" />
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" className="hidden"
          onChange={e => handleUpload(e.target.files)} />
      </div>
      {uploadError && <p className="text-xs text-red-600 mt-1 px-1">{uploadError}</p>}

      {/* List */}
      <div className="mt-4 space-y-2">
        {generalDocs.length > 0 ? (
          generalDocs.map(doc => (
            <div
              key={doc.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData('application/x-legalflow-case-document', doc.id);
                event.dataTransfer.setData('text/plain', doc.file_name || 'Case document');
              }}
              className="flex cursor-grab items-center gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50 active:cursor-grabbing"
              title="Drag this document to a complaint's Exhibits area to attach it without uploading another copy"
            >
              <SecureDocumentLink
                caseId={caseId}
                document={doc}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onError={setUploadError}
              >
                <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700">
                    {doc.file_name || doc.name || doc.filename || 'Document'}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {documentCategoryLabel(doc)} · {formatDate(doc.created_at || doc.uploaded_at)}
                  </span>
                  {doc.parent_document_id && (
                    <span className="mt-0.5 inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Attached as exhibit</span>
                  )}
                </span>
              </SecureDocumentLink>
              <button onClick={() => handleDelete(doc)}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No documents uploaded.</p>
        )}
      </div>
    </div>
  );
}

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
              <SecureDocumentLink
                caseId={caseId}
                document={doc}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700">{doc.file_name || 'Document'}</span>
                  <span className="block text-xs text-slate-400">{formatDate(doc.created_at || doc.uploaded_at)}</span>
                </span>
              </SecureDocumentLink>
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
  const [caseStages, setCaseStages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [approveModal, setApproveModal] = useState(false);
  const [revisionModal, setRevisionModal] = useState(false);
  const [denyModal, setDenyModal] = useState(false);
  const [stageChangeModal, setStageChangeModal] = useState(null);
  const [stageChangeLoading, setStageChangeLoading] = useState(false);

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
  const [showReferralPicker, setShowReferralPicker] = useState(false);

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

  useEffect(() => {
    getPipelineStages(caseData?.pipeline_id || 'all')
      .then((stages) => setCaseStages(Array.isArray(stages) ? stages : []))
      .catch((err) => console.debug('Pipeline stages unavailable:', err.message));
  }, [caseData?.pipeline_id]);

  const handleAssignReferral = async (partnerId) => {
    setSelectedPartnerId(partnerId);
    setSavingPartner(true);
    try {
      await assignReferral({ partner_id: partnerId, case_id: id });
      await fetchCase();
      setShowReferralPicker(false);
    } catch (err) {
      console.error('Failed to assign referral partner:', err);
    } finally {
      setSavingPartner(false);
    }
  };

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
      if (type === 'complaint') {
        const complaintDownload = await downloadComplaint(id);
        if (!complaintDownload?.url) throw new Error('Complaint Word document is not available.');
        const response = await fetch(complaintDownload.url);
        if (!response.ok) throw new Error('Complaint Word document could not be retrieved.');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `complaint_${id}.docx`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        return;
      }

      const blob = await downloadMemo(id);
      if (blob instanceof Blob) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `memo_${id}.docx`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(`Failed to download ${type}: ${err.message}`);
    }
  };

  const handleStageSelection = (nextStatus) => {
    const currentStatus = caseData?.status || 'submitted';
    if (!nextStatus || nextStatus === currentStatus) return;

    const selectedStage = caseStages.find((stage) => stage.slug === nextStatus) || {
      slug: nextStatus,
      name: STATUS_LABELS[nextStatus] || nextStatus.replace(/_/g, ' '),
    };

    if (nextStatus === 'documents_signed') {
      setError('Documents Signed is updated automatically when the client completes the representation agreement.');
      return;
    }

    if (nextStatus === 'doc_sent_for_signature') {
      setStageChangeModal({ type: 'engagement', stage: selectedStage });
      return;
    }

    setStageChangeModal({
      type: 'stage',
      stage: selectedStage,
      shouldNotify: Boolean(selectedStage.notify_email || selectedStage.notify_sms || selectedStage.notify_attorney),
    });
  };

  const notifyStageRecipients = async (stage) => {
    const client = caseData?.client || {};
    const clientId = caseData?.client_id || id;
    const clientEmail = client.email || caseData?.client_email || caseData?.plaintiff_email;
    const clientPhone = client.phone || caseData?.client_phone || caseData?.plaintiff_phone;
    const stageName = stage.name || stage.label || stage.slug;
    const caseLink = `${window.location.origin}/attorney/cases/${id}`;
    const clientMessage = (stage.notification_template || `Hi {client_name}, your case status has been updated to: {stage_name}.`)
      .replace(/{client_name}/g, clientName)
      .replace(/{stage_name}/g, stageName)
      .replace(/{case_status}/g, stage.slug.replace(/_/g, ' '))
      .replace(/{case_link}/g, caseLink);

    const deliveryTasks = [];
    if (stage.notify_email && clientEmail) {
      deliveryTasks.push(sendClientEmail({
        client_id: clientId,
        to_email: clientEmail,
        subject: `Case Update: ${stageName}`,
        body: clientMessage,
      }));
    }
    if (stage.notify_sms && clientPhone) {
      deliveryTasks.push(sendClientSMS({
        client_id: clientId,
        to_phone: clientPhone,
        body: clientMessage,
      }));
    }

    if (stage.notify_attorney) {
      try {
        let recipient = null;
        const attorneyId = stage.notify_attorney_id || 'assigned';
        if (attorneyId === 'assigned') {
          const assignedId = client.assigned_attorney_id;
          recipient = staffAttorneys.find((attorney) => attorney.id === assignedId) || null;
          if (!recipient && assignedId) {
            const { supabase } = await import('../../lib/supabase');
            const { data } = await supabase
              .from('profiles')
              .select('email, full_name')
              .eq('id', assignedId)
              .single();
            recipient = data || null;
          }
        } else {
          recipient = staffAttorneys.find((attorney) => attorney.id === attorneyId) || null;
          if (!recipient) {
            const { supabase } = await import('../../lib/supabase');
            const { data } = await supabase
              .from('profiles')
              .select('email, full_name')
              .eq('id', attorneyId)
              .single();
            recipient = data || null;
          }
        }
        if (recipient?.email) {
          const attorneyMessage = (stage.notification_template || `Hi {attorney_name},\n\nThe case for {client_name} has been moved to "{stage_name}". Please review it in LegalFlow.\n\n{case_link}`)
            .replace(/{attorney_name}/g, recipient.full_name || 'Attorney')
            .replace(/{client_name}/g, clientName)
            .replace(/{stage_name}/g, stageName)
            .replace(/{case_status}/g, stage.slug.replace(/_/g, ' '))
            .replace(/{case_link}/g, caseLink);
          deliveryTasks.push(sendClientEmail({
            client_id: clientId,
            to_email: recipient.email,
            subject: `Case Update: ${clientName} — ${stageName}`,
            body: attorneyMessage,
          }));
        }
      } catch (err) {
        console.error('Attorney stage notification setup failed:', err);
      }
    }

    const settled = await Promise.allSettled(deliveryTasks);
    const failed = settled.filter((result) => result.status === 'rejected');
    if (failed.length) {
      console.warn('One or more stage notifications could not be delivered.', failed);
    }
  };

  const handleConfirmStageChange = async () => {
    if (!stageChangeModal || stageChangeLoading) return;
    setStageChangeLoading(true);
    try {
      if (stageChangeModal.type === 'engagement') {
        await sendOiseEngagementContract(id);
      } else {
        await updateCaseStatus(id, stageChangeModal.stage.slug);
        if (stageChangeModal.shouldNotify) {
          await notifyStageRecipients(stageChangeModal.stage);
        }
      }
      setStageChangeModal(null);
      await fetchCase();
      await fetchPipeline();
    } catch (err) {
      setError(err.message || 'Could not update the pipeline stage.');
    } finally {
      setStageChangeLoading(false);
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
            {caseData.client_id ? (
              <Link
                to={`/attorney/clients/${caseData.client_id}`}
                className="rounded text-blue-700 underline decoration-blue-300 decoration-2 underline-offset-4 transition hover:text-blue-900 hover:decoration-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                title={`Open ${clientName}'s client profile`}
              >
                {clientName}
              </Link>
            ) : clientName} v. {defendantText}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {caseData.client_id && (
              <Link
                to={`/attorney/clients/${caseData.client_id}`}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                <User className="h-3.5 w-3.5" /> View Client Profile
              </Link>
            )}
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
            {caseStages.length > 0 && (
              <label className="ml-1 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
                <span className="text-slate-500">Move to</span>
                <select
                  value={status}
                  onChange={(event) => handleStageSelection(event.target.value)}
                  disabled={stageChangeLoading}
                  className="max-w-48 bg-transparent font-semibold text-slate-800 outline-none disabled:cursor-not-allowed"
                  aria-label="Move case to pipeline stage"
                >
                  {!caseStages.some((stage) => stage.slug === status) && (
                    <option value={status}>{STATUS_LABELS[status] || status.replace(/_/g, ' ')}</option>
                  )}
                  {caseStages.map((stage) => (
                    <option key={stage.id || stage.slug} value={stage.slug} disabled={stage.slug === 'documents_signed'}>
                      {stage.name || stage.slug.replace(/_/g, ' ')}{stage.slug === 'documents_signed' ? ' (automatic)' : ''}
                    </option>
                  ))}
                </select>
                {stageChangeLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" />}
              </label>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <div className="relative">
            <button
              onClick={() => setShowReferralPicker((visible) => !visible)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              aria-expanded={showReferralPicker}
            >
              <User className="h-4 w-4" />
              Referral
            </button>
            {showReferralPicker && (
              <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <label className="mb-2 block text-xs font-bold text-slate-600">Referred by</label>
                <select
                  value={selectedPartnerId}
                  onChange={(event) => handleAssignReferral(event.target.value)}
                  disabled={savingPartner}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
                >
                  <option value="">— No referral partner —</option>
                  {referralPartners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.full_name}{partner.company ? ` (${partner.company})` : ''}
                    </option>
                  ))}
                </select>
                {savingPartner && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving referral…</p>}
              </div>
            )}
          </div>
          <button
            onClick={() => navigate(`/attorney/settlements?case_id=${encodeURIComponent(id)}`)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-800"
          >
            <FileSignature className="h-4 w-4" />
            Settlement Workspace
          </button>
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

              {/* Case Type */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Case Type</p>
                <CaseTypeSelector caseId={id} currentTypes={caseData.case_type} onUpdate={fetchCase} />
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
                    onChange={(event) => handleAssignReferral(event.target.value)}
                    disabled={savingPartner}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
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

          {/* Complaint Section */}
          <ComplaintSection
            caseId={id}
            caseData={caseData}
            complaintText={complaintText}
            setComplaintText={setComplaintText}
            editingComplaint={editingComplaint}
            setEditingComplaint={setEditingComplaint}
            documents={documents}
            onRefresh={() => { fetchCase(); fetchDocuments(); }}
            onDownload={handleDownloadApprovedComplaint}
          />

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

          {/* Client Document Requests */}
          <DocumentRequestPanel caseId={id} />

          {/* Discovery Delivery */}
          <DiscoveryDeliveryPanel caseId={id} documents={documents} onRefreshDocuments={fetchDocuments} />

          {/* Client-separated owner and attorney collaboration */}
          <DocumentExchangePanel caseId={id} documents={documents} onRefreshDocuments={fetchDocuments} />

          {/* Secure Client Payout Information */}
          <PayoutInformationPanel caseId={id} />

          {/* Documents */}
          <DocumentsUploadSection caseId={id} documents={documents} onRefresh={fetchDocuments} />

          {/* Contact Attorney */}
          <ContactAttorneySection caseId={id} caseData={caseData} staffAttorneys={staffAttorneys} />

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

      {stageChangeModal && (
        <ConfirmModal
          title={stageChangeModal.type === 'engagement' ? 'Send Oise Law Contract for Signature' : `Move case to ${stageChangeModal.stage.name || stageChangeModal.stage.slug}`}
          message={stageChangeModal.type === 'engagement'
            ? `LegalFlow will send Esther Oise’s representation agreement to ${clientName} for signature. The case will move only after the signing invitation is accepted for delivery.`
            : stageChangeModal.shouldNotify
              ? `This stage has configured notifications. LegalFlow will move the case and send the enabled case-update notifications.`
              : `Move this case to ${stageChangeModal.stage.name || stageChangeModal.stage.slug}?`}
          confirmLabel={stageChangeModal.type === 'engagement' ? 'Send Contract for Signature' : stageChangeModal.shouldNotify ? 'Move Case & Send Notifications' : 'Move Case'}
          confirmColor="green"
          loading={stageChangeLoading}
          onConfirm={handleConfirmStageChange}
          onCancel={() => setStageChangeModal(null)}
        />
      )}
    </div>
  );
}
