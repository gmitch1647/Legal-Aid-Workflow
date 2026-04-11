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
async function request(path, options = {}) {
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

// ---------------------------------------------------------------------------
// Auth / Registration
// ---------------------------------------------------------------------------

export async function registerClient(data) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
