import { supabase } from './supabase';

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

/**
 * Get the current session's access token for Authorization headers.
 */
async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function apiErrorMessage(errorBody, fallback) {
  const detail = errorBody?.detail ?? errorBody;
  if (typeof detail === 'string' && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        const field = Array.isArray(item.loc)
          ? item.loc.filter((part) => part !== 'body').join(' ')
          : '';
        const message = typeof item.msg === 'string' ? item.msg : '';
        return field && message ? `${field}: ${message}` : message;
      })
      .filter(Boolean);
    if (messages.length) return messages.join(' ');
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string' && detail.message.trim()) return detail.message;
    if (typeof detail.error === 'string' && detail.error.trim()) return detail.error;
  }

  return fallback;
}

/**
 * Core fetch wrapper that adds Authorization header and handles JSON.
 */
export async function request(path, options = {}) {
  const token = await getAccessToken();

  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only set Content-Type to JSON when we have a body that is not FormData
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { detail: response.statusText };
    }
    const error = new Error(apiErrorMessage(errorBody, `Request failed: ${response.status}`));
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/octet-stream')) {
    return response.blob();
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export async function getCases(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, value);
    }
  });
  const qs = params.toString();
  return request(`/cases${qs ? `?${qs}` : ''}`);
}

export async function getCase(id) {
  return request(`/cases/${id}`);
}

