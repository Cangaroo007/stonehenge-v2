import {
  OptimizationInput,
  OptimizationResult,
  Placement,
  SlabResult,
  LaminationSummary
} from '@/types/slab-optimization';
import { STRIP_CONFIGURATIONS } from '@/lib/constants/slab-sizes';
import { logger } from '@/lib/logger';
import { decomposeShapeIntoRects, getShapeEdgeLengths, getFinishableEdgeLengthsMm, type OptimizerRect, type ShapeType, type ShapeConfig, type LShapeConfig, type UShapeConfig } from '@/lib/types/shapes';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Slab {
  width: number;
  height: number;
  placements: Placement[];
  freeRects: Rect[];
}

// Lamination strip constants — sourced from STRIP_CONFIGURATIONS (Northcoast Stone)
// These represent the strip width that must be cut from the slab (visible portion only).
// Kerf is added separately during placement by the optimizer.
const LAMINATION_STRIP_WIDTH_DEFAULT = STRIP_CONFIGURATIONS.STANDARD.visibleWidthMm; // 60mm
const LAMINATION_STRIP_WIDTH_MITRE = STRIP_CONFIGURATIONS.STANDARD.laminationWidthMm; // 40mm
const LAMINATION_THRESHOLD = 40; // mm - pieces >= 40mm need lamination

// Internal type for pieces during optimization (includes lamination and segment data)
type OptimizationPiece = OptimizationInput['pieces'][0] & {
  isLaminationStrip?: boolean;
  parentPieceId?: string;
  stripPosition?: string;
  isSegment?: boolean;
  segmentIndex?: number;
  totalSegments?: number;
  /** Per-piece kerf override — mitre strips use the MITRING machine's kerf */
  pieceKerfWidth?: number;
  /** Shape decomposition group — rects with same groupId must share a slab */
  groupId?: string;
  /** Part index within the decomposed group (0-based) */
  partIndex?: number;
  /** Human-readable part label, e.g. "Leg A" */
  partLabel?: string;
  /** Total parts in the decomposed group */
  totalParts?: number;
};

/**
 * Determine the strip width for an edge based on the edge type name.
 * Mitre strips: ~40mm (kerf added by optimizer during placement).
 * Waterfall & standard polish strips: ~60mm (kerf added by optimizer during placement).
 * Strip widths should come from strip_configurations table; these are defaults if not found.
 */
function getStripWidthForEdge(edgeTypeName?: string, _thickness?: number, _kerfWidth?: number): number {
  if (!edgeTypeName) return LAMINATION_STRIP_WIDTH_DEFAULT;
  const lower = edgeTypeName.toLowerCase();
  if (lower.includes('mitre')) {
    return LAMINATION_STRIP_WIDTH_MITRE;
  }
  // Waterfall and standard polish edges use the default laminated width
  return LAMINATION_STRIP_WIDTH_DEFAULT;
}

/**
 * Generates lamination strips for a 40mm+ piece.
 * Strips are needed under each finished edge to create the thickness appearance.
 * Mitre strip width: ~40mm (kerf added separately by optimizer via pieceKerfWidth).
 * Standard/waterfall strip width: ~60mm (kerf added separately by optimizer).
 *
 * @param piece - The piece to generate strips for
 * @param kerfWidth - Default kerf (INITIAL_CUT)
 * @param mitreKerfWidth - Kerf for MITRING machine (falls back to kerfWidth)
 */
