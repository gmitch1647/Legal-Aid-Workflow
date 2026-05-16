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
    const error = new Error(errorBody.detail || `Request failed: ${response.status}`);
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

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocument(caseId, file, category) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);

  return request(`/cases/${caseId}/documents`, {
    method: 'POST',
    body: formData,
  });
}

export async function getDocuments(caseId) {
  return request(`/cases/${caseId}/documents`);
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
// Communications (Email + SMS)
// ---------------------------------------------------------------------------

export async function getCommsConfig() {
  return request('/communications/config');
}

export async function getCommsHistory(clientId) {
  return request(`/communications/history/${clientId}`);
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

export async function getSignatureRequests(caseId = null, clientId = null) {
  const params = new URLSearchParams();
  if (caseId) params.append('case_id', caseId);
  if (clientId) params.append('client_id', clientId);
  const qs = params.toString();
  return request(`/esign/requests${qs ? `?${qs}` : ''}`);
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

export async function downloadSignedDocument(id) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}/esign/requests/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Download failed');
  return response.blob();
}
