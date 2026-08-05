import React, { useState } from 'react';
import { Calendar, Clock, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

export default function CaseCard({ caseData, onClick, onTypeChange }) {
  const {
    client_name,
    defendants,
    case_type,
    created_at,
    updated_at,
  } = caseData;

  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState(() => parseCaseTypes(case_type));
  const [saving, setSaving] = useState(false);

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

  async function toggleType(type) {
    const next = selectedTypes.includes(type)
      ? selectedTypes.filter(t => t !== type)
      : [...selectedTypes, type];
    setSelectedTypes(next);
    setSaving(true);
    try {
      await supabase.from('cases').update({ case_type: next.join(',') }).eq('id', caseData.id);
      if (onTypeChange) onTypeChange(caseData.id, next.join(','));
    } catch (err) { console.error('Failed to update case type:', err); }
    finally { setSaving(false); }
  }

  return (
    <div
      className={`group/card cursor-pointer rounded-lg border border-slate-200 border-l-4 ${borderClass} bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
    >
      {/* Case Name */}
      <div className="flex items-center justify-between">
        <p
          onClick={onClick}
          className="truncate text-sm font-semibold text-slate-900 hover:text-primary-700 flex-1 min-w-0"
          title={`${client_name || caseData.plaintiff_name || 'Unknown'} v. ${defendantText}`}
        >
          {client_name || caseData.plaintiff_name || 'Unknown Client'} v. {defendantText}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); setShowTypeSelector(!showTypeSelector); }}
          className={`p-1 shrink-0 ml-1 transition ${showTypeSelector ? 'text-blue-600' : 'text-slate-300 hover:text-slate-500'}`}
          title="Set case type"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline type selector */}
      {showTypeSelector && (
        <div className="mt-2 flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
          {['FCRA', 'FDCPA', 'TCPA'].map(type => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                selectedTypes.includes(type)
                  ? type === 'FCRA' ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : type === 'FDCPA' ? 'bg-purple-100 text-purple-700 border-purple-300'
                    : 'bg-green-100 text-green-700 border-green-300'
                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
              }`}
            >
              {type}
            </button>
          ))}
          {saving && <Clock className="w-3 h-3 animate-spin text-slate-400" />}
        </div>
      )}

      {/* Case type badges */}
      {!showTypeSelector && caseTypes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" onClick={onClick}>
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
      )}

      {/* Footer: date + days */}
      <div className="mt-3 flex items-center justify-between" onClick={onClick}>
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