function generateLaminationStrips(
  piece: OptimizationPiece,
  kerfWidth?: number,
  mitreKerfWidth?: number
): OptimizationPiece[] {
  // Only generate strips for 40mm+ pieces
  if (!piece.thickness || piece.thickness < LAMINATION_THRESHOLD) {
    return [];
  }

  const strips: OptimizationPiece[] = [];
  const edgeNames = piece.edgeTypeNames;
  const noStripEdges = piece.noStripEdges ?? [];

  // Helper: determine if an edge is a mitre edge
  const isMitreEdge = (name?: string): boolean => {
    if (!name) return false;
    return name.toLowerCase().includes('mitre');
  };

  // Rectangle pieces: generate strips for all 4 edges minus no_strip_edges (wall edges)
  const rectEdgeLengths: Record<string, { lengthMm: number; isWidth: boolean }> = {
    top:    { lengthMm: piece.width, isWidth: true },
    bottom: { lengthMm: piece.width, isWidth: true },
    left:   { lengthMm: piece.height, isWidth: false },
    right:  { lengthMm: piece.height, isWidth: false },
  };

  for (const [edgeKey, { lengthMm, isWidth }] of Object.entries(rectEdgeLengths)) {
    // Skip wall edges
    if (noStripEdges.includes(edgeKey)) continue;

    const edgeName = edgeNames?.[edgeKey as keyof typeof edgeNames];
    const isMitre = isMitreEdge(edgeName);
    const stripW = getStripWidthForEdge(edgeName, piece.thickness, kerfWidth);

    strips.push({
      id: `${piece.id}-lam-${edgeKey}`,
      width: isWidth ? lengthMm : stripW,
      height: isWidth ? stripW : lengthMm,
      thickness: 20,
      label: `${piece.label} (Lam-${edgeKey.charAt(0).toUpperCase() + edgeKey.slice(1)}${edgeName ? ` ${edgeName}` : ''})`,
      isLaminationStrip: true,
      parentPieceId: piece.id,
      stripPosition: edgeKey,
      pieceKerfWidth: isMitre ? (mitreKerfWidth ?? kerfWidth) : undefined,
    });
  }

  return strips;
}

/**
 * Generates lamination strips for an L/U shaped piece using actual outer edge lengths.
 * Called BEFORE decomposition so the parent piece still has its shape data.
 * Uses getFinishableEdgeLengthsMm() to get all finishable edge dimensions.
 *
 * Generates one strip per finishable edge NOT marked as a wall edge (noStripEdges).
 * All edges get strips by default — wall edges are explicitly excluded.
 */
function generateShapeStrips(
  piece: OptimizationPiece,
  _edgeLengths: { top_mm: number; bottom_mm: number; left_mm: number; right_mm: number },
  _kerfWidth?: number,
  _mitreKerfWidth?: number
): OptimizationPiece[] {
  const sType = piece.shapeType as ShapeType | undefined;
  const sCfg = piece.shapeConfig as ShapeConfig;
  if (!sType || !sCfg) return [];

  const noStripEdges = piece.noStripEdges ?? [];
  const stripWidthMm = LAMINATION_STRIP_WIDTH_DEFAULT;

  // Get ALL finishable edge lengths for this shape (6 for L, 8 for U)
  const allEdgeLengths = getFinishableEdgeLengthsMm(
    sType,
    sCfg,
    piece.width,   // optimizer width = piece length_mm
    piece.height    // optimizer height = piece width_mm
  );

  const strips: OptimizationPiece[] = [];

  // Generate one strip per edge NOT marked as wall
  for (const [edgeKey, lengthMm] of Object.entries(allEdgeLengths)) {
    if (noStripEdges.includes(edgeKey)) continue;
    if (lengthMm <= 0) continue;

    // Determine strip orientation: horizontal edges have width=length, height=stripWidth
    // Vertical edges have width=stripWidth, height=length
    const isHorizontal = ['top', 'bottom', 'inner', 'back_inner', 'top_left', 'top_right'].includes(edgeKey);

    strips.push({
      id: `${piece.id}-lam-${edgeKey}`,
      width: isHorizontal ? lengthMm : stripWidthMm,
      height: isHorizontal ? stripWidthMm : lengthMm,
      thickness: 20,
      label: `${piece.label} (Lam-${edgeKey.replace(/_/g, ' ')})`,
      isLaminationStrip: true,
      parentPieceId: piece.id,
      stripPosition: edgeKey,
    });
  }

  return strips;
}

/**
 * Generates lamination summary for reporting
 */
