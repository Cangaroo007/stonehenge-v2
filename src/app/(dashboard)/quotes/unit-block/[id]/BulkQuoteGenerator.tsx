'use client';

import { useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

// ============================================================================
// Types
// ============================================================================

interface GenerationUnit {
  unitId: number;
  unitNumber: string;
  unitTypeCode: string;
  finishLevel: string;
  colourScheme: string | null;
  templateId: number;
}

interface NotReadyUnit {
  unitId: number;
  unitNumber: string;
  reason: string;
}

interface DryRunResult {
  ready: GenerationUnit[];
  notReady: NotReadyUnit[];
}

interface GenerationResult {
  unitId: number;
  unitNumber: string;
  status: 'SUCCESS' | 'SKIPPED' | 'ERROR';
  quoteId?: number;
  quoteNumber?: string;
  quoteTotal?: number;
  error?: string;
}

interface ProjectTotals {
  totalArea_sqm: number;
  volumeTier: string;
  volumeDiscount: number;
  subtotalBeforeDiscount: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  gst: number;
  grandTotal: number;
}

interface BulkGenerationResult {
  totalProcessed: number;
  successful: number;
  skipped: number;
  failed: number;
  results: GenerationResult[];
  projectTotals: ProjectTotals;
}

type Phase = 'idle' | 'checking' | 'ready' | 'generating' | 'complete' | 'error';

interface BulkQuoteGeneratorProps {
  projectId: string;
  onGenerationComplete: () => void;
}

// ============================================================================
// Component
// ============================================================================

export default function BulkQuoteGenerator({ projectId, onGenerationComplete }: BulkQuoteGeneratorProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [generationResult, setGenerationResult] = useState<BulkGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showNotReady, setShowNotReady] = useState(false);

  // ========================================================================
  // Dry Run (Check Readiness)
  // ========================================================================

  const handleCheckReadiness = useCallback(async () => {
    setPhase('checking');
    setError(null);
    setGenerationResult(null);

    try {
      const url = `/api/unit-blocks/${projectId}/generate${forceRegenerate ? '?forceRegenerate=true' : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to check readiness');
      }

      const result: DryRunResult = await res.json();
      setDryRun(result);

      // Select all ready units by default
      setSelectedUnitIds(new Set(result.ready.map(u => u.unitId)));
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check readiness');
      setPhase('error');
    }
  }, [projectId, forceRegenerate]);

  // ========================================================================
  // Generate Quotes
  // ========================================================================

  const handleGenerate = useCallback(async () => {
    if (!dryRun || selectedUnitIds.size === 0) return;

    setPhase('generating');
    setError(null);
    setProgress({ current: 0, total: selectedUnitIds.size });

    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitIds: Array.from(selectedUnitIds),
          forceRegenerate,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate quotes');
      }

      const result: BulkGenerationResult = await res.json();
      setGenerationResult(result);
      setProgress({ current: result.totalProcessed, total: result.totalProcessed });
      setPhase('complete');
      onGenerationComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate quotes');
      setPhase('error');
    }
  }, [projectId, dryRun, selectedUnitIds, forceRegenerate, onGenerationComplete]);

  // ========================================================================
  // Selection Helpers
  // ========================================================================

  const toggleUnit = (unitId: number) => {
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (dryRun) {
      setSelectedUnitIds(new Set(dryRun.ready.map(u => u.unitId)));
    }
  };

  const selectNone = () => {
    setSelectedUnitIds(new Set());
  };

  const handleRetryFailed = useCallback(async () => {
    if (!generationResult) return;
    const failedIds = generationResult.results
      .filter(r => r.status === 'ERROR')
      .map(r => r.unitId);

    if (failedIds.length === 0) return;

    setPhase('generating');
    setError(null);
    setProgress({ current: 0, total: failedIds.length });

    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitIds: failedIds,
          forceRegenerate: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to retry generation');
      }

      const result: BulkGenerationResult = await res.json();
      setGenerationResult(result);
      setProgress({ current: result.totalProcessed, total: result.totalProcessed });
      setPhase('complete');
      onGenerationComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry generation');
      setPhase('error');
    }
  }, [projectId, generationResult, onGenerationComplete]);

  const handleReset = () => {
    setPhase('idle');
    setDryRun(null);
    setGenerationResult(null);
    setError(null);
    setSelectedUnitIds(new Set());
    setShowNotReady(false);
  };

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Generate Quotes</h2>
            <p className="text-sm text-gray-500 mt-1">
              Generate quotes for all units using templates and finish tier mappings
            </p>
          </div>
          {phase === 'complete' && (
            <button onClick={handleReset} className="text-sm text-gray-500 hover:text-gray-700">
              Start Over
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* ================================================================ */}
        {/* IDLE — Show generate button */}
        {/* ================================================================ */}
        {phase === 'idle' && (
          <div className="text-center py-4">
            <div className="mb-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={forceRegenerate}
                  onChange={(e) => setForceRegenerate(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Force regenerate (replace existing quotes)
              </label>
            </div>
            <button
              onClick={handleCheckReadiness}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Check Readiness &amp; Generate Quotes
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* CHECKING — Loading state */}
        {/* ================================================================ */}
        {phase === 'checking' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-600">Checking unit readiness...</p>
          </div>
        )}

        {/* ================================================================ */}
        {/* READY — Show dry run results */}
        {/* ================================================================ */}
        {phase === 'ready' && dryRun && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-700">Ready to generate</p>
                <p className="text-2xl font-bold text-green-600">{dryRun.ready.length} units</p>
              </div>
              <div className={`rounded-lg p-4 ${dryRun.notReady.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                <p className={`text-sm ${dryRun.notReady.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>Not ready</p>
                <p className={`text-2xl font-bold ${dryRun.notReady.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{dryRun.notReady.length} units</p>
              </div>
            </div>

            {/* Not-ready units */}
            {dryRun.notReady.length > 0 && (
              <div>
                <button
                  onClick={() => setShowNotReady(!showNotReady)}
                  className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900"
                >
                  <svg className={`h-4 w-4 transition-transform ${showNotReady ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  {showNotReady ? 'Hide' : 'Show'} not-ready units
                </button>
                {showNotReady && (
                  <div className="mt-2 space-y-1">
                    {dryRun.notReady.map((unit) => (
                      <div key={unit.unitId} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded px-3 py-2 text-sm">
                        <span className="font-medium text-gray-700">Unit {unit.unitNumber}</span>
                        <span className="text-amber-700">{unit.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Unit selection */}
            {dryRun.ready.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Select units to generate:</p>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800">Select All</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={selectNone} className="text-xs text-blue-600 hover:text-blue-800">Select None</button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {dryRun.ready.map((unit) => (
                    <label key={unit.unitId} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUnitIds.has(unit.unitId)}
                        onChange={() => toggleUnit(unit.unitId)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">Unit {unit.unitNumber}</span>
                      <span className="text-xs text-gray-500">Type {unit.unitTypeCode} &middot; {unit.finishLevel}{unit.colourScheme ? ` / ${unit.colourScheme}` : ''}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Generate button */}
            <div className="flex items-center justify-between pt-2">
              <button onClick={handleReset} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={selectedUnitIds.size === 0}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Generate {selectedUnitIds.size} Quote{selectedUnitIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* GENERATING — Progress indicator */}
        {/* ================================================================ */}
        {phase === 'generating' && (
          <div className="py-8 space-y-4">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-lg font-medium text-gray-900">Generating Quotes...</p>
              <p className="text-sm text-gray-500 mt-1">
                Processing {progress.total} unit{progress.total !== 1 ? 's' : ''}. Please do not close this page.
              </p>
            </div>
            <div className="max-w-md mx-auto">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300 animate-pulse"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* COMPLETE — Results */}
        {/* ================================================================ */}
        {phase === 'complete' && generationResult && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-sm text-green-700">Generated</p>
                <p className="text-2xl font-bold text-green-600">{generationResult.successful}</p>
              </div>
              <div className={`rounded-lg p-4 text-center ${generationResult.failed > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
                <p className={`text-sm ${generationResult.failed > 0 ? 'text-red-700' : 'text-gray-500'}`}>Failed</p>
                <p className={`text-2xl font-bold ${generationResult.failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>{generationResult.failed}</p>
              </div>
              <div className={`rounded-lg p-4 text-center ${generationResult.skipped > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                <p className={`text-sm ${generationResult.skipped > 0 ? 'text-amber-700' : 'text-gray-500'}`}>Skipped</p>
                <p className={`text-2xl font-bold ${generationResult.skipped > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{generationResult.skipped}</p>
              </div>
            </div>

            {/* Results table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quote #</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {generationResult.results.map((result) => (
                    <tr key={result.unitId} className={result.status === 'ERROR' ? 'bg-red-50' : result.status === 'SKIPPED' ? 'bg-amber-50' : ''}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">Unit {result.unitNumber}</td>
                      <td className="px-4 py-3 text-sm">
                        {result.status === 'SUCCESS' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Generated
                          </span>
                        )}
                        {result.status === 'SKIPPED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            Skipped
                          </span>
                        )}
                        {result.status === 'ERROR' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800" title={result.error}>
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {result.quoteNumber ? (
                          <Link href={`/quotes/${result.quoteId}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                            {result.quoteNumber}
                          </Link>
                        ) : result.error ? (
                          <span className="text-red-600 text-xs">{result.error}</span>
                        ) : (
                          <span className="text-gray-400">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {result.quoteTotal != null ? formatCurrency(result.quoteTotal) : <span className="text-gray-400">&mdash;</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Project totals */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-4">Project Totals</h3>
              <div className="max-w-md space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-800">Total Area:</span>
                  <span className="font-medium text-blue-900">{generationResult.projectTotals.totalArea_sqm.toFixed(2)} m&sup2;</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-800">Volume Tier:</span>
                  <span className="font-medium text-blue-900">{generationResult.projectTotals.volumeTier}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-800">Subtotal (before discount):</span>
                  <span className="font-medium text-blue-900">{formatCurrency(generationResult.projectTotals.subtotalBeforeDiscount)}</span>
                </div>
                {generationResult.projectTotals.volumeDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Volume Discount ({generationResult.projectTotals.volumeDiscount}%):</span>
                    <span className="font-medium">-{formatCurrency(generationResult.projectTotals.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-blue-800">Subtotal (after discount):</span>
                  <span className="font-medium text-blue-900">{formatCurrency(generationResult.projectTotals.subtotalAfterDiscount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-800">GST (10%):</span>
                  <span className="font-medium text-blue-900">{formatCurrency(generationResult.projectTotals.gst)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold pt-2 border-t border-blue-200">
                  <span className="text-blue-900">Grand Total:</span>
                  <span className="text-blue-900">{formatCurrency(generationResult.projectTotals.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Post-generation actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-3">
                {generationResult.failed > 0 && (
                  <button
                    onClick={handleRetryFailed}
                    className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
                  >
                    Retry {generationResult.failed} Failed
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  disabled
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-400 rounded-lg cursor-not-allowed"
                  title="Coming soon"
                >
                  Export Summary PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* ERROR — Show error with retry */}
        {/* ================================================================ */}
        {phase === 'error' && error && (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-3">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-red-600 font-medium mb-1">Generation Failed</p>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleReset} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Start Over
              </button>
              <button
                onClick={handleCheckReadiness}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
