'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { PiecePricingBreakdown } from '@/lib/types/pricing';
import type { Placement, LaminationSummary } from '@/types/slab-optimization';
import { formatCurrency } from '@/lib/utils';
import { decomposeShapeIntoRects, getFinishableEdgeLengthsMm, type ShapeType, type ShapeConfig } from '@/lib/types/shapes';

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuoteRoom {
  id: number;
  name: string;
  quote_pieces: QuotePiece[];
}

interface QuotePiece {
  id: number;
  name: string | null;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  shape_type?: string | null;
  shape_config?: unknown;
  material_id?: number | null;
  no_strip_edges?: unknown;
  edge_top: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  edge_right: string | null;
  promoted_from_piece_id?: number | null;
  promoted_edge_position?: string | null;
  piece_type?: string | null;
  lamination_method?: string | null;
  cutouts?: Array<{ cutout_type?: string }> | null;
  sourceRelationships: Array<{
    id: number;
    source_piece_id: number;
    target_piece_id: number;
    relationship_type: string | null;
    relation_type: string;
    side: string | null;
  }>;
  targetRelationships: Array<{
    id: number;
    source_piece_id: number;
    target_piece_id: number;
    relationship_type: string | null;
    relation_type: string;
    side: string | null;
  }>;
}

type PartType = 'MAIN' | 'OVERSIZE_HALF' | 'LAMINATION_STRIP' | 'WATERFALL' | 'CUTOUT';

interface Part {
  type: PartType;
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  slab: string | null;
  note?: string;
  isCutout?: boolean;
  stripPosition?: string;
  parentPieceId?: number;
}

interface OptimizerData {
  placements?: {
    items?: Placement[];
  };
  laminationSummary?: LaminationSummary;
}

interface PartsSectionProps {
  quoteId: number | string;
  rooms: QuoteRoom[];
  calcBreakdown: {
    pieces?: PiecePricingBreakdown[];
  } | null;
  /** Optional refresh key — bump to re-fetch optimizer data */
  optimiserRefreshKey?: number;
  /** Optional external relationships (edit mode — pieces don't carry inline relationships) */
  externalRelationships?: Array<{
    parentPieceId: string;
    childPieceId: string;
    relationshipType: string;
  }>;
  /** Callback after strip width is changed — parent should trigger re-optimise */
  onStripWidthChange?: () => void;
  /** Callback after a strip is promoted to a piece — parent should refresh data */
  onRefresh?: () => void;
}

// ─── Leg-to-Edge Maps (for grouping strips under parent legs) ────────────────

// L-shape: Leg A (index 0) owns top + left, Leg B (index 1) owns remaining 4
const LSHAPE_LEG_EDGE_MAP: Record<number, string[]> = {
  0: ['top', 'left'],
  1: ['r_top', 'inner', 'r_btm', 'bottom'],
};

// U-shape: Left leg (index 0), Back (index 1), Right leg (index 2)
const USHAPE_LEG_EDGE_MAP: Record<number, string[]> = {
  0: ['top_left', 'outer_left', 'inner_left'],
  1: ['bottom', 'back_inner'],
  2: ['top_right', 'outer_right', 'inner_right'],
};

// ─── Derivation Logic ───────────────────────────────────────────────────────

function getSlabLabel(slabIndex: number | null | undefined): string | null {
  if (slabIndex == null) return null;
  return `Slab ${slabIndex + 1}`;
}

function findSlabForPiece(
  pieceId: number,
  placements: Placement[] | undefined
): string | null {
  if (!placements) return null;
  const p = placements.find(
    (pl) => pl.pieceId === String(pieceId) && !pl.isLaminationStrip && !pl.isSegment
  );
  return p ? getSlabLabel(p.slabIndex) : null;
}

function findSlabForSegment(
  pieceId: number,
  segmentIndex: number,
  placements: Placement[] | undefined
): string | null {
  if (!placements) return null;
  const p = placements.find(
    (pl) =>
      pl.parentPieceId === String(pieceId) &&
      pl.isSegment === true &&
      pl.segmentIndex === segmentIndex
  );
  return p ? getSlabLabel(p.slabIndex) : null;
}

