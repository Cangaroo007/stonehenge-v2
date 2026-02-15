'use client';

import { useState, useMemo, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { PiecePricingBreakdown } from '@/lib/types/pricing';
import InlinePieceEditor from './InlinePieceEditor';
import type { InlinePieceData } from './InlinePieceEditor';
import type { PieceCutout, CutoutType } from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import PieceVisualEditor from './PieceVisualEditor';
import type { EdgeSide } from './PieceVisualEditor';

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

interface InlineEditMaterial {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
}

interface InlineEditEdgeType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  baseRate: number;
  isActive: boolean;
  sortOrder: number;
}

interface InlineEditThicknessOption {
  id: string;
  name: string;
  value: number;
  multiplier: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface InlineEditData {
  materials: InlineEditMaterial[];
  edgeTypes: InlineEditEdgeType[];
  cutoutTypes: CutoutType[];
  thicknessOptions: InlineEditThicknessOption[];
  roomNames: string[];
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
  /** Full piece data for inline editing (optional, edit mode only) */
  fullPiece?: InlinePieceData;
  /** Reference data for inline editing (optional, edit mode only) */
  editData?: InlineEditData;
  /** Callback when piece is saved via inline editor */
  onSavePiece?: (pieceId: number, data: Record<string, unknown>, roomName: string) => void;
  /** Whether a save operation is in progress */
  savingPiece?: boolean;
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

// ── Piece Visual Editor Section ─────────────────────────────────────────────

function PieceVisualEditorSection({
  piece,
  fullPiece,
  editData,
  breakdown,
  mode,
  onSavePiece,
}: {
  piece: PieceRowProps['piece'];
  fullPiece?: InlinePieceData;
  editData?: InlineEditData;
  breakdown?: PiecePricingBreakdown;
  mode: 'view' | 'edit';
  onSavePiece?: (pieceId: number, data: Record<string, unknown>, roomName: string) => void;
}) {
  const isEditMode = mode === 'edit' && !!fullPiece && !!editData && !!onSavePiece;

  // Map cutouts to display format
  const cutoutDisplays = useMemo(() => {
    if (!fullPiece || !Array.isArray(fullPiece.cutouts)) return [];
    const cutoutTypes = editData?.cutoutTypes ?? [];
    return fullPiece.cutouts.map((c: PieceCutout) => {
      const ct = cutoutTypes.find((t) => t.id === c.cutoutTypeId);
      return {
        id: c.id,
        typeId: c.cutoutTypeId,
        typeName: ct?.name ?? c.cutoutTypeId,
        quantity: c.quantity,
      };
    });
  }, [fullPiece, editData?.cutoutTypes]);

  // Also build cutout display from breakdown for view mode when fullPiece is not available
  const breakdownCutouts = useMemo(() => {
    if (fullPiece) return []; // prefer fullPiece data
    if (!breakdown) return [];
    return breakdown.fabrication.cutouts.map((c, idx) => ({
      id: `bd_${c.cutoutTypeId}_${idx}`,
      typeId: c.cutoutTypeId,
      typeName: c.cutoutTypeName,
      quantity: c.quantity,
    }));
  }, [fullPiece, breakdown]);

  const displayCutouts = fullPiece ? cutoutDisplays : breakdownCutouts;

  // Determine if piece is mitred
  const isMitred = breakdown?.fabrication?.lamination?.method === 'Mitred'
    || breakdown?.fabrication?.lamination?.method === 'MITRED';

  // Join position for oversize
  const joinAtMm = useMemo(() => {
    if (!breakdown?.oversize?.isOversize) return undefined;
    // Default join at midpoint if specific position not available
    return Math.round(piece.lengthMm / 2);
  }, [breakdown, piece.lengthMm]);

  // Edge change handler — saves via existing onSavePiece flow
  const handleEdgeChange = useCallback(
    (side: EdgeSide, profileId: string | null) => {
      if (!fullPiece || !onSavePiece) return;
      const edgeKey = `edge${side.charAt(0).toUpperCase()}${side.slice(1)}` as
        'edgeTop' | 'edgeBottom' | 'edgeLeft' | 'edgeRight';
      onSavePiece(
        piece.id,
        {
          lengthMm: fullPiece.lengthMm,
          widthMm: fullPiece.widthMm,
          thicknessMm: fullPiece.thicknessMm,
          materialId: fullPiece.materialId,
          materialName: fullPiece.materialName,
          edgeTop: edgeKey === 'edgeTop' ? profileId : fullPiece.edgeTop,
          edgeBottom: edgeKey === 'edgeBottom' ? profileId : fullPiece.edgeBottom,
          edgeLeft: edgeKey === 'edgeLeft' ? profileId : fullPiece.edgeLeft,
          edgeRight: edgeKey === 'edgeRight' ? profileId : fullPiece.edgeRight,
          cutouts: fullPiece.cutouts,
        },
        fullPiece.quote_rooms?.name || 'Kitchen'
      );
    },
    [fullPiece, onSavePiece, piece.id]
  );

  // Cutout add handler
  const handleCutoutAdd = useCallback(
    (cutoutTypeId: string) => {
      if (!fullPiece || !onSavePiece) return;
      const newCutout: PieceCutout = {
        id: `cut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cutoutTypeId,
        quantity: 1,
      };
      const updatedCutouts = [...(fullPiece.cutouts || []), newCutout];
      onSavePiece(
        piece.id,
        {
          lengthMm: fullPiece.lengthMm,
          widthMm: fullPiece.widthMm,
          thicknessMm: fullPiece.thicknessMm,
          materialId: fullPiece.materialId,
          materialName: fullPiece.materialName,
          edgeTop: fullPiece.edgeTop,
          edgeBottom: fullPiece.edgeBottom,
          edgeLeft: fullPiece.edgeLeft,
          edgeRight: fullPiece.edgeRight,
          cutouts: updatedCutouts,
        },
        fullPiece.quote_rooms?.name || 'Kitchen'
      );
    },
    [fullPiece, onSavePiece, piece.id]
  );

  // Cutout remove handler
  const handleCutoutRemove = useCallback(
    (cutoutId: string) => {
      if (!fullPiece || !onSavePiece) return;
      const updatedCutouts = (fullPiece.cutouts || []).filter(
        (c: PieceCutout) => c.id !== cutoutId
      );
      onSavePiece(
        piece.id,
        {
          lengthMm: fullPiece.lengthMm,
          widthMm: fullPiece.widthMm,
          thicknessMm: fullPiece.thicknessMm,
          materialId: fullPiece.materialId,
          materialName: fullPiece.materialName,
          edgeTop: fullPiece.edgeTop,
          edgeBottom: fullPiece.edgeBottom,
          edgeLeft: fullPiece.edgeLeft,
          edgeRight: fullPiece.edgeRight,
          cutouts: updatedCutouts,
        },
        fullPiece.quote_rooms?.name || 'Kitchen'
      );
    },
    [fullPiece, onSavePiece, piece.id]
  );

  return (
    <div className="px-4 py-3 border-t border-gray-100">
      <PieceVisualEditor
        lengthMm={piece.lengthMm}
        widthMm={piece.widthMm}
        edgeTop={piece.edgeTop}
        edgeBottom={piece.edgeBottom}
        edgeLeft={piece.edgeLeft}
        edgeRight={piece.edgeRight}
        edgeTypes={editData?.edgeTypes ?? []}
        cutouts={displayCutouts}
        joinAtMm={joinAtMm}
        isEditMode={isEditMode}
        isMitred={isMitred}
        onEdgeChange={isEditMode ? handleEdgeChange : undefined}
        onCutoutAdd={isEditMode ? handleCutoutAdd : undefined}
        onCutoutRemove={isEditMode ? handleCutoutRemove : undefined}
        cutoutTypes={editData?.cutoutTypes ?? []}
      />
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
  fullPiece,
  editData,
  onSavePiece,
  savingPiece = false,
}: PieceRowProps) {
  const [l1Expanded, setL1Expanded] = useState(false);
  const [editExpanded, setEditExpanded] = useState(true);
  const isOversize = breakdown?.oversize?.isOversize ?? false;
  const pieceTotal = breakdown?.pieceTotal ?? 0;
  const edgeBadges = getEdgeBadges(piece);
  const canInlineEdit = mode === 'edit' && fullPiece && editData && onSavePiece;

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
          {piece.thicknessMm > 20 && (() => {
            const layers = Math.floor((piece.thicknessMm - 20) / 20);
            const method = breakdown?.fabrication?.lamination?.method;
            if (piece.thicknessMm === 40) {
              return <span> — {method || 'Laminated'}</span>;
            }
            return <span> — {method || 'Laminated'} ({layers} layer{layers !== 1 ? 's' : ''})</span>;
          })()}
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

      {/* ── Piece Visual Editor (SVG diagram) ── */}
      {l1Expanded && (
        <PieceVisualEditorSection
          piece={piece}
          fullPiece={fullPiece}
          editData={editData}
          breakdown={breakdown}
          mode={mode}
          onSavePiece={onSavePiece}
        />
      )}

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

      {/* ── Inline Edit Section (edit mode only) ── */}
      {l1Expanded && canInlineEdit && (
        <div className="border-t border-gray-200">
          {/* Section header with collapse toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setEditExpanded(!editExpanded); }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <ChevronIcon expanded={editExpanded} />
            Edit Piece
          </button>

          {/* Editor content */}
          {editExpanded && (
            <div className="px-4 pb-4 pt-3">
              <InlinePieceEditor
                piece={fullPiece}
                materials={editData.materials}
                edgeTypes={editData.edgeTypes}
                cutoutTypes={editData.cutoutTypes}
                thicknessOptions={editData.thicknessOptions}
                roomNames={editData.roomNames}
                onSave={onSavePiece}
                saving={savingPiece}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
