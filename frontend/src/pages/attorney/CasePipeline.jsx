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
} from 'lucide-react';
import { getCases, updateCaseStatus, getPipelineStages, getPipelines, createPipelineStage, deletePipelineStage, createPipeline, reorderPipelineStages } from '../../lib/api';
import CaseCard from '../../components/CaseCard';

// ---------------------------------------------------------------------------
// Fallback columns (used if pipeline_stages table hasn't been set up)
// ---------------------------------------------------------------------------

const DEFAULT_COLUMNS = [
  { key: 'submitted', label: 'Submitted', color: 'blue' },
  { key: 'approved_for_processing', label: 'Approved for Processing', color: 'indigo' },
  { key: 'agents_processing', label: 'Agents Processing', color: 'cyan' },
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load pipelines, stages, and cases in parallel
      const [pipelinesData, stagesData, casesData] = await Promise.all([
        getPipelines().catch(() => []),
        getPipelineStages(activePipeline).catch(() => null),
        getCases(),
      ]);

      setPipelines(pipelinesData || []);

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
      setLoading(false);
    }
  }, [activePipeline]);

  useEffect(() => {
    fetchData();
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
  const handleCaseDragEnd = useCallback(
    async (result) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      const caseId = draggableId;
      const newStatus = destination.droppableId;
      const oldStatus = source.droppableId;

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
    },
    []
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
                    {!col.is_system && col.id && (
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
                              <CaseCard
                                caseData={caseData}
                                onClick={() => navigate(`/attorney/cases/${caseData.id}`)}
                              />
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
    </div>
  );
}
