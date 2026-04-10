import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCase, getDocuments, downloadComplaint, downloadMemo } from '../../lib/api';
import { getCurrentUser } from '../../lib/supabase';
import MessageThread from '../../components/MessageThread';
import ProgressBar from '../../components/ProgressBar';
import { ArrowLeft, FileText, Download, MessageSquare, Clock, User } from 'lucide-react';

const STATUS_MESSAGES = {
  submitted: "We've received your case and are reviewing it. We'll be in touch soon.",
  approved_for_processing: "Your case has been approved and our team is beginning work on it.",
  agents_processing: "Your case is actively being processed. This may take a few minutes.",
  draft_ready: "A draft complaint has been prepared and is being reviewed by your attorney.",
  attorney_review: "Your attorney is reviewing the complaint draft.",
  approved: "Your complaint has been approved and is ready.",
  filed: "Your complaint has been filed with the court.",
  closed: "This case has been closed.",
};

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      const [caseRes, docsRes, user] = await Promise.all([
        getCase(id),
        getDocuments(id),
        getCurrentUser(),
      ]);
      setCaseData(caseRes);
      setDocuments(docsRes || []);
      setCurrentUserId(user?.id);
    } catch (err) {
      console.error('Failed to load case:', err);
    } finally {
      setLoading(false);
    }
  }

  function getDefendantNames() {
    if (caseData?.defendants?.length > 0) {
      return caseData.defendants.map(d => d.name).join(', ');
    }
    return 'Pending';
  }

  function canDownloadComplaint() {
    return ['approved', 'filed', 'closed'].includes(caseData?.status);
  }

  async function handleDownloadComplaint() {
    try {
      const url = await downloadComplaint(id);
      if (url) window.open(url, '_blank');
    } catch (err) {
      console.error('Download failed:', err);
    }
  }

  async function handleDownloadMemo() {
    try {
      const url = await downloadMemo(id);
      if (url) window.open(url, '_blank');
    } catch (err) {
      console.error('Download failed:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Case not found.</p>
        <button onClick={() => navigate('/client/dashboard')} className="text-blue-600 hover:text-blue-700 mt-2">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <button
        onClick={() => navigate('/client/dashboard')}
        className="flex items-center gap-1 text-slate-500 hover:text-slate-700 mb-4 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Case against {getDefendantNames()}
        </h1>
        <p className="text-slate-500 mt-1">
          Submitted {new Date(caseData.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Case Progress</h2>
        <ProgressBar currentStatus={caseData.status} variant="client" />
      </div>

      {/* Status Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Current Status</p>
            <p className="text-sm text-blue-700 mt-1">
              {STATUS_MESSAGES[caseData.status] || "Your case is being processed."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Documents Ready for Download */}
          {canDownloadComplaint() && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <h2 className="font-semibold text-green-900 mb-3">Documents Ready for You</h2>
              <div className="space-y-2">
                <button
                  onClick={handleDownloadComplaint}
                  className="w-full flex items-center gap-3 bg-white border border-green-300 rounded-lg p-3 hover:bg-green-50 transition"
                >
                  <Download className="w-5 h-5 text-green-600" />
                  <div className="text-left">
                    <div className="font-medium text-slate-900">Complaint Document</div>
                    <div className="text-xs text-slate-500">Word document (.docx)</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Your Uploaded Documents */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Your Uploaded Documents</h2>
            {documents.length === 0 ? (
              <p className="text-sm text-slate-500">No documents uploaded.</p>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{doc.file_name}</div>
                      <div className="text-xs text-slate-500">{doc.document_category?.replace('_', ' ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message Thread */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" /> Messages
            </h2>
            <MessageThread caseId={id} currentUserId={currentUserId} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <User className="w-5 h-5" /> Your Attorney
            </h2>
            <p className="text-sm text-slate-600">
              Your attorney will contact you at:
            </p>
            <p className="text-sm font-medium text-slate-900 mt-2">{caseData.client_email || 'your registered email'}</p>
            {caseData.client_phone && (
              <p className="text-sm font-medium text-slate-900">{caseData.client_phone}</p>
            )}
          </div>

          {/* Case Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Case Information</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Case ID</dt>
                <dd className="font-mono text-xs text-slate-700 mt-0.5">{caseData.id?.slice(0, 8)}...</dd>
              </div>
              <div>
                <dt className="text-slate-500">Submitted</dt>
                <dd className="text-slate-700 mt-0.5">{new Date(caseData.created_at).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Defendants</dt>
                <dd className="text-slate-700 mt-0.5">{getDefendantNames()}</dd>
              </div>
              {caseData.court && (
                <div>
                  <dt className="text-slate-500">Court</dt>
                  <dd className="text-slate-700 mt-0.5">{caseData.court}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Denial Reason */}
          {caseData.status === 'closed' && caseData.denial_reason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <h2 className="font-semibold text-red-900 mb-2">Case Closed</h2>
              <p className="text-sm text-red-700">{caseData.denial_reason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