function generateLaminationSummary(
  originalPieces: OptimizationPiece[],
  allPieces: OptimizationPiece[]
): LaminationSummary | undefined {
  const strips = allPieces.filter((p): p is OptimizationPiece & { isLaminationStrip: true } => 
    p.isLaminationStrip === true
  );
  
  if (strips.length === 0) {
    return undefined;
  }
  
  const stripsByParent: LaminationSummary['stripsByParent'] = [];
  
  // Group strips by parent piece
  const parentIds = Array.from(new Set(strips.map(s => s.parentPieceId).filter(Boolean)));
  
  const isHorizontalEdge = (position: string) =>
    ['top', 'bottom', 'inner', 'back_inner', 'top_left', 'top_right'].includes(position);

  for (const parentId of parentIds) {
    let parent = originalPieces.find(p => p.id === parentId);
    // Fallback: if parent not in originalPieces (e.g. oversize segment),
    // find it in allPieces and trace up parentPieceId to the original piece.
    if (!parent && parentId) {
      const intermediate = allPieces.find(p => p.id === parentId);
      if (intermediate?.parentPieceId) {
        parent = originalPieces.find(p => p.id === intermediate.parentPieceId);
      }
      if (!parent && intermediate) {
        parent = intermediate;
      }
    }
    const parentStrips = strips.filter(s => s.parentPieceId === parentId);

    stripsByParent.push({
      parentPieceId: parentId || '',
      parentLabel: parent?.label || 'Unknown',
      strips: parentStrips.map(s => ({
        position: s.stripPosition || 'unknown',
        lengthMm: isHorizontalEdge(s.stripPosition || '') ? s.width : s.height,
        widthMm: isHorizontalEdge(s.stripPosition || '') ? s.height : s.width,
      }))
    });
  }
  
  const totalStripArea = strips.reduce((sum, s) => {
    return sum + (s.width * s.height) / 1_000_000; // Convert to m²
  }, 0);
  
  return {
    totalStrips: strips.length,
    totalStripArea,
    stripsByParent
  };
}

/**
 * Pre-process oversize pieces by splitting them into segments that fit on a slab.
 * Uses the same splitting logic as multi-slab-calculator but operates within the
 * optimizer's coordinate system (width/height with explicit slab dimensions).
 *
 * Pieces that already fit are passed through unchanged.
 * Oversize pieces are split into segments labelled "(Part 1/N)", "(Part 2/N)", etc.
 */
function preprocessOversizePieces(
  pieces: OptimizationPiece[],
  slabWidth: number,
  slabHeight: number,
  kerfWidth: number,
  allowRotation: boolean
): { processed: OptimizationPiece[]; warnings: string[] } {
  const processed: OptimizationPiece[] = [];
  const warnings: string[] = [];

  for (const piece of pieces) {
    const pw = piece.width + kerfWidth;
    const ph = piece.height + kerfWidth;

    const fitsNormal = pw <= slabWidth && ph <= slabHeight;
    const fitsRotated = allowRotation &&
                        (piece.canRotate !== false) &&
                        ph <= slabWidth && pw <= slabHeight;

    if (fitsNormal || fitsRotated) {
      processed.push(piece);
      continue;
    }

    // Skip lamination strips that are somehow oversize (shouldn't happen)
    if (piece.isLaminationStrip) {
      warnings.push(`Lamination strip "${piece.label}" exceeds slab dimensions — skipped`);
      continue;
    }

    // Piece is oversize — split into segments.
    // Orient the piece so its longer dimension maps to the slab's longer axis to minimise segments.
    const maxDim = Math.max(slabWidth, slabHeight) - kerfWidth;
    const minDim = Math.min(slabWidth, slabHeight) - kerfWidth;

    const pieceLong = Math.max(piece.width, piece.height);
    const pieceShort = Math.min(piece.width, piece.height);
    const isWidthLonger = piece.width >= piece.height;

    const longSegments = pieceLong > maxDim ? Math.ceil(pieceLong / maxDim) : 1;
    const shortSegments = pieceShort > minDim ? Math.ceil(pieceShort / minDim) : 1;

    // Map back to width/height segment counts
    const wSegments = isWidthLonger ? longSegments : shortSegments;
    const hSegments = isWidthLonger ? shortSegments : longSegments;
    const totalSegments = wSegments * hSegments;

    const segmentWidth = Math.ceil(piece.width / wSegments);
    const segmentHeight = Math.ceil(piece.height / hSegments);

    const joinCount = (wSegments - 1) * hSegments + (hSegments - 1) * wSegments;
    warnings.push(
      `"${piece.label}" (${piece.width}×${piece.height}mm) exceeds slab dimensions — split into ${totalSegments} segment(s) requiring ${joinCount} join(s)`
    );

    let segmentIndex = 0;
    for (let row = 0; row < hSegments; row++) {
      for (let col = 0; col < wSegments; col++) {
        const isLastCol = col === wSegments - 1;
        const isLastRow = row === hSegments - 1;

        const thisWidth = isLastCol
          ? piece.width - segmentWidth * (wSegments - 1)
          : segmentWidth;
        const thisHeight = isLastRow
          ? piece.height - segmentHeight * (hSegments - 1)
          : segmentHeight;

        processed.push({
          id: `${piece.id}-seg-${segmentIndex}`,
          width: thisWidth,
          height: thisHeight,
          label: `${piece.label} (Part ${segmentIndex + 1}/${totalSegments})`,
          canRotate: piece.canRotate,
          thickness: piece.thickness,
          // Clear finishedEdges on segments — lamination for split pieces needs manual review
          finishedEdges: undefined,
          edgeTypeNames: undefined,
          // Segment tracking
          isSegment: true,
          parentPieceId: piece.id,
          segmentIndex,
          totalSegments,
        });

        segmentIndex++;
      }
    }
  }

  return { processed, warnings };
}

