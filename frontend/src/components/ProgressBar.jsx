import React from 'react';
import { Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Stage Definitions
// ---------------------------------------------------------------------------

const CLIENT_STAGES = [
  { label: 'Received', key: 'received' },
  { label: 'Being Reviewed', key: 'being_reviewed' },
  { label: 'In Progress', key: 'in_progress' },
  { label: 'Draft Ready', key: 'draft_ready' },
  { label: 'Completed', key: 'completed' },
];

const ATTORNEY_STAGES = [
  { label: 'Submitted', key: 'submitted' },
  { label: 'Approved', key: 'approved_for_processing' },
  { label: 'AI Processing', key: 'agents_processing' },
  { label: 'Draft Ready', key: 'draft_ready' },
  { label: 'Attorney Review', key: 'attorney_review' },
  { label: 'Approved', key: 'approved' },
  { label: 'Filed', key: 'filed' },
  { label: 'Closed', key: 'closed' },
];

// ---------------------------------------------------------------------------
// Status-to-stage mapping
// ---------------------------------------------------------------------------

function mapStatusToClientIndex(status) {
  switch (status) {
    case 'submitted':
      return 0;
    case 'approved_for_processing':
      return 1;
    case 'agents_processing':
      return 2;
    case 'draft_ready':
    case 'attorney_review':
      return 3;
    case 'approved':
    case 'filed':
    case 'closed':
      return 4;
    case 'denied':
      return -1; // Special case
    default:
      return 0;
  }
}

function mapStatusToAttorneyIndex(status) {
  switch (status) {
    case 'submitted':
      return 0;
    case 'approved_for_processing':
      return 1;
    case 'agents_processing':
      return 2;
    case 'draft_ready':
      return 3;
    case 'attorney_review':
      return 4;
    case 'approved':
      return 5;
    case 'filed':
      return 6;
    case 'closed':
      return 7;
    case 'denied':
      return -1;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Horizontal Progress Bar (Desktop)
// ---------------------------------------------------------------------------

function HorizontalProgressBar({ stages, currentIndex }) {
  return (
    <div className="w-full">
      <div className="flex items-start justify-between">
        {stages.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isFuture = idx > currentIndex;

          return (
            <div
              key={stage.key}
              className="flex flex-col items-center"
              style={{ flex: '1 1 0%' }}
            >
              {/* Circle and connecting lines */}
              <div className="relative flex w-full items-center justify-center">
                {/* Left connecting line */}
                {idx > 0 && (
                  <div
                    className={`absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2 transition-colors duration-500 ${
                      isCompleted || isCurrent ? 'bg-green-500' : 'bg-slate-200'
                    }`}
                  />
                )}

                {/* Right connecting line */}
                {idx < stages.length - 1 && (
                  <div
                    className={`absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2 transition-colors duration-500 ${
                      isCompleted ? 'bg-green-500' : 'bg-slate-200'
                    }`}
                  />
                )}

                {/* Circle */}
                <div
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                    isCompleted
                      ? 'border-green-500 bg-green-500'
                      : isCurrent
                        ? 'border-blue-500 bg-blue-500 ring-4 ring-blue-100'
                        : 'border-slate-300 bg-white'
                  } ${isCurrent ? 'animate-pulse' : ''}`}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 text-white" />
                  ) : isCurrent ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-white" />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  )}
                </div>
              </div>

              {/* Label */}
              <p
                className={`mt-2.5 text-center text-xs font-medium leading-tight transition-colors ${
                  isCompleted
                    ? 'text-green-600'
                    : isCurrent
                      ? 'text-blue-600 font-semibold'
                      : 'text-slate-400'
                }`}
              >
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vertical Stepper (Mobile)
// ---------------------------------------------------------------------------

function VerticalProgressBar({ stages, currentIndex }) {
  return (
    <div className="w-full">
      {stages.map((stage, idx) => {
        const isCompleted = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const isLast = idx === stages.length - 1;

        return (
          <div key={stage.key} className="flex">
            {/* Circle + connector column */}
            <div className="flex flex-col items-center">
              {/* Circle */}
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                  isCompleted
                    ? 'border-green-500 bg-green-500'
                    : isCurrent
                      ? 'border-blue-500 bg-blue-500 ring-4 ring-blue-100'
                      : 'border-slate-300 bg-white'
                } ${isCurrent ? 'animate-pulse' : ''}`}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 text-white" />
                ) : isCurrent ? (
                  <div className="h-2 w-2 rounded-full bg-white" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-slate-300" />
                )}
              </div>

              {/* Vertical connector */}
              {!isLast && (
                <div
                  className={`w-0.5 flex-1 min-h-[24px] transition-colors duration-500 ${
                    isCompleted ? 'bg-green-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>

            {/* Label */}
            <div className={`ml-3 ${isLast ? 'pb-0' : 'pb-5'}`}>
              <p
                className={`text-sm font-medium leading-7 transition-colors ${
                  isCompleted
                    ? 'text-green-600'
                    : isCurrent
                      ? 'text-blue-600 font-semibold'
                      : 'text-slate-400'
                }`}
              >
                {stage.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Denied State
// ---------------------------------------------------------------------------

function DeniedBanner() {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center">
      <p className="text-sm font-medium text-red-700">
        This case has been denied.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ProgressBar({ currentStatus, variant = 'client' }) {
  const isClient = variant === 'client';
  const stages = isClient ? CLIENT_STAGES : ATTORNEY_STAGES;
  const currentIndex = isClient
    ? mapStatusToClientIndex(currentStatus)
    : mapStatusToAttorneyIndex(currentStatus);

  // Handle denied status
  if (currentStatus === 'denied') {
    return <DeniedBanner />;
  }

  return (
    <div>
      {/* Desktop: horizontal */}
      <div className="hidden sm:block">
        <HorizontalProgressBar stages={stages} currentIndex={currentIndex} />
      </div>

      {/* Mobile: vertical */}
      <div className="block sm:hidden">
        <VerticalProgressBar stages={stages} currentIndex={currentIndex} />
      </div>
    </div>
  );
}
