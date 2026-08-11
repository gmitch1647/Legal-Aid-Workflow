import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Search,
  Filter,
  Calendar,
  Loader2,
  AlertCircle,
  X,
  ChevronDown,
  Plus,
  Check,
  Trash2,
  GripVertical,
  Settings,
  Mail,
  MessageSquare,
  User,
  Save,
} from 'lucide-react';
import { getCases, updateCaseStatus, getPipelineStages, updatePipelineStage, getPipelines, createPipelineStage, deletePipelineStage, createPipeline, reorderPipelineStages, deleteCase, getStaffAttorneys, sendOiseEngagementContract } from '../../lib/api';
import CaseCard from '../../components/CaseCard';

// ---------------------------------------------------------------------------
// Fallback columns (used if pipeline_stages table hasn't been set up)
// ---------------------------------------------------------------------------

const DEFAULT_COLUMNS = [
  { key: 'submitted', label: 'Submitted', color: 'blue' },
  { key: 'draft_ready', label: 'Draft Ready', color: 'amber' },
  { key: 'attorney_review', label: 'Attorney Review', color: 'purple' },
  { key: 'approved', label: 'Approved', color: 'green' },
  { key: 'filed', label: 'Filed', color: 'emerald' },
  { key: 'closed', label: 'Closed', color: 'slate' },
];

const CASE_TYPES = ['FCRA', 'FDCPA', 'TCPA'];

// ---------------------------------------------------------------------------
// Pipeline Component
// ---------------------------------------------------------------------------