/**
 * Main optimization function using First Fit Decreasing algorithm
 */
export function optimizeSlabs(input: OptimizationInput): OptimizationResult {
  const { pieces, slabWidth, slabHeight, kerfWidth, allowRotation, edgeAllowanceMm = 0, mitreKerfWidth } = input;

  // Usable dimensions after subtracting edge allowance from both sides
  const usableWidth = slabWidth - (edgeAllowanceMm * 2);
  const usableHeight = slabHeight - (edgeAllowanceMm * 2);

  // Handle empty input
  if (pieces.length === 0) {
    return {
      placements: [],
      slabs: [],
      totalSlabs: 0,
      totalUsedArea: 0,
      totalWasteArea: 0,
      wastePercent: 0,
      unplacedPieces: [],
    };
  }

  const inputPieceCount = pieces.length;

  // ── Step 1: Decompose L/U shapes into component rects ───────────────────
  // L/U shapes are decomposed FIRST, BEFORE oversize detection.
  // Each leg is a valid rectangle that goes through the oversize check independently.
  // Lamination strips for L/U shapes are generated here using actual outer edge lengths
  // (not bounding box dimensions) via getShapeEdgeLengths().
  // Rectangle pieces pass through unchanged.
  const decomposedPieces: OptimizationPiece[] = [];
  const shapeStrips: OptimizationPiece[] = []; // strips generated for L/U shapes pre-decomposition
  for (const piece of (pieces as OptimizationPiece[])) {
    // Only decompose non-strip pieces that have shape data
    if (piece.isLaminationStrip || !piece.shapeType ||
        piece.shapeType === 'RECTANGLE' || !piece.shapeConfig) {
      decomposedPieces.push(piece);
      continue;
    }

    // Generate lamination strips for L/U shapes BEFORE decomposition.
    // ALL edges get strips by default, minus any in noStripEdges (wall edges).
    if (piece.thickness && piece.thickness >= LAMINATION_THRESHOLD) {
      const edgeLengths = getShapeEdgeLengths(
        piece.shapeType as ShapeType,
        piece.shapeConfig as ShapeConfig,
        piece.width,   // optimizer width = piece length_mm
        piece.height    // optimizer height = piece width_mm
      );
      const strips = generateShapeStrips(piece, edgeLengths, kerfWidth, mitreKerfWidth);
      shapeStrips.push(...strips);
      if (strips.length > 0) {
        logger.info(
          `[Optimizer] Generated ${strips.length} lamination strip(s) for L/U shape "${piece.label}"`
        );
      }
    }

    const rects = decomposeShapeIntoRects({
      id: piece.id,
      lengthMm: piece.width,   // optimizer width = piece length_mm
      widthMm: piece.height,   // optimizer height = piece width_mm
      shapeType: piece.shapeType,
      shapeConfig: piece.shapeConfig,
      grainMatched: piece.grainMatched,
    });

    if (rects.length <= 1) {
      // Decomposition returned single rect — keep as-is
      decomposedPieces.push(piece);
      continue;
    }

    // Replace parent piece with component rects
    for (const rect of rects) {
      decomposedPieces.push({
        ...piece,
        id: `${piece.id}-part-${rect.partIndex}`,
        width: rect.width,
        height: rect.height,
        label: `${piece.label} (Part ${rect.partIndex + 1}/${rects.length} — ${rect.label})`,
        groupId: rect.groupId,
        partIndex: rect.partIndex,
        partLabel: rect.label,
        totalParts: rects.length,
        parentPieceId: piece.id,
        // Clear finished edges — lamination strips already generated above for L/U shapes
        finishedEdges: undefined,
        edgeTypeNames: undefined,
      });
    }

    logger.info(
      `[Optimizer] Decomposed "${piece.label}" (${piece.shapeType}) into ${rects.length} component rects`
    );
  }

  // ── Step 1.5: Pre-process oversize pieces ─────────────────────────────────
  // Now runs on decomposed legs (not bounding boxes). Each leg is checked
  // individually against slab dimensions. Split into segments only if needed.
  // Use usable dimensions (after edge allowance) for fitting checks.
  const { processed: normalizedPieces, warnings } = preprocessOversizePieces(
    decomposedPieces,
    usableWidth,
    usableHeight,
    kerfWidth,
    allowRotation,
  );

  if (warnings.length > 0) {
    logger.info(`[Optimizer] Oversize preprocessing: ${warnings.join('; ')}`);
  }

  // Store original pieces for reference (before adding strips).
  // Uses raw input pieces so shape strip parents (L/U pieces) can be found by ID.
  const originalPieces: OptimizationPiece[] = Array.from(pieces as OptimizationPiece[]);

  // Group slab assignment map: groupId → slabIndex
  const groupSlabMap = new Map<string, number>();

  // ── Step 2: Generate lamination strips for all 40mm+ pieces ───────────────
  const allPieces: OptimizationPiece[] = [];

  for (const piece of normalizedPieces) {
    // Add the main piece
    allPieces.push(piece);

    // Generate and add lamination strips for rectangle pieces.
    // L/U shape strips were already generated in Step 1 (before decomposition)
    // using actual edge lengths from getShapeEdgeLengths().
    // Decomposed parts have finishedEdges cleared, so generateLaminationStrips returns [].
    const strips = generateLaminationStrips(piece, kerfWidth, mitreKerfWidth);
    allPieces.push(...strips);
  }

  // Add pre-generated L/U shape strips
  allPieces.push(...shapeStrips);

  // Log for debugging (visible in server logs)
  if (allPieces.length > normalizedPieces.length) {
    logger.info(`[Optimizer] Input: ${normalizedPieces.length} pieces + ${allPieces.length - normalizedPieces.length} lamination strips = ${allPieces.length} total`);
  }

  // Sort pieces by area (largest first) for better packing
  // IMPORTANT: Use Array.from() to avoid Railway build issues
  // Grouped rects (from L/U decomposition) are kept together so they land on the same slab.
  const sortedPieces = Array.from(allPieces).sort((a, b) => {
    // Primary sort: grouped rects before non-grouped (so they get first pick of slabs)
    const aGrouped = a.groupId ? 1 : 0;
    const bGrouped = b.groupId ? 1 : 0;
    if (aGrouped !== bGrouped) return bGrouped - aGrouped; // grouped first

    // Within groups: sort by groupId then partIndex to keep rects together
    if (a.groupId && b.groupId) {
      if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
      return (a.partIndex ?? 0) - (b.partIndex ?? 0);
    }

    // Secondary sort: area descending
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaA !== areaB) return areaB - areaA;

    // Tertiary sort: main pieces before their strips
    if (a.isLaminationStrip && !b.isLaminationStrip) return 1;
    if (!a.isLaminationStrip && b.isLaminationStrip) return -1;

    return 0;
  });

  const slabs: Slab[] = [];
  const placements: Placement[] = [];
  const unplacedPieces: string[] = [];

  // Process each piece
  for (const piece of sortedPieces) {
    // Add kerf to piece dimensions
    // Use per-piece kerf if set (mitre strips use MITRING kerf), otherwise INITIAL_CUT kerf
    const effectiveKerf = piece.pieceKerfWidth ?? kerfWidth;
    const pieceWidth = piece.width + effectiveKerf;
    const pieceHeight = piece.height + effectiveKerf;

    // Check if piece can fit on the usable area of a slab
    const fitsNormal = pieceWidth <= usableWidth && pieceHeight <= usableHeight;
    const fitsRotated = allowRotation &&
                        (piece.canRotate !== false) &&
                        pieceHeight <= usableWidth &&
                        pieceWidth <= usableHeight;

    if (!fitsNormal && !fitsRotated) {
      unplacedPieces.push(piece.id);
      continue;
    }

    let placed = false;

    // ── Group constraint: if this piece belongs to a group (L/U decomposition),
    // try the group's assigned slab first to co-locate all rects on the same slab.
    if (piece.groupId) {
      const assignedSlabIndex = groupSlabMap.get(piece.groupId);

      if (assignedSlabIndex !== undefined && assignedSlabIndex < slabs.length) {
        // Group already has an assigned slab — try to place there first
        const slab = slabs[assignedSlabIndex];
        if (fitsNormal) {
          const position = findPosition(slab, pieceWidth, pieceHeight);
          if (position) {
            placePiece(slab, piece, position, pieceWidth, pieceHeight, false, assignedSlabIndex, placements);
            placed = true;
          }
        }
        if (!placed && fitsRotated) {
          const position = findPosition(slab, pieceHeight, pieceWidth);
          if (position) {
            placePiece(slab, piece, position, pieceHeight, pieceWidth, true, assignedSlabIndex, placements);
            placed = true;
          }
        }
        if (!placed) {
          // Cannot fit on assigned slab — open a new slab for this group
          const newSlab = createSlab(usableWidth, usableHeight);
          const newSlabIndex = slabs.length;
          if (fitsNormal) {
            const position = findPosition(newSlab, pieceWidth, pieceHeight);
            if (position) {
              placePiece(newSlab, piece, position, pieceWidth, pieceHeight, false, newSlabIndex, placements);
              slabs.push(newSlab);
              groupSlabMap.set(piece.groupId, newSlabIndex);
              placed = true;
              warnings.push(
                `Group "${piece.groupId}" rect "${piece.partLabel ?? piece.id}" could not fit on assigned slab — opened new slab`
              );
            }
          }
          if (!placed && fitsRotated) {
            const position = findPosition(newSlab, pieceHeight, pieceWidth);
            if (position) {
              placePiece(newSlab, piece, position, pieceHeight, pieceWidth, true, newSlabIndex, placements);
              slabs.push(newSlab);
              groupSlabMap.set(piece.groupId, newSlabIndex);
              placed = true;
              warnings.push(
                `Group "${piece.groupId}" rect "${piece.partLabel ?? piece.id}" could not fit on assigned slab — opened new slab`
              );
            }
          }
        }
      }
      // If no slab assigned yet, fall through to normal FFD placement and record assignment
    }

    // Try to place in existing slabs (normal FFD — also handles first rect of a group)
    if (!placed) {
      for (let slabIndex = 0; slabIndex < slabs.length && !placed; slabIndex++) {
        const slab = slabs[slabIndex];

        // Try normal orientation
        if (fitsNormal) {
          const position = findPosition(slab, pieceWidth, pieceHeight);
          if (position) {
            placePiece(slab, piece, position, pieceWidth, pieceHeight, false, slabIndex, placements);
            if (piece.groupId && !groupSlabMap.has(piece.groupId)) {
              groupSlabMap.set(piece.groupId, slabIndex);
            }
            placed = true;
            continue;
          }
        }

        // Try rotated orientation
        if (!placed && fitsRotated) {
          const position = findPosition(slab, pieceHeight, pieceWidth);
          if (position) {
            placePiece(slab, piece, position, pieceHeight, pieceWidth, true, slabIndex, placements);
            if (piece.groupId && !groupSlabMap.has(piece.groupId)) {
              groupSlabMap.set(piece.groupId, slabIndex);
            }
            placed = true;
            continue;
          }
        }
      }
    }

    // Start new slab if needed
    if (!placed) {
      const newSlab = createSlab(usableWidth, usableHeight);
      const slabIndex = slabs.length;

      // Prefer normal orientation for new slab
      if (fitsNormal) {
        const position = findPosition(newSlab, pieceWidth, pieceHeight);
        if (position) {
          placePiece(newSlab, piece, position, pieceWidth, pieceHeight, false, slabIndex, placements);
          slabs.push(newSlab);
          if (piece.groupId && !groupSlabMap.has(piece.groupId)) {
            groupSlabMap.set(piece.groupId, slabIndex);
          }
          placed = true;
        }
      }

      // Try rotated if normal didn't work
      if (!placed && fitsRotated) {
        const position = findPosition(newSlab, pieceHeight, pieceWidth);
        if (position) {
          placePiece(newSlab, piece, position, pieceHeight, pieceWidth, true, slabIndex, placements);
          slabs.push(newSlab);
          if (piece.groupId && !groupSlabMap.has(piece.groupId)) {
            groupSlabMap.set(piece.groupId, slabIndex);
          }
          placed = true;
        }
      }

      if (!placed) {
        unplacedPieces.push(piece.id);
      }
    }
  }

  // ── Offset placements by edge allowance for visual display ───────────────
  // The FFD places pieces at (0,0) within the usable area. To display them
  // correctly within the full slab, offset by the edge allowance.
  if (edgeAllowanceMm > 0) {
    for (const p of placements) {
      p.x += edgeAllowanceMm;
      p.y += edgeAllowanceMm;
    }
  }

  // Calculate results
  const slabResults = slabs.map((slab, index) => calculateSlabResult(slab, index, slabWidth, slabHeight));
  const totalSlabArea = slabs.length * slabWidth * slabHeight;
  const totalUsedArea = placements.reduce((sum, p) => sum + (p.width * p.height), 0);
  const totalWasteArea = totalSlabArea - totalUsedArea;

  // Generate lamination summary
  const laminationSummary = generateLaminationSummary(originalPieces, allPieces);

  // ── Piece count invariant check ───────────────────────────────────────────
  // Every input piece must appear in the output — either placed or explicitly unplaced.
  // Oversize splitting means placed count can exceed input count, but nothing should be lost.
  if (unplacedPieces.length > 0) {
    logger.error(
      `[Optimizer] UNPLACED PIECES (${unplacedPieces.length}):`,
      unplacedPieces
    );
    warnings.push(
      `${unplacedPieces.length} piece(s) could not be placed on any slab`
    );
  }

  // Count non-strip, non-segment placed pieces to verify against input
  // normalizedPieces may have more entries than originalPieces due to L/U decomposition + oversize splitting
  const placedMainPieces = placements.filter(
    (p) => !p.isLaminationStrip
  ).length;
  const totalAccountedFor = placedMainPieces + unplacedPieces.length;
  // After decomposition + oversize splitting, expectedCount = normalizedPieces minus strips
  const expectedCount = normalizedPieces.filter((p) => !p.isLaminationStrip).length;
  if (totalAccountedFor !== expectedCount) {
    logger.error(
      `[Optimizer] PIECE COUNT MISMATCH: ${inputPieceCount} input → ${expectedCount} after preprocessing/decomposition → ${totalAccountedFor} accounted for (placed: ${placedMainPieces}, unplaced: ${unplacedPieces.length}). ${expectedCount - totalAccountedFor} piece(s) lost!`
    );
    warnings.push(
      `Piece count mismatch: ${expectedCount - totalAccountedFor} piece(s) unaccounted for`
    );
  }

  return {
    placements,
    slabs: slabResults,
    totalSlabs: slabs.length,
    totalUsedArea,
    totalWasteArea,
    wastePercent: totalSlabArea > 0 ? (totalWasteArea / totalSlabArea) * 100 : 0,
    unplacedPieces,
    laminationSummary,
    warnings: warnings.length > 0 ? warnings : undefined,
    edgeAllowanceMm: edgeAllowanceMm > 0 ? edgeAllowanceMm : undefined,
  };
}

