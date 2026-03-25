'use client';
//
/**
 * QuickViewPieceRow — compact two-tier inline editing row for pieces.
 *
 * Tier 1 (Quick View): Inline editable dimensions, material, thickness,
 * mini SVG with Quick Edge, cutout chips. Handles 90% of edits.
 *
 * Tier 2 (Accordion): Full PieceVisualEditor, cost breakdown, relationships.
 * Shown when "Expand full view" is clicked.
 *
 * Rule 1: Extends, never replaces. PieceRow/PieceVisualEditor untouched.
 * Rule 19: Minimum clicks to common actions.
 * Rule 44: No banned edge components.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { formatCurrency } from '@/lib/utils';
import { edgeColour, edgeCode, cutoutLabel } from '@/lib/utils/edge-utils';
import PieceVisualEditor from './PieceVisualEditor';
import type { EdgeSide, EdgePreset } from './PieceVisualEditor';
import { EDGE_PRESETS, PresetThumbnail } from './PieceVisualEditor';
import PieceEditorErrorBoundary from './PieceEditorErrorBoundary';
import type { PiecePricingBreakdown } from '@/lib/types/pricing';
import type { InlinePieceData } from './InlinePieceEditor';
import type { PieceCutout, CutoutType } from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import type { EdgeScope } from './EdgeProfilePopover';
import MaterialPickerV2 from './MaterialPickerV2';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import type { LShapeConfig, UShapeConfig, RadiusEndConfig, FullCircleConfig, ConcaveArcConfig, RoundedRectConfig, ShapeType } from '@/lib/types/shapes';
import RelationshipEditor from './RelationshipEditor';

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
  supplier?: { id: string; name: string } | null;
}

interface InlineEditEdgeType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  baseRate: number;
  isActive: boolean;
  isMitred?: boolean;
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
  pieceSuggestions?: string[];
  roomSuggestions?: string[];
}

interface PieceData {
  id: number;
  name: string;
  description?: string | null;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialName: string | null;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  roomName?: string;
  shapeType?: string | null;
  shapeConfig?: Record<string, unknown> | null;
  requiresGrainMatch?: boolean;
  noStripEdges?: string[];
  laminationMethod?: string | null;
  overrideMaterialCost?: number | null;
  overrideSlabPrice?: number | null;
  overrideFabricationCost?: number | null;
  edgeBuildups?: Record<string, { depth: number }> | null;
  materialCollectionOnly?: boolean;
  materialCollectionName?: string | null;
}

export interface QuickViewPieceRowProps {
  pieceNumber?: number;
  piece: PieceData;
  breakdown?: PiecePricingBreakdown;
  machines?: MachineOption[];
  machineOperationDefaults?: MachineOperationDefault[];
  mode: 'view' | 'edit';
  onMachineChange?: (pieceId: number, operationType: string, machineId: string) => void;
  fullPiece?: InlinePieceData;
  editData?: InlineEditData;
  onSavePiece?: (pieceId: number, data: Record<string, unknown>, roomName: string) => void;
  savingPiece?: boolean;
  onDelete?: (pieceId: number) => void;
  onDuplicate?: (pieceId: number) => void;
  quoteId?: number;
  onBulkEdgeApply?: (
    edges: { top: string | null; bottom: string | null; left: string | null; right: string | null },
    scope: 'room' | 'quote',
    pieceId: number
  ) => void;
  onExpand?: (pieceId: number) => void;
  relationships?: PieceRelationshipData[];
  allPiecesForRelationships?: Array<{
    id: string;
    description: string;
    piece_type: string | null;
    room_name: string | null;
  }>;
  quoteIdStr?: string;
  onRelationshipChange?: () => void;
  onBatchEdgeUpdate?: (
    profileId: string | null,
    scope: EdgeScope,
    sourcePieceId: number,
    sourceSide: string,
    sourceRoomId: number
  ) => void;
  /** Callback after strip width override changes — triggers re-optimise */
  onStripWidthChange?: () => void;
  /** WF-2c: shows "↳ N attached" badge on parent row */
  attachedCount?: number;
  /** WF-2c: shows "↳ WATERFALL (LEFT)" prefix on child rows */
  relationshipLabel?: string;
  /** WF-2c: shows grain match badge when true */
  grainMatch?: boolean;
  /** WF-2c: shows × detach button when provided */
  onDetach?: () => void;
  /** WF-2f: per-piece attach waterfall action */
  onAddWaterfall?: () => void;
  /** WF-2f: per-piece attach splashback action */
  onAddSplashback?: () => void;
  /** QF-4: callback to refetch materials list after creating a new material */
  onMaterialsRefresh?: () => void;
}

// ── Strip Width Constants ───────────────────────────────────────────────────

const STRIP_WIDTH_DEFAULT = 60;
const STRIP_WIDTH_MITRE = 40;

function getDefaultStripWidthForEdge(edgeName: string): number {
  if (edgeName.toLowerCase().includes('mitre')) return STRIP_WIDTH_MITRE;
  return STRIP_WIDTH_DEFAULT;
}