function findSlabForStrip(
  pieceId: number,
  position: string,
  placements: Placement[] | undefined,
  occurrenceIndex = 0
): string | null {
  if (!placements) return null;
  // 1. Try exact match first (piece was NOT split)
  let matches = placements.filter(
    (pl) =>
      pl.parentPieceId === String(pieceId) &&
      pl.isLaminationStrip &&
      pl.stripPosition === position
  );

  // 2. Fallback: parent was split by preprocessOversizePieces — find strip
  //    placements belonging to any segment of this piece
  if (matches.length === 0) {
    matches = placements.filter(
      (pl) =>
        pl.isLaminationStrip &&
        pl.stripPosition === position &&
        pl.parentPieceId?.startsWith(`${pieceId}-seg-`)
    );
  }

  // 3. Last resort: find the first segment's slab assignment so the strip
  //    inherits a slab rather than showing "—"
  if (matches.length === 0) {
    const segmentPlacement = placements.find(
      (pl) => pl.parentPieceId === String(pieceId) && pl.isSegment === true
    );
    if (segmentPlacement) return getSlabLabel(segmentPlacement.slabIndex);
  }

  const p = matches[occurrenceIndex] ?? matches[0];
  return p ? getSlabLabel(p.slabIndex) : null;
}

function findSlabForDecomposedPart(
  pieceId: number | string,
  partIndex: number,
  placements: Placement[] | undefined
): string | null {
  if (!placements) return null;
  const targetPieceId = `${pieceId}-part-${partIndex}`;
  const placement = placements.find(pl => pl.pieceId === targetPieceId);
  if (!placement) {
    const byGroup = placements.find(
      pl => pl.groupId === String(pieceId) && pl.partIndex === partIndex
    );
    if (byGroup) return `Slab ${byGroup.slabIndex + 1}`;
    return null;
  }
  return `Slab ${placement.slabIndex + 1}`;
}

function findSlabForDecomposedPartSegment(
  legId: string,
  segmentIndex: number,
  placements: Placement[]
): string | null {
  // Try compound ID first: e.g. "183-part-0-seg-0"
  const byId = placements.find(
    pl => pl.pieceId === `${legId}-seg-${segmentIndex}`
  );
  if (byId) return `Slab ${byId.slabIndex + 1}`;

  // Fallback: match by parentPieceId + segmentIndex
  const byParent = placements.find(
    pl =>
      pl.parentPieceId === legId &&
      pl.isSegment === true &&
      pl.segmentIndex === segmentIndex
  );
  if (byParent) return `Slab ${byParent.slabIndex + 1}`;

  return null;
}