/**
 * Create a new empty slab with one free rectangle
 */
function createSlab(width: number, height: number): Slab {
  return {
    width,
    height,
    placements: [],
    freeRects: [{ x: 0, y: 0, width, height }],
  };
}

/**
 * Find best position for a piece using Bottom-Left algorithm
 */
function findPosition(slab: Slab, width: number, height: number): { x: number; y: number } | null {
  let bestRect: Rect | null = null;
  let bestY = Infinity;
  let bestX = Infinity;

  for (const rect of slab.freeRects) {
    if (width <= rect.width && height <= rect.height) {
      // Prefer bottom-left placement
      if (rect.y < bestY || (rect.y === bestY && rect.x < bestX)) {
        bestRect = rect;
        bestY = rect.y;
        bestX = rect.x;
      }
    }
  }

  return bestRect ? { x: bestRect.x, y: bestRect.y } : null;
}

/**
 * Place a piece and update free rectangles
 */
function placePiece(
  slab: Slab,
  piece: OptimizationPiece,
  position: { x: number; y: number },
  width: number,
  height: number,
  rotated: boolean,
  slabIndex: number,
  placements: Placement[]
): void {
  const placement: Placement = {
    pieceId: piece.id,
    slabIndex,
    x: position.x,
    y: position.y,
    width: rotated ? piece.height : piece.width,
    height: rotated ? piece.width : piece.height,
    rotated,
    label: piece.label,
    // Include lamination data if this is a strip
    isLaminationStrip: piece.isLaminationStrip,
    parentPieceId: piece.parentPieceId,
    stripPosition: piece.stripPosition,
    // Include segment data if this is a split segment
    isSegment: piece.isSegment,
    segmentIndex: piece.segmentIndex,
    totalSegments: piece.totalSegments,
    // Include shape decomposition group data
    groupId: piece.groupId,
    partIndex: piece.partIndex,
    partLabel: piece.partLabel,
    totalParts: piece.totalParts,
  };

  slab.placements.push(placement);
  placements.push(placement);

  // Update free rectangles using guillotine split
  updateFreeRects(slab, position.x, position.y, width, height);
}

