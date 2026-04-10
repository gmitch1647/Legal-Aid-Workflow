import React, { useState, useCallback } from 'react';
import {
  FileSearch,
  Scale,
  BookOpen,
  DollarSign,
  FileText,
  CheckSquare,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { rerunAgent } from '../lib/api';

const AGENTS = [
  { key: 'intake_analyst', label: 'Intake Analyst', icon: FileSearch },
  { key: 'case_classifier', label: 'Case Classifier', icon: Scale },
  { key: 'legal_researcher', label: 'Legal Researcher', icon: BookOpen },
  { key: 'damages_analyst', label: 'Damages Analyst', icon: DollarSign },
  { key: 'complaint_drafter', label: 'Complaint Drafter', icon: FileText },
  { key: 'qa_reviewer', label: 'QA Reviewer', icon: CheckSquare },
];

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(startStr, endStr) {
  if (!startStr || !endStr) return '';
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end - start;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function StatusIndicator({ status }) {
  switch (status) {
    case 'complete':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'running':
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return (
        <div className="flex h-5 w-5 items-center justify-center">
          <div className="h-3 w-3 rounded-full border-2 border-slate-300 bg-slate-100" />
        </div>
      );
  }
}

function StatusText({ agentStatus }) {
  const { status, completed_at, started_at } = agentStatus;

  switch (status) {
    case 'complete':
      return (
        <span className="text-sm text-green-600">
          Complete
          {completed_at && (
            <span className="ml-1 text-xs text-slate-400">
              ({formatTime(completed_at)}
              {started_at && completed_at && ` - ${formatDuration(started_at, completed_at)}`})
            </span>
          )}
        </span>
      );
    case 'running':
      return <span className="text-sm text-blue-600">Processing...</span>;
    case 'error':
      return <span className="text-sm text-red-600">Error</span>;
    default:
      return <span className="text-sm text-slate-400">Waiting...</span>;
  }
}

function AgentRow({ agent, agentStatus, caseId, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);

  const status = agentStatus?.status || 'pending';
  const Icon = agent.icon;

  const handleRetry = useCallback(
    async (e) => {
      e.stopPropagation();
      setRetrying(true);
      setRetryError(null);
      try {
        await rerunAgent(caseId, agent.key);
      } catch (err) {
        setRetryError(err.message || 'Retry failed');
      } finally {
        setRetrying(false);
      }
    },
    [caseId, agent.key]
  );

  const statusBorder =
    status === 'complete'
      ? 'border-green-200 bg-green-50/50'
      : status === 'running'
        ? 'border-blue-200 bg-blue-50/50'
        : status === 'error'
          ? 'border-red-200 bg-red-50/50'
          : 'border-slate-200 bg-white';

  const connectorColor =
    status === 'complete'
      ? 'bg-green-400'
      : status === 'running'
        ? 'bg-blue-400'
        : 'bg-slate-200';

  return (
    <div className="relative flex items-stretch">
      {/* Vertical connector */}
      <div className="relative flex w-10 shrink-0 flex-col items-center">
        <div
          className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
            status === 'complete'
              ? 'border-green-500 bg-green-50'
              : status === 'running'
                ? 'border-blue-500 bg-blue-50'
                : status === 'error'
                  ? 'border-red-500 bg-red-50'
                  : 'border-slate-300 bg-white'
          }`}
        >
          <StatusIndicator status={status} />
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 ${connectorColor}`} />
        )}
      </div>

      {/* Agent card */}
      <div className="mb-3 ml-3 flex-1">
        <div
          className={`cursor-pointer rounded-lg border p-4 transition-all hover:shadow-sm ${statusBorder}`}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  status === 'complete'
                    ? 'bg-green-100 text-green-600'
                    : status === 'running'
                      ? 'bg-blue-100 text-blue-600'
                      : status === 'error'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{agent.label}</p>
                <StatusText agentStatus={agentStatus || { status: 'pending' }} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {status === 'error' && (
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                  {retrying ? 'Retrying...' : 'Retry'}
                </button>
              )}
              {(status === 'complete' || status === 'error') && (
                expanded ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )
              )}
            </div>
          </div>

          {/* Expanded detail */}
          {expanded && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              {status === 'error' && agentStatus?.error_message && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">{agentStatus.error_message}</p>
                </div>
              )}
              {retryError && (
                <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">Retry failed: {retryError}</p>
                </div>
              )}
              {status === 'complete' && agentStatus?.output_data && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Output Summary
                  </p>
                  <div className="rounded-md bg-slate-50 p-3">
                    {typeof agentStatus.output_data === 'string' ? (
                      <p className="text-sm text-slate-700">{agentStatus.output_data}</p>
                    ) : (
                      <pre className="max-h-48 overflow-auto text-xs text-slate-600">
                        {JSON.stringify(agentStatus.output_data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
              {status === 'complete' && !agentStatus?.output_data && (
                <p className="text-sm italic text-slate-400">No output data available.</p>
              )}
              {agentStatus?.started_at && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  Started at {formatTime(agentStatus.started_at)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgentPipelineStatus({ caseId, statuses = [] }) {
  const statusMap = {};
  statuses.forEach((s) => {
    statusMap[s.agent_name] = s;
  });

  const completedCount = AGENTS.filter(
    (a) => statusMap[a.key]?.status === 'complete'
  ).length;

  const hasError = AGENTS.some((a) => statusMap[a.key]?.status === 'error');
  const isRunning = AGENTS.some((a) => statusMap[a.key]?.status === 'running');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">AI Processing Pipeline</h3>
          <p className="mt-1 text-sm text-slate-500">
            {completedCount} of {AGENTS.length} agents complete
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasError && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
              <XCircle className="h-3.5 w-3.5" />
              Error
            </span>
          )}
          {isRunning && !hasError && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Processing
            </span>
          )}
          {completedCount === AGENTS.length && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
              <CheckCircle className="h-3.5 w-3.5" />
              All Complete
            </span>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="mb-6">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              hasError
                ? 'bg-red-400'
                : completedCount === AGENTS.length
                  ? 'bg-green-500'
                  : 'bg-blue-500'
            }`}
            style={{ width: `${(completedCount / AGENTS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Agent rows */}
      <div>
        {AGENTS.map((agent, idx) => (
          <AgentRow
            key={agent.key}
            agent={agent}
            agentStatus={statusMap[agent.key]}
            caseId={caseId}
            isLast={idx === AGENTS.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
