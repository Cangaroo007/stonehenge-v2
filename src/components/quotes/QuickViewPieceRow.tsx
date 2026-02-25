'use client';

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
import type { EdgeSide } from './PieceVisualEditor';
import PieceEditorErrorBoundary from './PieceEditorErrorBoundary';
import type { PiecePricingBreakdown } from '@/lib/types/pricing';
import type { InlinePieceData } from './InlinePieceEditor';
import type { PieceCutout, CutoutType } from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import type { EdgeScope } from './EdgeProfilePopover';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import type { LShapeConfig, UShapeConfig } from '@/lib/types/shapes';
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
  return null;
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
  quoteIdStr,
  onRelationshipChange,
}: QuickViewPieceRowProps) {
  const isEditMode = mode === 'edit' && !!fullPiece && !!editData && !!onSavePiece;

  // ── Local state ─────────────────────────────────────────────────────────
  const [localLength, setLocalLength] = useState(piece.lengthMm);
  const [localWidth, setLocalWidth] = useState(piece.widthMm);
  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(piece.name);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [quickEdgeProfileId, setQuickEdgeProfileId] = useState<string | null>(null);
  const [flashEdge, setFlashEdge] = useState<MiniEdgeSide | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<MiniEdgeSide | null>(null);
  const [showCutoutPopover, setShowCutoutPopover] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const materialRef = useRef<HTMLDivElement>(null);
  const cutoutRef = useRef<HTMLDivElement>(null);

  // Sync local state when piece changes externally
  useMemo(() => {
    setLocalLength(piece.lengthMm);
    setLocalWidth(piece.widthMm);
    setLocalName(piece.name);
  }, [piece.lengthMm, piece.widthMm, piece.name]);

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
    if (editData?.edgeTypes && editData.edgeTypes.length > 0) return editData.edgeTypes;
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
  const isMitred = piece.thicknessMm === 40;

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
  const handleLengthChange = useCallback((val: number) => {
    setLocalLength(val);
    savePiece({ lengthMm: val });
  }, [savePiece]);

  const handleWidthChange = useCallback((val: number) => {
    setLocalWidth(val);
    savePiece({ widthMm: val });
  }, [savePiece]);

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
    const aspect = piece.lengthMm / Math.max(piece.widthMm, 1);
    let w: number, h: number;
    if (aspect > maxW / maxH) { w = maxW; h = maxW / aspect; }
    else { h = maxH; w = maxH * aspect; }
    w = Math.max(w, 30); h = Math.max(h, 15);
    return { w, h, x: (MINI_W - w) / 2, y: (MINI_H - h) / 2 };
  }, [piece.lengthMm, piece.widthMm]);

  const miniEdgeDefs = useMemo(() => {
    const { x, y, w, h } = miniLayout;
    return {
      top: { x1: x, y1: y, x2: x + w, y2: y, lx: x + w / 2, ly: y - 6, anchor: 'middle' as const },
      bottom: { x1: x, y1: y + h, x2: x + w, y2: y + h, lx: x + w / 2, ly: y + h + 9, anchor: 'middle' as const },
      left: { x1: x, y1: y, x2: x, y2: y + h, lx: x - 4, ly: y + h / 2, anchor: 'end' as const },
      right: { x1: x + w, y1: y, x2: x + w, y2: y + h, lx: x + w + 4, ly: y + h / 2, anchor: 'start' as const },
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

          {/* Dimension inputs */}
          {isEditMode ? (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <input
                type="number"
                value={localLength}
                onChange={e => handleLengthChange(Number(e.target.value))}
                min={100}
                step={50}
                className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
              />
              <span className="text-xs text-gray-400">&times;</span>
              <input
                type="number"
                value={localWidth}
                onChange={e => handleWidthChange(Number(e.target.value))}
                min={100}
                step={50}
                className="w-[70px] px-1.5 py-0.5 text-xs border border-gray-200 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"
              />
              <span className="text-xs text-gray-400 ml-0.5">mm</span>
            </div>
          ) : (
            <span className="text-xs text-gray-500 flex-shrink-0">
              {piece.lengthMm} &times; {piece.widthMm} mm
            </span>
          )}

          {/* Thickness selector */}
          {isEditMode ? (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {[20, 40].map(t => (
                <button
                  key={t}
                  onClick={() => handleThicknessChange(t)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colours ${
                    piece.thicknessMm === t
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {t}mm
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-500 flex-shrink-0">{piece.thicknessMm}mm</span>
          )}

          {/* Material dropdown */}
          {isEditMode ? (
            <div className="relative flex-shrink-0" ref={materialRef}>
              <button
                onClick={() => setShowMaterialDropdown(!showMaterialDropdown)}
                className="flex items-center gap-1 px-2 py-0.5 text-xs border border-gray-200 rounded bg-white hover:border-gray-300 max-w-[200px] truncate"
              >
                <span className="truncate">{piece.materialName || 'Select material'}</span>
                <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showMaterialDropdown && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-[260px]">
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="text"
                      value={materialSearch}
                      onChange={e => setMaterialSearch(e.target.value)}
                      placeholder="Search materials..."
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto py-1">
                    {filteredMaterials.map(mat => (
                      <button
                        key={mat.id}
                        onClick={() => handleMaterialSelect(mat)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colours flex justify-between"
                      >
                        <span className="truncate">{mat.name}</span>
                        <span className="text-gray-400 ml-2 flex-shrink-0">{formatCurrency(mat.pricePerSqm)}/m&sup2;</span>
                      </button>
                    ))}
                    {filteredMaterials.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400">No materials found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            piece.materialName && (
              <span className="text-xs text-gray-500 flex-shrink-0 truncate max-w-[160px]">{piece.materialName}</span>
            )
          )}

          {/* Spacer + Price + Badges */}
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOversize && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                OVERSIZE
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
          {(onExpand || (mode === 'edit' && (onDelete || onDuplicate))) && (
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
              {onDelete && (
                <button onClick={() => onDelete(piece.id)} className="p-1 text-red-400 hover:text-red-600" title="Delete piece">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
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

              {/* Edges */}
              {sides.map(side => {
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
                      {code}
                    </text>
                  </g>
                );
              })}
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
                  const disabled = isMitred && !et.name.toLowerCase().includes('pencil');
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

        {/* ── Line 3: Expand trigger ── */}
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
      </div>

      {/* ══════════════ ACCORDION (Full View) ══════════════ */}
      {accordionOpen && (
        <div className="border-t border-gray-100">
          {/* Full PieceVisualEditor SVG */}
          <PieceEditorErrorBoundary pieceName={piece.name}>
            <div className="px-4 py-3 border-b border-gray-100">
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
                onEdgeChange={isEditMode ? handleEdgeChange : undefined}
                onEdgesChange={isEditMode ? handleEdgesChange : undefined}
                onCutoutAdd={isEditMode ? handleCutoutAdd : undefined}
                onCutoutRemove={isEditMode ? handleCutoutRemove : undefined}
                cutoutTypes={editData?.cutoutTypes ?? []}
                onBulkApply={isEditMode && onBulkEdgeApply ? handleBulkApply : undefined}
                roomName={piece.roomName}
                roomId={fullPiece?.quote_rooms?.id ? String(fullPiece.quote_rooms.id) : undefined}
                onApplyWithScope={isEditMode && onBatchEdgeUpdate ? handleApplyWithScope : undefined}
                shapeType={(piece.shapeType as 'RECTANGLE' | 'L_SHAPE' | 'U_SHAPE' | undefined) ?? undefined}
                shapeConfig={piece.shapeConfig as import('@/lib/types/shapes').ShapeConfig ?? undefined}
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
              {/* Polishing */}
              {breakdown.fabrication.polishing.total > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Polishing</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      {breakdown.fabrication.polishing.quantity.toFixed(2)} {unitShort(breakdown.fabrication.polishing.unit)} &times; {formatCurrency(breakdown.fabrication.polishing.rate)} {unitLabel(breakdown.fabrication.polishing.unit)}
                    </span>
                    <span className="font-medium tabular-nums">{formatCurrency(breakdown.fabrication.polishing.total)}</span>
                  </div>
                </div>
              )}
              {/* Edge Profiles */}
              {breakdown.fabrication.edges && breakdown.fabrication.edges.length > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Edge Profiles</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(breakdown.fabrication.edges.reduce((sum, e) => sum + e.total, 0))}
                  </span>
                </div>
              )}
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
                  <span>Lamination ({breakdown.fabrication.lamination.method})</span>
                  <span className="font-medium tabular-nums">{formatCurrency(breakdown.fabrication.lamination.total)}</span>
                </div>
              )}
              {/* Material cost — after fabrication */}
              {breakdown.materials && breakdown.materials.total > 0 && (
                <>
                  <div className="border-t border-gray-100 my-0.5" />
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Material</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">
                        {breakdown.materials.pricingBasis === 'PER_SLAB' && breakdown.materials.slabCount != null && breakdown.materials.pricePerSlab != null
                          ? `${breakdown.materials.slabCount} slab${breakdown.materials.slabCount !== 1 ? 's' : ''} \u00D7 ${formatCurrency(breakdown.materials.pricePerSlab)}`
                          : `${breakdown.materials.areaM2.toFixed(4)} m\u00B2 \u00D7 ${formatCurrency(breakdown.materials.pricePerSqm ?? breakdown.materials.baseRate)}/m\u00B2`
                        }
                      </span>
                      <span className="font-medium tabular-nums">{formatCurrency(breakdown.materials.total)}</span>
                    </div>
                  </div>
                </>
              )}
              {/* Installation — last */}
              {breakdown.fabrication.installation && breakdown.fabrication.installation.total > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Installation</span>
                  <span className="font-medium tabular-nums">{formatCurrency(breakdown.fabrication.installation.total)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs font-semibold text-gray-900 pt-1 border-t border-gray-100">
                <span>Piece Total</span>
                <span className="tabular-nums">{formatCurrency(pieceTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
