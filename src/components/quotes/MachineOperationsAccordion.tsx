'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

interface PieceOperation {
  operationType: string;
  machineName: string;
  machineId: string;
  kerfMm: number;
  isApplicable: boolean;
  reason?: string;
  cutoutCount?: number;
}

interface PieceOperations {
  pieceId: string;
  label: string;
  room: string;
  thicknessMm: number;
  operations: PieceOperation[];
}

interface MachineOperationsResponse {
  quoteId: number;
  pieces: PieceOperations[];
}

interface MachineDefault {
  id: string;
  operationType: string;
  machineId: string;
  machine: {
    id: string;
    name: string;
    kerfWidthMm: number;
  };
}

interface MachineOperationsAccordionProps {
  quoteId: string;
  pieces: Array<{
    id: number;
    cutouts?: Array<{ quantity?: number; count?: number }>;
  }>;
  mode: 'view' | 'edit';
}

// ── Constants ────────────────────────────────────────────────────────────────

const OPERATION_ORDER = [
  'INITIAL_CUT',
  'EDGE_POLISHING',
  'MITRING',
  'LAMINATION',
  'CUTOUT',
] as const;

const OPERATION_META: Record<string, { label: string; shortLabel: string }> = {
  INITIAL_CUT: { label: 'Initial Cut', shortLabel: 'Cut' },
  EDGE_POLISHING: { label: 'Edge Polishing', shortLabel: 'Polish' },
  MITRING: { label: 'Mitring', shortLabel: 'Mitre' },
  LAMINATION: { label: 'Lamination', shortLabel: 'Laminate' },
  CUTOUT: { label: 'Cutouts', shortLabel: 'Cutout' },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function MachineOperationsAccordion({
  quoteId,
  pieces,
  mode,
}: MachineOperationsAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [machineOps, setMachineOps] = useState<MachineOperationsResponse | null>(null);
  const [defaults, setDefaults] = useState<MachineDefault[]>([]);

  // Fetch machine operations for this quote
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [opsRes, defaultsRes] = await Promise.all([
          fetch(`/api/quotes/${quoteId}/machine-operations`),
          fetch('/api/admin/pricing/machine-defaults'),
        ]);

        if (!cancelled && opsRes.ok) {
          const opsData = await opsRes.json();
          setMachineOps(opsData);
        }

        if (!cancelled && defaultsRes.ok) {
          const defaultsData = await defaultsRes.json();
          setDefaults(defaultsData);
        }
      } catch {
        // Non-critical — silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [quoteId]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="card overflow-hidden animate-pulse">
        <div className="flex items-center gap-2 p-4">
          <div className="h-5 w-5 bg-gray-200 rounded" />
          <div className="h-4 bg-gray-200 rounded w-56" />
        </div>
      </div>
    );
  }

  // Empty state — no machine defaults configured
  if (defaults.length === 0) {
    return (
      <div className="card overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium text-gray-900">Machine Operations</span>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            No machine defaults configured. Set up machines in Pricing Admin.
          </p>
          <Link
            href="/admin/pricing"
            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Go to Pricing Admin
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  // Count total applicable operations across all pieces
  const totalOperations = machineOps?.pieces.reduce(
    (sum, p) => sum + p.operations.filter((op) => op.isApplicable).length,
    0
  ) ?? 0;
  const totalPieces = machineOps?.pieces.length ?? 0;

  return (
    <div className="card overflow-hidden">
      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="font-medium text-gray-900">Machine Operations</span>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {totalOperations} operations across {totalPieces} piece{totalPieces !== 1 ? 's' : ''}
          </span>
        </div>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Accordion Content */}
      <div
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 space-y-4">
          {/* Default Machines Table */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Default Machines (via Pricing Admin)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">Operation</th>
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">Machine</th>
                    <th className="text-left py-2 font-medium text-gray-600">Kerf</th>
                  </tr>
                </thead>
                <tbody>
                  {OPERATION_ORDER.map((opType) => {
                    const def = defaults.find((d) => d.operationType === opType);
                    const meta = OPERATION_META[opType];
                    return (
                      <tr key={opType} className="border-b border-gray-100">
                        <td className="py-2 pr-4 text-gray-800">{meta?.label ?? opType}</td>
                        <td className="py-2 pr-4 text-gray-700">
                          {def?.machine.name ?? (
                            <span className="text-gray-400 italic">Not assigned</span>
                          )}
                        </td>
                        <td className="py-2 text-gray-600">
                          {def?.machine.kerfWidthMm
                            ? `${def.machine.kerfWidthMm}mm`
                            : <span className="text-gray-300">&mdash;</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {mode === 'edit' && (
              <Link
                href="/admin/pricing"
                className="inline-flex items-center gap-1 mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Edit defaults in Pricing Admin
              </Link>
            )}
          </div>

          {/* Per-Piece Operations Matrix */}
          {machineOps && machineOps.pieces.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Per-Piece Operations
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-3 font-medium text-gray-600">Piece</th>
                      {OPERATION_ORDER.map((opType) => (
                        <th
                          key={opType}
                          className="text-center py-2 px-2 font-medium text-gray-600 whitespace-nowrap"
                        >
                          {OPERATION_META[opType]?.shortLabel ?? opType}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {machineOps.pieces.map((piece, idx) => (
                      <tr key={piece.pieceId} className="border-b border-gray-100">
                        <td className="py-2 pr-3 text-gray-800">
                          <span className="text-gray-400 text-xs mr-1">#{idx + 1}</span>
                          <span className="truncate max-w-[150px] inline-block align-bottom" title={piece.label}>
                            {piece.label}
                          </span>
                        </td>
                        {OPERATION_ORDER.map((opType) => {
                          const op = piece.operations.find((o) => o.operationType === opType);
                          if (!op) {
                            return (
                              <td key={opType} className="text-center py-2 px-2 text-gray-300">
                                &mdash;
                              </td>
                            );
                          }
                          return (
                            <td
                              key={opType}
                              className="text-center py-2 px-2"
                              title={op.isApplicable ? op.machineName : op.reason}
                            >
                              {op.isApplicable ? (
                                <span className="text-green-600 font-medium">
                                  {opType === 'CUTOUT' && op.cutoutCount && op.cutoutCount > 1
                                    ? `\u2713 \u00d7${op.cutoutCount}`
                                    : '\u2713'}
                                </span>
                              ) : (
                                <span className="text-gray-300">&mdash;</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                <span className="text-green-600 font-medium">{'\u2713'}</span> = operation applies &nbsp;
                <span className="text-gray-300">&mdash;</span> = not applicable.
                Hover for details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