function derivePartsForPiece(
  piece: QuotePiece,
  breakdown: PiecePricingBreakdown | undefined,
  optimizerResult: OptimizerData | null,
  allPieces: QuotePiece[],
  externalRelationships?: Array<{
    parentPieceId: string;
    childPieceId: string;
    relationshipType: string;
  }>
): Part[] {
  const parts: Part[] = [];
  const placements = optimizerResult?.placements?.items;
  const laminationSummary = optimizerResult?.laminationSummary;

  const pieceName = piece.name || 'Unnamed piece';
  const thicknessMm = breakdown?.dimensions?.thicknessMm ?? piece.thickness_mm;

  // For L/U shapes, show decomposed legs instead of bounding-box oversize splits
  const pieceShapeType = piece.shape_type ?? 'RECTANGLE';
  const isLOrUShape = pieceShapeType === 'L_SHAPE' || pieceShapeType === 'U_SHAPE';
  if (isLOrUShape) {
    const rects = decomposeShapeIntoRects({
      id: String(piece.id),
      lengthMm: piece.length_mm,
      widthMm: piece.width_mm,
      shapeType: piece.shape_type,
      shapeConfig: piece.shape_config,
    });
    for (let li = 0; li < rects.length; li++) {
      const rect = rects[li];
      const legId = `${piece.id}-part-${li}`;

      // Check if this leg was further split into segments by the optimizer
      const legSegmentPlacements = placements?.filter(
        pl => pl.parentPieceId === legId && pl.isSegment === true
      ) ?? [];

      if (legSegmentPlacements.length > 1) {
        // Leg was split — emit one row per segment
        for (const seg of legSegmentPlacements) {
          parts.push({
            type: 'OVERSIZE_HALF',
            name: `${rect.label} — Segment ${(seg.segmentIndex ?? 0) + 1} of ${legSegmentPlacements.length}`,
            lengthMm: seg.width,
            widthMm: seg.height,
            thicknessMm,
            slab: findSlabForDecomposedPartSegment(legId, seg.segmentIndex ?? 0, placements ?? []),
          });
        }
      } else {
        // Leg fits on one slab — emit single row as before
        parts.push({
          type: 'MAIN',
          name: rect.label ?? `Leg ${li + 1}`,
          lengthMm: rect.width,
          widthMm: rect.height,
          thicknessMm,
          slab: findSlabForDecomposedPart(piece.id, li, placements),
        });
      }
    }
    // Skip the normal oversize/main logic below for L/U shapes
  }

  // 1. Oversize halves (if piece has a join in breakdown)
  const isOversize = breakdown?.oversize?.isOversize ?? false;
  if (!isLOrUShape && isOversize && breakdown?.oversize) {
    // For RECTANGLE oversize pieces, prefer actual optimizer segment placements
    // over the calculated length_mm / N fallback (which produces fabrication-incorrect dimensions).
    const segmentPlacements = placements?.filter(
      (pl) =>
        pl.parentPieceId === String(piece.id) &&
        pl.isSegment === true
    )?.sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0)) ?? [];

    if (segmentPlacements.length > 0) {
      // Use actual optimizer segment dimensions
      // In the optimizer: width = piece length direction, height = piece width direction
      for (let seg = 0; seg < segmentPlacements.length; seg++) {
        const sp = segmentPlacements[seg];
        parts.push({
          type: 'OVERSIZE_HALF',
          name: `Part ${seg + 1}/${segmentPlacements.length}`,
          lengthMm: sp.width,
          widthMm: sp.height,
          thicknessMm,
          slab: getSlabLabel(sp.slabIndex),
          note: seg === 0
            ? `Joined at ${sp.width}mm — join cost ${formatCurrency(breakdown.oversize.joinCost)}`
            : undefined,
        });
      }
    } else {
      // Optimizer not yet run — show unsplit piece, not fabrication fiction
      parts.push({
        type: 'MAIN',
        name: `${pieceName} — Main Piece`,
        lengthMm: piece.length_mm,
        widthMm: piece.width_mm,
        thicknessMm,
        slab: null,
        note: 'Run optimiser to calculate cut positions',
      });
    }
  } else if (!isLOrUShape) {
    // Main piece (not oversize — shown as single piece)
    parts.push({
      type: 'MAIN',
      name: `${pieceName} — Main Piece`,
      lengthMm: piece.length_mm,
      widthMm: piece.width_mm,
      thicknessMm,
      slab: findSlabForPiece(piece.id, placements),
    });
  }

  // 2. Lamination strips (40mm+ with finished edges)
  if (thicknessMm >= 40 && breakdown?.fabrication?.edges) {
    // Use optimizer data if available for precise strip dimensions
    const stripsByParent = laminationSummary?.stripsByParent?.find(
      (sp) => sp.parentPieceId === String(piece.id)
    );

    if (stripsByParent && stripsByParent.strips.length > 0) {
      // Use real optimizer strip data
      // Track occurrence index per position for oversize pieces with multiple
      // strips per position (e.g. two top strips, one per segment)
      // First pass: count total occurrences per position to detect split strips
      const positionTotals: Record<string, number> = {};
      for (const strip of stripsByParent.strips) {
        positionTotals[strip.position] = (positionTotals[strip.position] ?? 0) + 1;
      }
      const positionOccurrences: Record<string, number> = {};
      for (const strip of stripsByParent.strips) {
        const position = strip.position;
        const occurrenceIndex = positionOccurrences[position] ?? 0;
        positionOccurrences[position] = occurrenceIndex + 1;

        const hasValidPosition = position && position !== 'unknown';
        const sideLabel = hasValidPosition
          ? position.charAt(0).toUpperCase() + position.slice(1)
          : null;
        const total = positionTotals[position];
        // Show "Part N of M" suffix when a strip was split into multiple segments
        const partSuffix = total > 1
          ? ` — Part ${occurrenceIndex + 1} of ${total}`
          : '';
        const stripName = sideLabel
          ? `${sideLabel} strip${partSuffix}`
          : `${pieceName} — Strip${partSuffix}`;
        parts.push({
          type: 'LAMINATION_STRIP',
          name: stripName,
          lengthMm: strip.lengthMm,
          widthMm: strip.widthMm,
          thicknessMm: 20,
          slab: findSlabForStrip(piece.id, strip.position, placements, occurrenceIndex),
          stripPosition: strip.position,
          parentPieceId: piece.id,
        });
      }
    } else {
      // Fallback: derive strips from all edges minus wall edges
      const noStripEdges = (piece.no_strip_edges as unknown as string[]) ?? [];
      const pieceShapeTypeStr = (piece.shape_type ?? 'RECTANGLE') as ShapeType;
      const isShape = pieceShapeTypeStr === 'L_SHAPE' || pieceShapeTypeStr === 'U_SHAPE';

      if (isShape && piece.shape_config) {
        // L/U shapes: use all finishable edge lengths (6 for L, 8 for U)
        const allEdgeLengths = getFinishableEdgeLengthsMm(
          pieceShapeTypeStr,
          piece.shape_config as unknown as ShapeConfig,
          piece.length_mm,
          piece.width_mm
        );
        for (const [edgeKey, lengthMm] of Object.entries(allEdgeLengths)) {
          if (noStripEdges.includes(edgeKey)) continue;
          if (lengthMm <= 0) continue;
          const sideLabel = edgeKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          parts.push({
            type: 'LAMINATION_STRIP',
            name: `${sideLabel} strip`,
            lengthMm,
            widthMm: 60,
            thicknessMm: 20,
            slab: findSlabForStrip(piece.id, edgeKey, placements),
            stripPosition: edgeKey,
            parentPieceId: piece.id,
          });
        }
      } else {
        // Rectangle: all 4 edges minus wall edges
        const rectEdges: Record<string, number> = {
          top: piece.length_mm,
          bottom: piece.length_mm,
          left: piece.width_mm,
          right: piece.width_mm,
        };
        for (const [edgeKey, lengthMm] of Object.entries(rectEdges)) {
          if (noStripEdges.includes(edgeKey)) continue;
          const sideLabel = edgeKey.charAt(0).toUpperCase() + edgeKey.slice(1);
          const edgeTypeId = piece[`edge_${edgeKey}` as keyof QuotePiece] as string | null;
          const isMitre = edgeTypeId?.toLowerCase().includes('mitre') ?? false;
          parts.push({
            type: 'LAMINATION_STRIP',
            name: `${sideLabel} strip`,
            lengthMm,
            widthMm: isMitre ? 40 : 60,
            thicknessMm: 20,
            slab: findSlabForStrip(piece.id, edgeKey, placements),
            stripPosition: edgeKey,
            parentPieceId: piece.id,
          });
        }
      }
    }

  }

  // 3. Waterfall legs (check inline relationships or external relationships)
  const waterfallChildIds = new Set<number>();

  // Check inline relationships (view mode — pieces carry their own relationships)
  for (const other of allPieces) {
    const isWaterfall = other.targetRelationships?.some(
      (rel) =>
        rel.source_piece_id === piece.id &&
        (rel.relation_type === 'WATERFALL' || rel.relationship_type === 'WATERFALL')
    );
    if (isWaterfall) waterfallChildIds.add(other.id);
  }

  // Check external relationships (edit mode — relationships stored separately)
  if (externalRelationships) {
    for (const rel of externalRelationships) {
      if (
        rel.parentPieceId === String(piece.id) &&
        rel.relationshipType === 'WATERFALL'
      ) {
        const childId = Number(rel.childPieceId);
        if (!isNaN(childId)) waterfallChildIds.add(childId);
      }
    }
  }

  for (const childId of Array.from(waterfallChildIds)) {
    const child = allPieces.find((p) => p.id === childId);
    if (!child) continue;
    parts.push({
      type: 'WATERFALL',
      name: `Waterfall — ${child.name || 'Unnamed piece'}`,
      lengthMm: child.length_mm,
      widthMm: child.width_mm,
      thicknessMm: child.thickness_mm,
      slab: findSlabForPiece(child.id, placements),
      note: 'Linked waterfall piece',
    });
  }

  // 4. Cutouts — intentionally excluded from Parts List.
  //    Cutouts are not physical stone parts, do not occupy slab space,
  //    and already appear in the Cutouts section of the quote.

  // Reorder parts so strips appear grouped under their parent leg (L/U shapes only)
  if (isLOrUShape) {
    const edgeMap = pieceShapeType === 'L_SHAPE' ? LSHAPE_LEG_EDGE_MAP : USHAPE_LEG_EDGE_MAP;
    const legs = parts.filter(p => p.type === 'MAIN');
    const strips = parts.filter(p => p.type === 'LAMINATION_STRIP');
    const others = parts.filter(p => p.type !== 'MAIN' && p.type !== 'LAMINATION_STRIP');

    const reordered: Part[] = [];
    const usedStrips = new Set<number>();

    for (let legIdx = 0; legIdx < legs.length; legIdx++) {
      reordered.push(legs[legIdx]);
      const legEdges = edgeMap[legIdx] ?? [];
      for (let si = 0; si < strips.length; si++) {
        if (usedStrips.has(si)) continue;
        if (strips[si].stripPosition && legEdges.includes(strips[si].stripPosition!)) {
          reordered.push(strips[si]);
          usedStrips.add(si);
        }
      }
    }

    // Add any unmatched strips (shouldn't happen, but safe fallback)
    for (let si = 0; si < strips.length; si++) {
      if (!usedStrips.has(si)) reordered.push(strips[si]);
    }

    reordered.push(...others);
    return reordered;
  }

  return parts;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STRIP_WIDTH_DEFAULT = 60; // mm — standard/waterfall