export async function submitCase(data) {
  return request('/cases/submit', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteCase(id) {
  return request(`/cases/${id}`, { method: 'DELETE' });
}

export async function deleteClient(id) {
  return request(`/cases/clients/${id}`, { method: 'DELETE' });
}

export async function updateCaseStatus(id, newStatus) {
  return request(`/cases/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus }),
  });
}

export async function approveForProcessing(id) {
  return request(`/cases/${id}/approve-for-processing`, {
    method: 'POST',
  });
}

export async function approveComplaint(id) {
  return request(`/cases/${id}/approve-complaint`, {
    method: 'POST',
  });
}

export async function requestRevision(id, notes) {
  return request(`/cases/${id}/request-revision`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function denyCase(id, reason) {
  return request(`/cases/${id}/deny`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function getPipelineStatus(id) {
  return request(`/cases/${id}/pipeline-status`);
}

export async function rerunAgent(id, agentName) {
  return request(`/cases/${id}/rerun-agent/${agentName}`, {
    method: 'POST',
  });
}

export async function downloadComplaint(id) {
  return request(`/cases/${id}/download/complaint`);
}

export async function downloadMemo(id) {
  return request(`/cases/${id}/download/memo`);
}

// ---------------------------------------------------------------------------
// Defendants
// ---------------------------------------------------------------------------

export async function getDefendants() {
  return request('/defendants');
}

// ---------------------------------------------------------------------------
// Attorneys
// ---------------------------------------------------------------------------

export async function getAttorneys() {
  return request('/attorneys');
}

export async function createAttorney(data) {
  return request('/attorneys', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAttorney(id, data) {
  return request(`/attorneys/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteAttorneyRecord(id) {
  return request(`/attorneys/${id}`, { method: 'DELETE' });
}

export async function createDefendant(data) {
  return request('/defendants', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDefendant(id, data) {
  return request(`/defendants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteDefendant(id) {
  return request(`/defendants/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocument(caseId, file, category, parentDocumentId = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_category', category);
  if (parentDocumentId) formData.append('parent_document_id', parentDocumentId);

  return request(`/cases/${caseId}/documents`, {
    method: 'POST',
    body: formData,
  });
}

export async function getDocuments(caseId) {
  return request(`/cases/${caseId}/documents`);
}

export async function getDocumentAccessUrl(caseId, docId) {
  return request(`/cases/${caseId}/documents/${docId}/access`);
}

export async function attachExistingDocumentAsComplaintExhibit(caseId, complaintId, documentId) {
  return request(`/cases/${caseId}/complaints/${complaintId}/exhibits/${documentId}`, {
    method: 'POST',
  });
}

export async function getUploadedComplaintWordDownload(caseId, docId) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/cases/${caseId}/documents/${docId}/word-download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let errorBody;
    try { errorBody = await response.json(); } catch { errorBody = { detail: response.statusText }; }
    throw new Error(apiErrorMessage(errorBody, `Word download failed: ${response.status}`));
  }
  return response.blob();
}

export async function deleteDocument(caseId, docId) {
  return request(`/cases/${caseId}/documents/${docId}`, { method: 'DELETE' });
}

export async function getDocumentRequests(caseId) {
  return request(`/cases/${caseId}/document-requests`);
}

export async function createDocumentRequest(caseId, data) {
  return request(`/cases/${caseId}/document-requests`, { method: 'POST', body: JSON.stringify(data) });
}

export async function uploadRequestedDocument(requestId, file) {
  const formData = new FormData();
  formData.append('file', file);
  return request(`/document-requests/${requestId}/upload`, { method: 'POST', body: formData });
}

export async function cancelDocumentRequest(requestId) {
  return request(`/document-requests/${requestId}/cancel`, { method: 'POST' });
}

export async function getSettlementPayoutLedgers() {
  return request('/settlement-payouts');
}

export async function createSettlementPayoutLedger(data) {
  return request('/settlement-payouts', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSettlementPayoutLedger(ledgerId, data) {
  return request(`/settlement-payouts/${ledgerId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function getSettlementPayouts(ledgerId) {
  return request(`/settlement-payouts/${ledgerId}/payments`);
}

export async function recordSettlementPayout(ledgerId, data) {
  return request(`/settlement-payouts/${ledgerId}/payments`, { method: 'POST', body: JSON.stringify(data) });
}

// ---------------------------------------------------------------------------
// Secure Client Payout Information
// ---------------------------------------------------------------------------

export async function getPayoutInformationRequests(caseId) {
  return request(`/cases/${caseId}/payout-information-requests`);
}

export async function getAllPayoutInformationRequests() {
  return request('/payout-information-requests');
}

export async function createPayoutInformationRequest(caseId, data = {}) {
  return request(`/cases/${caseId}/payout-information-requests`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getPayoutInformationRequest(requestId) {
  return request(`/payout-information-requests/${requestId}`);
}

export async function submitPayoutInformation(requestId, data) {
  return request(`/payout-information-requests/${requestId}/submit`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revealPayoutInformation(requestId) {
  return request(`/payout-information-requests/${requestId}/reveal`, { method: 'POST' });
}

export async function cancelPayoutInformationRequest(requestId) {
  return request(`/payout-information-requests/${requestId}/cancel`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Supporting Documents Library
// ---------------------------------------------------------------------------

export async function getSupportingDocuments() {
  return request('/supporting-documents');
}

export async function uploadSupportingDocument(file, description = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (description.trim()) formData.append('description', description.trim());
  return request('/supporting-documents', { method: 'POST', body: formData });
}

export async function deleteSupportingDocument(documentId) {
  return request(`/supporting-documents/${documentId}`, { method: 'DELETE' });
}

export async function getSupportingDocumentAccessUrl(documentId) {
  return request(`/supporting-documents/${documentId}/access`);
}

export async function getCaseSupportingDocuments(caseId) {
  return request(`/cases/${caseId}/supporting-documents`);
}

export async function attachSupportingDocumentsToCase(caseId, documentIds) {
  return request(`/cases/${caseId}/supporting-documents`, {
    method: 'POST',
    body: JSON.stringify(documentIds),
  });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function getMessages(caseId) {
  return request(`/cases/${caseId}/messages`);
}

export async function sendMessage(caseId, body) {
  return request(`/cases/${caseId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function getNotifications(unreadOnly = false) {
  const params = unreadOnly ? '?unread_only=true' : '';
  return request(`/notifications${params}`);
}

export async function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

// ---------------------------------------------------------------------------
// Conversations (Interactive Agents)
// ---------------------------------------------------------------------------

export async function getAgentTypes() {
  return request('/conversations/agent-types');
}

export async function getConversations(caseId = null) {
  const params = caseId ? `?case_id=${caseId}` : '';
  return request(`/conversations${params}`);
}

export async function getConversation(id) {
  return request(`/conversations/${id}`);
}

export async function createConversation(agentType, caseId = null, title = null) {
  return request('/conversations', {
    method: 'POST',
    body: JSON.stringify({ agent_type: agentType, case_id: caseId, title }),
  });
}

export async function sendAgentMessage(conversationId, message) {
  return request(`/conversations/${conversationId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function streamAgentMessage(conversationId, message, onToken) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/conversations/${conversationId}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Stream failed' }));
    throw new Error(err.detail || 'Stream failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try { fullText += JSON.parse(data); } catch { fullText += data; }
        onToken(fullText);
      }
    }
  }

  return fullText;
}

export async function archiveConversation(id) {
  return request(`/conversations/${id}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Draft (attorney complaint drafting tool)
// ---------------------------------------------------------------------------

/**
 * Upload a single file to the backend for use in a draft session.
 * Returns { storage_path, file_name, size }.
 */
export async function uploadDraftDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/draft/upload', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Start a new draft session. Triggers the full 7-agent pipeline.
 * Returns { session_id, status }.
 */
export async function startDraft(payload) {
  return request('/draft/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * List all draft sessions.
 */
export async function listDrafts() {
  return request('/draft/list');
}

/**
 * Poll the status of a draft session.
 */
export async function getDraftStatus(sessionId) {
  return request(`/draft/${sessionId}/status`);
}

/**
 * Fetch the completed draft result (complaint text + download URLs).
 */
export async function getDraftResult(sessionId) {
  return request(`/draft/${sessionId}/result`);
}

/**
 * Send a revision instruction for a drafted complaint.
 * Returns { revised_complaint, changes_summary, version }.
 */
export async function listDraftVersions(sessionId) {
  return request(`/draft/${sessionId}/versions`);
}

export async function restoreDraftVersion(sessionId, version) {
  return request(`/draft/${sessionId}/restore-version`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export async function reviseDraft(sessionId, message, complaintText, attachmentPaths = []) {
  return request(`/draft/${sessionId}/revise`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      complaint_text: complaintText,
      attachment_paths: attachmentPaths,
    }),
  });
}

export async function streamDraftChat(sessionId, message, complaintText, attachmentPaths, history, onToken) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/draft/${sessionId}/chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      complaint_text: complaintText,
      attachment_paths: attachmentPaths || [],
      history: history || [],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Chat failed' }));
    throw new Error(err.detail || 'Chat failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try { fullText += JSON.parse(data); } catch { fullText += data; }
        onToken(fullText);
      }
    }
  }

  return fullText;
}

/**
 * Download the current complaint as a formatted Word document.
 * Returns a Blob that can be saved via URL.createObjectURL.
 */
export async function downloadDraftDocx(sessionId) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/draft/${sessionId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let detail = 'Download failed';
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return response.blob();
}

/**
 * Save a draft session to an existing client case (or reassign).
 */
export async function saveDraftToCase(sessionId, clientId = null) {
  return request(`/draft/${sessionId}/save`, {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId }),
  });
}

/**
 * Rebuild the RAG reference index from backend/reference_cases/.
 * Pass force=true to wipe and fully re-index.
 */
export async function reindexReferenceCases(force = false) {
  return request('/draft/reindex', {
    method: 'POST',
    body: JSON.stringify({ force }),
  });
}

/**
 * Return the current state of the RAG reference index.
 */
export async function getReindexStatus() {
  return request('/draft/reindex/status');
}

export async function analyzeCreditReport(reportText, bureau = '') {
  return request('/draft/analyze-credit-report', {
    method: 'POST',
    body: JSON.stringify({ report_text: reportText, bureau }),
  });
}

export async function analyzeCreditReportPDF(file, bureau = '') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bureau', bureau);
  return request('/draft/analyze-credit-report-pdf', {
    method: 'POST',
    body: formData,
  });
}

export async function streamDisputeChat(message, letterText, accountsContext, history, onToken) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/draft/dispute-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, letter_text: letterText, accounts_context: accountsContext, history }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Chat failed' }));
    throw new Error(err.detail || 'Chat failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try { fullText += JSON.parse(data); } catch { fullText += data; }
        onToken(fullText);
      }
    }
  }

  return fullText;
}

// ---------------------------------------------------------------------------
// Dispute Sessions
// ---------------------------------------------------------------------------

export async function getDisputeSessions() {
  return request('/disputes');
}

export async function getDisputeSession(id) {
  return request(`/disputes/${id}`);
}

export async function createDisputeSession(data) {
  return request('/disputes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDisputeSession(id, data) {
  return request(`/disputes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteDisputeSession(id) {
  return request(`/disputes/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Violation Patterns
// ---------------------------------------------------------------------------

export async function getViolationPatterns(filters = {}) {
  const params = new URLSearchParams();
  if (filters.statute) params.append('statute', filters.statute);
  if (filters.defendant_type) params.append('defendant_type', filters.defendant_type);
  if (filters.search) params.append('search', filters.search);
  const qs = params.toString();
  return request(`/violations${qs ? `?${qs}` : ''}`);
}

export async function getViolationPattern(id) {
  return request(`/violations/${id}`);
}

export async function createViolationPattern(data) {
  return request('/violations', { method: 'POST', body: JSON.stringify(data) });
}

export async function seedViolationPatterns() {
  return request('/violations/seed', { method: 'POST' });
}

export async function deleteViolationPattern(id) {
  return request(`/violations/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Case Law
// ---------------------------------------------------------------------------

export async function getCaseLaw(filters = {}) {
  const params = new URLSearchParams();
  if (filters.court) params.append('court', filters.court);
  if (filters.statute) params.append('statute', filters.statute);
  if (filters.search) params.append('search', filters.search);
  const qs = params.toString();
  return request(`/case-law${qs ? `?${qs}` : ''}`);
}

export async function getCaseLawEntry(id) {
  return request(`/case-law/${id}`);
}

export async function createCaseLaw(data) {
  return request('/case-law', { method: 'POST', body: JSON.stringify(data) });
}

export async function uploadCaseLaw(file, metadata = {}) {
  const formData = new FormData();
  formData.append('file', file);
  if (metadata.case_name) formData.append('case_name', metadata.case_name);
  if (metadata.citation) formData.append('citation', metadata.citation);
  if (metadata.court) formData.append('court', metadata.court);
  if (metadata.year) formData.append('year', metadata.year);
  if (metadata.statutes) formData.append('statutes', metadata.statutes);
  return request('/case-law/upload', { method: 'POST', body: formData });
}

export async function bulkUploadCaseLaw(files) {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  return request('/case-law/bulk-upload', { method: 'POST', body: formData });
}

export async function deleteCaseLaw(id) {
  return request(`/case-law/${id}`, { method: 'DELETE' });
}

export async function reprocessAllCaseLaw() {
  return request('/case-law/reprocess-all', { method: 'POST' });
}

export async function searchCaseLaw(query, topK = 5) {
  return request(`/case-law/search/semantic?q=${encodeURIComponent(query)}&top_k=${topK}`);
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export async function getAttorneyMemories() {
  return request('/memory/attorney');
}

export async function getCaseMemories(caseId) {
  return request(`/memory/case/${caseId}`);
}

export async function addAttorneyMemory(data) {
  return request('/memory/attorney', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function addCaseMemory(caseId, data) {
  return request(`/memory/case/${caseId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteAttorneyMemory(id) {
  return request(`/memory/attorney/${id}`, { method: 'DELETE' });
}

export async function deleteCaseMemory(id) {
  return request(`/memory/case-memory/${id}`, { method: 'DELETE' });
}

export async function getMemoryStats() {
  return request('/memory/stats');
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function getCalendarEvents(month = null, caseId = null) {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (caseId) params.append('case_id', caseId);
  const qs = params.toString();
  return request(`/calendar${qs ? `?${qs}` : ''}`);
}

export async function createCalendarEvent(data) {
  return request('/calendar', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCalendarEvent(id, data) {
  return request(`/calendar/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCalendarEvent(id) {
  return request(`/calendar/${id}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Settlement Package Review
// ---------------------------------------------------------------------------

export async function getSettlementPackages(statusFilter = '') {
  const suffix = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : '';
  return request(`/settlement-packages${suffix}`);
}

export async function getSettlementPackageAccess() {
  return request('/settlement-packages/access');
}

export async function getCaseSettlementPackages(caseId) {
  return request(`/cases/${caseId}/settlement-packages`);
}

export async function submitSettlementPackage(caseId, { settlementAgreement, creditDisclosure, settlementAmount, attorneyNotes }) {
  const formData = new FormData();
  formData.append('settlement_agreement', settlementAgreement);
  if (creditDisclosure) formData.append('credit_disclosure', creditDisclosure);
  if (settlementAmount) formData.append('settlement_amount', settlementAmount);
  if (attorneyNotes) formData.append('attorney_notes', attorneyNotes);
  return request(`/cases/${caseId}/settlement-packages`, { method: 'POST', body: formData });
}

export async function approveSettlementPackage(packageId, comments = '') {
  return request(`/settlement-packages/${packageId}/approve`, {
    method: 'POST', body: JSON.stringify({ comments }),
  });
}

export async function returnSettlementPackage(packageId, comments) {
  return request(`/settlement-packages/${packageId}/return`, {
    method: 'POST', body: JSON.stringify({ comments }),
  });
}

export async function downloadSettlementPackageDocument(packageId, kind) {
  const response = await fetch(`${API_URL}/settlement-packages/${packageId}/documents/${kind}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Could not open the settlement package document.');
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function sendApprovedSettlementPackageDocument(packageId, kind) {
  return request(`/settlement-packages/${packageId}/send/${kind}`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Communications (Email + SMS)
// ---------------------------------------------------------------------------

export async function getCommsConfig() {
  return request('/communications/config');
}

export async function getCommsHistory(clientId) {
  return request(`/communications/history/${clientId}`);
}

export async function getCommunicationRecipients(recipientType) {
  return request(`/communications/recipients/${recipientType}`);
}

export async function getTypedCommsHistory(recipientType, recipientId) {
  return request(`/communications/history/${recipientType}/${recipientId}`);
}

export async function sendClientEmail(data) {
  return request('/communications/email', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function sendClientSMS(data) {
  return request('/communications/sms', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Pipeline Stages
// ---------------------------------------------------------------------------

export async function getPipelineStages(pipelineId = null) {
  const params = pipelineId ? `?pipeline_id=${pipelineId}` : '';
  return request(`/pipeline-stages${params}`);
}

export async function getPipelines() {
  return request('/pipeline-stages/pipelines');
}

export async function createPipeline(data) {
  return request('/pipeline-stages/pipelines', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deletePipeline(id) {
  return request(`/pipeline-stages/pipelines/${id}`, {
    method: 'DELETE',
  });
}

export async function createPipelineStage(data) {
  return request('/pipeline-stages', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePipelineStage(id, data) {
  return request(`/pipeline-stages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deletePipelineStage(id) {
  return request(`/pipeline-stages/${id}`, {
    method: 'DELETE',
  });
}

export async function reorderPipelineStages(stageIds) {
  return request('/pipeline-stages/reorder', {
    method: 'POST',
    body: JSON.stringify({ stage_ids: stageIds }),
  });
}

// ---------------------------------------------------------------------------
// Auth / Registration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public Intake Form
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Credit Reports (Experian API)
// ---------------------------------------------------------------------------

export async function getCreditReportConfig() {
  return request('/credit-reports/config');
}

export async function pullCreditReport(data) {
  return request('/credit-reports/pull', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getClientCreditReports(clientId) {
  return request(`/credit-reports/client/${clientId}`);
}

export async function getClientScoreHistory(clientId) {
  return request(`/credit-reports/client/${clientId}/scores`);
}

export async function deleteCreditReport(id) {
  return request(`/credit-reports/report/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Public Intake Form
// ---------------------------------------------------------------------------

export async function submitIntakeForm(formData) {
  // This is a public endpoint — no auth needed
  const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
  const response = await fetch(`${BASE}/intake/submit-with-files`, {
    method: 'POST',
    body: formData, // FormData with files
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Submission failed' }));
    throw new Error(err.detail || 'Submission failed');
  }
  return response.json();
}

export async function inviteStaffAttorney(data) {
  return request('/auth/invite-attorney', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getStaffAttorneys() {
  return request('/auth/staff-attorneys');
}

export async function updateStaffAttorney(id, data) {
  return request(`/auth/staff-attorneys/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteStaffAttorney(id) {
  return request(`/auth/staff-attorneys/${id}`, { method: 'DELETE' });
}

export async function resendStaffInvite(id) {
  return request(`/auth/staff-attorneys/${id}/resend-invite`, { method: 'POST' });
}

export async function assignAttorneyToClient(clientId, attorneyId) {
  return request('/auth/assign-attorney', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, attorney_id: attorneyId }),
  });
}

// ---------------------------------------------------------------------------
// Referral Partners
// ---------------------------------------------------------------------------

export async function getReferralPartners() {
  return request('/referrals');
}

export async function getReferralPartner(id) {
  return request(`/referrals/${id}`);
}

export async function createReferralPartner(data) {
  return request('/referrals', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateReferralPartner(id, data) {
  return request(`/referrals/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteReferralPartner(id) {
  return request(`/referrals/${id}`, { method: 'DELETE' });
}

export async function assignReferral(data) {
  return request('/referrals/assign', { method: 'POST', body: JSON.stringify(data) });
}

export async function inviteReferralPortal(partnerId, email) {
  return request('/referrals/invite-portal', {
    method: 'POST',
    body: JSON.stringify({ partner_id: partnerId, email }),
  });
}

export async function toggleReferralAccess(partnerId, feature, enabled) {
  return request('/referrals/toggle-access', {
    method: 'PATCH',
    body: JSON.stringify({ partner_id: partnerId, feature, enabled }),
  });
}

export async function getReferralPartnerMessages(partnerId) {
  return request(`/referrals/${partnerId}/messages`);
}

export async function sendReferralPartnerMessage(partnerId, data) {
  return request(`/referrals/${partnerId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

export async function getCommissions(partnerId = null, status = null) {
  const params = new URLSearchParams();
  if (partnerId) params.append('partner_id', partnerId);
  if (status) params.append('status', status);
  const qs = params.toString();
  return request(`/commissions${qs ? `?${qs}` : ''}`);
}

export async function getCommissionSummary() {
  return request('/commissions/summary');
}

export async function createCommission(data) {
  return request('/commissions', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCommission(id, data) {
  return request(`/commissions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function approveCommission(id) {
  return request(`/commissions/${id}/approve`, { method: 'POST' });
}

export async function markCommissionPaid(id) {
  return request(`/commissions/${id}/mark-paid`, { method: 'POST' });
}

export async function deleteCommission(id) {
  return request(`/commissions/${id}`, { method: 'DELETE' });
}

export async function getQuickBooksStatus() {
  return request('/commissions/quickbooks/status');
}

export async function getQuickBooksAuthUrl() {
  return request('/commissions/quickbooks/auth-url');
}

export async function connectQuickBooks(code, realmId) {
  return request('/commissions/quickbooks/callback', {
    method: 'POST',
    body: JSON.stringify({ code, realm_id: realmId }),
  });
}

export async function disconnectQuickBooks() {
  return request('/commissions/quickbooks/disconnect', { method: 'POST' });
}

export async function syncCommissionToQuickBooks(id) {
  return request(`/commissions/${id}/sync-to-quickbooks`, { method: 'POST' });
}

export async function registerClient(data) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// E-Signatures (Dropbox Sign)
// ---------------------------------------------------------------------------

export async function getEsignConfig() {
  return request('/esign/config');
}

export async function getEsignTemplates() {
  return request('/esign/templates');
}

export async function sendSignatureRequest(data) {
  return request('/esign/send', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function testSigningStorage() {
  return request('/signing/test');
}

export async function deleteSigningSession(id) {
  return request(`/signing/${id}`, { method: 'DELETE' });
}

export async function sendOiseEngagementContract(caseId) {
  return request('/signing/engagement-contract/send', {
    method: 'POST',
    body: JSON.stringify({ case_id: caseId, confirmed: true }),
  });
}

export async function createSigningSession(formData) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/signing/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create signing session');
  }
  return response.json();
}

export async function sendDocumentForSignature(formData) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/esign/send-document`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to send document for signature');
  }
  return response.json();
}

export async function sendCompletedSettlementPackage(caseId, attorneyProfileId) {
  return request('/esign/settlement-package/deliver', {
    method: 'POST',
    body: JSON.stringify({
      case_id: caseId,
      attorney_profile_id: attorneyProfileId,
      confirmed: true,
    }),
  });
}

export async function getSignatureRequests(caseId = null, clientId = null) {
  const params = new URLSearchParams();
  if (caseId) params.append('case_id', caseId);
  if (clientId) params.append('client_id', clientId);
  const qs = params.toString();
  return request(`/esign/requests${qs ? `?${qs}` : ''}`);
}

export async function getGroupedSignatureDashboard(caseId = null, clientId = null) {
  const params = new URLSearchParams();
  if (caseId) params.append('case_id', caseId);
  if (clientId) params.append('client_id', clientId);
  const qs = params.toString();
  return request(`/esign/dashboard${qs ? `?${qs}` : ''}`);
}

export async function getSignatureRequest(id) {
  return request(`/esign/requests/${id}`);
}

export async function remindSigner(id) {
  return request(`/esign/requests/${id}/remind`, { method: 'POST' });
}

export async function cancelSignatureRequest(id) {
  return request(`/esign/requests/${id}/cancel`, { method: 'POST' });
}

export async function downloadOriginalAttachment(id) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/esign/requests/${id}/source`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Original attachment download failed');
  return response.blob();
}

export async function downloadSignedDocument(id) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/esign/requests/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Download failed');
  return response.blob();
}


// ---------------------------------------------------------------------------
// Secure Form W-9
// ---------------------------------------------------------------------------

export async function createW9Request(data) {
  return request('/w9/create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function inspectW9Prefill(caseId) {
  return request(`/w9/attorney/prefill?case_id=${encodeURIComponent(caseId)}`);
}

export async function listW9Requests(caseId = null) {
  const params = new URLSearchParams();
  if (caseId) params.append('case_id', caseId);
  const query = params.toString();
  return request(`/w9/attorney/requests${query ? `?${query}` : ''}`);
}

export async function getW9Request(id) {
  return request(`/w9/attorney/requests/${id}`);
}

export async function cancelW9Request(id) {
  return request(`/w9/attorney/requests/${id}/cancel`, { method: 'POST' });
}

export async function notifyW9Signer(id) {
  return request(`/w9/attorney/requests/${id}/notify`, { method: 'POST' });
}

export async function downloadCompletedW9(id) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/w9/attorney/requests/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(detail, 'W-9 download failed'));
  }
  return response.blob();
}

export async function getPublicW9(token) {
  const response = await fetch(`${BASE_URL}/w9/${token}`);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(detail, 'W-9 request not found'));
  }
  return response.json();
}

export async function submitPublicW9(token, data) {
  const response = await fetch(`${BASE_URL}/w9/${token}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(detail, 'W-9 submission failed'));
  }
  return response.json();
}

export async function getPublicPayoutInformation(token) {
  const response = await fetch(`${BASE_URL}/public/payout-information/${encodeURIComponent(token)}`);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(detail, 'Secure payout form not found'));
  }
  return response.json();
}

export async function submitPublicPayoutInformation(token, data) {
  const response = await fetch(`${BASE_URL}/public/payout-information/${encodeURIComponent(token)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(detail, 'Payout information submission failed'));
  }
  return response.json();
}

export function publicW9TemplateUrl(token) {
  return `${BASE_URL}/w9/${token}/template`;
}

export function publicW9CompletedCopyUrl(token) {
  return `${BASE_URL}/w9/${token}/completed-copy`;
}


// ---------------------------------------------------------------------------
// Closing statements
// ---------------------------------------------------------------------------

export async function uploadSettlementForClosingStatement(caseId, file) {
  const formData = new FormData();
  formData.append('case_id', caseId);
  formData.append('file', file);
  return request('/closing-statements/extract-settlement', {
    method: 'POST',
    body: formData,
  });
}

export async function attachSigningSettlementForClosingStatement(caseId, signingSessionId) {
  return request('/closing-statements/attach-signing-settlement', {
    method: 'POST',
    body: JSON.stringify({ case_id: caseId, signing_session_id: signingSessionId }),
  });
}

export async function getClosingStatementSettlementSource(caseId) {
  return request(`/closing-statements/settlement-source?case_id=${encodeURIComponent(caseId)}`);
}

export async function createClosingStatement(data) {
  return request('/closing-statements', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getClosingStatements() {
  return request('/closing-statements');
}

export async function sendClosingStatementForSignature(statementId) {
  return request(`/closing-statements/${statementId}/send`, {
    method: 'POST',
  });
}

export async function downloadClosingStatement(statementId, { signed = false } = {}) {
  const token = await getAccessToken();
  const response = await fetch(
    `${BASE_URL}/closing-statements/${statementId}/download${signed ? '?signed=true' : ''}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { detail: response.statusText };
    }
    throw new Error(apiErrorMessage(errorBody, `Could not download statement (${response.status}).`));
  }
  return response.blob();
}

export function saveDownloadedBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
