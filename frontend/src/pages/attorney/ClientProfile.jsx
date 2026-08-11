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
  Send,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import {
  getCases,
  getDocuments,
  uploadDocument,
  deleteDocument,
  getCommsConfig,
  getCommsHistory,
  sendClientEmail,
  sendClientSMS,
  getCreditReportConfig,
  pullCreditReport,
  getClientCreditReports,
  getClientScoreHistory,
  getStaffAttorneys,
  assignAttorneyToClient,
  getReferralPartners,
  assignReferral,
  getDefendants,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';
import SecureDocumentLink from '../../components/SecureDocumentLink';

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

function normalizedDefendants(values = []) {
  const byName = new Map();
  for (const value of values) {
    const entry = typeof value === 'string'
      ? { name: value.trim() }
      : { id: value?.id, name: String(value?.name || '').trim(), custom: Boolean(value?.custom) };
    if (!entry.name) continue;
    const key = entry.name.toLocaleLowerCase();
    if (!byName.has(key)) byName.set(key, entry);
  }
  return [...byName.values()];
}

function caseCaption(plaintiffName, defendants) {
  const plaintiff = String(plaintiffName || '').trim() || 'Client';
  const defendantNames = normalizedDefendants(defendants).map((defendant) => defendant.name);
  return `${plaintiff} v. ${defendantNames.join(', ') || 'Unknown Defendant'}`;
}

function caseFactsWithParties(plaintiffName, defendants, facts = '') {
  const defendantBlock = normalizedDefendants(defendants).map((defendant) => defendant.name).join('\n');
  return `=== PLAINTIFF ===\nName: ${String(plaintiffName || '').trim() || 'Client'}\n\n=== DEFENDANTS ===\n${defendantBlock || 'Unknown Defendant'}\n\n=== FACTS ===\n${facts.trim()}`;
}

async function linkCaseDefendants(caseId, defendants) {
  const defendantEntries = normalizedDefendants(defendants);
  const defendantIds = [];

  for (const defendant of defendantEntries) {
    let defendantId = defendant.custom ? null : defendant.id;
    if (!defendantId) {
      const { data: matches, error: lookupError } = await supabase
        .from('defendants')
        .select('id')
        .ilike('name', defendant.name)
        .limit(1);
      if (lookupError) throw lookupError;
      defendantId = matches?.[0]?.id;
    }
    if (!defendantId) {
      const { data: created, error: createError } = await supabase
        .from('defendants')
        .insert({ name: defendant.name, is_custom: true })
        .select('id')
        .single();
      if (createError) throw createError;
      defendantId = created?.id;
    }
    if (defendantId) defendantIds.push(defendantId);
  }

  if (!defendantIds.length) throw new Error('Could not link the selected defendants to the new case.');
  const { error: linkError } = await supabase
    .from('case_defendants')
    .insert(defendantIds.map((defendantId) => ({ case_id: caseId, defendant_id: defendantId })));
  if (linkError) throw linkError;
}

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
  const [showUploadCase, setShowUploadCase] = useState(false);
  const [showNewCase, setShowNewCase] = useState(false);
  const [uploadingCase, setUploadingCase] = useState(false);
  const [uploadCaseForm, setUploadCaseForm] = useState({ description: '', defendants: '' });
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const refreshDocuments = useCallback(async () => {
    try {
      const allDocs = [];
      for (const c of clientCases.slice(0, 10)) {
        try {
          const docsData = await getDocuments(c.id);
          const docs = Array.isArray(docsData) ? docsData : docsData?.documents ?? docsData?.items ?? [];
          docs.forEach((d) => {
            allDocs.push({ ...d, case_id: c.id, case_name: c.plaintiff_name || c.client_name || 'Case' });
          });
        } catch {}
      }
      setDocuments(allDocs);
    } catch {}
  }, [clientCases]);

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

      // Enrich cases with assigned attorney and referral partner names
      const partnerIds = [...new Set(filtered.map(c => c.referral_partner_id).filter(Boolean))];
      const attorneyClientIds = [...new Set(filtered.map(c => c.client_id).filter(Boolean))];

      let partnerMap = {};
      if (partnerIds.length > 0) {
        const { data: partners } = await supabase.from('referral_partners').select('id, full_name, company').in('id', partnerIds);
        partnerMap = Object.fromEntries((partners || []).map(p => [p.id, p]));
      }

      let attorneyMap = {};
      if (attorneyClientIds.length > 0) {
        const { data: clientProfiles } = await supabase.from('profiles').select('id, assigned_attorney_id').in('id', attorneyClientIds);
        const attyIds = [...new Set((clientProfiles || []).map(p => p.assigned_attorney_id).filter(Boolean))];
        if (attyIds.length > 0) {
          const { data: attorneys } = await supabase.from('profiles').select('id, full_name').in('id', attyIds);
          const attyNameMap = Object.fromEntries((attorneys || []).map(a => [a.id, a.full_name]));
          for (const cp of (clientProfiles || [])) {
            if (cp.assigned_attorney_id) {
              attorneyMap[cp.id] = attyNameMap[cp.assigned_attorney_id] || null;
            }
          }
        }
      }

      for (const c of filtered) {
        const partner = partnerMap[c.referral_partner_id];
        c._referral_name = partner ? (partner.full_name + (partner.company ? ` (${partner.company})` : '')) : null;
        c._attorney_name = attorneyMap[c.client_id] || null;
      }

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

      {/* Attorney & Referral Assignment */}
      <div className="flex gap-4">
        <div className="flex-1"><AssignedAttorneySection clientId={id} currentAttorneyId={client.assigned_attorney_id} /></div>
        <div className="flex-1"><ReferralPartnerSection clientId={id} currentPartnerId={client.referral_partner_id} /></div>
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
              <div className="flex gap-2">
                <button
                  onClick={() => setShowUploadCase(!showUploadCase)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Existing
                </button>
                <button
                  onClick={() => setShowNewCase(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  <Plus className="h-3.5 w-3.5" /> New Case
                </button>
              </div>
            </div>

            {showUploadCase && (
              <UploadExistingCase
                clientId={id}
                clientName={client.full_name}
                onComplete={() => { setShowUploadCase(false); fetchData(); }}
                onCancel={() => setShowUploadCase(false)}
              />
            )}

            {showNewCase && (
              <NewCaseForm
                clientId={id}
                clientName={client.full_name || ''}
                onComplete={() => { setShowNewCase(false); fetchData(); }}
                onCancel={() => setShowNewCase(false)}
              />
            )}

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
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                          {c._attorney_name && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3 text-blue-400" />
                              Attorney: <span className="font-medium text-slate-700">{c._attorney_name}</span>
                            </span>
                          )}
                          {c._referral_name && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3 text-purple-400" />
                              Referral: <span className="font-medium text-slate-700">{c._referral_name}</span>
                            </span>
                          )}
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
          {/* Communications */}
          <CommunicationsPanel
            clientId={id}
            clientEmail={client.email}
            clientPhone={client.phone}
            clientName={client.full_name}
            clientCases={clientCases}
          />

          {/* Credit Reports */}
          <CreditReportSection clientId={id} client={client} />

          {/* Documents */}
          <DocumentsSection
            documents={documents}
            clientCases={clientCases}
            onUploadComplete={refreshDocuments}
            onDelete={async (doc) => {
              if (!confirm(`Delete "${doc.file_name || 'this document'}"?`)) return;
              try {
                await deleteDocument(doc.case_id, doc.id);
                refreshDocuments();
              } catch (err) {
                alert('Delete failed: ' + err.message);
              }
            }}
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

// ---------------------------------------------------------------------------
// Upload Existing Case
// ---------------------------------------------------------------------------

const FEDERAL_COURTS = [
  'United States District Court, Northern District of Georgia, Atlanta Division',
  'United States District Court, Northern District of Georgia, Gainesville Division',
  'United States District Court, Northern District of Georgia, Newnan Division',
  'United States District Court, Northern District of Georgia, Rome Division',
  'United States District Court, Middle District of Georgia',
  'United States District Court, Southern District of Georgia',
  'United States District Court, Northern District of Alabama',
  'United States District Court, Middle District of Alabama',
  'United States District Court, Southern District of Alabama',
  'United States District Court, Northern District of Florida',
  'United States District Court, Middle District of Florida',
  'United States District Court, Southern District of Florida',
  'United States District Court, District of South Carolina',
  'United States District Court, Western District of North Carolina',
  'United States District Court, Eastern District of North Carolina',
  'United States District Court, Middle District of North Carolina',
  'United States District Court, Eastern District of Tennessee',
  'United States District Court, Middle District of Tennessee',
  'United States District Court, Western District of Tennessee',
  'United States District Court, Northern District of Texas',
  'United States District Court, Southern District of Texas',
  'United States District Court, Eastern District of Texas',
  'United States District Court, Western District of Texas',
  'United States District Court, District of New Jersey',
  'United States District Court, Eastern District of New York',
  'United States District Court, Southern District of New York',
  'United States District Court, Northern District of Illinois',
  'United States District Court, Central District of California',
  'United States District Court, Northern District of California',
  'United States District Court, Eastern District of Pennsylvania',
  'United States District Court, District of Maryland',
  'United States District Court, District of Columbia',
];

function NewCaseForm({ clientId, clientName, onComplete, onCancel }) {
  const [selectedDefendants, setSelectedDefendants] = useState([]);
  const [defendantSearch, setDefendantSearch] = useState('');
  const [allDefendants, setAllDefendants] = useState([]);
  const [courtSearch, setCourtSearch] = useState('');
  const [courtFocused, setCourtFocused] = useState(false);
  const [caseType, setCaseType] = useState('FCRA');
  const [caseFacts, setCaseFacts] = useState('');
  const [damages, setDamages] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDefendants().then(d => setAllDefendants(d || [])).catch(() => {});
  }, []);

  const filteredDefendants = allDefendants.filter(d =>
    !selectedDefendants.find(s => s.id === d.id) &&
    (!defendantSearch || (d.name || '').toLowerCase().includes(defendantSearch.toLowerCase()))
  );

  const filteredCourts = FEDERAL_COURTS.filter(c =>
    courtSearch.length >= 2 && c.toLowerCase().includes(courtSearch.toLowerCase())
  );

  function addDefendant(d) {
    setSelectedDefendants(prev => [...prev, d]);
    setDefendantSearch('');
  }

  function addCustomDefendant() {
    if (!defendantSearch.trim()) return;
    const custom = { id: 'custom_' + Date.now(), name: defendantSearch.trim(), custom: true };
    setSelectedDefendants(prev => [...prev, custom]);
    setDefendantSearch('');
  }

  function removeDefendant(id) {
    setSelectedDefendants(prev => prev.filter(d => d.id !== id));
  }

  async function handleSubmit() {
    if (selectedDefendants.length === 0) { setError('Add at least one defendant'); return; }
    setSaving(true);
    setError('');
    try {
      const defendants = normalizedDefendants(selectedDefendants);
      const defNames = defendants.map((defendant) => defendant.name).join(', ');
      const { data: createdCase, error: insertErr } = await supabase.from('cases').insert({
        client_id: clientId,
        plaintiff_name: clientName,
        defendant_name: defNames,
        case_number: caseCaption(clientName, defendants),
        case_type: caseType,
        court: courtSearch.trim() || null,
        case_facts: caseFactsWithParties(clientName, defendants, caseFacts),
        damages_description: damages.trim() || 'See case facts.',
        status: 'submitted',
      }).select('id').single();

      if (insertErr) throw insertErr;
      await linkCaseDefendants(createdCase.id, defendants);
      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to create case');
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">New Case for {clientName}</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>

      {/* Defendants */}
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Defendant(s) *</label>
        {selectedDefendants.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedDefendants.map(d => (
              <span key={d.id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-medium">
                {d.name}
                <button onClick={() => removeDefendant(d.id)} className="text-blue-400 hover:text-blue-600"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <input value={defendantSearch} onChange={e => setDefendantSearch(e.target.value)}
            placeholder="Search defendants or type a new one..."
            onKeyDown={e => { if (e.key === 'Enter' && defendantSearch.trim() && filteredDefendants.length === 0) { e.preventDefault(); addCustomDefendant(); } }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          {defendantSearch && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredDefendants.slice(0, 8).map(d => (
                <button key={d.id} onClick={() => addDefendant(d)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-800">{d.name}</span>
                    {d.registered_address && <span className="text-slate-400 ml-2">{d.registered_address}</span>}
                  </div>
                  <Plus className="w-3 h-3 text-slate-400" />
                </button>
              ))}
              {defendantSearch.trim() && !filteredDefendants.find(d => d.name.toLowerCase() === defendantSearch.toLowerCase()) && (
                <button onClick={addCustomDefendant}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 text-emerald-700 font-medium border-t border-slate-100">
                  <Plus className="w-3 h-3 inline mr-1" /> Add "{defendantSearch.trim()}"
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Case Type */}
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Case Type</label>
        <div className="flex gap-1">
          {['FCRA', 'FDCPA', 'TCPA'].map(t => (
            <button key={t} onClick={() => setCaseType(caseType === t ? '' : t)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                caseType === t
                  ? t === 'FCRA' ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : t === 'FDCPA' ? 'bg-purple-100 text-purple-700 border-purple-300'
                    : 'bg-green-100 text-green-700 border-green-300'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Court */}
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Court</label>
        <div className="relative">
          <input value={courtSearch}
            onChange={e => setCourtSearch(e.target.value)}
            onFocus={() => setCourtFocused(true)}
            onBlur={() => setTimeout(() => setCourtFocused(false), 200)}
            placeholder="Start typing court name..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          {courtFocused && filteredCourts.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredCourts.map(c => (
                <button key={c} onClick={() => { setCourtSearch(c); setCourtFocused(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 text-slate-700">
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Case Facts */}
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Case Facts</label>
        <textarea value={caseFacts} onChange={e => setCaseFacts(e.target.value)}
          rows={4} placeholder="Describe what happened..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y" />
      </div>

      {/* Damages */}
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Damages Description</label>
        <textarea value={damages} onChange={e => setDamages(e.target.value)}
          rows={2} placeholder="Describe damages suffered..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y" />
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertCircle className="w-3 h-3 inline mr-1" /> {error}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-600">Cancel</button>
        <button onClick={handleSubmit} disabled={saving}
          className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Create Case
        </button>
      </div>
    </div>
  );
}

function UploadExistingCase({ clientId, clientName, onComplete, onCancel }) {
  const [description, setDescription] = useState('');
  const [defendants, setDefendants] = useState('');
  const [caseType, setCaseType] = useState('FCRA');
  const [files, setFiles] = useState([]);
  const [complaintFile, setComplaintFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!description && !complaintFile) {
      setError('Add a case description or upload a complaint document.');
      return;
    }
    setUploading(true);
    setError('');

    try {
      const defendantEntries = normalizedDefendants(defendants.split(','));
      if (!defendantEntries.length) {
        setError('Add at least one defendant before uploading the complaint.');
        return;
      }
      const defendantNames = defendantEntries.map((defendant) => defendant.name).join(', ');
      const { data: createdCase, error: caseError } = await supabase.from('cases').insert({
        client_id: clientId,
        plaintiff_name: clientName,
        defendant_name: defendantNames,
        case_number: caseCaption(clientName, defendantEntries),
        case_type: caseType,
        case_facts: caseFactsWithParties(clientName, defendantEntries, description),
        damages_description: description.trim() || 'See uploaded complaint.',
        status: 'submitted',
      }).select('id').single();
      if (caseError) throw caseError;
      await linkCaseDefendants(createdCase.id, defendantEntries);

      const caseId = createdCase.id;
      if (caseId) {
        // Upload complaint document
        if (complaintFile) {
          await uploadDocument(caseId, complaintFile, 'complaint');

          // Also try to extract text and save as complaint version
          if (complaintFile.name.endsWith('.docx') || complaintFile.name.endsWith('.txt')) {
            try {
              const text = complaintFile.name.endsWith('.txt')
                ? await complaintFile.text()
                : null; // docx extraction handled server-side
              if (text) {
                const { supabase } = await import('../../lib/supabase');
                await supabase.table('complaints').insert({
                  case_id: caseId,
                  complaint_text: text,
                  version: 1,
                  is_current: true,
                }).execute();
              }
            } catch {}
          }
        }

        // Upload supporting documents
        for (const file of files) {
          try {
            await uploadDocument(caseId, file, 'other');
          } catch {}
        }
      }

      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to create case');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-blue-800">Upload Existing Case</h3>
        <button onClick={onCancel} className="text-blue-400 hover:text-blue-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Case Type</label>
          <select value={caseType} onChange={e => setCaseType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="FCRA">FCRA</option>
            <option value="FDCPA">FDCPA</option>
            <option value="TCPA">TCPA</option>
            <option value="FCRA + FDCPA">FCRA + FDCPA</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Defendants (comma-separated)</label>
          <input value={defendants} onChange={e => setDefendants(e.target.value)}
            placeholder="e.g. Equifax, Experian"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Case Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Brief description of the case..."
          rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-y" />
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Complaint Document (.docx, .pdf, .txt)</label>
        <input type="file" accept=".pdf,.docx,.txt"
          onChange={e => setComplaintFile(e.target.files[0])}
          className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-sm file:font-medium file:bg-white file:text-slate-700" />
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Supporting Documents (optional)</label>
        <input type="file" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
          onChange={e => setFiles(Array.from(e.target.files || []))}
          className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-sm file:font-medium file:bg-white file:text-slate-700" />
        {files.length > 0 && (
          <div className="text-[10px] text-slate-500 mt-1">{files.length} file{files.length !== 1 ? 's' : ''} selected</div>
        )}
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={uploading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {uploading ? 'Creating Case...' : 'Create Case & Upload'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Referral Partner Section
// ---------------------------------------------------------------------------

function ReferralPartnerSection({ clientId, currentPartnerId }) {
  const [partners, setPartners] = useState([]);
  const [selectedId, setSelectedId] = useState(currentPartnerId || '');

  useEffect(() => {
    getReferralPartners().then(data => setPartners(data || [])).catch(() => {});
  }, []);

  useEffect(() => { setSelectedId(currentPartnerId || ''); }, [currentPartnerId]);

  async function handleAssign(partnerId) {
    try {
      await assignReferral({ client_id: clientId, partner_id: partnerId });
      setSelectedId(partnerId);
    } catch (err) { console.error(err); }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <User className="h-4 w-4 text-slate-400" />
          Referred By
        </h3>
        <select value={selectedId} onChange={(e) => handleAssign(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">— None —</option>
          {partners.map(p => (
            <option key={p.id} value={p.id}>{p.full_name}{p.company ? ` (${p.company})` : ''}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assigned Attorney Section
// ---------------------------------------------------------------------------

function AssignedAttorneySection({ clientId, currentAttorneyId }) {
  const [attorneys, setAttorneys] = useState([]);
  const [selectedId, setSelectedId] = useState(currentAttorneyId || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAttorneys();
  }, []);

  useEffect(() => {
    setSelectedId(currentAttorneyId || '');
  }, [currentAttorneyId]);

  async function loadAttorneys() {
    try {
      const data = await getStaffAttorneys();
      setAttorneys(data || []);
    } catch {}
  }

  async function handleAssign(attorneyId) {
    setSaving(true);
    try {
      await assignAttorneyToClient(clientId, attorneyId);
      setSelectedId(attorneyId);
    } catch (err) {
      console.error('Assignment failed:', err);
    } finally {
      setSaving(false);
    }
  }

  if (attorneys.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Briefcase className="h-4 w-4 text-slate-400" />
          Assigned Attorney
        </h3>
        <select
          value={selectedId}
          onChange={(e) => handleAssign(e.target.value)}
          disabled={saving}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Not Assigned —</option>
          {attorneys.map(a => (
            <option key={a.id} value={a.id}>{a.full_name}{a.bar_number ? ` (Bar #${a.bar_number})` : ''}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Credit Report Section
// ---------------------------------------------------------------------------

function CreditReportSection({ clientId, client }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [showPullForm, setShowPullForm] = useState(false);
  const [pullForm, setPullForm] = useState({
    ssn: '', dob: '', address: '', city: '', state: '', zip_code: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [clientId]);

  async function loadData() {
    setLoading(true);
    try {
      const [configResp, reportsResp] = await Promise.allSettled([
        getCreditReportConfig(),
        getClientCreditReports(clientId),
      ]);
      if (configResp.status === 'fulfilled') setConfigured(configResp.value?.experian);
      if (reportsResp.status === 'fulfilled') setReports(reportsResp.value || []);
    } catch {} finally { setLoading(false); }
  }

  async function handlePull() {
    if (!pullForm.ssn || !pullForm.dob) {
      setError('SSN and date of birth are required');
      return;
    }
    setPulling(true);
    setError('');
    try {
      const result = await pullCreditReport({
        client_id: clientId,
        first_name: (client.full_name || '').split(' ')[0],
        last_name: (client.full_name || '').split(' ').slice(-1)[0],
        middle_name: (client.full_name || '').split(' ').length > 2 ? (client.full_name || '').split(' ')[1] : '',
        ssn: pullForm.ssn,
        dob: pullForm.dob,
        address: pullForm.address || client.address || '',
        city: pullForm.city || client.county || '',
        state: pullForm.state || client.state || '',
        zip_code: pullForm.zip_code || '',
      });
      setReports(prev => [result, ...prev]);
      setShowPullForm(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Credit pull failed');
    } finally {
      setPulling(false);
    }
  }

  const latestScores = {};
  for (const r of reports) {
    if (r.scores && !latestScores[r.bureau]) {
      latestScores[r.bureau] = r.scores;
    }
  }

  function getScoreColor(score) {
    if (score >= 740) return 'text-emerald-600';
    if (score >= 670) return 'text-blue-600';
    if (score >= 580) return 'text-amber-600';
    return 'text-red-600';
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Shield className="h-5 w-5 text-slate-400" />
          Credit Reports
        </h2>
        {configured && (
          <button onClick={() => setShowPullForm(!showPullForm)}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-3 w-3" /> Pull Experian
          </button>
        )}
      </div>

      {/* Score Display */}
      {Object.keys(latestScores).length > 0 && (
        <div className="mb-3 grid grid-cols-1 gap-2">
          {Object.entries(latestScores).map(([bureau, scores]) => {
            const firstModel = Object.values(scores)[0];
            const score = firstModel?.score;
            if (!score) return null;
            return (
              <div key={bureau} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">{bureau}</div>
                  <div className="text-[10px] text-slate-400">
                    {reports.find(r => r.bureau === bureau)?.pulled_at
                      ? `Pulled ${formatDate(reports.find(r => r.bureau === bureau)?.pulled_at)}`
                      : ''}
                  </div>
                </div>
                <div className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pull Form */}
      {showPullForm && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
          <div className="text-xs font-bold text-blue-800">Pull Experian Credit Report</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600">SSN *</label>
              <input type="password" value={pullForm.ssn} onChange={e => setPullForm(p => ({ ...p, ssn: e.target.value }))}
                placeholder="123456789" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600">DOB *</label>
              <input value={pullForm.dob} onChange={e => setPullForm(p => ({ ...p, dob: e.target.value }))}
                placeholder="MM/DD/YYYY" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600">Address</label>
              <input value={pullForm.address || client.address || ''} onChange={e => setPullForm(p => ({ ...p, address: e.target.value }))}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600">City</label>
              <input value={pullForm.city || client.county || ''} onChange={e => setPullForm(p => ({ ...p, city: e.target.value }))}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600">State</label>
              <input value={pullForm.state || client.state || ''} onChange={e => setPullForm(p => ({ ...p, state: e.target.value }))}
                maxLength={2} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600">Zip</label>
              <input value={pullForm.zip_code} onChange={e => setPullForm(p => ({ ...p, zip_code: e.target.value }))}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
            </div>
          </div>
          {error && <div className="text-xs text-red-600"><AlertCircle className="w-3 h-3 inline mr-1" />{error}</div>}
          <div className="flex gap-2">
            <button onClick={handlePull} disabled={pulling}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
              {pulling ? <><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Pulling...</> : 'Pull Report'}
            </button>
            <button onClick={() => setShowPullForm(false)} className="px-3 py-1.5 text-xs text-slate-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Report History */}
      {loading ? (
        <div className="py-4 text-center text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /></div>
      ) : reports.length === 0 ? (
        <div className="py-6 text-center">
          <Shield className="mx-auto h-8 w-8 text-slate-300 mb-2" />
          <p className="text-xs text-slate-500">No credit reports on file</p>
          {configured && (
            <button onClick={() => setShowPullForm(true)} className="mt-2 text-xs text-blue-600 font-medium">Pull first report →</button>
          )}
          {!configured && (
            <p className="text-[10px] text-slate-400 mt-1">Add EXPERIAN_CLIENT_ID to Railway to enable</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <div key={r.id} className="rounded-lg border border-slate-200 p-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold capitalize text-slate-700">{r.bureau}</span>
                  <span className="text-[10px] text-slate-400 ml-2">{formatDateTime(r.pulled_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.accounts && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
                      {Array.isArray(r.accounts) ? r.accounts.length : 0} negative
                    </span>
                  )}
                </div>
              </div>
              {r.scores && Object.entries(r.scores).map(([model, data]) => (
                <div key={model} className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-500">{model}:</span>
                  <span className={`text-sm font-bold ${getScoreColor(data.score)}`}>{data.score}</span>
                  {data.factors && data.factors.length > 0 && (
                    <span className="text-[10px] text-slate-400 truncate">{data.factors[0]?.description}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Section
// ---------------------------------------------------------------------------

function DocumentsSection({ documents, clientCases, onUploadComplete, onDelete }) {
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
    // Refresh just the documents without resetting the whole page
    if (onUploadComplete) onUploadComplete();
    // Reset file input so the same file can be uploaded again
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const documentCategoryLabel = (doc) => {
    const category = String(doc.document_category || doc.category || doc.type || 'File').toLowerCase();
    if (category === 'signed_contract' || category === 'signed_engagement_agreement') return 'Signed Contract';
    if (category === 'signed_closing_statement') return 'Signed Closing Statement';
    return category.replace(/_/g, ' ');
  };

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
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50">
              <SecureDocumentLink
                caseId={doc.case_id}
                document={doc}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700">
                    {doc.file_name || doc.name || doc.filename || 'Document'}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {doc.case_name || 'Case'} · {documentCategoryLabel(doc)}
                  </span>
                </span>
              </SecureDocumentLink>
              <button
                onClick={() => onDelete && onDelete(doc)}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                title="Delete document"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">No documents uploaded.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Communications Panel — Email + SMS
// ---------------------------------------------------------------------------

function CommunicationsPanel({ clientId, clientEmail, clientPhone, clientName, clientCases }) {
  const [tab, setTab] = useState('email');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  // Email fields
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // SMS fields
  const [smsBody, setSmsBody] = useState('');

  // Selected case (optional)
  const [selectedCase, setSelectedCase] = useState('');

  useEffect(() => {
    loadHistory();
  }, [clientId]);

  async function loadHistory() {
    try {
      setLoading(true);
      const data = await getCommsHistory(clientId);
      setHistory(data || []);
    } catch (err) {
      console.error('Failed to load comms history:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const result = await sendClientEmail({
        client_id: clientId,
        to_email: clientEmail,
        subject: emailSubject,
        body: emailBody,
        case_id: selectedCase || null,
      });
      if (result.status === 'sent') {
        setSent(true);
        setEmailSubject('');
        setEmailBody('');
        await loadHistory();
      } else {
        setError(result.error || 'Failed to send email');
      }
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  }

  async function handleSendSMS() {
    if (!smsBody.trim()) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const result = await sendClientSMS({
        client_id: clientId,
        to_phone: clientPhone,
        body: smsBody,
        case_id: selectedCase || null,
      });
      if (result.status === 'sent') {
        setSent(true);
        setSmsBody('');
        await loadHistory();
      } else {
        setError(result.error || 'Failed to send SMS');
      }
    } catch (err) {
      setError(err.message || 'Failed to send SMS');
    } finally {
      setSending(false);
    }
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  const emailHistory = history.filter((h) => h.channel === 'email');
  const smsHistory = history.filter((h) => h.channel === 'sms');
  const currentHistory = tab === 'email' ? emailHistory : smsHistory;

  return (
    <div className="card">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 mb-3">
        <MessageSquare className="h-5 w-5 text-slate-400" />
        Communications
      </h3>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1">
        <button
          onClick={() => { setTab('email'); setSent(false); setError(null); }}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
            tab === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
          }`}
        >
          <Mail className="w-3 h-3 inline mr-1" />
          Email {emailHistory.length > 0 ? `(${emailHistory.length})` : ''}
        </button>
        <button
          onClick={() => { setTab('sms'); setSent(false); setError(null); }}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
            tab === 'sms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
          }`}
        >
          <Phone className="w-3 h-3 inline mr-1" />
          Text {smsHistory.length > 0 ? `(${smsHistory.length})` : ''}
        </button>
      </div>

      {/* Case selector */}
      {clientCases.length > 0 && (
        <select
          value={selectedCase}
          onChange={(e) => setSelectedCase(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">General (no case)</option>
          {clientCases.map((c) => (
            <option key={c.id} value={c.id}>Re: {c.plaintiff_name || 'Case'} — {c.status}</option>
          ))}
        </select>
      )}

      {/* Compose */}
      {tab === 'email' ? (
        <div className="space-y-2">
          <div className="text-xs text-slate-500">
            To: <span className="font-medium text-slate-700">{clientEmail || 'No email on file'}</span>
          </div>
          <input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            placeholder={`Hi ${(clientName || '').split(' ')[0] || 'there'},\n\n`}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
          <button
            onClick={handleSendEmail}
            disabled={sending || !emailSubject.trim() || !emailBody.trim() || !clientEmail}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-slate-500">
            To: <span className="font-medium text-slate-700">{clientPhone || 'No phone on file'}</span>
          </div>
          <textarea
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            placeholder="Type your message..."
            rows={3}
            maxLength={1600}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">{smsBody.length}/1600</span>
            <button
              onClick={handleSendSMS}
              disabled={sending || !smsBody.trim() || !clientPhone}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending...' : 'Send Text'}
            </button>
          </div>
        </div>
      )}

      {/* Status messages */}
      {sent && (
        <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5" /> Sent successfully
        </div>
      )}
      {error && (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* History */}
      {currentHistory.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            History
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {currentHistory.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-slate-500">
                    {item.direction === 'outbound' ? '→ Sent' : '← Received'}
                    {item.subject ? `: ${item.subject}` : ''}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    item.status === 'sent' || item.status === 'delivered'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-xs text-slate-700 line-clamp-2">{item.body}</p>
                <p className="text-[10px] text-slate-400 mt-1">{formatTime(item.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