const STRIP_WIDTH_MITRE = 40;   // mm — mitre edges

function getDefaultStripWidth(stripPosition: string): number {
  const pos = stripPosition.toLowerCase();
  if (pos.includes('mitre')) return STRIP_WIDTH_MITRE;
  return STRIP_WIDTH_DEFAULT;
}

// ─── Strip Width Pill ───────────────────────────────────────────────────────

function StripWidthPill({
  stripPosition,
  overrides,
  onSave,
  onReset,
}: {
  parentPieceId: number;
  stripPosition: string;
  currentWidthMm: number;
  overrides: Record<string, number> | null | undefined;
  onSave: (newWidthMm: number) => void;
  onReset: () => void;
}) {
  const defaultWidth = getDefaultStripWidth(stripPosition);
  const overrideValue = overrides?.[stripPosition];
  const displayWidth = overrideValue ?? defaultWidth;
  const isOverridden = overrideValue != null && overrideValue !== defaultWidth;

  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(displayWidth));

  // Sync when overrides change externally
  useEffect(() => {
    setInputValue(String(overrideValue ?? defaultWidth));
  }, [overrideValue, defaultWidth]);

  const handleSave = () => {
    setEditing(false);
    const parsed = parseInt(inputValue);
    if (isNaN(parsed) || parsed <= 0) {
      setInputValue(String(displayWidth));
      return;
    }
    if (parsed !== displayWidth) {
      onSave(parsed);
    }
  };

  if (editing) {
    return (
      <input
        type="number"
        min="1"
        autoFocus
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') { setEditing(false); setInputValue(String(displayWidth)); }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-14 px-1 py-0.5 text-[10px] border border-blue-400 rounded text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
          isOverridden
            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
        title={`Strip width: ${displayWidth}mm (click to edit)`}
      >
        w{displayWidth}
      </button>
      {isOverridden && (
        <button
          onClick={(e) => { e.stopPropagation(); onReset(); }}
          className="text-amber-500 hover:text-amber-700 text-[10px] leading-none"
          title="Reset to default"
        >
          ↺
        </button>
      )}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PartsSection({
  quoteId,
  rooms,
  calcBreakdown,
  optimiserRefreshKey = 0,
  externalRelationships,
  onStripWidthChange,
  onRefresh,
}: PartsSectionProps) {
  const [expandedRooms, setExpandedRooms] = useState<Set<number>>(new Set());
  const [optimizerResult, setOptimizerResult] = useState<OptimizerData | null>(null);
  const [promotionThresholdMm, setPromotionThresholdMm] = useState(300);
  const [promotingStripKey, setPromotingStripKey] = useState<string | null>(null);

  // Fetch optimizer data (Rule 23: data fetch at component level, not inside conditional UI)
  useEffect(() => {
    let cancelled = false;
    async function fetchOptimizer() {
      try {
        const res = await fetch(`/api/quotes/${quoteId}/optimize`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data?.placements) {
            setOptimizerResult(data as unknown as OptimizerData);
          }
        }
      } catch {
        // Silently fail — optimizer data is optional
      }
    }
    fetchOptimizer();
    return () => { cancelled = true; };
  }, [quoteId, optimiserRefreshKey]);

  // Fetch strip-to-piece promotion threshold from pricing settings
  useEffect(() => {
    let cancelled = false;
    async function fetchThreshold() {
      try {
        const res = await fetch('/api/admin/pricing/settings');
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data?.stripToPieceThresholdMm != null) {
            setPromotionThresholdMm(data.stripToPieceThresholdMm);
          }
        }
      } catch {
        // Keep default 300mm
      }
    }
    fetchThreshold();
    return () => { cancelled = true; };
  }, []);

  const hasOptimizer = !!(
    optimizerResult?.placements?.items && optimizerResult.placements.items.length > 0
  );

  // Build breakdown map for quick lookup
  const breakdownMap = useMemo(() => {
    const map = new Map<number, PiecePricingBreakdown>();
    if (calcBreakdown?.pieces) {
      for (const pb of calcBreakdown.pieces) {
        map.set(pb.pieceId, pb);
      }
    }
    return map;
  }, [calcBreakdown]);

  // Build a set of already-promoted edges per piece ID — hide "Promote to Piece" for these
  const promotedEdgesMap = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const room of rooms) {
      for (const p of room.quote_pieces) {
        if (p.promoted_from_piece_id && p.promoted_edge_position) {
          const existing = map.get(p.promoted_from_piece_id) ?? new Set<string>();
          existing.add(p.promoted_edge_position);
          map.set(p.promoted_from_piece_id, existing);
        }
      }
    }
    return map;
  }, [rooms]);

  // Build parts per room
  const roomPartsData = useMemo(() => {
    const allPieces = rooms.flatMap((r) => r.quote_pieces);

    return rooms.map((room) => {
      const parts: Array<{ piece: QuotePiece; parts: Part[] }> = [];
      for (const piece of room.quote_pieces) {
        const bd = breakdownMap.get(piece.id);
        const pieceParts = derivePartsForPiece(piece, bd, optimizerResult, allPieces, externalRelationships);
        parts.push({ piece, parts: pieceParts });
      }
      const totalParts = parts.reduce((sum, p) => sum + p.parts.length, 0);
      return { room, parts, totalParts };
    });
  }, [rooms, breakdownMap, optimizerResult, externalRelationships]);

  const totalPartsCount = roomPartsData.reduce((sum, r) => sum + r.totalParts, 0);

  if (totalPartsCount === 0) return null;

  const toggleRoom = (roomId: number) => {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  };

  // ── Strip width overrides cache ─────────────────────────────────────────
  // Tracks per-piece overrides locally so pills render correctly before re-fetch
  const [pieceOverrides, setPieceOverrides] = useState<Record<number, Record<string, number> | null>>({});

  // Fetch current strip width overrides for all pieces on mount / refresh
  useEffect(() => {
    let cancelled = false;
    async function fetchOverrides() {
      try {
        const res = await fetch(`/api/quotes/${quoteId}/pieces`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          const map: Record<number, Record<string, number> | null> = {};
          for (const p of data) {
            map[p.id] = p.stripWidthOverrides ?? null;
          }
          setPieceOverrides(map);
        }
      } catch { /* non-critical */ }
    }
    fetchOverrides();
    return () => { cancelled = true; };
  }, [quoteId, optimiserRefreshKey]);

  const patchStripWidth = useCallback(async (
    parentPieceId: number,
    stripPosition: string,
    newWidthMm: number | null, // null = reset
  ) => {
    const existing = pieceOverrides[parentPieceId] ?? {};
    let updated: Record<string, number> | null;
    if (newWidthMm === null) {
      const { [stripPosition]: _, ...rest } = existing;
      updated = Object.keys(rest).length ? rest : null;
    } else {
      updated = { ...existing, [stripPosition]: newWidthMm };
    }
    // Optimistic update
    setPieceOverrides(prev => ({ ...prev, [parentPieceId]: updated }));

    try {
      const res = await fetch(`/api/quotes/${quoteId}/pieces/${parentPieceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripWidthOverrides: updated }),
      });
      if (!res.ok) throw new Error('PATCH failed');
      onStripWidthChange?.();
    } catch {
      // Revert on failure
      setPieceOverrides(prev => ({ ...prev, [parentPieceId]: existing }));
    }
  }, [quoteId, pieceOverrides, onStripWidthChange]);

  // ── Strip-to-piece promotion handler ──────────────────────────────────────
  async function handlePromoteStrip(part: Part, parentPiece: QuotePiece, stripKey: string) {
    if (promotingStripKey !== stripKey) {
      // First click — show confirm state
      setPromotingStripKey(stripKey);
      return;
    }
    // Second click — confirmed, proceed
    setPromotingStripKey(null);
    try {
      const roomName = rooms.find(r => r.quote_pieces.some(p => p.id === parentPiece.id))?.name ?? 'Kitchen';
      const res = await fetch(`/api/quotes/${quoteId}/pieces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${parentPiece.name} — Strip (promoted)`,
          lengthMm: part.lengthMm,
          widthMm: part.widthMm,
          thicknessMm: parentPiece.thickness_mm,
          materialId: parentPiece.material_id,
          roomName,
          shapeType: 'RECTANGLE',
          description: `Promoted from lamination strip (parent: ${parentPiece.name}, edge: ${part.stripPosition ?? 'unknown'})`,
          promotedFromPieceId: parentPiece.id,
          promotedEdgePosition: part.stripPosition ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onRefresh?.();
    } catch (err) {
      console.error('Promote strip failed:', err);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Parts List</h2>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {totalPartsCount} part{totalPartsCount !== 1 ? 's' : ''}
          </span>
        </div>
        {!hasOptimizer && (
          <span className="text-xs text-amber-600 italic">
            Run slab optimiser to see slab assignments
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {roomPartsData.map(({ room, parts: pieceParts, totalParts }) => {
          if (totalParts === 0) return null;
          const isExpanded = expandedRooms.has(room.id);

          return (
            <div key={room.id}>
              {/* Room header — collapsible */}
              <button
                onClick={() => toggleRoom(room.id)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span className="text-sm font-semibold text-gray-700">
                    {room.name}
                  </span>
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                    {totalParts} part{totalParts !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>

              {/* Parts table */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  <table className="w-full text-sm mt-2">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                        <th className="text-left py-2 pr-3 font-medium">Part</th>
                        <th className="text-left py-2 pr-3 font-medium">Dimensions</th>
                        <th className="text-left py-2 pr-3 font-medium">Slab</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pieceParts.map(({ piece, parts: derivedParts }, pieceIdx) => (
                        derivedParts.map((part, partIdx) => {
                          const isEvenPiece = pieceIdx % 2 === 0;
                          const rowBg = isEvenPiece ? 'bg-white' : 'bg-gray-50/50';
                          const isFirstPartOfPiece = partIdx === 0;

                          return (
                            <tr
                              key={`${piece.id}-${partIdx}`}
                              className={`${rowBg} border-b border-gray-100 last:border-b-0${part.type === 'LAMINATION_STRIP' ? ' pl-6' : ''}`}
                            >
                              <td className="py-2 pr-3">
                                <div className="flex flex-col">
                                  {isFirstPartOfPiece && (
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">
                                      {piece.name || 'Unnamed piece'}
                                      {piece.promoted_from_piece_id && (
                                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 text-[9px] font-semibold uppercase tracking-wide">
                                          Promoted strip
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  <span
                                    className={
                                      part.isCutout
                                        ? 'text-gray-400 italic text-xs'
                                        : part.type === 'LAMINATION_STRIP'
                                          ? 'text-slate-400 text-sm'
                                          : part.type === 'OVERSIZE_HALF'
                                            ? 'text-gray-700 text-xs font-medium'
                                            : 'text-gray-800 font-medium text-xs'
                                    }
                                  >
                                    {part.type === 'LAMINATION_STRIP'
                                      ? `↳ ${part.name}`
                                      : part.name}
                                  </span>
                                  {part.note && (
                                    <span className="text-[10px] text-gray-400 mt-0.5">
                                      {part.note}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap">
                                {part.isCutout
                                  ? '—'
                                  : part.type === 'LAMINATION_STRIP'
                                    ? (
                                      <span className="inline-flex items-center gap-1.5">
                                        <span>{Math.max(part.lengthMm, part.widthMm)}mm × {Math.min(part.lengthMm, part.widthMm)}mm × {part.thicknessMm}mm</span>
                                        {part.parentPieceId != null && part.stripPosition && (
                                          <StripWidthPill
                                            parentPieceId={part.parentPieceId}
                                            stripPosition={part.stripPosition}
                                            currentWidthMm={Math.min(part.lengthMm, part.widthMm)}
                                            overrides={pieceOverrides[part.parentPieceId]}
                                            onSave={(val) => patchStripWidth(part.parentPieceId!, part.stripPosition!, val)}
                                            onReset={() => patchStripWidth(part.parentPieceId!, part.stripPosition!, null)}
                                          />
                                        )}
                                        {(() => {
                                          const stripWidth = Math.min(part.lengthMm, part.widthMm);
                                          const stripKey = `${piece.id}-${partIdx}`;
                                          if (promotingStripKey === stripKey) {
                                            return (
                                              <span className="inline-flex items-center gap-1">
                                                <span className="text-xs text-amber-700">Promote?</span>
                                                <button
                                                  onClick={() => handlePromoteStrip(part, piece, stripKey)}
                                                  className="text-xs px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600"
                                                >
                                                  Yes
                                                </button>
                                                <button
                                                  onClick={() => setPromotingStripKey(null)}
                                                  className="text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50"
                                                >
                                                  No
                                                </button>
                                              </span>
                                            );
                                          }
                                          const alreadyPromoted = part.stripPosition && promotedEdgesMap.get(piece.id)?.has(part.stripPosition);
                                          if (alreadyPromoted) {
                                            return (
                                              <span className="text-[10px] text-violet-500 italic">
                                                Already promoted
                                              </span>
                                            );
                                          }
                                          if (stripWidth >= promotionThresholdMm) {
                                            return (
                                              <button
                                                onClick={() => setPromotingStripKey(stripKey)}
                                                className="text-xs px-2 py-0.5 rounded border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                                                title={`Strip is ${stripWidth}mm — wider than ${promotionThresholdMm}mm threshold. Promote to piece for cutting charges.`}
                                              >
                                                Promote to Piece
                                              </button>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </span>
                                    )
                                    : `${part.lengthMm}mm × ${part.widthMm}mm × ${part.thicknessMm}mm`}
                              </td>
                              <td className="py-2 pr-3 text-xs text-gray-600">
                                {part.slab ?? '—'}
                              </td>
                            </tr>
                          );
                        })
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* WF-2c: Apron Strips — MITRED pieces with 40mm thickness */}
      {(() => {
        const allPieces = rooms.flatMap((r) => r.quote_pieces);
        const apronStrips = allPieces.filter((p) => {
          // Check lamination_method if available, or fall back to pricing breakdown
          if (p.lamination_method === 'MITRED' && String(p.thickness_mm).includes('40')) return true;
          const bd = breakdownMap.get(p.id);
          if (bd?.fabrication?.lamination?.method === 'MITRED' && String(p.thickness_mm).includes('40')) return true;
          return false;
        });
        if (apronStrips.length === 0) return null;
        return (
          <div className="border-t border-gray-200 p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Apron Strips</h4>
            {apronStrips.map((piece) => {
              // Resolve edge names from pricing breakdown (edges[] contains edgeTypeName)
              const bd = breakdownMap.get(piece.id);
              const edgeNames = bd?.fabrication?.edges
                ?.map((e) => e.edgeTypeName)
                .filter((n) => n && !n.startsWith('Edge ')) ?? [];
              const edgeLabel = Array.from(new Set(edgeNames)).join(', ') || 'Mitre';

              // Derive per-edge strip dimensions: length = edge length, width = 40mm (mitre strip)
              const noStripEdges = (piece.no_strip_edges as unknown as string[]) ?? [];
              const stripDims: Array<{ label: string; lengthMm: number }> = [];
              const edgeMap: Record<string, number> = {
                top: piece.length_mm,
                bottom: piece.length_mm,
                left: piece.width_mm,
                right: piece.width_mm,
              };
              for (const [edgeKey, lengthMm] of Object.entries(edgeMap)) {
                if (noStripEdges.includes(edgeKey)) continue;
                const edgeId = piece[`edge_${edgeKey}` as keyof QuotePiece] as string | null;
                if (!edgeId) continue;
                const sideLabel = edgeKey.charAt(0).toUpperCase() + edgeKey.slice(1);
                stripDims.push({ label: sideLabel, lengthMm });
              }

              return stripDims.length > 0 ? (
                stripDims.map((strip, idx) => (
                  <div key={`${piece.id}-apron-${idx}`} className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span>{piece.name ?? 'Unnamed'} — {strip.label} strip — {strip.lengthMm} × 40mm</span>
                    <span className="text-gray-500">{edgeLabel}</span>
                  </div>
                ))
              ) : (
                <div key={piece.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                  <span>{piece.name ?? 'Unnamed'} — {piece.length_mm} × 40mm</span>
                  <span className="text-gray-500">{edgeLabel}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* WF-2c: Splashback Strips — SPLASHBACK pieces with width ≤ 300mm */}
      {(() => {
        const allPieces = rooms.flatMap((r) => r.quote_pieces);
        const splashbackStrips = allPieces.filter((p) =>
          p.piece_type === 'SPLASHBACK' && p.width_mm != null && p.width_mm <= 300
        );
        if (splashbackStrips.length === 0) return null;
        return (
          <div className="border-t border-gray-200 p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Splashback Strips</h4>
            {splashbackStrips.map((strip) => (
              <div key={strip.id} className="text-sm py-1 border-b border-gray-50">
                <div className="flex justify-between">
                  <span>{strip.name ?? 'Unnamed'} — {strip.length_mm} × {strip.width_mm}mm</span>
                </div>
                {strip.cutouts != null && strip.cutouts.length > 0 && (
                  <div className="text-xs text-gray-500 ml-2">
                    Cutouts: {strip.cutouts.map((c) => c.cutout_type ?? 'Unknown').join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
