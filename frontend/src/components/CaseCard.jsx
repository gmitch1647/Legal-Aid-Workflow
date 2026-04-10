import React from 'react';
import { Calendar, Clock } from 'lucide-react';

const CASE_TYPE_STYLES = {
  FCRA: 'bg-blue-100 text-blue-700 border-blue-200',
  FDCPA: 'bg-purple-100 text-purple-700 border-purple-200',
  TCPA: 'bg-green-100 text-green-700 border-green-200',
};

const CASE_TYPE_BORDER = {
  FCRA: 'border-l-blue-500',
  FDCPA: 'border-l-purple-500',
  TCPA: 'border-l-green-500',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDaysInStage(updatedAt) {
  if (!updatedAt) return 0;
  const updated = new Date(updatedAt);
  const now = new Date();
  const diffMs = now - updated;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getDaysColor(days) {
  if (days < 3) return 'text-green-600 bg-green-50';
  if (days <= 7) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

function getPrimaryCaseType(caseType) {
  if (!caseType) return 'FCRA';
  if (typeof caseType === 'string') {
    const types = caseType.split(',').map((t) => t.trim().toUpperCase());
    return types[0] || 'FCRA';
  }
  if (Array.isArray(caseType)) return caseType[0] || 'FCRA';
  return 'FCRA';
}

function parseCaseTypes(caseType) {
  if (!caseType) return [];
  if (typeof caseType === 'string') {
    return caseType.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
  }
  if (Array.isArray(caseType)) return caseType.map((t) => t.toUpperCase());
  return [];
}

export default function CaseCard({ caseData, onClick }) {
  const {
    client_name,
    defendants,
    case_type,
    created_at,
    updated_at,
  } = caseData;

  const caseTypes = parseCaseTypes(case_type);
  const primaryType = getPrimaryCaseType(case_type);
  const borderClass = CASE_TYPE_BORDER[primaryType] || 'border-l-slate-400';
  const days = getDaysInStage(updated_at);
  const daysColor = getDaysColor(days);

  const defendantText =
    Array.isArray(defendants) && defendants.length > 0
      ? defendants.map((d) => (typeof d === 'string' ? d : d.name)).join(', ')
      : typeof defendants === 'string'
        ? defendants
        : 'No defendant';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`group cursor-pointer rounded-lg border border-slate-200 border-l-4 ${borderClass} bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
    >
      {/* Client name */}
      <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-primary-700">
        {client_name || 'Unknown Client'}
      </p>

      {/* Defendants */}
      <p className="mt-1 truncate text-xs text-slate-500" title={defendantText}>
        vs. {defendantText}
      </p>

      {/* Case type badges */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {caseTypes.map((type) => (
          <span
            key={type}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              CASE_TYPE_STYLES[type] || 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {type}
          </span>
        ))}
      </div>

      {/* Footer: date + days */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Calendar className="h-3 w-3" />
          <span>{formatDate(created_at)}</span>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${daysColor}`}
        >
          <Clock className="h-3 w-3" />
          <span>
            {days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
          </span>
        </div>
      </div>
    </div>
  );
}
