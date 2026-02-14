'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { PiecePricingBreakdown } from '@/lib/types/pricing';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface MachineOption {
  id: string;
  name: string;
  kerfWidthMm: number;
  isDefault: boolean;
}

interface MachineOperationDefault {
  id: string;
  operationType: string;
  machineId: string;
  machine: {
    id: string;
    name: string;
    kerfWidthMm: number;
  };
}

interface PieceRowProps {
  /** Basic piece data */
  piece: {
    id: number;
    name: string;
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
    materialName: string | null;
    edgeTop: string | null;
    edgeBottom: string | null;
    edgeLeft: string | null;
    edgeRight: string | null;
  };
  /** Per-piece cost breakdown from the calculation result */
  breakdown?: PiecePricingBreakdown;
  /** Available machines for Level 2 dropdowns */
  machines?: MachineOption[];
  /** Operation-to-machine default mappings */
  machineOperationDefaults?: MachineOperationDefault[];
  /** View or edit mode */
  mode: 'view' | 'edit';
  /** Callback when machine assignment changes (edit mode) */
  onMachineChange?: (pieceId: number, operationType: string, machineId: string) => void;
}

// ── Chevron Icon ────────────────────────────────────────────────────────────

function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transform transition-transform ${expanded ? 'rotate-90' : ''} ${className ?? ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Unit Label Helper ───────────────────────────────────────────────────────

function unitLabel(unit: string): string {
  switch (unit) {
    case 'LINEAR_METRE':
      return 'per Lm';
    case 'SQUARE_METRE':
      return 'per m\u00B2';
    case 'FIXED':
      return 'fixed';
    case 'PER_SLAB':
      return 'per slab';
    case 'PER_KILOMETRE':
      return 'per km';
    default:
      return unit;
  }
}

function unitShort(unit: string): string {
  switch (unit) {
    case 'LINEAR_METRE':
      return 'Lm';
    case 'SQUARE_METRE':
      return 'm\u00B2';
    case 'FIXED':
      return '';
    case 'PER_SLAB':
      return 'slab';
    default:
      return unit;
  }
}

// ── Edge Badge Helpers ──────────────────────────────────────────────────────

function getEdgeBadges(piece: PieceRowProps['piece']): string[] {
  const badges: string[] = [];
  if (piece.edgeTop) badges.push('T');
  if (piece.edgeBottom) badges.push('B');
  if (piece.edgeLeft) badges.push('L');
  if (piece.edgeRight) badges.push('R');
  return badges;
}

// ── Cost Line Component (Level 1 + Level 2) ────────────────────────────────

interface CostLineProps {
  label: string;
  formula: string;
  total: number;
  operationType?: string;
  machines?: MachineOption[];
  machineOperationDefaults?: MachineOperationDefault[];
  mode: 'view' | 'edit';
  pieceId: number;
  onMachineChange?: (pieceId: number, operationType: string, machineId: string) => void;
}

function CostLine({
  label,
  formula,
  total,
  operationType,
  machines = [],
  machineOperationDefaults = [],
  mode,
  pieceId,
  onMachineChange,
}: CostLineProps) {
  const [l2Expanded, setL2Expanded] = useState(false);
  const isZero = total === 0;

  // Resolve the machine for this operation type
  const resolvedDefault = machineOperationDefaults.find(d => d.operationType === operationType);
  const defaultMachine = resolvedDefault?.machine;

  return (
    <div>
      <div
        className={`flex items-start justify-between text-xs ${isZero ? 'text-gray-400' : 'text-gray-600'}`}
      >
        <div className="flex items-start gap-1 flex-1 min-w-0">
          {operationType && machines.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); setL2Expanded(!l2Expanded); }}
              className="mt-0.5 flex-shrink-0 hover:text-primary-600"
            >
              <ChevronIcon expanded={l2Expanded} />
            </button>
          ) : (
            <span className="w-3.5 flex-shrink-0" />
          )}
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className={`text-[11px] ${isZero ? 'text-gray-300' : 'text-gray-400'}`}>{formula}</span>
          <span className={`font-medium tabular-nums ${isZero ? 'text-gray-300' : ''}`}>
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      {/* Level 2: Machine assignment */}
      {l2Expanded && operationType && (
        <div className="ml-5 mt-1 mb-1 p-2 bg-gray-50 rounded text-xs">
          {mode === 'view' || !onMachineChange ? (
            <span className="text-gray-500">
              Machine: {defaultMachine?.name ?? 'Default'} | Kerf: {defaultMachine?.kerfWidthMm ?? '—'}mm
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-gray-500 flex-shrink-0">Machine:</label>
              <select
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                defaultValue={defaultMachine?.id ?? ''}
                onChange={(e) => onMachineChange(pieceId, operationType, e.target.value)}
              >
                {machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} (Kerf: {m.kerfWidthMm}mm){m.isDefault ? ' — Default' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main PieceRow Component ─────────────────────────────────────────────────

export default function PieceRow({
  piece,
  breakdown,
  machines = [],
  machineOperationDefaults = [],
  mode,
  onMachineChange,
}: PieceRowProps) {
  const [l1Expanded, setL1Expanded] = useState(false);
  const isOversize = breakdown?.oversize?.isOversize ?? false;
  const pieceTotal = breakdown?.pieceTotal ?? 0;
  const edgeBadges = getEdgeBadges(piece);

  return (
    <div className={`rounded-lg border ${isOversize ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'}`}>
      {/* ── Collapsed Header ── */}
      <button
        onClick={() => setL1Expanded(!l1Expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50/50 transition-colors"
      >
        <ChevronIcon expanded={l1Expanded} className="flex-shrink-0" />

        {/* Name */}
        <span className="font-medium text-gray-900 truncate min-w-0">{piece.name}</span>

        {/* Dimensions */}
        <span className="text-xs text-gray-500 flex-shrink-0">
          {piece.lengthMm} x {piece.widthMm} mm
        </span>

        {/* Thickness */}
        <span className="text-xs text-gray-500 flex-shrink-0">
          {piece.thicknessMm}mm
        </span>

        {/* Material */}
        {piece.materialName && (
          <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 flex-shrink-0 truncate max-w-[120px]">
            {piece.materialName}
          </span>
        )}

        {/* Edge badges */}
        {edgeBadges.length > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 flex-shrink-0">
            {edgeBadges.join(', ')}
          </span>
        )}

        {/* Oversize badge */}
        {isOversize && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 flex-shrink-0">
            OVERSIZE
          </span>
        )}

        {/* Total price — pushed right */}
        <span className="ml-auto font-medium text-gray-900 tabular-nums flex-shrink-0">
          {formatCurrency(pieceTotal)}
        </span>
      </button>

      {/* ── Level 1: Cost Breakdown ── */}
      {l1Expanded && breakdown && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-1.5">
          {/* Cutting */}
          {breakdown.fabrication.cutting.total > 0 && (
          <CostLine
            label="Cutting"
            formula={`${breakdown.fabrication.cutting.quantity.toFixed(2)} ${unitShort(breakdown.fabrication.cutting.unit)} x ${formatCurrency(breakdown.fabrication.cutting.rate)} ${unitLabel(breakdown.fabrication.cutting.unit)} = ${formatCurrency(breakdown.fabrication.cutting.baseAmount)}`}
            total={breakdown.fabrication.cutting.total}
            operationType="INITIAL_CUT"
            machines={machines}
            machineOperationDefaults={machineOperationDefaults}
            mode={mode}
            pieceId={piece.id}
            onMachineChange={onMachineChange}
          />
          )}

          {/* Polishing */}
          {breakdown.fabrication.polishing.total > 0 && (
          <CostLine
            label="Polishing"
            formula={`${breakdown.fabrication.polishing.quantity.toFixed(2)} ${unitShort(breakdown.fabrication.polishing.unit)} x ${formatCurrency(breakdown.fabrication.polishing.rate)} ${unitLabel(breakdown.fabrication.polishing.unit)} = ${formatCurrency(breakdown.fabrication.polishing.baseAmount)}`}
            total={breakdown.fabrication.polishing.total}
            operationType="EDGE_POLISHING"
            machines={machines}
            machineOperationDefaults={machineOperationDefaults}
            mode={mode}
            pieceId={piece.id}
            onMachineChange={onMachineChange}
          />
          )}

          {/* Edges */}
          {breakdown.fabrication.edges.filter(e => e.total > 0).map((edge, idx) => (
            <CostLine
              key={`${edge.side}-${idx}`}
              label={`Edge: ${edge.edgeTypeName} (${edge.side})`}
              formula={`${edge.linearMeters.toFixed(2)} Lm x ${formatCurrency(edge.rate)} per Lm = ${formatCurrency(edge.baseAmount)}`}
              total={edge.total}
              operationType="EDGE_POLISHING"
              machines={machines}
              machineOperationDefaults={machineOperationDefaults}
              mode={mode}
              pieceId={piece.id}
              onMachineChange={onMachineChange}
            />
          ))}

          {/* Lamination */}
          {breakdown.fabrication.lamination && breakdown.fabrication.lamination.total > 0 && (
            <CostLine
              label={`Lamination (${breakdown.fabrication.lamination.method})`}
              formula={`${breakdown.fabrication.lamination.finishedEdgeLm.toFixed(2)} Lm x ${formatCurrency(breakdown.fabrication.lamination.baseRate)} x ${breakdown.fabrication.lamination.multiplier.toFixed(2)} = ${formatCurrency(breakdown.fabrication.lamination.total)}`}
              total={breakdown.fabrication.lamination.total}
              operationType="LAMINATION"
              machines={machines}
              machineOperationDefaults={machineOperationDefaults}
              mode={mode}
              pieceId={piece.id}
              onMachineChange={onMachineChange}
            />
          )}

          {/* Cutouts */}
          {breakdown.fabrication.cutouts.filter(c => c.total > 0).map((cutout, idx) => (
            <CostLine
              key={`${cutout.cutoutTypeId}-${idx}`}
              label={`Cutout: ${cutout.cutoutTypeName} x ${cutout.quantity}`}
              formula={`${cutout.quantity} x ${formatCurrency(cutout.rate)} ea = ${formatCurrency(cutout.baseAmount)}`}
              total={cutout.total}
              operationType="CUTOUT"
              machines={machines}
              machineOperationDefaults={machineOperationDefaults}
              mode={mode}
              pieceId={piece.id}
              onMachineChange={onMachineChange}
            />
          ))}

          {/* Installation */}
          {breakdown.fabrication.installation && breakdown.fabrication.installation.total > 0 && (
            <CostLine
              label="Installation"
              formula={`${breakdown.fabrication.installation.quantity.toFixed(2)} ${unitShort(breakdown.fabrication.installation.unit)} x ${formatCurrency(breakdown.fabrication.installation.rate)} ${unitLabel(breakdown.fabrication.installation.unit)} = ${formatCurrency(breakdown.fabrication.installation.baseAmount)}`}
              total={breakdown.fabrication.installation.total}
              machines={machines}
              machineOperationDefaults={machineOperationDefaults}
              mode={mode}
              pieceId={piece.id}
              onMachineChange={onMachineChange}
            />
          )}

          {/* Oversize / Join Details */}
          {isOversize && breakdown.oversize && (
            <div className="pt-1.5 mt-1 border-t border-amber-200 space-y-1.5">
              {breakdown.oversize.joinCost > 0 && (
              <CostLine
                label={`Join (${breakdown.oversize.joinCount} join${breakdown.oversize.joinCount !== 1 ? 's' : ''})`}
                formula={`${breakdown.oversize.joinLengthLm.toFixed(2)} Lm x ${formatCurrency(breakdown.oversize.joinRate)}/Lm = ${formatCurrency(breakdown.oversize.joinCost)}`}
                total={breakdown.oversize.joinCost}
                machines={machines}
                machineOperationDefaults={machineOperationDefaults}
                mode={mode}
                pieceId={piece.id}
                onMachineChange={onMachineChange}
              />
              )}
              {breakdown.oversize.grainMatchingSurcharge > 0 && (
              <CostLine
                label={`Grain Matching Surcharge (${(breakdown.oversize.grainMatchingSurchargeRate * 100).toFixed(0)}%)`}
                formula={`${formatCurrency(breakdown.oversize.fabricationSubtotalBeforeSurcharge)} x ${(breakdown.oversize.grainMatchingSurchargeRate * 100).toFixed(0)}%`}
                total={breakdown.oversize.grainMatchingSurcharge}
                machines={machines}
                machineOperationDefaults={machineOperationDefaults}
                mode={mode}
                pieceId={piece.id}
                onMachineChange={onMachineChange}
              />
              )}
              {breakdown.oversize.warnings.length > 0 && (
                <div className="text-amber-600 text-[10px] italic ml-5">
                  {breakdown.oversize.warnings.map((w, idx) => (
                    <p key={idx}>{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fabrication total */}
          <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-200 text-xs font-bold text-gray-800">
            <span>Fabrication Total</span>
            <span className="tabular-nums">{formatCurrency(breakdown.pieceTotal)}</span>
          </div>
        </div>
      )}

      {/* ── Level 1: No breakdown data ── */}
      {l1Expanded && !breakdown && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          <p className="text-xs text-gray-400 italic">
            Awaiting calculation\u2026
          </p>
        </div>
      )}
    </div>
  );
}