function humaniseEdgeName(edge: string): string {
  return edge.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Accordion Strip Width Table ─────────────────────────────────────────────

function AccordionStripWidths({
  piece,
  quoteId,
  edgeSelections,
  shapeType,
  onStripWidthChange,
}: {
  piece: InlinePieceData;
  quoteId: string;
  edgeSelections: { edgeTop: string | null; edgeBottom: string | null; edgeLeft: string | null; edgeRight: string | null };
  shapeType: ShapeType;
  onStripWidthChange?: () => void;
}) {
  // Derive which edges generate strips
  const edges: string[] = [];
  if (shapeType === 'RECTANGLE') {
    if (edgeSelections.edgeTop) edges.push('top');
    if (edgeSelections.edgeBottom) edges.push('bottom');
    if (edgeSelections.edgeLeft) edges.push('left');
    if (edgeSelections.edgeRight) edges.push('right');
  } else if (shapeType === 'L_SHAPE') {
    edges.push('top', 'left', 'r_top', 'inner', 'r_btm', 'bottom');
  } else if (shapeType === 'U_SHAPE') {
    edges.push('top_left', 'outer_left', 'inner_left', 'bottom', 'back_inner', 'top_right', 'outer_right', 'inner_right');
  }

  const [overrides, setOverrides] = useState<Record<string, number>>(
    (piece.stripWidthOverrides as unknown as Record<string, number>) ?? {}
  );
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  if (edges.length === 0) return null;

  const patchOverrides = async (updated: Record<string, number>) => {
    setOverrides(updated);
    const payload = Object.keys(updated).length > 0 ? updated : null;
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pieces/${piece.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripWidthOverrides: payload }),
      });
      if (res.ok) onStripWidthChange?.();
    } catch { /* non-critical */ }
  };

  const handleEdgeSave = (edge: string, value: string) => {
    const parsed = parseInt(value);
    if (isNaN(parsed) || parsed <= 0) return;
    const defaultWidth = getDefaultStripWidthForEdge(edge);
    if (parsed === defaultWidth) {
      const { [edge]: _, ...rest } = overrides;
      patchOverrides(rest);
    } else {
      patchOverrides({ ...overrides, [edge]: parsed });
    }
  };

  const handleReset = (edge: string) => {
    const { [edge]: _, ...rest } = overrides;
    patchOverrides(rest);
  };

  const handleApplyToAll = async () => {
    setApplyingAll(true);
    setApplyMessage(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pieces`);
      if (!res.ok) throw new Error('Failed to fetch pieces');
      const allPieces: Array<{ id: number; thicknessMm: number; edgeBuildups?: Record<string, { depth: number }> | null }> = await res.json();
      const targets = allPieces.filter(p =>
        (p.thicknessMm >= 40 || Object.keys(p.edgeBuildups ?? {}).length > 0) &&
        p.id !== piece.id
      );
      const overridePayload = Object.keys(overrides).length > 0 ? overrides : null;
      for (const target of targets) {
        await fetch(`/api/quotes/${quoteId}/pieces/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stripWidthOverrides: overridePayload }),
        });
      }
      onStripWidthChange?.();
      setApplyMessage(`Applied strip widths to ${targets.length} piece${targets.length !== 1 ? 's' : ''}`);
      setTimeout(() => setApplyMessage(null), 4000);
    } catch {
      setApplyMessage('Failed to apply strip widths');
      setTimeout(() => setApplyMessage(null), 4000);
    } finally {
      setApplyingAll(false);
    }
  };

  return (
    <div className="px-4 pb-3 pt-3 border-b border-gray-100">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Return Strip Width Overrides</p>
      <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
            <th className="text-left py-1 px-2 font-medium">Edge</th>
            <th className="text-left py-1 px-2 font-medium">Width (mm)</th>
            <th className="text-left py-1 px-2 font-medium w-10"></th>
          </tr>
        </thead>
        <tbody>
          {edges.map((edge) => {
            const defaultWidth = getDefaultStripWidthForEdge(edge);
            const overrideValue = overrides[edge];
            const displayValue = overrideValue ?? defaultWidth;
            const isOverridden = overrideValue != null && overrideValue !== defaultWidth;
            return (
              <tr key={edge} className="border-t border-gray-100">
                <td className="py-1 px-2 text-gray-700">{humaniseEdgeName(edge)}</td>
                <td className="py-0.5 px-2">
                  <input
                    type="number"
                    min="1"
                    defaultValue={displayValue}
                    onBlur={(e) => handleEdgeSave(edge, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-16 px-2 py-0.5 text-xs border rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                      isOverridden ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-300'
                    }`}
                  />
                </td>
                <td className="py-0.5 px-2">
                  {isOverridden && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReset(edge); }}
                      className="text-amber-500 hover:text-amber-700 text-sm"
                      title="Reset to default"
                    >
                      ↺
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        onClick={(e) => { e.stopPropagation(); handleApplyToAll(); }}
        disabled={applyingAll}
        className="mt-1.5 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 font-medium"
      >
        {applyingAll ? 'Applying...' : 'Apply to all pieces with build-ups'}
      </button>
      {applyMessage && (
        <p className="text-xs text-green-600 mt-0.5">{applyMessage}</p>
      )}
    </div>
  );
}

// ── Mini SVG Constants ──────────────────────────────────────────────────────

const MINI_W = 120;
const MINI_H = 80;
const MINI_PAD = 16;
const EDGE_HIT = 14;

type MiniEdgeSide = 'top' | 'right' | 'bottom' | 'left';

// ── Mini SVG shape path (reuses L/U shape geometry from PieceVisualEditor K4) ─
function getMiniShapePath(
  shapeType: string | null | undefined,
  shapeConfig: Record<string, unknown> | null | undefined,
  x: number, y: number, w: number, h: number,
): string | null {
  if (shapeType === 'L_SHAPE' && shapeConfig?.shape === 'L_SHAPE') {
    const cfg = shapeConfig as unknown as LShapeConfig;
    const boundW = cfg.leg1.length_mm;
    const boundH = cfg.leg1.width_mm + cfg.leg2.length_mm;
    const sL1L = (cfg.leg1.length_mm / boundW) * w;
    const sL1W = (cfg.leg1.width_mm / boundH) * h;
    const sL2W = (cfg.leg2.width_mm / boundW) * w;
    const sL2L = (cfg.leg2.length_mm / boundH) * h;
    // L-shape: P0→P1→P2→P3→P4→P5 (same point order as PieceVisualEditor)
    return `M ${x},${y} L ${x + sL1L},${y} L ${x + sL1L},${y + sL1W} L ${x + sL2W},${y + sL1W} L ${x + sL2W},${y + sL1W + sL2L} L ${x},${y + sL1W + sL2L} Z`;
  }
  if (shapeType === 'U_SHAPE' && shapeConfig?.shape === 'U_SHAPE') {
    const cfg = shapeConfig as unknown as UShapeConfig;
    const boundW = cfg.back.length_mm;
    const boundH = Math.max(cfg.leftLeg.length_mm, cfg.rightLeg.length_mm);
    const sLW = (cfg.leftLeg.width_mm / boundW) * w;
    const sLL = (cfg.leftLeg.length_mm / boundH) * h;
    const sBW = (cfg.back.width_mm / boundH) * h;
    const sRW = (cfg.rightLeg.width_mm / boundW) * w;
    const sRL = (cfg.rightLeg.length_mm / boundH) * h;
    const sInnerLeftY = sLL - sBW;
    const sInnerRightY = sRL - sBW;
    // U-shape: P0→P1→P2→P3→P4→P5→P6→P7 (same point order as PieceVisualEditor)
    return `M ${x},${y} L ${x + sLW},${y} L ${x + sLW},${y + sInnerLeftY} L ${x + w - sRW},${y + sInnerRightY} L ${x + w - sRW},${y} L ${x + w},${y} L ${x + w},${y + sRL} L ${x},${y + sLL} Z`;
  }
  // RADIUS_END — rectangle with one or both short ends replaced by arc
  if (shapeType === 'RADIUS_END' && shapeConfig?.shape === 'RADIUS_END') {
    const cfg = shapeConfig as unknown as RadiusEndConfig;
    const rx = Math.max(Math.min((cfg.radius_mm / cfg.length_mm) * w, w * 0.45), w * 0.25);
    const ry = Math.max(Math.min((cfg.radius_mm / cfg.width_mm) * h, h * 0.45), h * 0.25);
    if (cfg.curved_ends === 'BOTH') {
      // Both ends curved — pill shape
      return `M ${x + rx},${y} L ${x + w - rx},${y} Q ${x + w},${y} ${x + w},${y + ry} L ${x + w},${y + h - ry} Q ${x + w},${y + h} ${x + w - rx},${y + h} L ${x + rx},${y + h} Q ${x},${y + h} ${x},${y + h - ry} L ${x},${y + ry} Q ${x},${y} ${x + rx},${y} Z`;
    } else {
      // One end curved (right end)
      return `M ${x},${y} L ${x + w - rx},${y} Q ${x + w},${y} ${x + w},${y + ry} L ${x + w},${y + h - ry} Q ${x + w},${y + h} ${x + w - rx},${y + h} L ${x},${y + h} Z`;
    }
  }
  // FULL_CIRCLE — ellipse (SVG path approximation via cubic bezier)
  if (shapeType === 'FULL_CIRCLE' && shapeConfig?.shape === 'FULL_CIRCLE') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx2 = w / 2;
    const ry2 = h / 2;
    const k = 0.5523;
    return `M ${cx},${y} C ${cx + rx2 * k},${y} ${cx + rx2},${cy - ry2 * k} ${cx + rx2},${cy} C ${cx + rx2},${cy + ry2 * k} ${cx + rx2 * k},${y + h} ${cx},${y + h} C ${cx - rx2 * k},${y + h} ${x},${cy + ry2 * k} ${x},${cy} C ${x},${cy - ry2 * k} ${cx - rx2 * k},${y} ${cx},${y} Z`;
  }
  // CONCAVE_ARC — rectangle with a concave bite from one side
  if (shapeType === 'CONCAVE_ARC' && shapeConfig?.shape === 'CONCAVE_ARC') {
    const depth = Math.min(((shapeConfig as unknown as { depth_mm: number }).depth_mm ?? 0) / 1000, 1) * w * 0.3;
    return `M ${x},${y} L ${x + w},${y} Q ${x + w - depth},${y + h / 2} ${x + w},${y + h} L ${x},${y + h} Z`;
  }
  // ROUNDED_RECT — rectangle with rounded corners
  if (shapeType === 'ROUNDED_RECT' && shapeConfig?.shape === 'ROUNDED_RECT') {
    const cfg = shapeConfig as unknown as RoundedRectConfig;
    const r = Math.min(
      (cfg.corner_radius_mm / Math.max(cfg.length_mm, 1)) * w,
      (cfg.corner_radius_mm / Math.max(cfg.width_mm, 1)) * h,
      w * 0.3, h * 0.3
    );
    return `M ${x + r},${y} L ${x + w - r},${y} Q ${x + w},${y} ${x + w},${y + r} L ${x + w},${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h} L ${x + r},${y + h} Q ${x},${y + h} ${x},${y + h - r} L ${x},${y + r} Q ${x},${y} ${x + r},${y} Z`;
  }
  return null;
}

// ── Mini SVG edge segment definitions for L/U shapes ─────────────────────────
// Returns the polygon edge segments for use in the mini SVG hit areas + display.
// Side keys match shapeConfig.edges keys used by handleShapeEdgeChange.
function getMiniShapeEdges(
  shapeType: string | null | undefined,
  shapeConfig: Record<string, unknown> | null | undefined,
  x: number, y: number, w: number, h: number,
): Array<{
  side: string;
  label: string;
  x1: number; y1: number; x2: number; y2: number;
  lx: number; ly: number;
  anchor: 'middle' | 'start' | 'end';
}> | null {
  if (shapeType === 'L_SHAPE' && shapeConfig?.shape === 'L_SHAPE') {
    const cfg = shapeConfig as unknown as LShapeConfig;
    const boundW = cfg.leg1.length_mm;
    const boundH = cfg.leg1.width_mm + cfg.leg2.length_mm;
    const sL1L = (cfg.leg1.length_mm / boundW) * w;
    const sL1W = (cfg.leg1.width_mm / boundH) * h;
    const sL2W = (cfg.leg2.width_mm / boundW) * w;
    const sL2L = (cfg.leg2.length_mm / boundH) * h;

    const p0 = { x, y };
    const p1 = { x: x + sL1L, y };
    const p2 = { x: x + sL1L, y: y + sL1W };
    const p3 = { x: x + sL2W, y: y + sL1W };
    const p4 = { x: x + sL2W, y: y + sL1W + sL2L };
    const p5 = { x, y: y + sL1W + sL2L };

    return [
      { side: 'top',   label: 'TOP',   x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, lx: (p0.x + p1.x) / 2, ly: p0.y - 6, anchor: 'middle' },
      { side: 'r_top', label: 'R-TOP', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, lx: p1.x + 8,           ly: (p1.y + p2.y) / 2, anchor: 'start' },
      { side: 'inner', label: 'INN',   x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y, lx: (p2.x + p3.x) / 2, ly: p2.y - 6, anchor: 'middle' },
      { side: 'r_btm', label: 'R-BTM', x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y, lx: p3.x + 8,           ly: (p3.y + p4.y) / 2, anchor: 'start' },
      { side: 'bottom',label: 'BTM',   x1: p4.x, y1: p4.y, x2: p5.x, y2: p5.y, lx: (p4.x + p5.x) / 2, ly: p4.y + 9, anchor: 'middle' },
      { side: 'left',  label: 'LEFT',  x1: p5.x, y1: p5.y, x2: p0.x, y2: p0.y, lx: p5.x - 8,           ly: (p5.y + p0.y) / 2, anchor: 'end' },
    ];
  }

  if (shapeType === 'U_SHAPE' && shapeConfig?.shape === 'U_SHAPE') {
    const cfg = shapeConfig as unknown as UShapeConfig;
    const boundW = cfg.back.length_mm;
    const boundH = Math.max(cfg.leftLeg.length_mm, cfg.rightLeg.length_mm);
    const sLW = (cfg.leftLeg.width_mm / boundW) * w;
    const sLL = (cfg.leftLeg.length_mm / boundH) * h;
    const sBW = (cfg.back.width_mm / boundH) * h;
    const sRW = (cfg.rightLeg.width_mm / boundW) * w;
    const sRL = (cfg.rightLeg.length_mm / boundH) * h;
    const sInnerLeftY = sLL - sBW;
    const sInnerRightY = sRL - sBW;

    const p0 = { x,           y };
    const p1 = { x: x + sLW,  y };
    const p2 = { x: x + sLW,  y: y + sInnerLeftY };
    const p3 = { x: x + w - sRW, y: y + sInnerRightY };
    const p4 = { x: x + w - sRW, y };
    const p5 = { x: x + w,    y };
    const p6 = { x: x + w,    y: y + sRL };
    const p7 = { x,           y: y + sLL };

    return [
      { side: 'top_left',    label: 'T-L',   x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, lx: (p0.x+p1.x)/2, ly: p0.y - 6,         anchor: 'middle' as const },
      { side: 'inner_left',  label: 'IN-L',  x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, lx: p1.x + 8,       ly: (p1.y+p2.y)/2,    anchor: 'start' as const },
      { side: 'back_inner',  label: 'BACK',  x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y, lx: (p2.x+p3.x)/2, ly: Math.max(p2.y, p3.y) + 9, anchor: 'middle' as const },
      { side: 'inner_right', label: 'IN-R',  x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y, lx: p4.x - 8,       ly: (p3.y+p4.y)/2,    anchor: 'end' as const },
      { side: 'top_right',   label: 'T-R',   x1: p4.x, y1: p4.y, x2: p5.x, y2: p5.y, lx: (p4.x+p5.x)/2, ly: p4.y - 6,         anchor: 'middle' as const },
      { side: 'outer_right', label: 'RIGHT', x1: p5.x, y1: p5.y, x2: p6.x, y2: p6.y, lx: p5.x + 8,       ly: (p5.y+p6.y)/2,    anchor: 'start' as const },
      { side: 'bottom',      label: 'BTM',   x1: p6.x, y1: p6.y, x2: p7.x, y2: p7.y, lx: (p6.x+p7.x)/2, ly: Math.max(p6.y, p7.y) + 9, anchor: 'middle' as const },
      { side: 'outer_left',  label: 'LEFT',  x1: p7.x, y1: p7.y, x2: p0.x, y2: p0.y, lx: p7.x - 8,       ly: (p7.y+p0.y)/2,    anchor: 'end' as const },
    ];
  }

  return null;
}

// ── Piece dimension label (shows leg dims for L/U shapes) ───────────────────
function getPieceDimensionLabel(piece: { lengthMm: number; widthMm: number; shapeType?: string | null; shapeConfig?: Record<string, unknown> | null }): string {
  const cfg = piece.shapeConfig as unknown as Record<string, unknown>;

  if (piece.shapeType === 'L_SHAPE' && cfg?.leg1 && cfg?.leg2) {
    const leg1 = cfg.leg1 as { length_mm: number; width_mm: number };
    const leg2 = cfg.leg2 as { length_mm: number; width_mm: number };
    const leg2Net = leg2.length_mm - leg1.width_mm;
    return `${leg1.length_mm}\u00D7${leg1.width_mm}  +  ${leg2Net}\u00D7${leg2.width_mm} mm`;
  }

  if (piece.shapeType === 'U_SHAPE' && cfg?.leftLeg && cfg?.back && cfg?.rightLeg) {
    const l = cfg.leftLeg as { length_mm: number; width_mm: number };
    const b = cfg.back as { length_mm: number; width_mm: number };
    const r = cfg.rightLeg as { length_mm: number; width_mm: number };
    return `${l.length_mm}\u00D7${l.width_mm}  /  ${b.length_mm}\u00D7${b.width_mm}  /  ${r.length_mm}\u00D7${r.width_mm} mm`;
  }

  return `${piece.lengthMm}\u00D7${piece.widthMm} mm`;
}

// ── Cutout name resolution (matches PieceRow pattern) ───────────────────────

function resolveCutoutTypeName(
  cutout: Record<string, unknown>,
  cutoutTypes?: CutoutType[],
): string {
  const typeId = (cutout.cutoutTypeId || cutout.typeId) as string | undefined;
  if (typeId && cutoutTypes) {
    const ct = cutoutTypes.find(t => t.id === typeId);
    if (ct) return ct.name;
  }
  const typeName = (cutout.type || cutout.name) as string | undefined;
  if (typeName && cutoutTypes) {
    const ct = cutoutTypes.find(t => t.name === typeName);
    if (ct) return ct.name;
  }
  return typeName || typeId || 'Unknown';
}

// ── Cost Line (reused from PieceRow pattern for accordion) ──────────────────

function unitShort(unit: string): string {
  switch (unit) {
    case 'LINEAR_METRE': return 'Lm';
    case 'SQUARE_METRE': return 'm\u00B2';
    case 'FIXED': return '';
    case 'PER_SLAB': return 'slab';
    default: return unit;
  }
}

function unitLabel(unit: string): string {
  switch (unit) {
    case 'LINEAR_METRE': return 'per Lm';
    case 'SQUARE_METRE': return 'per m\u00B2';
    case 'FIXED': return 'fixed';
    case 'PER_SLAB': return 'per slab';
    default: return unit;
  }
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function QuickViewPieceRow({
  pieceNumber,
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
  onDelete,
  onDuplicate,
  onBulkEdgeApply,
  onBatchEdgeUpdate,
  onExpand,
  relationships,
  allPiecesForRelationships,
  quoteId,
  quoteIdStr,
  onRelationshipChange,
  onStripWidthChange,
  attachedCount,
  relationshipLabel,
  grainMatch,
  onDetach,
  onAddWaterfall,
  onAddSplashback,
  onMaterialsRefresh,
}: QuickViewPieceRowProps) {
  const isEditMode = mode === 'edit' && !!fullPiece && !!editData && !!onSavePiece;

  // ── Local state ─────────────────────────────────────────────────────────
  const [localLength, setLocalLength] = useState(piece.lengthMm);
  const [localWidth, setLocalWidth] = useState(piece.widthMm);
  const [localShapeConfig, setLocalShapeConfig] = useState<Record<string, unknown> | null>(
    piece.shapeConfig ?? null
  );
  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(piece.name);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [quickEdgeProfileId, setQuickEdgeProfileId] = useState<string | null>(null);
  const [flashEdge, setFlashEdge] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<MiniEdgeSide | null>(null);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);
  const [showCutoutPopover, setShowCutoutPopover] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [showGrainWarning, setShowGrainWarning] = useState(false);
  const [localOverrideCost, setLocalOverrideCost] = useState<string>(
    piece.overrideMaterialCost != null ? String(piece.overrideMaterialCost) : ''
  );
  const [localOverrideSlabPrice, setLocalOverrideSlabPrice] = useState<string>(
    piece.overrideSlabPrice != null ? String(piece.overrideSlabPrice) : ''
  );
  const [localOverrideFabCost, setLocalOverrideFabCost] = useState<string>(
    piece.overrideFabricationCost != null ? String(piece.overrideFabricationCost) : ''
  );
  const [overrideSaving, setOverrideSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [localEdgeBuildups, setLocalEdgeBuildups] = useState<Record<string, { depth: number }>>(
    (piece.edgeBuildups as Record<string, { depth: number }>) ?? {}
  );
  const [buildupSaveState, setBuildupSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const [newMat, setNewMat] = useState({
    name: '',
    fabricationCategory: 'ENGINEERED',
    slabLengthMm: '',
    slabWidthMm: '',
    pricePerSlab: '',
    collection: '',
    pricePerSqm: 0,
  });
  const [newMatSaving, setNewMatSaving] = useState(false);
  const [newMatError, setNewMatError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const materialRef = useRef<HTMLDivElement>(null);
  const cutoutRef = useRef<HTMLDivElement>(null);

  // Sync local state when piece changes externally
  useMemo(() => {
    setLocalLength(piece.lengthMm);
    setLocalWidth(piece.widthMm);
    if (!editingName) setLocalName(piece.name);
    setLocalOverrideCost(
      piece.overrideMaterialCost != null ? String(piece.overrideMaterialCost) : ''
    );
    setLocalOverrideSlabPrice(
      piece.overrideSlabPrice != null ? String(piece.overrideSlabPrice) : ''
    );
    setLocalOverrideFabCost(
      piece.overrideFabricationCost != null ? String(piece.overrideFabricationCost) : ''
    );
    setLocalEdgeBuildups((piece.edgeBuildups as Record<string, { depth: number }>) ?? {});
  }, [piece.lengthMm, piece.widthMm, piece.name, piece.overrideMaterialCost, piece.overrideSlabPrice, piece.overrideFabricationCost, piece.edgeBuildups]);

  const pieceTotal = breakdown?.pieceTotal ?? 0;
  const isOversize = breakdown?.oversize?.isOversize ?? false;

  // ── Edge resolution ─────────────────────────────────────────────────────
  const resolvedEdges = useMemo(() => {
    if (piece.edgeTop || piece.edgeBottom || piece.edgeLeft || piece.edgeRight) {
      return { edgeTop: piece.edgeTop, edgeBottom: piece.edgeBottom, edgeLeft: piece.edgeLeft, edgeRight: piece.edgeRight };
    }
    if (!breakdown?.fabrication?.edges) {
      return { edgeTop: null, edgeBottom: null, edgeLeft: null, edgeRight: null };
    }
    const result: Record<string, string | null> = { edgeTop: null, edgeBottom: null, edgeLeft: null, edgeRight: null };
    for (const e of breakdown.fabrication.edges) {
      const key = `edge${e.side.charAt(0).toUpperCase()}${e.side.slice(1)}`;
      if (key in result) result[key] = e.edgeTypeId;
    }
    return result as { edgeTop: string | null; edgeBottom: string | null; edgeLeft: string | null; edgeRight: string | null };
  }, [piece.edgeTop, piece.edgeBottom, piece.edgeLeft, piece.edgeRight, breakdown]);

  const resolvedEdgeTypes = useMemo(() => {
    if (editData?.edgeTypes && editData.edgeTypes.length > 0) {
      return editData.edgeTypes.filter(et => et.isActive !== false);
    }
    if (!breakdown?.fabrication?.edges) return [];
    const seen = new Set<string>();
    return breakdown.fabrication.edges
      .filter(e => { if (seen.has(e.edgeTypeId)) return false; seen.add(e.edgeTypeId); return true; })
      .map(e => ({ id: e.edgeTypeId, name: e.edgeTypeName }));
  }, [editData?.edgeTypes, breakdown]);

  // ── Cutout display ──────────────────────────────────────────────────────
  const displayCutouts = useMemo(() => {
    if (fullPiece && Array.isArray(fullPiece.cutouts) && fullPiece.cutouts.length > 0) {
      const cutoutTypes = editData?.cutoutTypes ?? [];
      const rawCutouts = fullPiece.cutouts as unknown as Record<string, unknown>[];
      return rawCutouts
        .filter((c) => !!c && typeof c === 'object')
        .map((c, idx) => ({
          id: (c.id as string) || `cutout_${idx}`,
          typeId: (c.cutoutTypeId || c.typeId || '') as string,
          typeName: resolveCutoutTypeName(c, cutoutTypes),
          quantity: (c.quantity as number) ?? 1,
        }));
    }
    if (breakdown?.fabrication?.cutouts) {
      return breakdown.fabrication.cutouts.map((c, idx) => ({
        id: `bd_${c.cutoutTypeId}_${idx}`,
        typeId: c.cutoutTypeId,
        typeName: c.cutoutTypeName,
        quantity: c.quantity,
      }));
    }
    return [];
  }, [fullPiece, editData?.cutoutTypes, breakdown]);

  // ── Mitred check ────────────────────────────────────────────────────────
  const isMitred = piece.laminationMethod === 'MITRED';

  // ── Save helper (debounced) ─────────────────────────────────────────────
  // Only recalculate when we have minimum viable data (positive dimensions).
  // Prevents eager recalculation with incomplete piece data.
  const savePiece = useCallback((overrides: Record<string, unknown>) => {
    if (!fullPiece || !onSavePiece) return;
    const mergedLength = (overrides.lengthMm as number) ?? fullPiece.lengthMm;
    const mergedWidth = (overrides.widthMm as number) ?? fullPiece.widthMm;
    if (mergedLength <= 0 || mergedWidth <= 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
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
          cutouts: fullPiece.cutouts,
          ...overrides,
        },
        fullPiece.quote_rooms?.name || 'Kitchen'
      );
    }, 500);
  }, [fullPiece, onSavePiece, piece.id]);

  // ── Immediate save (no debounce, for dropdowns/selectors) ───────────────
  // Same minimum viable data guard as savePiece.
  const savePieceImmediate = useCallback((overrides: Record<string, unknown>) => {
    if (!fullPiece || !onSavePiece) return;
    const mergedLength = (overrides.lengthMm as number) ?? fullPiece.lengthMm;
    const mergedWidth = (overrides.widthMm as number) ?? fullPiece.widthMm;
    if (mergedLength <= 0 || mergedWidth <= 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
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
        cutouts: fullPiece.cutouts,
        ...overrides,
      },
      fullPiece.quote_rooms?.name || 'Kitchen'
    );
  }, [fullPiece, onSavePiece, piece.id]);

  // ── Dimension handlers ──────────────────────────────────────────────────
  // onChange: update local state only — no save
  const handleLengthChange = useCallback((val: number) => {
    setLocalLength(val);
  }, []);

  // onBlur: save when user leaves the field
  const handleLengthBlur = useCallback(() => {
    if (localLength > 0) {
      savePiece({ lengthMm: localLength });
    }
  }, [localLength, savePiece]);

  // onChange: update local state only — no save
  const handleWidthChange = useCallback((val: number) => {
    setLocalWidth(val);
  }, []);

  // onBlur: save when user leaves the field
  const handleWidthBlur = useCallback(() => {
    if (localWidth > 0) {
      savePiece({ widthMm: localWidth });
    }
  }, [localWidth, savePiece]);

  const handleShapeConfigChange = useCallback((
    updatedConfig: Record<string, unknown>
  ) => {
    setLocalShapeConfig(updatedConfig);
    if (piece.shapeType === 'L_SHAPE') {
      const cfg = updatedConfig as unknown as LShapeConfig;
      if (cfg.leg1 && cfg.leg2) {
        const newLength = cfg.leg1.length_mm;
        const newWidth = cfg.leg1.width_mm + cfg.leg2.length_mm;
        setLocalLength(newLength);
        setLocalWidth(newWidth);
        savePiece({
          shapeConfig: updatedConfig,
          lengthMm: newLength,
          widthMm: newWidth,
        });
      }
    } else if (piece.shapeType === 'U_SHAPE') {
      const cfg = updatedConfig as unknown as UShapeConfig;
      if (cfg.leftLeg && cfg.back && cfg.rightLeg) {
        const newLength = cfg.back.length_mm;
        const newWidth = Math.max(cfg.leftLeg.length_mm, cfg.rightLeg.length_mm);
        setLocalLength(newLength);
        setLocalWidth(newWidth);
        savePiece({
          shapeConfig: updatedConfig,
          lengthMm: newLength,
          widthMm: newWidth,
        });
      }
    }
  }, [piece.shapeType, savePiece]);

  // ── Name handler ────────────────────────────────────────────────────────
  const handleNameSave = useCallback(() => {
    setEditingName(false);
    if (localName !== piece.name) {
      savePieceImmediate({ name: localName });
    }
  }, [localName, piece.name, savePieceImmediate]);

  // ── Material handler ────────────────────────────────────────────────────
  const handleMaterialSelect = useCallback((mat: InlineEditMaterial) => {
    setShowMaterialDropdown(false);
    setMaterialSearch('');
    savePieceImmediate({ materialId: mat.id, materialName: mat.name });
  }, [savePieceImmediate]);

  // handleOverrideCostChange removed — replaced by handleSaveOverrides in Cost Breakdown

  const handleLabourOnlyToggle = useCallback(async (checked: boolean) => {
    const val = checked ? '0' : '';
    setLocalOverrideCost(val);
    if (!quoteId) return;
    await fetch(`/api/quotes/${quoteId}/pieces/${piece.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrideMaterialCost: checked ? 0 : null }),
    });
    onSavePiece?.(piece.id, { overrideMaterialCost: checked ? 0 : null }, piece.roomName ?? '');
  }, [quoteId, piece.id, piece.roomName, onSavePiece]);

  const handleSaveOverrides = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!quoteId) return;
    setOverrideSaving('saving');
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pieces/${piece.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lengthMm: piece.lengthMm,
          widthMm: piece.widthMm,
          thicknessMm: piece.thicknessMm,
          materialName: piece.materialName,
          edgeTop: piece.edgeTop,
          edgeBottom: piece.edgeBottom,
          edgeLeft: piece.edgeLeft,
          edgeRight: piece.edgeRight,
          overrideFabricationCost: localOverrideFabCost === '' ? null : parseFloat(localOverrideFabCost),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        console.error('[handleSaveOverrides] failed:', res.status, err);
        setOverrideSaving('idle');
        return;
      }
      onSavePiece?.(piece.id, {
        overrideFabricationCost: localOverrideFabCost === '' ? null : parseFloat(localOverrideFabCost),
      }, piece.roomName ?? '');
      setOverrideSaving('saved');
      setTimeout(() => setOverrideSaving('idle'), 2000);
    } catch (err) {
      console.error('[handleSaveOverrides] fetch error:', err);
      setOverrideSaving('idle');
    }
  }, [quoteId, piece.id, piece.lengthMm, piece.widthMm, piece.thicknessMm, piece.materialName, piece.edgeTop, piece.edgeBottom, piece.edgeLeft, piece.edgeRight, piece.roomName, localOverrideFabCost, onSavePiece]);

  const MITERED_EDGE_ID = 'cmlar3eu20006znatmv7mbivv';
  const edgeFieldMap: Record<string, string> = {
    top: 'edgeTop', bottom: 'edgeBottom', left: 'edgeLeft', right: 'edgeRight',
  };

  const handleEdgeBuildup = useCallback((edge: string, active: boolean, depth = 40) => {
    const next = { ...localEdgeBuildups };
    const profileField = edgeFieldMap[edge];
    if (active) {
      next[edge] = { depth };
    } else {
      delete next[edge];
    }
    setLocalEdgeBuildups(next);
    setBuildupSaveState('saving');
    savePieceImmediate({
      edgeBuildups: Object.keys(next).length > 0 ? next : null,
      ...(profileField ? { [profileField]: active ? MITERED_EDGE_ID : null } : {}),
    });
    setBuildupSaveState('saved');
    setTimeout(() => setBuildupSaveState('idle'), 2000);
  }, [localEdgeBuildups, savePieceImmediate]);

  const calculatedPricePerSqm = useMemo(() => {
    const price = parseFloat(newMat.pricePerSlab);
    const length = parseInt(newMat.slabLengthMm);
    const width = parseInt(newMat.slabWidthMm);
    if (!price || !length || !width || price <= 0 || length <= 0 || width <= 0) return null;
    const slabAreaSqm = (length * width) / 1_000_000;
    return Math.round((price / slabAreaSqm) * 100) / 100;
  }, [newMat.pricePerSlab, newMat.slabLengthMm, newMat.slabWidthMm]);

  const handleSaveNewMaterial = useCallback(async () => {
    if (!newMat.name.trim()) {
      setNewMatError('Name is required');
      return;
    }
    setNewMatSaving(true);
    setNewMatError(null);
    try {
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMat.name.trim(),
          collection: newMat.collection.trim() || null,
          fabricationCategory: newMat.fabricationCategory,
          slabLengthMm: newMat.slabLengthMm ? parseInt(newMat.slabLengthMm) : null,
          slabWidthMm: newMat.slabWidthMm ? parseInt(newMat.slabWidthMm) : null,
          pricePerSlab: newMat.pricePerSlab ? parseFloat(newMat.pricePerSlab) : null,
          pricePerSqm: calculatedPricePerSqm ?? 0,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setNewMatError(err.error || 'Failed to create material');
        return;
      }
      const created = await res.json();
      savePieceImmediate({ materialId: created.id, materialName: created.name });
      setShowNewMaterialModal(false);
      setNewMat({ name: '', fabricationCategory: 'ENGINEERED', slabLengthMm: '', slabWidthMm: '', pricePerSlab: '', collection: '', pricePerSqm: 0 });
      onMaterialsRefresh?.();
    } catch {
      setNewMatError('Failed to create material');
    } finally {
      setNewMatSaving(false);
    }
  }, [newMat, calculatedPricePerSqm, savePieceImmediate, onMaterialsRefresh]);

  const filteredMaterials = useMemo(() => {
    if (!editData?.materials) return [];
    if (!materialSearch) return editData.materials;
    const lower = materialSearch.toLowerCase();
    return editData.materials.filter(m =>
      m.name.toLowerCase().includes(lower) || (m.collection || '').toLowerCase().includes(lower)
    );
  }, [editData?.materials, materialSearch]);

  // ── Thickness handler ───────────────────────────────────────────────────
  const handleThicknessChange = useCallback((val: number) => {
    savePieceImmediate({ thicknessMm: val });
  }, [savePieceImmediate]);

  // ── Edge click handler (Quick Edge on mini SVG) ─────────────────────────
  const handleMiniEdgeClick = useCallback((side: MiniEdgeSide, e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.stopPropagation();
    const edgeKey = `edge${side.charAt(0).toUpperCase()}${side.slice(1)}` as
      'edgeTop' | 'edgeBottom' | 'edgeLeft' | 'edgeRight';

    let profileToApply = quickEdgeProfileId;
    // Mitred enforcement: only Pencil Round allowed
    if (isMitred && profileToApply) {
      const pencilId = editData?.edgeTypes.find(et => et.name.toLowerCase().includes('pencil'))?.id;
      if (profileToApply !== pencilId) profileToApply = pencilId ?? null;
    }

    savePieceImmediate({ [edgeKey]: profileToApply });
    setFlashEdge(side);
    setTimeout(() => setFlashEdge(null), 200);
  }, [isEditMode, quickEdgeProfileId, isMitred, editData?.edgeTypes, savePieceImmediate]);

  // ── Cutout handlers ─────────────────────────────────────────────────────
  const handleCutoutAdd = useCallback((cutoutTypeId: string) => {
    if (!fullPiece) return;
    const newCutout: PieceCutout = {
      id: `cut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      cutoutTypeId,
      quantity: 1,
    };
    const updatedCutouts = [...(fullPiece.cutouts || []), newCutout];
    savePieceImmediate({ cutouts: updatedCutouts });
    setShowCutoutPopover(false);
  }, [fullPiece, savePieceImmediate]);

  const handleCutoutRemove = useCallback((cutoutId: string) => {
    if (!fullPiece) return;
    const raw = (fullPiece.cutouts || []) as unknown as Record<string, unknown>[];
    let updated = raw.filter(c => (c.id as string) !== cutoutId);
    if (updated.length === raw.length && cutoutId.startsWith('cutout_')) {
      const idx = parseInt(cutoutId.replace('cutout_', ''), 10);
      if (!isNaN(idx) && idx >= 0 && idx < raw.length) {
        updated = raw.filter((_, i) => i !== idx);
      }
    }
    savePieceImmediate({ cutouts: updated });
  }, [fullPiece, savePieceImmediate]);

  // ── Accordion edge/cutout handlers (for PieceVisualEditor) ──────────────
  const handleEdgeChange = useCallback((side: EdgeSide, profileId: string | null) => {
    if (!fullPiece || !onSavePiece) return;
    const edgeKey = `edge${side.charAt(0).toUpperCase()}${side.slice(1)}` as
      'edgeTop' | 'edgeBottom' | 'edgeLeft' | 'edgeRight';
    savePieceImmediate({ [edgeKey]: profileId });
  }, [fullPiece, onSavePiece, savePieceImmediate]);

  // Handler for shape_config edges (INNER, R-BTM, etc.) — merges into shape_config.edges
  const handleNoStripEdgesChange = useCallback((noStripEdges: string[]) => {
    savePieceImmediate({ noStripEdges });
  }, [savePieceImmediate]);

  const handleShapeEdgeChange = useCallback((edgeId: string, profileId: string | null) => {
    if (!fullPiece || !onSavePiece) return;

    const shapeType = piece.shapeType;

    if (shapeType === 'L_SHAPE' || shapeType === 'U_SHAPE') {
      // L/U shapes: store edges in shapeConfig.edges sub-object
      const currentConfig = (fullPiece.shapeConfig as unknown as Record<string, unknown>) ?? {};
      const currentEdges = (currentConfig.edges as Record<string, string | null>) ?? {};
      const updatedEdges = { ...currentEdges, [edgeId]: profileId };
      const updatedConfig = { ...currentConfig, edges: updatedEdges };
      savePieceImmediate({ shapeConfig: updatedConfig });
    } else if (shapeType === 'RADIUS_END' && edgeId !== 'arc_end' && edgeId !== 'arc_left') {
      // Straight edges on RADIUS_END (top/bottom/left) save to rectangle
      // edge columns — same path as regular rectangles.
      // arc_end and arc_left go to edge_arc_config (handled by the final else).
      const sideMap: Record<string, string> = {
        top: 'edgeTop',
        bottom: 'edgeBottom',
        left: 'edgeLeft',
        right: 'edgeRight',
      };
      const colKey = sideMap[edgeId];
      if (colKey) savePieceImmediate({ [colKey]: profileId });
    } else {
      // arc_end on RADIUS_END, and all other curved shapes → edge_arc_config
      const currentArcConfig = (fullPiece as unknown as Record<string, unknown>).edge_arc_config as Record<string, string | null> ?? {};
      const updatedArcConfig = { ...currentArcConfig, [edgeId]: profileId };
      savePieceImmediate({ edgeArcConfig: updatedArcConfig });
    }
  }, [fullPiece, piece.shapeType, onSavePiece, savePieceImmediate]);

  const handleEdgesChange = useCallback(
    (edges: { top?: string | null; bottom?: string | null; left?: string | null; right?: string | null }) => {
      if (!fullPiece || !onSavePiece) return;
      const overrides: Record<string, unknown> = {};
      if (edges.top !== undefined) overrides.edgeTop = edges.top;
      if (edges.bottom !== undefined) overrides.edgeBottom = edges.bottom;
      if (edges.left !== undefined) overrides.edgeLeft = edges.left;
      if (edges.right !== undefined) overrides.edgeRight = edges.right;
      savePieceImmediate(overrides);
    },
    [fullPiece, onSavePiece, savePieceImmediate]
  );

  const handlePresetApply = useCallback((preset: EdgePreset) => {
    if (!preset.allRaw && !quickEdgeProfileId) {
      setPresetMessage('Select an edge profile first');
      setTimeout(() => setPresetMessage(null), 2000);
      return;
    }

    const profileId = preset.allRaw ? null : quickEdgeProfileId;
    handleEdgesChange({
      top:    preset.sides.includes('top')    ? profileId : null,
      bottom: preset.sides.includes('bottom') ? profileId : null,
      left:   preset.sides.includes('left')   ? profileId : null,
      right:  preset.sides.includes('right')  ? profileId : null,
    });
  }, [handleEdgesChange, quickEdgeProfileId]);

  const handleBulkApply = useCallback(
    (edges: { top: string | null; bottom: string | null; left: string | null; right: string | null }, scope: 'room' | 'quote') => {
      if (onBulkEdgeApply) onBulkEdgeApply(edges, scope, piece.id);
    },
    [onBulkEdgeApply, piece.id]
  );

  const handleApplyWithScope = useCallback(
    (profileId: string | null, scope: EdgeScope, clickedSide: string) => {
      if (!onBatchEdgeUpdate) return;
      const roomId = fullPiece?.quote_rooms?.id ?? 0;
      onBatchEdgeUpdate(profileId, scope, piece.id, clickedSide, roomId);
    },
    [onBatchEdgeUpdate, piece.id, fullPiece]
  );

  // ── Mini SVG layout ─────────────────────────────────────────────────────
  const miniLayout = useMemo(() => {
    const maxW = MINI_W - MINI_PAD * 2;
    const maxH = MINI_H - MINI_PAD * 2;
    // Child pieces (waterfall/splashback) may be taller than wide — swap so SVG renders portrait
    const svgLengthMm = (relationshipLabel && piece.widthMm > piece.lengthMm) ? piece.widthMm : piece.lengthMm;
    const svgWidthMm = (relationshipLabel && piece.widthMm > piece.lengthMm) ? piece.lengthMm : piece.widthMm;
    const aspect = svgLengthMm / Math.max(svgWidthMm, 1);
    let w: number, h: number;
    if (aspect > maxW / maxH) { w = maxW; h = maxW / aspect; }
    else { h = maxH; w = maxH * aspect; }
    w = Math.max(w, 30); h = Math.max(h, 15);
    return { w, h, x: (MINI_W - w) / 2, y: (MINI_H - h) / 2 };
  }, [piece.lengthMm, piece.widthMm, relationshipLabel]);

  const miniEdgeDefs = useMemo(() => {
    const { x, y, w, h } = miniLayout;
    return {
      top: { x1: x, y1: y, x2: x + w, y2: y, lx: x + w / 2, ly: y - 6, anchor: 'middle' as const },
      bottom: { x1: x, y1: y + h, x2: x + w, y2: y + h, lx: x + w / 2, ly: y + h + 9, anchor: 'middle' as const },
      left: { x1: x, y1: y, x2: x, y2: y + h, lx: x - 8, ly: y + h / 2, anchor: 'end' as const },
      right: { x1: x + w, y1: y, x2: x + w, y2: y + h, lx: x + w + 8, ly: y + h / 2, anchor: 'start' as const },
    };
  }, [miniLayout]);

  // Resolve edge name from ID
  const resolveEdgeName = useCallback((edgeId: string | null): string | undefined => {
    if (!edgeId) return undefined;
    return resolvedEdgeTypes.find(e => e.id === edgeId)?.name;
  }, [resolvedEdgeTypes]);

  // ── Join position for oversize accordion ────────────────────────────────
  const joinAtMm = useMemo(() => {
    if (!breakdown?.oversize?.isOversize) return undefined;
    return Math.round(piece.lengthMm / 2);
  }, [breakdown, piece.lengthMm]);

  // ── Render ──────────────────────────────────────────────────────────────
  const sides: MiniEdgeSide[] = ['top', 'bottom', 'left', 'right'];
  const edgeKeyMap: Record<MiniEdgeSide, 'edgeTop' | 'edgeBottom' | 'edgeLeft' | 'edgeRight'> = {
    top: 'edgeTop', bottom: 'edgeBottom', left: 'edgeLeft', right: 'edgeRight',
  };

  return (
    <>
    <div className={`rounded-lg border ${isOversize ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'}`}>
      {/* ══════════════ QUICK VIEW ROW ══════════════ */}
      <div className="px-4 py-3">
        {/* ── Line 1: Badge · Name · Dims · Thickness · Material · Price ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Piece number badge */}
          {pieceNumber != null && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-900 text-white font-bold text-sm flex-shrink-0">
              {pieceNumber}
            </span>
          )}

          {/* WF-2c: Relationship label prefix for child pieces */}
          {relationshipLabel && (
            <span className="text-xs text-gray-400 flex-shrink-0">{relationshipLabel}</span>
          )}

          {/* Piece name */}
          <div className="flex-shrink-0 min-w-[100px] max-w-[180px]">
            {isEditMode && editingName ? (
              <input
                type="text"
                value={localName}
                onChange={e => setLocalName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); }}
                className="w-full px-1.5 py-0.5 text-sm font-medium border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <span
                className={`text-sm font-medium text-gray-900 truncate block ${isEditMode ? 'cursor-text hover:bg-blue-50 rounded px-1.5 py-0.5' : ''}`}
                onClick={() => isEditMode && setEditingName(true)}
                title={piece.name}
              >
                {piece.name || 'Untitled'}
              </span>
            )}
          </div>

          {/* WF-2c: Attached count badge for parent pieces */}
          {attachedCount != null && attachedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 flex-shrink-0">
              ↳ {attachedCount} attached
            </span>
          )}

          {/* WF-2c: Grain match badge for child pieces */}
          {grainMatch && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 flex-shrink-0">
              🌿 Grain match
            </span>
          )}

          {/* Compact dims shown inline when accordion is open */}
          {accordionOpen && (
            <span className="text-xs text-gray-500 ml-2">
              {getPieceDimensionLabel(piece)}
              {piece.thicknessMm ? ` · ${piece.thicknessMm}mm` : ''}
              {piece.materialName ? ` · ${piece.materialName}` : ''}
            </span>
          )}

          {/* Summary content — always visible above expanded diagram */}
          <div className="contents">
          {/* Dimension inputs — shape-aware */}
          {isEditMode ? (
            <>
              {/* Rectangle: standard length × width inputs */}
              {(!piece.shapeType || piece.shapeType === 'RECTANGLE') && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <input
                    type="number"
                    value={localLength}
                    onChange={e => handleLengthChange(Number(e.target.value))}
                    onBlur={handleLengthBlur}
                    min={100}
                    step={50}
                    className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
                  />
                  <span className="text-xs text-gray-400">&times;</span>
                  <input
                    type="number"
                    value={localWidth}
                    onChange={e => handleWidthChange(Number(e.target.value))}
                    onBlur={handleWidthBlur}
                    min={100}
                    step={50}
                    className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
                  />
                  <span className="text-xs text-gray-400 ml-0.5">mm</span>
                </div>
              )}

              {/* L-Shape: per-leg inputs */}
              {piece.shapeType === 'L_SHAPE' && localShapeConfig && (() => {
                const cfg = localShapeConfig as unknown as LShapeConfig;
                if (!cfg?.leg1 || !cfg?.leg2) return null;
                return (
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 w-10">Leg 1:</span>
                      <input type="number" value={cfg.leg1.length_mm} min={100} step={10}
                        onChange={e => handleShapeConfigChange({
                          ...localShapeConfig,
                          leg1: { ...cfg.leg1, length_mm: Number(e.target.value) }
                        })}
                        onBlur={() => { if (localShapeConfig) handleShapeConfigChange(localShapeConfig as Record<string, unknown>); }}
                        className="w-[60px] px-1 py-0.5 border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-400">&times;</span>
                      <input type="number" value={cfg.leg1.width_mm} min={100} step={10}
                        onChange={e => handleShapeConfigChange({
                          ...localShapeConfig,
                          leg1: { ...cfg.leg1, width_mm: Number(e.target.value) }
                        })}
                        onBlur={() => { if (localShapeConfig) handleShapeConfigChange(localShapeConfig as Record<string, unknown>); }}
                        className="w-[60px] px-1 py-0.5 border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 w-10">Leg 2:</span>
                      <input type="number" value={cfg.leg2.length_mm} min={100} step={10}
                        onChange={e => handleShapeConfigChange({
                          ...localShapeConfig,
                          leg2: { ...cfg.leg2, length_mm: Number(e.target.value) }
                        })}
                        onBlur={() => { if (localShapeConfig) handleShapeConfigChange(localShapeConfig as Record<string, unknown>); }}
                        className="w-[60px] px-1 py-0.5 border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-400">&times;</span>
                      <input type="number" value={cfg.leg2.width_mm} min={100} step={10}
                        onChange={e => handleShapeConfigChange({
                          ...localShapeConfig,
                          leg2: { ...cfg.leg2, width_mm: Number(e.target.value) }
                        })}
                        onBlur={() => { if (localShapeConfig) handleShapeConfigChange(localShapeConfig as Record<string, unknown>); }}
                        className="w-[60px] px-1 py-0.5 border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-[10px] text-gray-400">mm</span>
                  </div>
                );
              })()}

              {/* U-Shape: per-leg inputs */}
              {piece.shapeType === 'U_SHAPE' && localShapeConfig && (() => {
                const cfg = localShapeConfig as unknown as UShapeConfig;
                if (!cfg?.leftLeg || !cfg?.back || !cfg?.rightLeg) return null;
                return (
                  <div className="flex flex-col gap-1 text-xs">
                    {[
                      { key: 'leftLeg', label: 'Left:', data: cfg.leftLeg },
                      { key: 'back', label: 'Back:', data: cfg.back },
                      { key: 'rightLeg', label: 'Right:', data: cfg.rightLeg },
                    ].map(({ key, label, data }) => (
                      <div key={key} className="flex items-center gap-1">
                        <span className="text-gray-400 w-10">{label}</span>
                        <input type="number" value={data.length_mm} min={100} step={10}
                          onChange={e => handleShapeConfigChange({
                            ...localShapeConfig,
                            [key]: { ...data, length_mm: Number(e.target.value) }
                          })}
                          onBlur={() => { if (localShapeConfig) handleShapeConfigChange(localShapeConfig as Record<string, unknown>); }}
                          className="w-[60px] px-1 py-0.5 border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-gray-400">&times;</span>
                        <input type="number" value={data.width_mm} min={100} step={10}
                          onChange={e => handleShapeConfigChange({
                            ...localShapeConfig,
                            [key]: { ...data, width_mm: Number(e.target.value) }
                          })}
                          onBlur={() => { if (localShapeConfig) handleShapeConfigChange(localShapeConfig as Record<string, unknown>); }}
                          className="w-[60px] px-1 py-0.5 border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                    <span className="text-[10px] text-gray-400">mm</span>
                  </div>
                );
              })()}

              {/* Other shapes (RADIUS_END, FULL_CIRCLE etc) — bounding box only */}
              {piece.shapeType && !['RECTANGLE', 'L_SHAPE', 'U_SHAPE'].includes(piece.shapeType) && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <input type="number" value={localLength}
                    onChange={e => handleLengthChange(Number(e.target.value))}
                    onBlur={handleLengthBlur}
                    min={100} step={50}
                    className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
                  />
                  <span className="text-xs text-gray-400">&times;</span>
                  <input type="number" value={localWidth}
                    onChange={e => handleWidthChange(Number(e.target.value))}
                    onBlur={handleWidthBlur}
                    min={100} step={50}
                    className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
                  />
                  <span className="text-xs text-gray-400 ml-0.5">mm</span>
                </div>
              )}

              {/* RADIUS_END — edit arc radius */}
              {piece.shapeType === 'RADIUS_END' && isEditMode && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Radius</span>
                  <input
                    type="number"
                    value={(localShapeConfig as Record<string, unknown>)?.radius_mm as number ?? ''}
                    onChange={e => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      setLocalShapeConfig(prev => prev ? { ...prev, radius_mm: val } : prev);
                    }}
                    onBlur={() => {
                      if (localShapeConfig) {
                        savePiece({ shapeConfig: localShapeConfig });
                      }
                    }}
                    min={10}
                    step={10}
                    className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
                  />
                  <span className="text-xs text-gray-400 ml-0.5">mm</span>
                </div>
              )}

              {/* FULL_CIRCLE — edit diameter */}
              {piece.shapeType === 'FULL_CIRCLE' && isEditMode && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Diameter</span>
                  <input
                    type="number"
                    value={(localShapeConfig as Record<string, unknown>)?.diameter_mm as number ?? ''}
                    onChange={e => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      setLocalShapeConfig(prev => prev ? { ...prev, diameter_mm: val } : prev);
                      if (val !== '') {
                        setLocalLength(val as number);
                        setLocalWidth(val as number);
                      }
                    }}
                    onBlur={() => {
                      if (localShapeConfig) {
                        const diam = (localShapeConfig as Record<string, unknown>).diameter_mm as number;
                        savePiece({
                          shapeConfig: localShapeConfig,
                          lengthMm: diam,
                          widthMm: diam,
                        });
                      }
                    }}
                    min={100}
                    step={50}
                    className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
                  />
                  <span className="text-xs text-gray-400 ml-0.5">mm</span>
                </div>
              )}

              {/* ROUNDED_RECT — edit corner radius */}
              {piece.shapeType === 'ROUNDED_RECT' && isEditMode && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Corner R</span>
                  <input
                    type="number"
                    value={(localShapeConfig as Record<string, unknown>)?.corner_radius_mm as number ?? ''}
                    onChange={e => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      setLocalShapeConfig(prev => prev ? { ...prev, corner_radius_mm: val } : prev);
                    }}
                    onBlur={() => {
                      if (localShapeConfig) {
                        savePiece({ shapeConfig: localShapeConfig });
                      }
                    }}
                    min={5}
                    step={5}
                    className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
                  />
                  <span className="text-xs text-gray-400 ml-0.5">mm</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-500 flex-shrink-0">
              {getPieceDimensionLabel(piece)}
            </span>
          )}

          {/* Thickness (read-only — derived from material slab) */}
          <span className="text-xs text-gray-500 flex-shrink-0">{piece.thicknessMm}mm</span>

          {/* Edge build-up pills (read-only) */}
          {piece.edgeBuildups && Object.keys(piece.edgeBuildups as Record<string, unknown>).length > 0 && (
            <div className="flex gap-1 flex-shrink-0">
              {Object.entries(piece.edgeBuildups as Record<string, { depth: number }>).map(([edge, cfg]) => (
                <span
                  key={edge}
                  className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded border border-amber-200"
                >
                  {edge.charAt(0).toUpperCase()}:{cfg.depth}
                </span>
              ))}
            </div>
          )}

          {/* Material picker */}
          {isEditMode ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <MaterialPickerV2
                materials={editData?.materials ?? []}
                value={fullPiece?.materialId ?? null}
                onChange={(_id, mat, collectionInfo) => {
                  if (collectionInfo?.collectionOnly) {
                    savePieceImmediate({
                      materialId: mat?.id ?? null,
                      materialName: mat?.name ?? null,
                      materialCollectionOnly: true,
                      materialCollectionName: collectionInfo.collectionName,
                    });
                  } else if (mat) {
                    savePieceImmediate({
                      materialId: mat.id,
                      materialName: mat.name,
                      materialCollectionOnly: false,
                      materialCollectionName: null,
                    });
                  }
                }}
                placeholder={piece.materialName || 'Select material'}
                collectionOnly={piece.materialCollectionOnly ?? false}
                collectionName={piece.materialCollectionName ?? null}
              />
              <button
                type="button"
                onClick={() => setShowNewMaterialModal(true)}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap"
              >
                + New
              </button>
            </div>
          ) : (
            piece.materialName && (
              <span className="text-xs text-gray-500 flex-shrink-0 truncate max-w-[160px]">{piece.materialName}</span>
            )
          )}

          {isEditMode && (
            <div className="w-full mt-1 space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`labour-only-${piece.id}`}
                  checked={localOverrideCost === '0'}
                  onChange={(e) => handleLabourOnlyToggle(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label
                  htmlFor={`labour-only-${piece.id}`}
                  className="text-xs text-gray-600 cursor-pointer select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  Labour only
                </label>
              </div>
              {/* Override material cost input moved to Cost Breakdown section */}
            </div>
          )}

          {piece.overrideMaterialCost === 0 ? (
            <span className="ml-1 text-xs text-gray-400 italic">Labour only</span>
          ) : piece.overrideMaterialCost != null ? (
            <span className="ml-1 text-xs text-amber-600 font-medium">
              ${Number(piece.overrideMaterialCost).toFixed(2)} override
            </span>
          ) : null}

          {/* Slab price override input moved to Cost Breakdown section */}

          {/* Edge Build-Up edit UI (edit mode only) */}
          {isEditMode && (
            <div className="w-full mt-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600">Edge Build-Up</span>
                  {buildupSaveState === 'saving' && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Saving...
                    </span>
                  )}
                  {buildupSaveState === 'saved' && (
                    <span className="text-xs text-green-600">&#10003; Saved</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const wallEdges = piece.noStripEdges ?? [];
                    const next: Record<string, { depth: number }> = {};
                    const profileOverrides: Record<string, string | null> = {};
                    (['top', 'bottom', 'left', 'right'] as const).forEach(edge => {
                      if (!wallEdges.includes(edge)) {
                        next[edge] = { depth: 40 };
                        profileOverrides[edgeFieldMap[edge]] = MITERED_EDGE_ID;
                      }
                    });
                    setLocalEdgeBuildups(next);
                    setBuildupSaveState('saving');
                    savePieceImmediate({ edgeBuildups: next, ...profileOverrides });
                    setBuildupSaveState('saved');
                    setTimeout(() => setBuildupSaveState('idle'), 2000);
                  }}
                  className="text-xs text-primary-600 hover:underline"
                >
                  Apply 40mm to all
                </button>
              </div>
              <div className="flex gap-1 flex-wrap">
                {(['top','bottom','left','right'] as const).map(edge => {
                  const isWall = (piece.noStripEdges ?? []).includes(edge);
                  const buildup = localEdgeBuildups[edge];
                  return (
                    <div key={edge} className={`flex items-center gap-1 ${isWall ? 'opacity-40' : ''}`}>
                      <button
                        type="button"
                        disabled={isWall}
                        onClick={(e) => { e.stopPropagation(); handleEdgeBuildup(edge, !buildup); }}
                        className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                          buildup ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-500 border-gray-300'
                        }`}
                      >
                        {edge.charAt(0).toUpperCase() + edge.slice(1)}
                      </button>
                      {buildup && (
                        <input
                          type="number"
                          min={40}
                          step={5}
                          value={buildup.depth}
                          onChange={(e) => { e.stopPropagation(); handleEdgeBuildup(edge, true, parseInt(e.target.value) || 40); }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded"
                        />
                      )}
                      {buildup && <span className="text-xs text-gray-400">mm</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fabrication cost override input moved to Cost Breakdown section */}

          {/* Spacer + Price + Badges */}
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOversize && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                OVERSIZE
              </span>
            )}
            {(piece.requiresGrainMatch || (isOversize && (breakdown?.oversize?.grainMatchingSurcharge ?? 0) > 0)) && (
              breakdown?.grainMatchWarning && !breakdown.grainMatchWarning.feasible ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowGrainWarning(prev => !prev); }}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                  title={breakdown.grainMatchWarning.message}
                >
                  GRAIN MATCH ⚠️
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 border border-yellow-200">
                  GRAIN MATCH {!piece.requiresGrainMatch && isOversize ? '⚠' : ''}
                </span>
              )
            )}
            {/* Curved shape badge */}
            {piece.shapeType === 'RADIUS_END' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 border border-sky-300 flex-shrink-0">
                ~R
              </span>
            )}
            {piece.shapeType === 'FULL_CIRCLE' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 border border-sky-300 flex-shrink-0">
                ○
              </span>
            )}
            {piece.shapeType === 'ROUNDED_RECT' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 border border-sky-300 flex-shrink-0">
                ▢
              </span>
            )}
            {savingPiece && (
              <span className="text-[10px] text-blue-500 animate-pulse">Saving...</span>
            )}
            <span className="font-semibold text-gray-900 tabular-nums text-sm">
              {formatCurrency(pieceTotal)}
            </span>
          </div>

          {/* Action buttons */}
          {(onExpand || (mode === 'edit' && (onDelete || onDuplicate || onAddWaterfall || onAddSplashback))) && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {onExpand && (
                <button onClick={() => onExpand(piece.id)} className="p-1 text-gray-400 hover:text-gray-600" title="Open piece in new tab">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
              {onDuplicate && (
                <button onClick={() => onDuplicate(piece.id)} className="p-1 text-gray-400 hover:text-gray-600" title="Duplicate piece">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              )}
              {onAddWaterfall && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddWaterfall(); }}
                  className="px-1 text-[10px] font-medium text-orange-500 hover:text-orange-700 transition-colors"
                  title="Attach Waterfall"
                >
                  +Waterfall
                </button>
              )}
              {onAddSplashback && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddSplashback(); }}
                  className="px-1 text-[10px] font-medium text-orange-500 hover:text-orange-700 transition-colors"
                  title="Attach Splashback"
                >
                  +Splash Back
                </button>
              )}
              {onDelete && (
                <button onClick={() => onDelete(piece.id)} className="p-1 text-red-400 hover:text-red-600" title="Delete piece">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {/* WF-2c: Detach button for child pieces */}
          {onDetach && (
            <button
              onClick={onDetach}
              className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0"
              title="Detach from parent (keeps piece as top-level)"
            >
              ×
            </button>
          )}
          </div>
        </div>

        {/* ── Line 2: Mini SVG · Quick Edge · Cutouts ── */}
        <div className="flex items-start gap-3 mt-2">
          {/* Mini SVG diagram */}
          <div className="flex-shrink-0" style={{ width: MINI_W, height: MINI_H }}>
            <svg viewBox={`0 0 ${MINI_W} ${MINI_H}`} width={MINI_W} height={MINI_H} className="w-full h-full">
              <defs>
                <style>{`
                  @keyframes qv-edge-flash {
                    0% { stroke: #22c55e; stroke-width: 4; }
                    100% { stroke: inherit; stroke-width: inherit; }
                  }
                  .qv-edge-flash { animation: qv-edge-flash 200ms ease-out; }
                `}</style>
              </defs>

              {/* Piece shape — L/U polygon or rectangle */}
              {(() => {
                const shapePath = getMiniShapePath(piece.shapeType, piece.shapeConfig, miniLayout.x, miniLayout.y, miniLayout.w, miniLayout.h);
                return shapePath
                  ? <path d={shapePath} fill="#f5f5f5" stroke="#e5e7eb" strokeWidth={1} />
                  : <rect x={miniLayout.x} y={miniLayout.y} width={miniLayout.w} height={miniLayout.h} fill="#f5f5f5" stroke="#e5e7eb" strokeWidth={1} />;
              })()}

              {/* Edges — L/U shapes use polygon segments; rectangles use bounding box */}
              {(() => {
                const shapeEdges = getMiniShapeEdges(
                  piece.shapeType,
                  piece.shapeConfig as Record<string, unknown> | null | undefined,
                  miniLayout.x, miniLayout.y, miniLayout.w, miniLayout.h
                );

                // RADIUS_END: straight edges (top/bottom/left) work correctly via bounding box.
                // Only the arc_end needs special handling — replace right-side line with Q-bezier.
                if (piece.shapeType === 'RADIUS_END' && piece.shapeConfig) {
                  const cfg = piece.shapeConfig as unknown as {
                    radius_mm: number; length_mm: number; width_mm: number; curved_ends?: string;
                  };
                  const { x, y, w, h } = miniLayout;
                  const rx = Math.max(Math.min((cfg.radius_mm / cfg.length_mm) * w, w * 0.45), w * 0.25);
                  const ry = Math.max(Math.min((cfg.radius_mm / cfg.width_mm) * h, h * 0.45), h * 0.25);
                  const bothEnds = cfg.curved_ends === 'BOTH';

                  // Read arc_end profile from edge_arc_config
                  const arcConfig = (fullPiece as unknown as Record<string, unknown>)
                    ?.edge_arc_config as Record<string, string | null> | null | undefined;
                  const arcEndId = arcConfig?.arc_end ?? null;
                  const arcName = resolveEdgeName(arcEndId);
                  const arcIsFinished = !!arcEndId;
                  const arcColour = edgeColour(arcName);
                  const arcCode = edgeCode(arcName);
                  const arcFlashing = flashEdge === 'arc_end';

                  // Arc path for right end (Q bezier matching getMiniShapePath)
                  const rightArcPath = `M ${x + w - rx},${y} Q ${x + w},${y} ${x + w},${y + ry} L ${x + w},${y + h - ry} Q ${x + w},${y + h} ${x + w - rx},${y + h}`;
                  // Arc path for left end (BOTH only)
                  const leftArcPath = `M ${x + rx},${y + h} Q ${x},${y + h} ${x},${y + h - ry} L ${x},${y + ry} Q ${x},${y} ${x + rx},${y}`;

                  const handleArcClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    let profileToApply = quickEdgeProfileId;
                    if (isMitred && profileToApply) {
                      const pencilId = editData?.edgeTypes.find(et =>
                        et.name.toLowerCase().includes('pencil'))?.id;
                      if (profileToApply !== pencilId) profileToApply = pencilId ?? null;
                    }
                    handleShapeEdgeChange('arc_end', profileToApply);
                    setFlashEdge('arc_end');
                    setTimeout(() => setFlashEdge(null), 200);
                  };

                  // Left arc (BOTH ends) — separate key in edge_arc_config
                  const leftArcId = arcConfig?.arc_left ?? null;
                  const leftArcName = resolveEdgeName(leftArcId);
                  const leftArcIsFinished = !!leftArcId;
                  const leftArcColour = edgeColour(leftArcName);
                  const leftArcCode = edgeCode(leftArcName);
                  const leftArcFlashing = flashEdge === 'arc_left';

                  const handleLeftArcClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    let profileToApply = quickEdgeProfileId;
                    if (isMitred && profileToApply) {
                      const pencilId = editData?.edgeTypes.find(et =>
                        et.name.toLowerCase().includes('pencil'))?.id;
                      if (profileToApply !== pencilId) profileToApply = pencilId ?? null;
                    }
                    handleShapeEdgeChange('arc_left', profileToApply);
                    setFlashEdge('arc_left');
                    setTimeout(() => setFlashEdge(null), 200);
                  };

                  // Straight edges: top, bottom, left (and right-straight for single-end)
                  const straightEdges = bothEnds
                    ? [
                        { side: 'top'    as MiniEdgeSide, def: { x1: x + rx, y1: y,     x2: x + w - rx, y2: y,     lx: x + w / 2,  ly: y - 6      } },
                        { side: 'bottom' as MiniEdgeSide, def: { x1: x + rx, y1: y + h, x2: x + w - rx, y2: y + h, lx: x + w / 2,  ly: y + h + 9  } },
                      ]
                    : [
                        { side: 'top'    as MiniEdgeSide, def: { x1: x,      y1: y,     x2: x + w - rx, y2: y,     lx: x + (w - rx) / 2, ly: y - 6      } },
                        { side: 'bottom' as MiniEdgeSide, def: { x1: x,      y1: y + h, x2: x + w - rx, y2: y + h, lx: x + (w - rx) / 2, ly: y + h + 9  } },
                        { side: 'left'   as MiniEdgeSide, def: { x1: x,      y1: y,     x2: x,          y2: y + h, lx: x - 8,            ly: y + h / 2  } },
                      ];

                  return (
                    <>
                      {/* Straight edges — read from edgeTop/edgeBottom/edgeLeft as normal */}
                      {straightEdges.map(({ side, def }) => {
                        const edgeId = resolvedEdges[edgeKeyMap[side]];
                        const name = resolveEdgeName(edgeId);
                        const isFinished = !!edgeId;
                        const colour = edgeColour(name);
                        const code = edgeCode(name);
                        const isFlashing = flashEdge === side;
                        return (
                          <g key={side}>
                            <line x1={def.x1} y1={def.y1} x2={def.x2} y2={def.y2}
                              stroke={isFlashing ? '#22c55e' : colour}
                              strokeWidth={isFlashing ? 3 : (isFinished ? 2 : 0.75)}
                              strokeDasharray={isFinished ? undefined : '2 1.5'}
                            />
                            {isEditMode && (
                              <line x1={def.x1} y1={def.y1} x2={def.x2} y2={def.y2}
                                stroke="transparent" strokeWidth={EDGE_HIT}
                                style={{ cursor: 'pointer' }}
                                onClick={e => handleMiniEdgeClick(side, e)}
                                onMouseEnter={() => setHoveredEdge(side)}
                                onMouseLeave={() => setHoveredEdge(null)}
                              />
                            )}
                            <text x={def.lx} y={def.ly}
                              textAnchor="middle" dominantBaseline="middle"
                              className={`select-none ${isFinished ? 'text-[7px] font-semibold' : 'text-[6px]'}`}
                              fill={colour}
                            >{code || side.charAt(0).toUpperCase()}</text>
                          </g>
                        );
                      })}

                      {/* Right arc (arc_end) */}
                      <g>
                        <path d={rightArcPath} fill="none"
                          stroke={arcFlashing ? '#22c55e' : arcColour}
                          strokeWidth={arcFlashing ? 3 : (arcIsFinished ? 2 : 0.75)}
                          strokeDasharray={arcIsFinished ? undefined : '2 1.5'}
                        />
                        {isEditMode && (
                          <path d={rightArcPath} fill="none"
                            stroke="transparent" strokeWidth={EDGE_HIT}
                            style={{ cursor: 'pointer' }}
                            onClick={handleArcClick}
                          />
                        )}
                        <text x={x + w + 8} y={y + h / 2}
                          textAnchor="start" dominantBaseline="middle"
                          className={`select-none ${arcIsFinished ? 'text-[7px] font-semibold' : 'text-[6px]'}`}
                          fill={arcColour}
                        >{arcCode || 'ARC'}</text>
                      </g>

                      {/* Left arc (BOTH ends only — separate arc_left key) */}
                      {bothEnds && (
                        <g>
                          <path d={leftArcPath} fill="none"
                            stroke={leftArcFlashing ? '#22c55e' : leftArcColour}
                            strokeWidth={leftArcFlashing ? 3 : (leftArcIsFinished ? 2 : 0.75)}
                            strokeDasharray={leftArcIsFinished ? undefined : '2 1.5'}
                          />
                          {isEditMode && (
                            <path d={leftArcPath} fill="none"
                              stroke="transparent" strokeWidth={EDGE_HIT}
                              style={{ cursor: 'pointer' }}
                              onClick={handleLeftArcClick}
                            />
                          )}
                          <text x={x - 8} y={y + h / 2}
                            textAnchor="end" dominantBaseline="middle"
                            className={`select-none ${leftArcIsFinished ? 'text-[7px] font-semibold' : 'text-[6px]'}`}
                            fill={leftArcColour}
                          >{leftArcCode || 'ARC'}</text>
                        </g>
                      )}
                    </>
                  );
                }

                if (shapeEdges) {
                  // L/U shape: render polygon edge segments
                  const shapeEdgeMap = (piece.shapeType === 'L_SHAPE' || piece.shapeType === 'U_SHAPE')
                    ? ((piece.shapeConfig as Record<string, unknown> | null)?.edges as Record<string, string | null> | undefined) ?? {}
                    : {};

                  return shapeEdges.map(seg => {
                    const edgeId = shapeEdgeMap[seg.side] ?? null;
                    const name = resolveEdgeName(edgeId);
                    const isFinished = !!edgeId;
                    const colour = edgeColour(name);
                    const code = edgeCode(name);
                    const isFlashing = flashEdge === seg.side;

                    return (
                      <g key={seg.side}>
                        <line
                          x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                          stroke={isFlashing ? '#22c55e' : colour}
                          strokeWidth={isFlashing ? 3 : (isFinished ? 2 : 0.75)}
                          strokeDasharray={isFinished ? undefined : '2 1.5'}
                        />
                        {isEditMode && (
                          <line
                            x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                            stroke="transparent"
                            strokeWidth={EDGE_HIT}
                            style={{ cursor: 'pointer' }}
                            onClick={e => {
                              e.stopPropagation();
                              let profileToApply = quickEdgeProfileId;
                              if (isMitred && profileToApply) {
                                const pencilId = editData?.edgeTypes.find(et =>
                                  et.name.toLowerCase().includes('pencil'))?.id;
                                if (profileToApply !== pencilId) profileToApply = pencilId ?? null;
                              }
                              handleShapeEdgeChange(seg.side, profileToApply);
                              setFlashEdge(seg.side);
                              setTimeout(() => setFlashEdge(null), 200);
                            }}
                          />
                        )}
                        <text
                          x={seg.lx} y={seg.ly}
                          textAnchor={seg.anchor}
                          dominantBaseline="middle"
                          className={`select-none ${isFinished ? 'text-[7px] font-semibold' : 'text-[6px]'}`}
                          fill={colour}
                        >
                          {code || seg.label}
                        </text>
                      </g>
                    );
                  });
                }

                // Rectangle (and all other shapes): original 4-side bounding box rendering
                return sides.map(side => {
                  const def = miniEdgeDefs[side];
                  const edgeId = resolvedEdges[edgeKeyMap[side]];
                  const name = resolveEdgeName(edgeId);
                  const isFinished = !!edgeId;
                  const colour = edgeColour(name);
                  const code = edgeCode(name);
                  const isHovered = hoveredEdge === side && isEditMode;
                  const isFlashing = flashEdge === side;

                  return (
                    <g key={side}>
                      {isHovered && (
                        <line x1={def.x1} y1={def.y1} x2={def.x2} y2={def.y2}
                          stroke="#3b82f6" strokeWidth={8} strokeOpacity={0.15} strokeLinecap="round" />
                      )}
                      <line x1={def.x1} y1={def.y1} x2={def.x2} y2={def.y2}
                        stroke={isFlashing ? '#22c55e' : colour}
                        strokeWidth={isFlashing ? 3 : (isFinished ? 2 : 0.75)}
                        strokeDasharray={isFinished ? undefined : '2 1.5'}
                        className={isFlashing ? 'qv-edge-flash' : undefined}
                      />
                      {isEditMode && (
                        <line x1={def.x1} y1={def.y1} x2={def.x2} y2={def.y2}
                          stroke="transparent" strokeWidth={EDGE_HIT}
                          style={{ cursor: 'pointer' }}
                          onClick={e => handleMiniEdgeClick(side, e)}
                          onMouseEnter={() => setHoveredEdge(side)}
                          onMouseLeave={() => setHoveredEdge(null)}
                        />
                      )}
                      <text x={def.lx} y={def.ly} textAnchor={def.anchor} dominantBaseline="middle"
                        className={`select-none ${isFinished ? 'text-[7px] font-semibold' : 'text-[6px]'}`}
                        fill={colour}
                      >
                        {code}{piece.edgeBuildups && (piece.edgeBuildups as Record<string, { depth: number }>)[side]
                          ? ` ${(piece.edgeBuildups as Record<string, { depth: number }>)[side].depth}mm`
                          : ''}
                      </text>
                    </g>
                  );
                });
              })()}
            </svg>
          </div>

          {/* Quick Edge selector + cutouts */}
          <div className="flex-1 min-w-0">
            {/* Quick Edge profile selector */}
            {isEditMode && (
              <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 mr-0.5">Quick Edge:</span>
                <button
                  onClick={() => setQuickEdgeProfileId(null)}
                  className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colours ${
                    quickEdgeProfileId === null
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Raw
                </button>
                {(editData?.edgeTypes ?? []).map(et => {
                  const disabled = isMitred && !et.isMitred;
                  return (
                    <button
                      key={et.id}
                      onClick={() => !disabled && setQuickEdgeProfileId(et.id)}
                      disabled={disabled}
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colours ${
                        disabled
                          ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                          : quickEdgeProfileId === et.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                      title={disabled ? 'Mitred edges use Pencil Round only' : et.name}
                    >
                      {et.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Layout Presets (Rectangle only, edit mode) */}
            {isEditMode && (!piece.shapeType || piece.shapeType === 'RECTANGLE') && (
              <div className="flex flex-wrap items-center gap-1 mb-1">
                <span className="text-[10px] text-gray-400 mr-0.5">Presets:</span>
                {EDGE_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetApply(preset)}
                    title={preset.label}
                    className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded border
                               border-gray-200 hover:border-stone-400 hover:bg-stone-50
                               transition-colors text-center"
                  >
                    <PresetThumbnail sides={preset.sides} />
                    <span className="text-[9px] text-gray-500 leading-tight whitespace-nowrap">
                      {preset.label}
                    </span>
                  </button>
                ))}
                {presetMessage && (
                  <p className="text-[10px] text-amber-600 ml-1">{presetMessage}</p>
                )}
              </div>
            )}

            {/* View mode: edge summary */}
            {!isEditMode && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1 flex-wrap">
                <span className="text-gray-400">Edges:</span>
                {sides.map(side => {
                  const edgeId = resolvedEdges[edgeKeyMap[side]];
                  const name = resolveEdgeName(edgeId);
                  const colour = edgeColour(name);
                  const code = edgeCode(name);
                  return (
                    <span key={side} className="inline-flex items-center gap-0.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colour }} />
                      <span>{side.charAt(0).toUpperCase()}:{code}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Cutout chips */}
            <div className="flex items-center gap-1 flex-wrap">
              {displayCutouts.length > 0 && (
                <span className="text-[10px] text-gray-400 mr-0.5">Cutouts:</span>
              )}
              {displayCutouts.map(c => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded"
                >
                  {cutoutLabel(c.typeName)} &times;{c.quantity}
                  {isEditMode && (
                    <button
                      onClick={() => handleCutoutRemove(c.id)}
                      className="text-amber-400 hover:text-red-500 ml-0.5"
                      title="Remove cutout"
                    >
                      &#10005;
                    </button>
                  )}
                </span>
              ))}
              {displayCutouts.length === 0 && !isEditMode && (
                <span className="text-[10px] text-gray-300">No cutouts</span>
              )}
              {/* Add cutout button */}
              {isEditMode && editData?.cutoutTypes && editData.cutoutTypes.filter(ct => ct.isActive).length > 0 && (
                <div className="relative" ref={cutoutRef}>
                  <button
                    onClick={() => setShowCutoutPopover(!showCutoutPopover)}
                    className="px-1.5 py-0.5 text-[10px] font-medium border border-dashed border-gray-300 rounded text-gray-500 hover:border-amber-300 hover:text-amber-700 transition-colours"
                  >
                    + Add Cutout
                  </button>
                  {showCutoutPopover && (
                    <div className="absolute left-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-[200px] overflow-y-auto">
                      {editData.cutoutTypes.filter(ct => ct.isActive).map(ct => (
                        <button
                          key={ct.id}
                          onClick={() => handleCutoutAdd(ct.id)}
                          className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colours flex justify-between"
                        >
                          <span>{ct.name}</span>
                          <span className="text-gray-400 ml-2">{formatCurrency(ct.baseRate)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Line 3: Expand trigger — always accessible regardless of warning state ── */}
        <button
          onClick={() => setAccordionOpen(!accordionOpen)}
          className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colours"
        >
          <svg
            className={`h-3 w-3 transform transition-transform ${accordionOpen ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {accordionOpen ? 'Collapse full view' : 'Expand full view'}
        </button>

        {/* ── Grain match warning (inline alert — Rule 37: contextual, not modal) ── */}
        {/* Rendered BELOW expand trigger so it never blocks piece editing access */}
        {showGrainWarning && breakdown?.grainMatchWarning && !breakdown.grainMatchWarning.feasible && (
          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
            <p className="font-medium mb-1">Grain match may not be achievable</p>
            <p className="mb-3">{breakdown.grainMatchWarning.message}</p>
            <div className="flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); setShowGrainWarning(false); }}
                className="px-2 py-1 text-xs rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
              >
                Keep grain match (add join cost)
              </button>
              {onSavePiece && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSavePiece(piece.id, { requiresGrainMatch: false }, '');
                    setShowGrainWarning(false);
                  }}
                  className="px-2 py-1 text-xs rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
                >
                  Remove grain match
                </button>
              )}
              {onSavePiece ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSavePiece(piece.id, { requiresGrainMatch: false }, '');
                    setShowGrainWarning(false);
                  }}
                  className="text-xs text-amber-700 underline"
                >
                  Dismiss
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowGrainWarning(false); }}
                  className="text-xs text-amber-700 underline"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════ ACCORDION (Full View) ══════════════ */}
      {accordionOpen && (
        <div className="border-t border-gray-100">
          {/* Full PieceVisualEditor SVG */}
          <PieceEditorErrorBoundary pieceName={piece.name}>
            <div className="px-4 py-3 border-b border-gray-100 min-h-[320px]">
              <PieceVisualEditor
                lengthMm={piece.lengthMm}
                widthMm={piece.widthMm}
                edgeTop={resolvedEdges.edgeTop}
                edgeBottom={resolvedEdges.edgeBottom}
                edgeLeft={resolvedEdges.edgeLeft}
                edgeRight={resolvedEdges.edgeRight}
                edgeTypes={resolvedEdgeTypes}
                cutouts={displayCutouts}
                joinAtMm={joinAtMm}
                isEditMode={isEditMode}
                isMitred={isMitred}
                initialQuickEdgeProfile={isEditMode ? quickEdgeProfileId : undefined}
                onEdgeChange={isEditMode ? handleEdgeChange : undefined}
                onEdgesChange={isEditMode ? handleEdgesChange : undefined}
                onCutoutAdd={isEditMode ? handleCutoutAdd : undefined}
                onCutoutRemove={isEditMode ? handleCutoutRemove : undefined}
                cutoutTypes={editData?.cutoutTypes ?? []}
                onBulkApply={isEditMode && onBulkEdgeApply ? handleBulkApply : undefined}
                roomName={piece.roomName}
                roomId={fullPiece?.quote_rooms?.id ? String(fullPiece.quote_rooms.id) : undefined}
                onApplyWithScope={isEditMode && onBatchEdgeUpdate ? handleApplyWithScope : undefined}
                shapeType={(piece.shapeType as import('@/lib/types/shapes').ShapeType | undefined) ?? undefined}
                shapeConfig={piece.shapeConfig as import('@/lib/types/shapes').ShapeConfig ?? undefined}
                onShapeEdgeChange={isEditMode ? handleShapeEdgeChange : undefined}
                shapeConfigEdges={(() => {
                  const st = piece.shapeType;
                  if (st === 'L_SHAPE' || st === 'U_SHAPE') {
                    const sc = (fullPiece?.shapeConfig as { edges?: Record<string, string | null> } | null | undefined);
                    return sc?.edges ?? undefined;
                  }
                  return ((fullPiece as unknown as Record<string, unknown>)?.edge_arc_config as Record<string, string | null>) ?? undefined;
                })()}
                noStripEdges={(piece.noStripEdges as string[]) ?? []}
                onNoStripEdgesChange={isEditMode ? handleNoStripEdgesChange : undefined}
              />
            </div>
          </PieceEditorErrorBoundary>

          {/* Relationships (edit mode only) */}
          {mode === 'edit' && quoteIdStr && relationships && allPiecesForRelationships && onRelationshipChange && (
            <div className="px-4 pb-3 pt-3 border-b border-gray-100">
              <RelationshipEditor
                quoteId={quoteIdStr}
                selectedPieceId={String(piece.id)}
                allPieces={allPiecesForRelationships}
                existingRelationships={relationships}
                onRelationshipChange={onRelationshipChange}
              />
            </div>
          )}

          {/* Per-edge strip width overrides (edit mode, 40mm+ pieces or pieces with edge buildups) */}
          {mode === 'edit' && quoteIdStr && fullPiece && (fullPiece.thicknessMm >= 40 || Object.keys(fullPiece.edgeBuildups ?? {}).length > 0) && (
            <AccordionStripWidths
              piece={fullPiece}
              quoteId={quoteIdStr}
              edgeSelections={{
                edgeTop: fullPiece.edgeTop,
                edgeBottom: fullPiece.edgeBottom,
                edgeLeft: fullPiece.edgeLeft,
                edgeRight: fullPiece.edgeRight,
              }}
              shapeType={(piece.shapeType ?? 'RECTANGLE') as ShapeType}
              onStripWidthChange={onStripWidthChange}
            />
          )}

          {/* Cost breakdown — fabrication first, then material, then installation */}
          {breakdown && (
            <div className="px-4 pb-4 pt-3 space-y-1.5">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Cost Breakdown</p>
              {/* Cutting */}
              {breakdown.fabrication.cutting.total > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Cutting</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      {breakdown.fabrication.cutting.quantity.toFixed(2)} {unitShort(breakdown.fabrication.cutting.unit)} &times; {formatCurrency(breakdown.fabrication.cutting.rate)} {unitLabel(breakdown.fabrication.cutting.unit)}
                    </span>
                    <span className="font-medium tabular-nums">{formatCurrency(breakdown.fabrication.cutting.total)}</span>
                  </div>
                </div>
              )}
              {/* POLISHING REMOVED — deliberate pricing decision (March 2026) */}
              {/* Curved Cutting */}
              {breakdown.fabrication.curvedCutting && breakdown.fabrication.curvedCutting.cost > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Curved Cutting</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      {breakdown.fabrication.curvedCutting.arcLengthLm.toFixed(2)} Lm &times; {formatCurrency(breakdown.fabrication.curvedCutting.rate)}
                    </span>
                    <span className="font-medium tabular-nums">{formatCurrency(breakdown.fabrication.curvedCutting.cost)}</span>
                  </div>
                </div>
              )}
              {/* CURVED POLISHING REMOVED — deliberate pricing decision (March 2026) */}
              {/* Edge Profiles — one row per distinct edge type, Lm × rate shown */}
              {breakdown.fabrication.edges && breakdown.fabrication.edges.length > 0 && (() => {
                // Group edges by name, summing lm and cost across all sides
                const grouped = breakdown.fabrication.edges.reduce<
                  Record<string, { name: string; lm: number; rate: number; total: number }>
                >((acc, e) => {
                  const key = e.edgeTypeName;
                  if (!acc[key]) {
                    acc[key] = { name: e.edgeTypeName, lm: 0, rate: e.rate, total: 0 };
                  }
                  acc[key].lm += e.linearMeters;
                  acc[key].total += e.total;
                  return acc;
                }, {});

                return Object.values(grouped).map((group, idx) => (
                  <div key={`edge-profile-${idx}`} className="flex items-center justify-between text-xs text-gray-600">
                    <span>Edge Profile: {group.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">
                        {group.lm.toFixed(2)} Lm &times; {formatCurrency(group.rate)} per Lm
                      </span>
                      <span className="font-medium tabular-nums">{formatCurrency(group.total)}</span>
                    </div>
                  </div>
                ));
              })()}
              {/* Join (oversize) */}
              {breakdown.oversize?.isOversize && breakdown.oversize.joinCost > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Join ({breakdown.oversize.joinCount} join{breakdown.oversize.joinCount !== 1 ? 's' : ''})</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      {breakdown.oversize.joinLengthLm.toFixed(2)} Lm &times; {formatCurrency(breakdown.oversize.joinRate)}
                    </span>
                    <span className="font-medium tabular-nums">{formatCurrency(breakdown.oversize.joinCost)}</span>
                  </div>
                </div>
              )}
              {/* Grain Matching Surcharge (oversize) */}
              {breakdown.oversize?.isOversize && breakdown.oversize.grainMatchingSurcharge > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Grain Matching Surcharge ({(breakdown.oversize.grainMatchingSurchargeRate * 100).toFixed(0)}%)</span>
                  <span className="font-medium tabular-nums">{formatCurrency(breakdown.oversize.grainMatchingSurcharge)}</span>
                </div>
              )}
              {/* Cutouts */}
              {breakdown.fabrication.cutouts && breakdown.fabrication.cutouts.filter(c => c.total > 0).map((cutout, idx) => (
                <div key={`${cutout.cutoutTypeId}-${idx}`} className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Cutout: {cutout.cutoutTypeName}
                    <span className="text-[11px] text-gray-400 ml-1">&times;{cutout.quantity}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      {cutout.quantity} &times; {formatCurrency(cutout.rate)} ea
                    </span>
                    <span className="font-medium tabular-nums">{formatCurrency(cutout.total)}</span>
                  </div>
                </div>
              ))}
              {/* Lamination */}
              {breakdown.fabrication.lamination && breakdown.fabrication.lamination.total > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Lamination ({breakdown.fabrication.lamination.method && breakdown.fabrication.lamination.method !== 'NONE' ? breakdown.fabrication.lamination.method : breakdown.fabrication.lamination.total > 0 ? 'LAMINATED' : 'NONE'})</span>
                  <span className="font-medium tabular-nums">{formatCurrency(breakdown.fabrication.lamination.total)}</span>
                </div>
              )}
              {/* Material cost — after fabrication */}
              {breakdown.materials && breakdown.materials.total > 0 && (() => {
                const m = breakdown.materials;
                const isSoleUser = (m.sharePercent ?? 100) >= 99.9;
                const isSlab = m.pricingBasis === 'PER_SLAB';
                let formulaText: string;
                if (isSlab && m.slabCount != null && m.pricePerSlab != null) {
                  const slabLabel = `${m.slabCount} slab${m.slabCount > 1 ? 's' : ''} \u00D7 ${formatCurrency(m.pricePerSlab)}`;
                  if (isSoleUser) {
                    formulaText = slabLabel;
                  } else {
                    formulaText = `${slabLabel}  \u00B7  ${m.areaM2.toFixed(2)} m\u00B2 of ${(m.totalMaterialAreaSqm ?? m.areaM2).toFixed(2)} m\u00B2 (${(m.sharePercent ?? 100).toFixed(1)}%)`;
                  }
                } else if (m.wasteFactorPercent != null && m.ratePerSqm != null) {
                  formulaText = `${(m.adjustedAreaM2 ?? m.areaM2).toFixed(2)} m\u00B2 \u00D7 ${formatCurrency(m.ratePerSqm)}/m\u00B2 (incl. ${m.wasteFactorPercent}% waste)`;
                } else {
                  formulaText = `${m.areaM2.toFixed(2)} m\u00B2 \u00D7 ${formatCurrency(m.pricePerSqm ?? m.baseRate)}/m\u00B2`;
                }
                return (
                  <>
                    <div className="border-t border-gray-100 my-0.5" />
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>Material{m.materialName ? ` \u2014 ${m.materialName}` : ''}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">{formulaText}</span>
                        <span className="font-medium tabular-nums">{formatCurrency(m.total)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
              {/* Installation — last */}
              {breakdown.fabrication.installation && breakdown.fabrication.installation.total > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Installation</span>
                  <span className="font-medium tabular-nums">{formatCurrency(breakdown.fabrication.installation.total)}</span>
                </div>
              )}
              {/* ── Price Overrides ── */}
              {mode === 'edit' && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200 space-y-2">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    Price Overrides
                  </p>

                  {/* Override fabrication cost */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 w-40">Override fabrication cost</span>
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 250.00"
                        value={localOverrideFabCost}
                        onChange={(e) => setLocalOverrideFabCost(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-28 text-xs border border-gray-200 rounded px-2 py-1 appearance-none"
                      />
                      {localOverrideFabCost !== '' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setLocalOverrideFabCost(''); }}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >Clear</button>
                      )}
                    </div>
                  </div>

                  {/* Update button + save state */}
                  {localOverrideFabCost !== '' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleSaveOverrides}
                        disabled={overrideSaving === 'saving'}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {overrideSaving === 'saving' ? 'Saving...' : 'Update overrides'}
                      </button>
                      {overrideSaving === 'saved' && (
                        <span className="text-xs text-green-600">&#10003; Saved</span>
                      )}
                    </div>
                  )}

                  {/* Active override pill */}
                  {piece.overrideFabricationCost != null && (
                    <span className="text-xs text-amber-600">
                      ⚠️ Fabrication override: ${Number(piece.overrideFabricationCost).toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-xs font-semibold text-gray-900 pt-1 border-t border-gray-100">
                <span>Piece Total</span>
                <span className="tabular-nums">{formatCurrency(pieceTotal)}</span>
              </div>
            </div>
          )}
          {/* Bottom collapse button — so Jay doesn't have to scroll to top */}
          <div className="px-4 py-3 border-t border-gray-100 flex justify-center">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAccordionOpen(false); }}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <span>↑</span>
              <span>Collapse full view</span>
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Quick-add material modal */}
    {showNewMaterialModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => setShowNewMaterialModal(false)}
      >
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-semibold text-gray-900 mb-4">New Material</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newMat.name}
                onChange={(e) => setNewMat(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Calacatta Gold"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Collection</label>
              <input
                type="text"
                value={newMat.collection}
                onChange={(e) => setNewMat(p => ({ ...p, collection: e.target.value }))}
                placeholder="e.g. Premium Range"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fabrication Category</label>
              <select
                value={newMat.fabricationCategory}
                onChange={(e) => setNewMat(p => ({ ...p, fabricationCategory: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="ENGINEERED">Engineered Quartz</option>
                <option value="NATURAL_HARD">Natural Granite</option>
                <option value="NATURAL_SOFT">Natural Marble</option>
                <option value="NATURAL_PREMIUM">Natural Premium</option>
                <option value="SINTERED">Porcelain / Sintered</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Slab Length (mm)</label>
                <input
                  type="number"
                  value={newMat.slabLengthMm}
                  onChange={(e) => setNewMat(p => ({ ...p, slabLengthMm: e.target.value }))}
                  placeholder="3200"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Slab Width (mm)</label>
                <input
                  type="number"
                  value={newMat.slabWidthMm}
                  onChange={(e) => setNewMat(p => ({ ...p, slabWidthMm: e.target.value }))}
                  placeholder="1600"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cost per Slab (ex GST)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={newMat.pricePerSlab}
                  onChange={(e) => setNewMat(p => ({ ...p, pricePerSlab: e.target.value }))}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {calculatedPricePerSqm !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  ≈ <span className="font-medium text-gray-700">${calculatedPricePerSqm.toFixed(2)}/m²</span> based on slab dimensions
                </p>
              )}
              {newMat.pricePerSlab && !calculatedPricePerSqm && (
                <p className="text-xs text-amber-600 mt-1">
                  Enter slab dimensions to calculate m² rate
                </p>
              )}
            </div>
            {newMatError && (
              <p className="text-xs text-red-600">{newMatError}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={() => setShowNewMaterialModal(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNewMaterial}
              disabled={newMatSaving || !newMat.name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {newMatSaving ? 'Saving...' : 'Save Material'}
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