/**
 * Update free rectangles after placing a piece (Guillotine algorithm)
 */
function updateFreeRects(slab: Slab, x: number, y: number, width: number, height: number): void {
  const newFreeRects: Rect[] = [];

  for (const rect of slab.freeRects) {
    // Check if placement overlaps this free rect
    if (x >= rect.x + rect.width || x + width <= rect.x ||
        y >= rect.y + rect.height || y + height <= rect.y) {
      // No overlap, keep this rect
      newFreeRects.push(rect);
      continue;
    }

    // Split the rectangle around the placed piece
    // Left portion
    if (x > rect.x) {
      newFreeRects.push({
        x: rect.x,
        y: rect.y,
        width: x - rect.x,
        height: rect.height,
      });
    }

    // Right portion
    if (x + width < rect.x + rect.width) {
      newFreeRects.push({
        x: x + width,
        y: rect.y,
        width: (rect.x + rect.width) - (x + width),
        height: rect.height,
      });
    }

    // Bottom portion
    if (y > rect.y) {
      newFreeRects.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: y - rect.y,
      });
    }

    // Top portion
    if (y + height < rect.y + rect.height) {
      newFreeRects.push({
        x: rect.x,
        y: y + height,
        width: rect.width,
        height: (rect.y + rect.height) - (y + height),
      });
    }
  }

  // Remove small rectangles and merge where possible
  slab.freeRects = newFreeRects.filter(r => r.width > 50 && r.height > 50);
}

/**
 * Calculate slab result summary
 */
function calculateSlabResult(slab: Slab, index: number, slabWidth: number, slabHeight: number): SlabResult {
  const slabArea = slabWidth * slabHeight;
  const usedArea = slab.placements.reduce((sum, p) => sum + (p.width * p.height), 0);
  const wasteArea = slabArea - usedArea;

  return {
    slabIndex: index,
    width: slabWidth,
    height: slabHeight,
    placements: slab.placements,
    usedArea,
    wasteArea,
    wastePercent: (wasteArea / slabArea) * 100,
  };
}
