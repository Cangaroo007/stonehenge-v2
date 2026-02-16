import {
  OptimizationInput,
  OptimizationResult,
  Placement,
  SlabResult,
  LaminationSummary
} from '@/types/slab-optimization';
import { logger } from '@/lib/logger';

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

// Lamination strip constants
// Strip widths from business rules (kerf is added separately by the optimizer during placement)
const LAMINATION_STRIP_WIDTH_DEFAULT = 60; // mm - standard laminated strip width (~60mm + kerf = 68mm)
const LAMINATION_STRIP_WIDTH_MITRE = 40; // mm - mitred strip width (~40mm + kerf = 48mm)
const LAMINATION_THRESHOLD = 40; // mm - pieces >= 40mm need lamination

// Internal type for pieces during optimization (includes lamination and segment data)
type OptimizationPiece = OptimizationInput['pieces'][0] & {
  isLaminationStrip?: boolean;
  parentPieceId?: string;
  stripPosition?: 'top' | 'bottom' | 'left' | 'right';
  isSegment?: boolean;
  segmentIndex?: number;
  totalSegments?: number;
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
 * Mitre strip width: ~40mm (kerf added separately by optimizer).
 * Standard/waterfall strip width: ~60mm (kerf added separately by optimizer).
 */
function generateLaminationStrips(piece: OptimizationPiece, kerfWidth?: number): OptimizationPiece[] {
  // Only generate strips for 40mm+ pieces
  if (!piece.thickness || piece.thickness < LAMINATION_THRESHOLD) {
    return [];
  }

  // If no finished edges specified, assume none (no strips needed)
  if (!piece.finishedEdges) {
    return [];
  }

  const strips: OptimizationPiece[] = [];
  const edges = piece.finishedEdges;
  const edgeNames = piece.edgeTypeNames;

  // Top edge strip (runs along the width)
  if (edges.top) {
    const stripW = getStripWidthForEdge(edgeNames?.top, piece.thickness, kerfWidth);
    strips.push({
      id: `${piece.id}-lam-top`,
      width: piece.width,
      height: stripW,
      thickness: 20, // Strips are cut from 20mm slab
      label: `${piece.label} (Lam-Top${edgeNames?.top ? ` ${edgeNames.top}` : ''})`,
      isLaminationStrip: true,
      parentPieceId: piece.id,
      stripPosition: 'top'
    });
  }

  // Bottom edge strip (runs along the width)
  if (edges.bottom) {
    const stripW = getStripWidthForEdge(edgeNames?.bottom, piece.thickness, kerfWidth);
    strips.push({
      id: `${piece.id}-lam-bottom`,
      width: piece.width,
      height: stripW,
      thickness: 20,
      label: `${piece.label} (Lam-Bottom${edgeNames?.bottom ? ` ${edgeNames.bottom}` : ''})`,
      isLaminationStrip: true,
      parentPieceId: piece.id,
      stripPosition: 'bottom'
    });
  }

  // Left edge strip (runs along the height)
  if (edges.left) {
    const stripW = getStripWidthForEdge(edgeNames?.left, piece.thickness, kerfWidth);
    strips.push({
      id: `${piece.id}-lam-left`,
      width: stripW,
      height: piece.height,
      thickness: 20,
      label: `${piece.label} (Lam-Left${edgeNames?.left ? ` ${edgeNames.left}` : ''})`,
      isLaminationStrip: true,
      parentPieceId: piece.id,
      stripPosition: 'left'
    });
  }

  // Right edge strip (runs along the height)
  if (edges.right) {
    const stripW = getStripWidthForEdge(edgeNames?.right, piece.thickness, kerfWidth);
    strips.push({
      id: `${piece.id}-lam-right`,
      width: stripW,
      height: piece.height,
      thickness: 20,
      label: `${piece.label} (Lam-Right${edgeNames?.right ? ` ${edgeNames.right}` : ''})`,
      isLaminationStrip: true,
      parentPieceId: piece.id,
      stripPosition: 'right'
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
  
  for (const parentId of parentIds) {
    const parent = originalPieces.find(p => p.id === parentId);
    const parentStrips = strips.filter(s => s.parentPieceId === parentId);
    
    stripsByParent.push({
      parentPieceId: parentId || '',
      parentLabel: parent?.label || 'Unknown',
      strips: parentStrips.map(s => ({
        position: s.stripPosition || 'unknown',
        lengthMm: s.stripPosition === 'left' || s.stripPosition === 'right'
          ? s.height
          : s.width,
        widthMm: s.stripPosition === 'left' || s.stripPosition === 'right'
          ? s.width
          : s.height
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
  const { pieces, slabWidth, slabHeight, kerfWidth, allowRotation } = input;

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

  // ── Step 1: Pre-process oversize pieces ───────────────────────────────────
  // Split any piece that exceeds slab dimensions into segments that fit.
  // This MUST happen before FFD to prevent pieces being silently dropped.
  const { processed: normalizedPieces, warnings } = preprocessOversizePieces(
    pieces as OptimizationPiece[],
    slabWidth,
    slabHeight,
    kerfWidth,
    allowRotation,
  );

  if (warnings.length > 0) {
    logger.info(`[Optimizer] Oversize preprocessing: ${warnings.join('; ')}`);
  }

  // Store original pieces for reference (before adding strips)
  const originalPieces: OptimizationPiece[] = Array.from(normalizedPieces);

  // ── Step 2: Generate lamination strips for all 40mm+ pieces ───────────────
  const allPieces: OptimizationPiece[] = [];

  for (const piece of normalizedPieces) {
    // Add the main piece
    allPieces.push(piece);

    // Generate and add lamination strips if needed
    // (segments have finishedEdges cleared, so no strips are generated for them)
    const strips = generateLaminationStrips(piece, kerfWidth);
    allPieces.push(...strips);
  }

  // Log for debugging (visible in server logs)
  if (allPieces.length > normalizedPieces.length) {
    logger.info(`[Optimizer] Input: ${normalizedPieces.length} pieces + ${allPieces.length - normalizedPieces.length} lamination strips = ${allPieces.length} total`);
  }

  // Sort pieces by area (largest first) for better packing
  // IMPORTANT: Use Array.from() to avoid Railway build issues
  // Keep main pieces and their strips somewhat together for better organization
  const sortedPieces = Array.from(allPieces).sort((a, b) => {
    // Primary sort: area descending
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaA !== areaB) return areaB - areaA;
    
    // Secondary sort: main pieces before their strips
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
    const pieceWidth = piece.width + kerfWidth;
    const pieceHeight = piece.height + kerfWidth;

    // Check if piece can fit on a slab at all
    const fitsNormal = pieceWidth <= slabWidth && pieceHeight <= slabHeight;
    const fitsRotated = allowRotation &&
                        (piece.canRotate !== false) &&
                        pieceHeight <= slabWidth &&
                        pieceWidth <= slabHeight;

    if (!fitsNormal && !fitsRotated) {
      unplacedPieces.push(piece.id);
      continue;
    }

    let placed = false;

    // Try to place in existing slabs
    for (let slabIndex = 0; slabIndex < slabs.length && !placed; slabIndex++) {
      const slab = slabs[slabIndex];

      // Try normal orientation
      if (fitsNormal) {
        const position = findPosition(slab, pieceWidth, pieceHeight);
        if (position) {
          placePiece(slab, piece, position, pieceWidth, pieceHeight, false, slabIndex, placements);
          placed = true;
          continue;
        }
      }

      // Try rotated orientation
      if (!placed && fitsRotated) {
        const position = findPosition(slab, pieceHeight, pieceWidth);
        if (position) {
          placePiece(slab, piece, position, pieceHeight, pieceWidth, true, slabIndex, placements);
          placed = true;
          continue;
        }
      }
    }

    // Start new slab if needed
    if (!placed) {
      const newSlab = createSlab(slabWidth, slabHeight);
      const slabIndex = slabs.length;

      // Prefer normal orientation for new slab
      if (fitsNormal) {
        const position = findPosition(newSlab, pieceWidth, pieceHeight);
        if (position) {
          placePiece(newSlab, piece, position, pieceWidth, pieceHeight, false, slabIndex, placements);
          slabs.push(newSlab);
          placed = true;
        }
      }

      // Try rotated if normal didn't work
      if (!placed && fitsRotated) {
        const position = findPosition(newSlab, pieceHeight, pieceWidth);
        if (position) {
          placePiece(newSlab, piece, position, pieceHeight, pieceWidth, true, slabIndex, placements);
          slabs.push(newSlab);
          placed = true;
        }
      }

      if (!placed) {
        unplacedPieces.push(piece.id);
      }
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
  const placedMainPieces = placements.filter(
    (p) => !p.isLaminationStrip
  ).length;
  const totalAccountedFor = placedMainPieces + unplacedPieces.length;
  // normalizedPieces includes segments, so total should match
  const expectedCount = originalPieces.filter((p) => !p.isLaminationStrip).length;
  if (totalAccountedFor !== expectedCount) {
    logger.error(
      `[Optimizer] PIECE COUNT MISMATCH: ${inputPieceCount} input → ${expectedCount} after preprocessing → ${totalAccountedFor} accounted for (placed: ${placedMainPieces}, unplaced: ${unplacedPieces.length}). ${expectedCount - totalAccountedFor} piece(s) lost!`
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
