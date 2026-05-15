import React, { useState, useEffect } from 'react';
import {
  PenLine, Send, Download, Clock, CheckCircle2, XCircle,
  AlertCircle, Loader2, RefreshCw, Eye, Bell, FileText,
  ChevronDown, X, Search, User,
} from 'lucide-react';
import {
  getEsignConfig, getEsignTemplates, sendSignatureRequest,
  getSignatureRequests, getSignatureRequest, remindSigner,
  cancelSignatureRequest, downloadSignedDocument,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';

const STATUS_MAP = {
  awaiting_signature: { label: 'Awaiting Signature', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
  viewed: { label: 'Viewed', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: Eye },
  signed: { label: 'Signed', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  complete: { label: 'Complete', color: 'text-emerald-700 bg-emerald-100 border-emerald-300', icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'text-slate-500 bg-slate-50 border-slate-200', icon: XCircle },
};

export default function ESignatures() {
  const [configured, setConfigured] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [configResp, reqsResp] = await Promise.all([
        getEsignConfig(),
        getSignatureRequests(),
      ]);
      setConfigured(configResp.configured);
      setRequests(reqsResp);
    } catch (err) {
      console.error('Failed to load e-sign data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const t = await getEsignTemplates();
      setTemplates(t);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function viewDetail(id) {
    setShowDetailModal(id);
    setDetailData(null);
    try {
      const data = await getSignatureRequest(id);
      setDetailData(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDownload(id) {
    try {
      const blob = await downloadSignedDocument(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signed-${id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  }

  const filteredRequests = requests.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        (r.signer_name || '').toLowerCase().includes(term) ||
        (r.title || '').toLowerCase().includes(term) ||
        (r.signer_email || '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const counts = {
    all: requests.length,
    awaiting_signature: requests.filter(r => r.status === 'awaiting_signature' || r.status === 'viewed').length,
    signed: requests.filter(r => r.status === 'signed' || r.status === 'complete').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">E-Signatures</h1>
          <p className="text-sm text-slate-500 mt-1">Send documents for signing via Dropbox Sign</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => { setShowSendModal(true); loadTemplates(); }}
            disabled={!configured}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            <Send className="w-4 h-4" /> Send for Signature
          </button>
        </div>
      </div>

      {!configured && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 inline mr-2" />
          <strong>Dropbox Sign not configured.</strong> Add your <code className="bg-amber-100 px-1 rounded">DROPBOX_SIGN_API_KEY</code> environment variable in Railway to enable e-signatures.
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {[
            { key: 'all', label: 'All' },
            { key: 'awaiting_signature', label: 'Pending' },
            { key: 'signed', label: 'Signed' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {f.label} ({counts[f.key] || 0})
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, title, or email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Request list */}
      {filteredRequests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <PenLine className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {requests.length === 0 ? 'No signature requests yet' : 'No matching requests'}
          </p>
          {requests.length === 0 && configured && (
            <button onClick={() => { setShowSendModal(true); loadTemplates(); }}
              className="mt-3 text-sm text-blue-600 font-medium hover:text-blue-700">
              Send your first document →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRequests.map(req => {
            const st = STATUS_MAP[req.status] || STATUS_MAP.awaiting_signature;
            const Icon = st.icon;
            return (
              <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-slate-300 transition">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg border ${st.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">{req.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{req.signer_name}</span>
                      <span>{req.signer_email}</span>
                      <span>{req.document_type}</span>
                      {req.sent_at && <span>{new Date(req.sent_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => viewDetail(req.id)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg" title="View details">
                      <Eye className="w-4 h-4" />
                    </button>
                    {(req.status === 'awaiting_signature' || req.status === 'viewed') && (
                      <ReminderBtn id={req.id} />
                    )}
                    {(req.status === 'signed' || req.status === 'complete') && (
                      <button onClick={() => handleDownload(req.id)}
                        className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg" title="Download signed PDF">
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <SendSignatureModal
          templates={templates}
          loadingTemplates={loadingTemplates}
          onClose={() => setShowSendModal(false)}
          onSent={() => { setShowSendModal(false); loadData(); }}
        />
      )}

      {/* Detail Modal */}
      {showDetailModal && (
        <DetailModal
          requestId={showDetailModal}
          data={detailData}
          onClose={() => { setShowDetailModal(null); setDetailData(null); }}
          onCancel={async () => {
            try {
              await cancelSignatureRequest(showDetailModal);
              setShowDetailModal(null);
              loadData();
            } catch (err) { alert('Cancel failed: ' + err.message); }
          }}
          onDownload={() => handleDownload(showDetailModal)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reminder Button
// ---------------------------------------------------------------------------

function ReminderBtn({ id }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleRemind() {
    setSending(true);
    try {
      await remindSigner(id);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      alert('Reminder failed: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <button onClick={handleRemind} disabled={sending || sent}
      className={`p-2 rounded-lg ${sent ? 'text-emerald-500 bg-emerald-50' : 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'}`}
      title={sent ? 'Reminder sent!' : 'Send reminder'}>
      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle2 className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Send Signature Modal
// ---------------------------------------------------------------------------

function SendSignatureModal({ templates, loadingTemplates, onClose, onSent }) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Please sign this document');
  const [message, setMessage] = useState('Please review and sign the attached document at your earliest convenience.');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [docType, setDocType] = useState('w9');
  const [caseId, setCaseId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Client picker
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setLoadingClients(true);
    try {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('full_name');
      setClients(data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingClients(false); }
  }

  function pickClient(client) {
    setSignerName(client.full_name || '');
    setSignerEmail(client.email || '');
  }

  async function handleSend() {
    if (!selectedTemplate) { setError('Select a template'); return; }
    if (!signerName || !signerEmail) { setError('Signer name and email required'); return; }

    setSending(true);
    setError('');
    try {
      await sendSignatureRequest({
        template_id: selectedTemplate,
        title: title || `${DOC_TYPES.find(d => d.value === docType)?.label || 'Document'} — ${signerName}`,
        subject,
        message,
        signer_name: signerName,
        signer_email: signerEmail,
        document_type: docType,
        case_id: caseId || null,
      });
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const DOC_TYPES = [
    { value: 'w9', label: 'W-9' },
    { value: 'engagement_letter', label: 'Engagement Letter' },
    { value: 'retainer', label: 'Retainer Agreement' },
    { value: 'authorization', label: 'Authorization Form' },
    { value: 'hipaa', label: 'HIPAA Release' },
    { value: 'settlement', label: 'Settlement Agreement' },
    { value: 'affidavit', label: 'Affidavit' },
    { value: 'general', label: 'General Document' },
  ];

  const filteredClients = clients.filter(c =>
    !clientSearch || (c.full_name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900">Send for Signature</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Template selector */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Template *</label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3 border border-amber-200">
                No templates found. Create templates in your Dropbox Sign dashboard first.
              </div>
            ) : (
              <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            )}
          </div>

          {/* Document type */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Document Type</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          {/* Client picker */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Select Client</label>
            <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {clientSearch && filteredClients.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg">
                {filteredClients.slice(0, 8).map(c => (
                  <button key={c.id} onClick={() => { pickClient(c); setClientSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium">{c.full_name}</span>
                    <span className="text-slate-400 text-xs">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Signer details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Signer Name *</label>
              <input value={signerName} onChange={(e) => setSignerName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Signer Email *</label>
              <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Title / Subject / Message */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-generated if empty"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Email Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Email Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 inline mr-1" /> {error}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button onClick={handleSend} disabled={sending || !selectedTemplate || !signerName || !signerEmail}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Modal
// ---------------------------------------------------------------------------

function DetailModal({ requestId, data, onClose, onCancel, onDownload }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Signature Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {!data ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Title</div>
                <div className="text-sm font-medium text-slate-900">{data.title}</div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Status</div>
                <div className="flex items-center gap-2">
                  {data.is_complete ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Complete
                    </span>
                  ) : data.has_error ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                      <XCircle className="w-3 h-3" /> Error
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3 h-3" /> Pending
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Signers</div>
                <div className="space-y-2">
                  {(data.signatures || []).map((s, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <User className="w-4 h-4 text-slate-400" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{s.signer_name}</div>
                        <div className="text-xs text-slate-500">{s.signer_email}</div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        s.status === 'signed' ? 'bg-emerald-100 text-emerald-700' :
                        s.status === 'declined' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {s.status === 'signed' ? 'Signed' : s.status === 'declined' ? 'Declined' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {data.created_at && (
                <div className="text-xs text-slate-400">
                  Sent: {new Date(data.created_at * 1000).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex justify-between">
          <div>
            {data && !data.is_complete && !data.has_error && (
              <button onClick={onCancel}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                Cancel Request
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {data?.is_complete && (
              <button onClick={onDownload}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Download PDF
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
