'use client';

import { useState, useEffect, useCallback } from 'react';

/* ─── Types (mirrors quote-readiness-service.ts) ─── */

type ReadinessStatus = 'pass' | 'fail' | 'warn';

interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  fix?: string;
  fixAction?: string;
}

interface ReadinessResult {
  quoteId: number;
  quoteNumber: string;
  checks: ReadinessCheck[];
  canGenerate: boolean;
  failCount: number;
  warnCount: number;
  passCount: number;
}

/* ─── Props ─── */

interface QuoteReadinessCheckerProps {
  quoteId: string;
  quoteNumber: string;
  onClose: () => void;
  onGeneratePdf: () => void;
}

/* ─── Status Icon ─── */

function StatusIcon({ status }: { status: ReadinessStatus }) {
  if (status === 'pass') {
    return (
      <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4" stroke="#2E7D32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (status === 'fail') {
    return (
      <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="#C62828" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 4V9" stroke="#F57F17" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="12" r="1" fill="#F57F17" />
      </svg>
    </div>
  );
}

/* ─── Check Item ─── */

function CheckItem({
  check,
  isExpanded,
  onToggle,
}: {
  check: ReadinessCheck;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const borderColor = {
    pass: 'border-l-green-200',
    fail: 'border-l-red-200',
    warn: 'border-l-amber-200',
  }[check.status];

  const bgColor = {
    pass: 'bg-green-50/30',
    fail: 'bg-red-50/30',
    warn: 'bg-amber-50/30',
  }[check.status];

  return (
    <div className={`border-l-[3px] ${borderColor} ${bgColor} rounded-r-lg mb-1.5 overflow-hidden transition-all duration-200`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 cursor-pointer select-none text-left"
      >
        <StatusIcon status={check.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 tracking-tight">
            {check.label}
          </div>
          {!isExpanded && (
            <div className="text-xs text-gray-400 mt-0.5 truncate">
              {check.detail}
            </div>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className={`transition-transform duration-200 flex-shrink-0 opacity-40 ${isExpanded ? 'rotate-180' : ''}`}
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3.5 pl-14 animate-fade-in">
          <div className="text-[13px] text-gray-500 leading-relaxed">
            {check.detail}
          </div>
          {check.fix && (
            <div
              className={`mt-2.5 text-xs rounded-md px-3 py-2 flex items-center justify-between gap-3 ${
                check.status === 'fail'
                  ? 'text-red-800 bg-red-100/50'
                  : 'text-amber-800 bg-amber-100/50'
              }`}
            >
              <span className="leading-relaxed">{check.fix}</span>
              {check.fixAction && (
                <button
                  type="button"
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold text-white whitespace-nowrap transition-opacity hover:opacity-85 ${
                    check.status === 'fail' ? 'bg-red-700' : 'bg-amber-600'
                  }`}
                >
                  {check.fixAction} →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */

export default function QuoteReadinessChecker({
  quoteId,
  quoteNumber,
  onClose,
  onGeneratePdf,
}: QuoteReadinessCheckerProps) {
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [checkedCount, setCheckedCount] = useState(0);
  const [totalChecks, setTotalChecks] = useState(8); // estimated
  const [error, setError] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setIsChecking(true);
    setChecks([]);
    setCheckedCount(0);
    setExpandedId(null);
    setError(null);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/readiness`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to run checks' }));
        throw new Error(data.error || `Check failed (${response.status})`);
      }

      const data: ReadinessResult = await response.json();
      setTotalChecks(data.checks.filter(Boolean).length);

      // Animate checks appearing one at a time
      const validChecks = data.checks.filter(Boolean);
      let i = 0;
      const interval = setInterval(() => {
        if (i < validChecks.length) {
          const currentCheck = validChecks[i];
          setChecks((prev) => [...prev, currentCheck]);
          setCheckedCount(i + 1);
          i++;
        } else {
          clearInterval(interval);
          setIsChecking(false);
          // Auto-expand first failing check
          const firstFail = validChecks.find((c) => c.status === 'fail');
          if (firstFail) setExpandedId(firstFail.id);
        }
      }, 100);

      return () => clearInterval(interval);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run readiness checks');
      setIsChecking(false);
    }
  }, [quoteId]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const validChecks = checks.filter(Boolean);
  const failCount = validChecks.filter((c) => c.status === 'fail').length;
  const warnCount = validChecks.filter((c) => c.status === 'warn').length;
  const passCount = validChecks.filter((c) => c.status === 'pass').length;
  const hasBlockers = !isChecking && failCount > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="2" width="14" height="16" rx="2" stroke="#1a1a1a" strokeWidth="1.5" />
                <path d="M7 6H13M7 9H13M7 12H10" stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <h2 className="text-[17px] font-semibold text-gray-900 tracking-tight">
                PDF Readiness Check
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M6 6L14 14M14 6L6 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="text-[13px] text-gray-400 mt-1">
            Quote #{quoteNumber} — Checking all requirements before generating your PDF
          </p>

          {/* Progress bar */}
          <div className="mt-4 h-[3px] bg-gray-100 rounded-sm overflow-hidden">
            <div
              className={`h-full rounded-sm transition-all duration-150 ease-out ${
                isChecking
                  ? 'animate-shimmer'
                  : hasBlockers
                    ? 'bg-red-700'
                    : 'bg-green-700'
              }`}
              style={{
                width: `${(checkedCount / totalChecks) * 100}%`,
                ...(isChecking
                  ? {
                      background: 'linear-gradient(90deg, #1a1a1a, #555, #1a1a1a)',
                      backgroundSize: '200% 100%',
                    }
                  : {}),
              }}
            />
          </div>
        </div>

        {/* Check items (scrollable) */}
        <div className="px-4 pt-4 pb-2 overflow-y-auto flex-1 min-h-0">
          {error ? (
            <div className="text-center py-8">
              <div className="text-sm text-red-600 font-medium mb-2">Check failed</div>
              <div className="text-xs text-gray-500 mb-4">{error}</div>
              <button
                type="button"
                onClick={runChecks}
                className="text-xs text-gray-600 hover:text-gray-900 underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {checks.filter(Boolean).map((check) => (
                <CheckItem
                  key={check.id}
                  check={check}
                  isExpanded={expandedId === check.id}
                  onToggle={() => setExpandedId(expandedId === check.id ? null : check.id)}
                />
              ))}
              {isChecking && checks.length < totalChecks && (
                <div className="px-4 py-3 flex items-center gap-3 animate-pulse">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  </div>
                  <span className="text-[13px] text-gray-400">Checking...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Summary footer */}
        {!isChecking && !error && (
          <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">
            {/* Status summary pills */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {failCount > 0 && (
                <span className="text-xs font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                  {failCount} blocker{failCount !== 1 ? 's' : ''}
                </span>
              )}
              {warnCount > 0 && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                  {warnCount} warning{warnCount !== 1 ? 's' : ''}
                </span>
              )}
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                {passCount} passed
              </span>
            </div>

            {/* Action area */}
            {hasBlockers ? (
              <div className="bg-red-50/50 border border-red-100 rounded-lg p-4 text-center">
                <div className="text-sm font-semibold text-red-800 mb-1">
                  Cannot generate PDF
                </div>
                <div className="text-[13px] text-gray-500 leading-relaxed">
                  Resolve the {failCount} blocker{failCount !== 1 ? 's' : ''} above to unlock PDF generation.
                  {warnCount > 0 && ` ${warnCount} warning${warnCount !== 1 ? 's' : ''} can be addressed optionally.`}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-[13px] text-green-700 font-medium mb-3">
                  All checks passed — ready to generate
                </div>
                <button
                  type="button"
                  onClick={onGeneratePdf}
                  className="w-full bg-gray-900 hover:bg-gray-700 text-white rounded-lg px-8 py-3 text-sm font-semibold transition-all shadow-sm hover:-translate-y-px"
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="3" y="1.5" width="12" height="15" rx="1.5" stroke="white" strokeWidth="1.3" />
                      <path d="M6 5.5H12M6 8H12M6 10.5H9" stroke="white" strokeWidth="1" strokeLinecap="round" />
                      <path d="M10.5 13L12.5 15L15 11" stroke="#4CAF50" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Generate PDF Quote
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer note */}
        <div className="text-center pb-4 text-[11px] text-gray-300 tracking-wide">
          Warnings are optional — only blockers prevent PDF generation
        </div>
      </div>
    </div>
  );
}