export default function CasePipeline() {
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [pipelines, setPipelines] = useState([]);
  const [activePipeline, setActivePipeline] = useState(null); // null = all
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [caseTypeFilter, setCaseTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Add stage inline
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [addingStage, setAddingStage] = useState(false);

  // Add pipeline inline
  const [showAddPipeline, setShowAddPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');

  // Edit mode — drag columns to reorder
  const [editMode, setEditMode] = useState(false);
  const [stageSettingsId, setStageSettingsId] = useState(null);

  // Notification modal
  const [notifyModal, setNotifyModal] = useState(null); // { caseId, caseName, oldStatus, newStatus, stage }
  const [sendEmail, setSendEmail] = useState(false);
  const [sendSms, setSendSms] = useState(false);
  const [notifyAttorney, setNotifyAttorney] = useState(false);
  const [notifyAttorneyId, setNotifyAttorneyId] = useState('assigned');
  const [staffAttorneyList, setStaffAttorneyList] = useState([]);
  const [notifyMessage, setNotifyMessage] = useState('');

  // Oise Law engagement-contract stage automation. This modal is separate from
  // generic stage notifications because it creates a secure signature session.
  const [engagementSendModal, setEngagementSendModal] = useState(null);
  const [sendingEngagement, setSendingEngagement] = useState(false);

  async function handleDeleteCase(caseId, caseName) {
    if (!window.confirm(`Delete case "${caseName}"? This cannot be undone.`)) return;
    try {
      await deleteCase(caseId);
      setCases((prev) => prev.filter((c) => c.id !== caseId));
    } catch (err) {
      setError(err.message || 'Failed to delete case');
    }
  }

  async function handleAddStage() {
    if (!newStageName.trim() || addingStage) return;
    setAddingStage(true);
    try {
      await createPipelineStage({ name: newStageName.trim(), color: 'slate' });
      setNewStageName('');
      setShowAddStage(false);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to add stage');
    } finally {
      setAddingStage(false);
    }
  }

  async function handleDeleteStage(stageId, stageName) {
    if (!window.confirm(`Delete the "${stageName}" column? Cases in this stage must be moved first.`)) return;
    try {
      await deletePipelineStage(stageId);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to delete stage');
    }
  }

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      // Load pipelines, stages, and cases in parallel
      const [pipelinesData, stagesData, casesData, staffData] = await Promise.all([
        getPipelines().catch(() => []),
        getPipelineStages(activePipeline).catch(() => null),
        getCases(),
        getStaffAttorneys().catch(() => []),
      ]);

      setPipelines(pipelinesData || []);
      setStaffAttorneyList(staffData || []);

      // Use dynamic stages if available, otherwise fallback
      if (stagesData && stagesData.length > 0) {
        setColumns(
          stagesData.map((s) => ({
            id: s.id,
            key: s.slug,
            label: s.name,
            color: s.color || 'slate',
            is_system: s.is_system,
            pipeline_id: s.pipeline_id,
            notify_email: s.notify_email || false,
            notify_sms: s.notify_sms || false,
            notify_attorney: s.notify_attorney || false,
            notify_attorney_id: s.notify_attorney_id || 'assigned',
            notify_on_enter: s.notify_on_enter || false,
            notification_template: s.notification_template || '',
          }))
        );
      }

      let list = Array.isArray(casesData) ? casesData : casesData?.items ?? casesData?.cases ?? [];

      // Filter cases by pipeline if one is selected
      if (activePipeline && activePipeline !== 'all') {
        list = list.filter((c) => c.pipeline_id === activePipeline || !c.pipeline_id);
      }

      setCases(list);
    } catch (err) {
      console.error('Pipeline fetch error:', err);
      setError(err.message || 'Failed to load cases');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activePipeline]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // A completed signature happens on the client's secure signing page. Refresh
  // the active board while visible so the server-side Documents Signed update is
  // reflected without requiring the attorney to reload LegalFlow.
  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData({ silent: true });
      }
    }, 30000);
    return () => window.clearInterval(refreshTimer);
  }, [fetchData]);

  async function handleAddPipeline() {
    if (!newPipelineName.trim()) return;
    try {
      const created = await createPipeline({ name: newPipelineName.trim() });
      setNewPipelineName('');
      setShowAddPipeline(false);
      setActivePipeline(created.id);
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  // Filter cases
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const clientName = (c.plaintiff_name || c.client_name || '').toLowerCase();
        const defendants = (
          c.defendant_names?.join(', ') ||
          c.defendant_name ||
          (Array.isArray(c.defendants)
            ? c.defendants.map((d) => (typeof d === 'string' ? d : d.name)).join(', ')
            : '') ||
          ''
        ).toLowerCase();
        if (!clientName.includes(q) && !defendants.includes(q)) return false;
      }
      // Case type filter
      if (caseTypeFilter) {
        const types = (c.case_type || '').toUpperCase();
        if (!types.includes(caseTypeFilter)) return false;
      }
      // Date range filter
      if (dateFrom) {
        const caseDate = new Date(c.created_at);
        if (caseDate < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const caseDate = new Date(c.created_at);
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        if (caseDate >= endDate) return false;
      }
      return true;
    });
  }, [cases, search, caseTypeFilter, dateFrom, dateTo]);

  // Group by status
  const grouped = useMemo(() => {
    const map = {};
    columns.forEach((col) => {
      map[col.key] = [];
    });
    filteredCases.forEach((c) => {
      const status = c.status || 'submitted';
      if (map[status]) {
        map[status].push(c);
      }
    });
    return map;
  }, [filteredCases]);

  // Drag end handler
  // Drag handler for CASES (normal mode)
  async function moveCaseToStatus(caseId, newStatus, oldStatus) {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, status: newStatus, updated_at: new Date().toISOString() } : c))
    );
    try {
      setUpdating(caseId);
      await updateCaseStatus(caseId, newStatus);
    } catch (err) {
      console.error('Status update failed:', err);
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? { ...c, status: oldStatus } : c))
      );
      setError(`Failed to move case: ${err.message}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setUpdating(null);
    }
  }

  async function handleConfirmEngagementSend() {
    if (!engagementSendModal || sendingEngagement) return;
    setSendingEngagement(true);
    setUpdating(engagementSendModal.caseId);
    try {
      const result = await sendOiseEngagementContract(engagementSendModal.caseId);
      setCases((prev) => prev.map((caseItem) => (
        caseItem.id === engagementSendModal.caseId
          ? { ...caseItem, status: result.case_status || 'doc_sent_for_signature', updated_at: new Date().toISOString() }
          : caseItem
      )));
      setEngagementSendModal(null);
    } catch (err) {
      setError(err.message || 'Could not send the Oise Law representation agreement.');
      setTimeout(() => setError(null), 7000);
    } finally {
      setSendingEngagement(false);
      setUpdating(null);
    }
  }

  async function handleSendNotification() {
    if (!notifyModal) return;
    const { caseId, newStatus, oldStatus } = notifyModal;

    // Move the case first
    await moveCaseToStatus(caseId, newStatus, oldStatus);

    // Send notifications
    const caseData = cases.find(c => c.id === caseId);
    const clientId = caseData?.client_id;
    const clientEmail = caseData?.client?.email || caseData?.client_email;
    const clientPhone = caseData?.client?.phone || caseData?.client_phone;
    const clientName = caseData?.plaintiff_name || caseData?.client_name || 'Client';

    if (clientId && (sendEmail || sendSms)) {
      const message = notifyMessage
        .replace('{client_name}', clientName)
        .replace('{stage_name}', notifyModal.stage?.name || newStatus)
        .replace('{case_status}', newStatus.replace(/_/g, ' '));

      try {
        if (sendEmail && clientEmail) {
          const { sendClientEmail } = await import('../../lib/api');
          await sendClientEmail({
            client_id: clientId,
            to_email: clientEmail,
            subject: `Case Update: ${notifyModal.stage?.name || newStatus}`,
            body: message || `Hi ${clientName}, your case status has been updated to: ${notifyModal.stage?.name || newStatus}.`,
          });
        }
        if (sendSms && clientPhone) {
          const { sendClientSMS } = await import('../../lib/api');
          await sendClientSMS({
            client_id: clientId,
            to_phone: clientPhone,
            body: message || `Hi ${clientName}, your case status has been updated to: ${notifyModal.stage?.name || newStatus}.`,
          });
        }
      } catch (err) {
        console.error('Notification send failed:', err);
      }
    }

    // Notify attorney
    if (notifyAttorney) {
      try {
        const { supabase } = await import('../../lib/supabase');
        let attorneyEmail = '';
        let attorneyName = '';
        let attorneyPhone = '';

        const stageAttyId = notifyModal.stage?.notify_attorney_id || notifyAttorneyId;

        if (stageAttyId === 'assigned' && clientId) {
          const { data: clientProfile } = await supabase
            .from('profiles')
            .select('assigned_attorney_id')
            .eq('id', clientId)
            .single();

          if (clientProfile?.assigned_attorney_id) {
            const { data: atty } = await supabase
              .from('profiles')
              .select('email, full_name, phone')
              .eq('id', clientProfile.assigned_attorney_id)
              .single();
            attorneyEmail = atty?.email || '';
            attorneyName = atty?.full_name || '';
            attorneyPhone = atty?.phone || '';
          }
        } else if (stageAttyId && stageAttyId !== 'assigned') {
          // Look up from staff list first, then DB
          const selected = staffAttorneyList.find(a => a.id === stageAttyId);
          if (selected) {
            attorneyEmail = selected.email || '';
            attorneyName = selected.full_name || '';
            attorneyPhone = selected.phone || '';
          } else {
            const { data: atty } = await supabase
              .from('profiles')
              .select('email, full_name, phone')
              .eq('id', stageAttyId)
              .single();
            if (atty) {
              attorneyEmail = atty.email || '';
              attorneyName = atty.full_name || '';
              attorneyPhone = atty.phone || '';
            }
          }
        }

        const stageName = notifyModal.stage?.name || notifyModal.stage?.label || newStatus;
        const frontendUrl = window.location.origin;
        const caseLink = `${frontendUrl}/attorney/cases/${caseId}`;

        const emailBody = (notifyModal.stage?.notification_template || notifyMessage || `Hi {attorney_name},\n\nThe case for {client_name} has been moved to "{stage_name}". Please review it in LegalFlow.\n\n{case_link}`)
          .replace(/{attorney_name}/g, attorneyName)
          .replace(/{client_name}/g, clientName)
          .replace(/{stage_name}/g, stageName)
          .replace(/{case_link}/g, caseLink);

        if (attorneyEmail) {
          const { sendClientEmail } = await import('../../lib/api');
          await sendClientEmail({
            client_id: clientId || caseId,
            to_email: attorneyEmail,
            subject: `Case Update: ${clientName} — ${stageName}`,
            body: emailBody,
          });
        }

        if (sendSms && attorneyPhone) {
          const { sendClientSMS } = await import('../../lib/api');
          const smsBody = `LegalFlow: Case for ${clientName} moved to "${stageName}". View: ${caseLink}`;
          await sendClientSMS({
            client_id: clientId || caseId,
            to_phone: attorneyPhone,
            body: smsBody,
          });
        }
      } catch (err) {
        console.error('Attorney notification failed:', err);
      }
    }

    setNotifyModal(null);
    setSendEmail(false);
    setSendSms(false);
    setNotifyAttorney(false);
    setNotifyAttorneyId('assigned');
    setNotifyMessage('');
  }

  function handleSkipNotification() {
    if (!notifyModal) return;
    moveCaseToStatus(notifyModal.caseId, notifyModal.newStatus, notifyModal.oldStatus);
    setNotifyModal(null);
    setSendEmail(false);
    setSendSms(false);
    setNotifyAttorney(false);
    setNotifyAttorneyId('assigned');
    setNotifyMessage('');
  }

  const handleCaseDragEnd = useCallback(
    (result) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      const caseId = draggableId;
      const newStatus = destination.droppableId;
      const oldStatus = source.droppableId;

      // A representation agreement can only be sent after an explicit
      // confirmation. The server validates that the client is assigned to
      // Esther Oise and does not move the case until delivery is accepted.
      if (newStatus === 'doc_sent_for_signature') {
        const caseData = cases.find(c => c.id === caseId);
        setEngagementSendModal({
          caseId,
          caseName: caseData?.plaintiff_name || caseData?.client_name || 'this client',
          oldStatus,
        });
        return;
      }

      // This stage is exclusively the result of a completed engagement
      // signature, preventing a manual move from being mistaken for consent.
      if (newStatus === 'documents_signed') {
        setError('Documents Signed is updated automatically when the client completes the representation agreement.');
        setTimeout(() => setError(null), 6000);
        return;
      }

      // Check if destination stage has notifications enabled
      const destStage = columns.find(c => c.key === newStatus);
      if (destStage && (destStage.notify_email || destStage.notify_sms || destStage.notify_attorney)) {
        const caseData = cases.find(c => c.id === caseId);
        const caseName = caseData?.plaintiff_name || caseData?.client_name || 'Case';
        setSendEmail(destStage.notify_email || false);
        setSendSms(destStage.notify_sms || false);
        setNotifyAttorney(destStage.notify_attorney || false);
        setNotifyAttorneyId(destStage.notify_attorney_id || 'assigned');
        setNotifyMessage(destStage.notification_template || '');
        setNotifyModal({ caseId, caseName, oldStatus, newStatus, stage: destStage });
        return;
      }

      // No notifications — just move
      moveCaseToStatus(caseId, newStatus, oldStatus);
    },
    [columns, cases]
  );

  // Drag handler for COLUMNS (edit mode)
  const handleColumnDragEnd = useCallback(
    async (result) => {
      const { source, destination } = result;
      if (!destination) return;
      if (source.index === destination.index) return;

      // Reorder columns locally
      const newColumns = Array.from(columns);
      const [moved] = newColumns.splice(source.index, 1);
      newColumns.splice(destination.index, 0, moved);
      setColumns(newColumns);

      // Save to backend
      const stageIds = newColumns.filter((c) => c.id).map((c) => c.id);
      try {
        await reorderPipelineStages(stageIds);
      } catch (err) {
        console.error('Reorder failed:', err);
        setError('Failed to save column order');
        await fetchData();
      }
    },
    [columns, fetchData]
  );

  const clearFilters = () => {
    setSearch('');
    setCaseTypeFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = search || caseTypeFilter || dateFrom || dateTo;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" />
          <p className="mt-3 text-sm text-slate-500">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Case Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filteredCases.length} case{filteredCases.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={() => setEditMode(!editMode)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
            editMode
              ? 'bg-purple-100 text-purple-700 border border-purple-300'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <GripVertical className="w-3.5 h-3.5" />
          {editMode ? 'Done Editing' : 'Reorder Columns'}
        </button>
      </div>

      {editMode && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-2 text-xs text-purple-700">
          Drag columns to reorder them. Click "Done Editing" when finished.
        </div>
      )}

      {/* Pipeline Tabs */}
      {pipelines.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {pipelines.map((p) => {
            const isActive = activePipeline === p.id || (!activePipeline && p.is_default);
            return (
              <button
                key={p.id}
                onClick={() => setActivePipeline(p.is_default ? null : p.id)}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p.name}
              </button>
            );
          })}
          {showAddPipeline ? (
            <div className="flex items-center gap-2 shrink-0">
              <input
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPipeline();
                  if (e.key === 'Escape') { setShowAddPipeline(false); setNewPipelineName(''); }
                }}
                placeholder="Pipeline name..."
                className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoFocus
              />
              <button
                onClick={handleAddPipeline}
                disabled={!newPipelineName.trim()}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setShowAddPipeline(false); setNewPipelineName(''); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddPipeline(true)}
              className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition"
            >
              <Plus className="w-3.5 h-3.5" /> New Pipeline
            </button>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card !p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client or defendant name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input !pl-9"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`btn-secondary gap-2 ${hasActiveFilters ? '!border-primary-300 !bg-primary-50 !text-primary-700' : ''}`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-[10px] text-white">
                {[caseTypeFilter, dateFrom, dateTo].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn-secondary gap-1.5 text-red-600 hover:text-red-700">
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-end">
            <div className="sm:w-48">
              <label className="label">Case Type</label>
              <select
                value={caseTypeFilter}
                onChange={(e) => setCaseTypeFilter(e.target.value)}
                className="input"
              >
                <option value="">All Types</option>
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-44">
              <label className="label">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input"
              />
            </div>
            <div className="sm:w-44">
              <label className="label">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input"
              />
            </div>
          </div>
        )}
      </div>

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

      {/* Kanban Board */}
      <DragDropContext onDragEnd={editMode ? handleColumnDragEnd : handleCaseDragEnd}>
        <Droppable droppableId="columns-droppable" direction="horizontal" isDropDisabled={!editMode} type="COLUMN">
          {(columnsProvided) => (
        <div
          ref={columnsProvided.innerRef}
          {...columnsProvided.droppableProps}
          className="flex gap-4 overflow-x-auto pb-4"
        >
          {columns.map((col, colIndex) => {
            const columnCases = grouped[col.key] || [];
            return (
              <Draggable
                key={col.key}
                draggableId={`col-${col.key}`}
                index={colIndex}
                isDragDisabled={!editMode}
              >
                {(colDragProvided, colDragSnapshot) => (
              <div
                ref={colDragProvided.innerRef}
                {...colDragProvided.draggableProps}
                className={`flex w-72 shrink-0 flex-col ${colDragSnapshot.isDragging ? 'opacity-80 shadow-2xl' : ''}`}
              >
                {/* Column Header */}
                <div
                  {...(editMode ? colDragProvided.dragHandleProps : {})}
                  className={`mb-3 flex items-center justify-between rounded-lg border px-3 py-2.5 group transition ${
                    editMode
                      ? 'border-purple-300 bg-purple-50 cursor-grab active:cursor-grabbing'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {editMode && <GripVertical className="w-3.5 h-3.5 text-purple-400" />}
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: `var(--color-${col.color}-500, #64748b)` }}
                    />
                    <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-slate-600 shadow-sm">
                      {columnCases.length}
                    </span>
                    {col.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setStageSettingsId(stageSettingsId === col.id ? null : col.id); }}
                        className={`p-1 transition ${stageSettingsId === col.id ? 'text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}
                        title="Stage notification settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {col.notify_attorney && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 rounded-full" title="Attorney email on">
                        <Mail className="w-2.5 h-2.5 text-blue-600" />
                      </span>
                    )}
                    {col.notify_email && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 rounded-full" title="Client email on">
                        <Mail className="w-2.5 h-2.5 text-emerald-600" />
                      </span>
                    )}
                    {col.notify_sms && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 rounded-full" title="SMS on">
                        <MessageSquare className="w-2.5 h-2.5 text-purple-600" />
                      </span>
                    )}
                    {col.id && (
                      <button
                        onClick={() => handleDeleteStage(col.id, col.label)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition"
                        title="Delete this stage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Stage Settings Panel */}
                {stageSettingsId === col.id && (
                  <StageSettingsPanel
                    stage={col}
                    staffAttorneys={staffAttorneyList}
                    onSave={async (updates) => {
                      try {
                        await updatePipelineStage(col.id, updates);
                        setColumns(prev => prev.map(c => c.id === col.id ? { ...c, ...updates } : c));
                        setStageSettingsId(null);
                      } catch (err) { console.error('Failed to update stage:', err); }
                    }}
                    onClose={() => setStageSettingsId(null)}
                  />
                )}

                {/* Droppable Area */}
                <Droppable droppableId={col.key} type="CASE" isDropDisabled={editMode}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex min-h-[200px] flex-1 flex-col gap-3 rounded-lg border-2 border-dashed p-2 transition-colors ${
                        snapshot.isDraggingOver
                          ? 'border-primary-300 bg-primary-50/50'
                          : 'border-transparent bg-slate-50/50'
                      }`}
                    >
                      {columnCases.length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex flex-1 items-center justify-center py-8">
                          <p className="text-xs text-slate-400">No cases</p>
                        </div>
                      )}
                      {columnCases.map((caseData, index) => (
                        <Draggable key={caseData.id} draggableId={caseData.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={`transition-shadow ${
                                dragSnapshot.isDragging ? 'shadow-lg ring-2 ring-primary-300' : ''
                              } ${updating === caseData.id ? 'opacity-60' : ''}`}
                            >
                              <div className="group/card relative">
                                <CaseCard
                                  caseData={caseData}
                                  onClick={() => navigate(`/attorney/cases/${caseData.id}`)}
                                  onTypeChange={(id, newType) => setCases(prev => prev.map(c => c.id === id ? { ...c, case_type: newType } : c))}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCase(caseData.id, caseData.plaintiff_name || caseData.client_name || 'this case');
                                  }}
                                  className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 p-1 bg-white rounded-full shadow-sm border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-300 transition"
                                  title="Delete case"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
                )}
              </Draggable>
            );
          })}
          {columnsProvided.placeholder}

          {/* Add Stage Column */}
          <div className="flex w-60 shrink-0 flex-col">
            {showAddStage ? (
              <div className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 p-3">
                <input
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddStage();
                    if (e.key === 'Escape') { setShowAddStage(false); setNewStageName(''); }
                  }}
                  placeholder="Stage name..."
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddStage}
                    disabled={!newStageName.trim() || addingStage}
                    className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Check className="w-3 h-3" /> {addingStage ? 'Adding...' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setShowAddStage(false); setNewStageName(''); }}
                    className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddStage(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 py-3 text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition"
              >
                <Plus className="w-4 h-4" /> Add Stage
              </button>
            )}
          </div>
        </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Oise Law engagement-contract confirmation */}
      {engagementSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Send Representation Agreement?</h2>
              <p className="text-sm text-slate-600 mt-2">
                LegalFlow will email <strong>{engagementSendModal.caseName}</strong> the Oise Law Group PC representation agreement for electronic signature and date.
              </p>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-amber-900">Attorney: Esther Oise</p>
                <p className="mt-1 text-amber-800">The case will move to <strong>Doc Sent for Signature</strong> only after the signing invitation is accepted for delivery.</p>
              </div>
              <p>After the client signs, LegalFlow will save the signed agreement to the case and automatically move the case to <strong>Documents Signed</strong>.</p>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                disabled={sendingEngagement}
                onClick={() => setEngagementSendModal(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingEngagement}
                onClick={handleConfirmEngagementSend}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {sendingEngagement && <Loader2 className="w-4 h-4 animate-spin" />}
                {sendingEngagement ? 'Sending Contract…' : 'Send Contract for Signature'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notifyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Notify Client?</h2>
              <p className="text-sm text-slate-500 mt-1">
                Moving <strong>{notifyModal.caseName}</strong> to <strong>{notifyModal.stage?.label || notifyModal.newStatus}</strong>
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                  Send Email
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
                  Send SMS
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={notifyAttorney} onChange={(e) => setNotifyAttorney(e.target.checked)} />
                  Notify Attorney
                </label>
              </div>
              {notifyAttorney && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Select Attorney to Notify</label>
                  <select value={notifyAttorneyId} onChange={(e) => setNotifyAttorneyId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="assigned">Assigned Attorney (auto)</option>
                    {staffAttorneyList.map(a => (
                      <option key={a.id} value={a.id}>{a.full_name}{a.email ? ` (${a.email})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {(sendEmail || sendSms) && (
                <textarea
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  rows={3}
                  placeholder={`Hi {client_name}, your case has been updated to: {stage_name}. We will keep you informed of any further updates.`}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                />
              )}
              <p className="text-[10px] text-slate-400">
                Use {'{client_name}'}, {'{stage_name}'}, {'{case_status}'} in your message
              </p>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={handleSkipNotification}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                Move Without Notifying
              </button>
              <button onClick={handleSendNotification}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                {sendEmail || sendSms ? 'Move & Notify' : 'Move Case'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function StageSettingsPanel({ stage, staffAttorneys, onSave, onClose }) {
  const [notifyAttorney, setNotifyAttorney] = useState(stage.notify_attorney || false);
  const [notifyEmail, setNotifyEmail] = useState(stage.notify_email || false);
  const [notifySms, setNotifySms] = useState(stage.notify_sms || false);
  const [attorneyId, setAttorneyId] = useState(stage.notify_attorney_id || 'assigned');
  const [template, setTemplate] = useState(
    stage.notification_template || `Hi {attorney_name},\n\nThe case for {client_name} has been moved to "${stage.label || stage.name}". Please review it in LegalFlow.\n\n{case_link}`
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      notify_attorney: notifyAttorney,
      notify_email: notifyEmail,
      notify_sms: notifySms,
      notify_attorney_id: attorneyId,
      notification_template: template,
    });
    setSaving(false);
  }

  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-700">Stage Notifications</h4>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={notifyAttorney} onChange={e => setNotifyAttorney(e.target.checked)}
          className="rounded border-slate-300" />
        <Mail className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-xs text-slate-700">Email attorney when case enters this stage</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)}
          className="rounded border-slate-300" />
        <Mail className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs text-slate-700">Email client when case enters this stage</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={notifySms} onChange={e => setNotifySms(e.target.checked)}
          className="rounded border-slate-300" />
        <MessageSquare className="w-3.5 h-3.5 text-purple-500" />
        <span className="text-xs text-slate-700">Text (SMS) attorney when case enters this stage</span>
      </label>

      {notifyAttorney && (
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Which Attorney</label>
          <select value={attorneyId} onChange={e => setAttorneyId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="assigned">Assigned Attorney (auto)</option>
            {staffAttorneys.map(a => (
              <option key={a.id} value={a.id}>{a.full_name} ({a.email})</option>
            ))}
          </select>
        </div>
      )}

      {(notifyAttorney || notifyEmail) && (
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            Email Template
            <span className="ml-2 font-normal normal-case text-slate-400">
              Use: {'{client_name}'} {'{attorney_name}'} {'{stage_name}'} {'{case_link}'}
            </span>
          </label>
          <textarea value={template} onChange={e => setTemplate(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono" />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1 text-xs text-slate-500">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
      </div>
    </div>
  );
}
