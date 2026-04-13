import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  FileText,
  ExternalLink,
  Clock,
  Shield,
  StickyNote,
  Save,
  Loader2,
  AlertCircle,
  ChevronRight,
  CheckCircle,
  XCircle,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { getCases, getDocuments, uploadDocument } from '../../lib/api';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  submitted: 'bg-blue-100 text-blue-700',
  approved_for_processing: 'bg-indigo-100 text-indigo-700',
  agents_processing: 'bg-cyan-100 text-cyan-700',
  draft_ready: 'bg-amber-100 text-amber-700',
  attorney_review: 'bg-purple-100 text-purple-700',
  approved: 'bg-green-100 text-green-700',
  filed: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
  denied: 'bg-red-100 text-red-700',
};

const STATUS_ICONS = {
  submitted: 'text-blue-500',
  approved_for_processing: 'text-indigo-500',
  agents_processing: 'text-cyan-500',
  draft_ready: 'text-amber-500',
  attorney_review: 'text-purple-500',
  approved: 'text-green-500',
  filed: 'text-emerald-500',
  closed: 'text-slate-400',
  denied: 'text-red-500',
};

// ---------------------------------------------------------------------------
// Client Profile Component
// ---------------------------------------------------------------------------

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [clientCases, setClientCases] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Notes
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch client profile
      try {
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();

        if (!profileErr && profile) {
          setClient(profile);
          setNotes(profile.attorney_notes || []);
        }
      } catch {
        // Will derive from cases if profile query fails
      }

      // Fetch all cases
      const casesData = await getCases();
      const allCases = Array.isArray(casesData) ? casesData : casesData?.items ?? casesData?.cases ?? [];
      const filtered = allCases.filter(
        (c) => c.client_id === id || c.plaintiff_id === id || c.user_id === id
      );
      setClientCases(filtered);

      // If no profile data, derive from cases
      if (!client) {
        const first = filtered[0];
        if (first) {
          setClient((prev) =>
            prev || {
              id,
              full_name: first.plaintiff_name || first.client_name || 'Unknown Client',
              email: first.client_email || first.plaintiff_email || '',
              phone: first.client_phone || first.plaintiff_phone || '',
              address: first.client_address || first.plaintiff_address || '',
              county: first.county || '',
              state: first.state || '',
              created_at: first.created_at,
            }
          );
        }
      }

      // Fetch documents from all cases
      const allDocs = [];
      for (const c of filtered.slice(0, 10)) {
        try {
          const docsData = await getDocuments(c.id);
          const docs = Array.isArray(docsData) ? docsData : docsData?.documents ?? docsData?.items ?? [];
          docs.forEach((d) => {
            allDocs.push({ ...d, case_id: c.id, case_name: c.plaintiff_name || c.client_name || 'Case' });
          });
        } catch {
          // Ignore doc fetch errors for individual cases
        }
      }
      setDocuments(allDocs);
    } catch (err) {
      console.error('Failed to load client profile:', err);
      setError(err.message || 'Failed to load client profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveNote = async () => {
    if (!newNote.trim()) return;
    try {
      setSavingNote(true);
      const noteObj = {
        id: Date.now().toString(),
        text: newNote.trim(),
        author: 'Attorney',
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
          <p className="mt-3 text-sm text-slate-500">Loading client profile...</p>
        </div>
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Failed to Load Client</h2>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => navigate('/attorney/clients')} className="btn-secondary">
            Back to Clients
          </button>
          <button onClick={fetchData} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <User className="mx-auto h-12 w-12 text-slate-300" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Client Not Found</h2>
        <p className="mt-2 text-sm text-slate-500">The client you are looking for does not exist.</p>
        <button onClick={() => navigate('/attorney/clients')} className="btn-secondary mt-6">
          Back to Clients
        </button>
      </div>
    );
  }

  const retainerStatus = client.retainer_signed || client.retainer_status;
  const sortedCases = [...clientCases].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/attorney/clients')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Clients
      </button>

      {/* Client Header */}
      <div className="card">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-100">
            <span className="text-2xl font-bold text-primary-700">
              {(client.full_name || '?')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </span>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{client.full_name}</h1>
              <p className="mt-1 text-sm text-slate-500">
                Client since {formatDate(client.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {client.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <a href={`mailto:${client.email}`} className="text-sm text-primary-600 hover:underline">
                    {client.email}
                  </a>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-700">{client.phone}</span>
                </div>
              )}
              {(client.address || client.county || client.state) && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-700">
                    {[client.address, client.county, client.state].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Retainer Status */}
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Retainer:</span>
              {retainerStatus === true || retainerStatus === 'signed' ? (
                <span className="badge bg-green-100 text-green-700">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Signed
                </span>
              ) : retainerStatus === 'pending' ? (
                <span className="badge bg-amber-100 text-amber-700">
                  <Clock className="mr-1 h-3 w-3" />
                  Pending
                </span>
              ) : (
                <span className="badge bg-slate-100 text-slate-600">
                  <XCircle className="mr-1 h-3 w-3" />
                  Not on File
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cases List - Left 2/3 */}
        <div className="space-y-6 lg:col-span-2">
          {/* Cases */}
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Briefcase className="h-5 w-5 text-slate-400" />
                Cases ({clientCases.length})
              </h2>
              <button
                onClick={() => navigate(`/attorney/draft?client_id=${id}&plaintiff_name=${encodeURIComponent(client.full_name || '')}&plaintiff_county=${encodeURIComponent(client.county || '')}`)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <Plus className="h-3.5 w-3.5" /> New Case
              </button>
            </div>

            {sortedCases.length === 0 ? (
              <div className="py-8 text-center">
                <Briefcase className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">No cases found for this client.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sortedCases.map((c) => {
                  const defendants = c.defendant_names?.join(', ') ||
                    c.defendant_name ||
                    (Array.isArray(c.defendants)
                      ? c.defendants.map((d) => (typeof d === 'string' ? d : d.name)).join(', ')
                      : '') ||
                    'Unknown Defendant';

                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/attorney/cases/${c.id}`)}
                      className="flex w-full items-center gap-4 px-2 py-4 text-left transition-colors hover:bg-slate-50 rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {c.plaintiff_name || c.client_name || 'Client'} v. {defendants}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`badge ${STATUS_COLORS[c.status] || 'bg-slate-100 text-slate-600'}`}>
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                          {c.case_type && (
                            <span className="text-xs text-slate-500">
                              {typeof c.case_type === 'string' ? c.case_type.toUpperCase() : c.case_type}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Calendar className="h-3 w-3" />
                            {formatDate(c.created_at)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Case History Timeline */}
          <div className="card">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock className="h-5 w-5 text-slate-400" />
              Case History
            </h2>
            <div className="mt-4">
              {sortedCases.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No case history.</p>
              ) : (
                <div className="space-y-0">
                  {sortedCases.map((c, idx) => {
                    const defendants = c.defendant_names?.join(', ') ||
                      c.defendant_name ||
                      'Unknown';
                    return (
                      <div key={c.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {idx < sortedCases.length - 1 && (
                          <div className="absolute left-[9px] top-5 h-full w-0.5 bg-slate-200" />
                        )}
                        <div
                          className={`z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            c.status === 'filed'
                              ? 'bg-emerald-100'
                              : c.status === 'closed' || c.status === 'denied'
                                ? 'bg-slate-100'
                                : 'bg-primary-100'
                          }`}
                        >
                          <div
                            className={`h-2 w-2 rounded-full ${
                              c.status === 'filed'
                                ? 'bg-emerald-600'
                                : c.status === 'closed' || c.status === 'denied'
                                  ? 'bg-slate-400'
                                  : 'bg-primary-600'
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            v. {defendants}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {STATUS_LABELS[c.status] || c.status} &middot; {formatDateTime(c.updated_at || c.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - 1/3 */}
        <div className="space-y-6">
          {/* Documents */}
          <DocumentsSection
            documents={documents}
            clientCases={clientCases}
            onUploadComplete={fetchData}
          />

          {/* Attorney Notes */}
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
                    {typeof note === 'object' && note.created_at && (
                      <p className="mt-1 text-xs text-slate-400">{formatDateTime(note.created_at)}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No notes yet.</p>
              )}
              <div className="border-t border-slate-100 pt-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a private note about this client..."
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
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Section with Upload
// ---------------------------------------------------------------------------

function DocumentsSection({ documents, clientCases, onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('other');
  const fileInputRef = React.useRef(null);

  const categories = [
    { value: 'credit_report', label: 'Credit Report' },
    { value: 'dispute_letter', label: 'Dispute Letter' },
    { value: 'bureau_response', label: 'Bureau Response' },
    { value: 'collection_notice', label: 'Collection Notice' },
    { value: 'call_log', label: 'Call Log' },
    { value: 'other', label: 'Other' },
  ];

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    if (!selectedCaseId) {
      alert('Select a case first to attach documents to.');
      return;
    }
    setUploading(true);
    for (const file of Array.from(fileList)) {
      try {
        await uploadDocument(selectedCaseId, file, selectedCategory);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    setUploading(false);
    if (onUploadComplete) onUploadComplete();
  }

  return (
    <div className="card">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <FileText className="h-5 w-5 text-slate-400" />
        Documents ({documents.length})
      </h3>

      {/* Upload Section */}
      <div className="mt-4 space-y-3 border-b border-slate-100 pb-4">
        <div className="grid grid-cols-1 gap-2">
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Select case to upload to —</option>
            {clientCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.plaintiff_name || c.client_name || 'Case'} — {c.status}
              </option>
            ))}
          </select>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div
          onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
            dragActive
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-300 hover:border-slate-400'
          } ${!selectedCaseId ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
          <div className="text-xs text-slate-600 font-medium">
            {uploading ? 'Uploading...' : 'Click or drag files'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            PDF, DOCX, TXT, PNG, JPG
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
      </div>

      {/* Document list */}
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
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">
                  {doc.file_name || doc.name || doc.filename || 'Document'}
                </p>
                <p className="text-xs text-slate-400">
                  {doc.case_name || 'Case'} · {(doc.document_category || doc.category || doc.type || 'File').replace('_', ' ')}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            </a>
          ))
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">No documents uploaded.</p>
        )}
      </div>
    </div>
  );
}
