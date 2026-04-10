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
} from 'lucide-react';
import { getCases, updateCaseStatus } from '../../lib/api';
import CaseCard from '../../components/CaseCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS = [
  { key: 'submitted', label: 'Submitted', color: 'bg-blue-500', headerBg: 'bg-blue-50', borderColor: 'border-blue-200' },
  { key: 'approved_for_processing', label: 'Approved for Processing', color: 'bg-indigo-500', headerBg: 'bg-indigo-50', borderColor: 'border-indigo-200' },
  { key: 'agents_processing', label: 'Agents Processing', color: 'bg-cyan-500', headerBg: 'bg-cyan-50', borderColor: 'border-cyan-200' },
  { key: 'draft_ready', label: 'Draft Ready', color: 'bg-amber-500', headerBg: 'bg-amber-50', borderColor: 'border-amber-200' },
  { key: 'attorney_review', label: 'Attorney Review', color: 'bg-purple-500', headerBg: 'bg-purple-50', borderColor: 'border-purple-200' },
  { key: 'approved', label: 'Approved', color: 'bg-green-500', headerBg: 'bg-green-50', borderColor: 'border-green-200' },
  { key: 'filed', label: 'Filed', color: 'bg-emerald-500', headerBg: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { key: 'closed', label: 'Closed', color: 'bg-slate-500', headerBg: 'bg-slate-50', borderColor: 'border-slate-200' },
];

const CASE_TYPES = ['FCRA', 'FDCPA', 'TCPA'];

// ---------------------------------------------------------------------------
// Pipeline Component
// ---------------------------------------------------------------------------

export default function CasePipeline() {
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [caseTypeFilter, setCaseTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCases();
      const list = Array.isArray(data) ? data : data?.items ?? data?.cases ?? [];
      setCases(list);
    } catch (err) {
      console.error('Pipeline fetch error:', err);
      setError(err.message || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

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
    COLUMNS.forEach((col) => {
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
  const handleDragEnd = useCallback(
    async (result) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      const caseId = draggableId;
      const newStatus = destination.droppableId;
      const oldStatus = source.droppableId;

      // Optimistic update
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? { ...c, status: newStatus, updated_at: new Date().toISOString() } : c))
      );

      try {
        setUpdating(caseId);
        await updateCaseStatus(caseId, newStatus);
      } catch (err) {
        console.error('Status update failed:', err);
        // Revert on failure
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
      </div>

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
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const columnCases = grouped[col.key] || [];
            return (
              <div key={col.key} className="flex w-72 shrink-0 flex-col">
                {/* Column Header */}
                <div className={`mb-3 flex items-center justify-between rounded-lg border ${col.borderColor} ${col.headerBg} px-3 py-2.5`}>
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                    <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                  </div>
                  <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-slate-600 shadow-sm">
                    {columnCases.length}
                  </span>
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={col.key}>
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
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
