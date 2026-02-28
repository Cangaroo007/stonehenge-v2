'use client';

import { useState, useMemo, useEffect } from 'react';
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
  no_strip_edges?: unknown;
  edge_top: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  edge_right: string | null;
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
  cost: number | null;
  note?: string;
  isCutout?: boolean;
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
}

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
      pl.pieceId === String(pieceId) &&
      pl.isSegment &&
      pl.segmentIndex === segmentIndex
  );
  return p ? getSlabLabel(p.slabIndex) : null;
}

function findSlabForStrip(
  pieceId: number,
  position: string,
  placements: Placement[] | undefined
): string | null {
  if (!placements) return null;
  const p = placements.find(
    (pl) =>
      pl.parentPieceId === String(pieceId) &&
      pl.isLaminationStrip &&
      pl.stripPosition === position
  );
  return p ? getSlabLabel(p.slabIndex) : null;
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

  // Calculate non-main-piece costs for deduction from pieceTotal
  let laminationCost = 0;
  if (breakdown?.fabrication?.lamination) {
    laminationCost = breakdown.fabrication.lamination.total ?? 0;
  }

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
    const materialCost = breakdown?.materials?.total ?? 0;
    const installationCost = breakdown?.fabrication?.installation?.total ?? 0;
    const fabricationCost = (breakdown?.pieceTotal ?? 0) - materialCost - installationCost;
    const legCost = rects.length > 0 ? fabricationCost / rects.length : 0;
    for (let li = 0; li < rects.length; li++) {
      const rect = rects[li];
      parts.push({
        type: 'MAIN',
        name: rect.label ?? `Leg ${li + 1}`,
        lengthMm: rect.width,
        widthMm: rect.height,
        thicknessMm,
        slab: findSlabForSegment(piece.id, li, placements),
        cost: legCost,
      });
    }
    // Skip the normal oversize/main logic below for L/U shapes
  }

  // 1. Oversize halves (if piece has a join in breakdown)
  const isOversize = breakdown?.oversize?.isOversize ?? false;
  if (!isLOrUShape && isOversize && breakdown?.oversize) {
    const strategy = breakdown.oversize.strategy || 'LENGTHWISE';
    const joinCount = breakdown.oversize.joinCount || 1;
    const numberOfSegments = joinCount + 1;

    // Derive proportional fabrication cost per segment
    // Exclude material and installation (shown at piece level, not per-half)
    const materialCost = breakdown.materials?.total ?? 0;
    const installationCost = breakdown.fabrication?.installation?.total ?? 0;
    const fabricationCost = breakdown.pieceTotal - materialCost - installationCost;
    const segmentCost = fabricationCost / numberOfSegments;

    if (strategy === 'LENGTHWISE' || strategy === 'MULTI_JOIN') {
      const halfLength = Math.ceil(piece.length_mm / (joinCount + 1));
      for (let seg = 0; seg <= joinCount; seg++) {
        const segLength = seg < joinCount
          ? halfLength
          : piece.length_mm - halfLength * joinCount;
        parts.push({
          type: 'OVERSIZE_HALF',
          name: `Part ${seg + 1}`,
          lengthMm: segLength,
          widthMm: piece.width_mm,
          thicknessMm,
          slab: findSlabForSegment(piece.id, seg, placements),
          cost: segmentCost,
          note: `Joined at ${Math.round(breakdown.oversize.joinLengthLm * 1000)}mm`,
        });
      }
    } else {
      // WIDTHWISE
      const halfWidth = Math.ceil(piece.width_mm / (joinCount + 1));
      for (let seg = 0; seg <= joinCount; seg++) {
        const segWidth = seg < joinCount
          ? halfWidth
          : piece.width_mm - halfWidth * joinCount;
        parts.push({
          type: 'OVERSIZE_HALF',
          name: `Part ${seg + 1}`,
          lengthMm: piece.length_mm,
          widthMm: segWidth,
          thicknessMm,
          slab: findSlabForSegment(piece.id, seg, placements),
          cost: segmentCost,
          note: `Joined at ${Math.round(breakdown.oversize.joinLengthLm * 1000)}mm`,
        });
      }
    }

    // Add join cost as a note on the first half
    if (parts.length > 0 && breakdown.oversize.joinCost > 0) {
      parts[0].note = `${parts[0].note} — join cost ${formatCurrency(breakdown.oversize.joinCost)}`;
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
      cost: breakdown ? breakdown.pieceTotal - laminationCost : null,
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
      for (const strip of stripsByParent.strips) {
        const position = strip.position;
        const hasValidPosition = position && position !== 'unknown';
        const sideLabel = hasValidPosition
          ? position.charAt(0).toUpperCase() + position.slice(1)
          : null;
        const stripName = sideLabel
          ? `${sideLabel} lamination strip`
          : `${pieceName} — Lamination Strip`;
        parts.push({
          type: 'LAMINATION_STRIP',
          name: stripName,
          lengthMm: strip.lengthMm,
          widthMm: strip.widthMm,
          thicknessMm: 20,
          slab: findSlabForStrip(piece.id, strip.position, placements),
          cost: null,
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
            name: `${sideLabel} lamination strip`,
            lengthMm,
            widthMm: 60,
            thicknessMm: 20,
            slab: findSlabForStrip(piece.id, edgeKey, placements),
            cost: null,
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
            name: `${sideLabel} lamination strip`,
            lengthMm,
            widthMm: isMitre ? 40 : 60,
            thicknessMm: 20,
            slab: findSlabForStrip(piece.id, edgeKey, placements),
            cost: null,
          });
        }
      }
    }

    // Add lamination cost note to main piece if present
    if (laminationCost > 0 && parts.length > 0) {
      const mainPart = parts.find((p) => p.type === 'MAIN' || p.type === 'OVERSIZE_HALF');
      if (mainPart && !mainPart.note) {
        mainPart.note = `Lamination: ${formatCurrency(laminationCost)}`;
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
      cost: null,
      note: 'Linked waterfall piece',
    });
  }

  // 4. Cutouts (shown as deductions)
  if (breakdown?.fabrication?.cutouts) {
    for (const cutout of breakdown.fabrication.cutouts) {
      if (cutout.quantity > 0) {
        parts.push({
          type: 'CUTOUT',
          name: `— ${cutout.cutoutTypeName || 'Cutout'}`,
          lengthMm: 0,
          widthMm: 0,
          thicknessMm: 0,
          slab: null,
          cost: null,
          isCutout: true,
          note: cutout.quantity > 1 ? `×${cutout.quantity}` : undefined,
        });
      }
    }
  }

  return parts;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PartsSection({
  quoteId,
  rooms,
  calcBreakdown,
  optimiserRefreshKey = 0,
  externalRelationships,
}: PartsSectionProps) {
  const [expandedRooms, setExpandedRooms] = useState<Set<number>>(new Set());
  const [optimizerResult, setOptimizerResult] = useState<OptimizerData | null>(null);

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
                        <th className="text-right py-2 font-medium">Cost</th>
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
                              className={`${rowBg} border-b border-gray-100 last:border-b-0`}
                            >
                              <td className="py-2 pr-3">
                                <div className="flex flex-col">
                                  {isFirstPartOfPiece && (
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">
                                      {piece.name || 'Unnamed piece'}
                                    </span>
                                  )}
                                  <span
                                    className={
                                      part.isCutout
                                        ? 'text-gray-400 italic text-xs'
                                        : part.type === 'LAMINATION_STRIP'
                                          ? 'text-gray-600 text-xs'
                                          : part.type === 'OVERSIZE_HALF'
                                            ? 'text-gray-700 text-xs font-medium'
                                            : 'text-gray-800 font-medium text-xs'
                                    }
                                  >
                                    {part.name}
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
                                  : `${part.lengthMm}mm × ${part.widthMm}mm × ${part.thicknessMm}mm`}
                              </td>
                              <td className="py-2 pr-3 text-xs text-gray-600">
                                {part.slab ?? '—'}
                              </td>
                              <td className="py-2 text-xs text-right text-gray-600">
                                {part.cost != null ? formatCurrency(part.cost) : '—'}
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
    </div>
  );
}
