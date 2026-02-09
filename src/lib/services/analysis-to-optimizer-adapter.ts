import {
  ElevationAnalysis,
  ElevationDeductionSummary,
  SlabFitConfig,
  SlabFitPiece,
} from '@/lib/types/drawing-analysis';
import { OptimizationInput } from '@/types/slab-optimization';

/**
 * Transform elevation analysis into slab optimiser input.
 *
 * Each stone face becomes one or more rectangular pieces.
 * Faces larger than the slab are split into segments that fit.
 *
 * CRITICAL: We use the face's GROSS dimensions for slab fitting,
 * not net dimensions. The stone must cover the entire face area
 * including where openings are — the openings are cut OUT of
 * already-placed slab pieces.
 *
 * Net area is used for PRICING only.
 * Gross area is used for SLAB FITTING.
 */
export function elevationToOptimizerInput(
  analysis: ElevationAnalysis,
  _deductions: ElevationDeductionSummary,
  config: SlabFitConfig
): {
  pieces: SlabFitPiece[];
  optimizerInput: OptimizationInput;
} {
  const pieces: SlabFitPiece[] = [];

  for (const face of analysis.stoneFaces) {
    const faceWidth = face.grossDimensions.width;
    const faceHeight = face.grossDimensions.height;

    // Check if face fits on a single slab
    const fitsOnSlab = canFitOnSlab(faceWidth, faceHeight, config);

    if (fitsOnSlab) {
      pieces.push({
        id: `elev-${face.id}`,
        label: face.name,
        width: faceWidth,
        height: faceHeight,
        sourceFaceId: face.id,
        isSplitPiece: false,
      });
    } else {
      // Face too large — split into segments
      const segments = splitFaceForSlab(
        { width: faceWidth, height: faceHeight },
        config
      );
      segments.forEach((seg, index) => {
        pieces.push({
          id: `elev-${face.id}-seg${index}`,
          label: `${face.name} (Part ${index + 1}/${segments.length})`,
          width: seg.width,
          height: seg.height,
          sourceFaceId: face.id,
          isSplitPiece: true,
          splitIndex: index,
        });
      });
    }
  }

  const optimizerInput = buildOptimizerInput(pieces, config);

  return { pieces, optimizerInput };
}

/**
 * Check if a face fits on a slab (try both orientations).
 */
function canFitOnSlab(
  width: number,
  height: number,
  config: SlabFitConfig
): boolean {
  const { slabWidth, slabHeight } = config;

  // Try normal orientation
  if (width <= slabWidth && height <= slabHeight) return true;

  // Try rotated (if allowed)
  if (config.allowRotation && height <= slabWidth && width <= slabHeight)
    return true;

  return false;
}

/**
 * Split an oversized face into segments that each fit on a slab.
 *
 * Uses a grid-based split: divide along width and height as needed.
 * Each segment's max size is bounded by slab dimensions.
 *
 * Example: Face 4000x2700mm with slab 3200x1600mm
 * -> 2 cols x 2 rows = 4 segments
 * -> Segment sizes: 2000x1350, 2000x1350, 2000x1350, 2000x1350
 *    (evenly divided for better aesthetics)
 */
function splitFaceForSlab(
  faceDims: { width: number; height: number },
  config: SlabFitConfig
): Array<{ width: number; height: number }> {
  const { slabWidth, slabHeight } = config;
  // Use the larger dimension as max width, smaller as max height
  // to account for potential rotation
  const maxW = config.allowRotation
    ? Math.max(slabWidth, slabHeight)
    : slabWidth;
  const maxH = config.allowRotation
    ? Math.min(slabWidth, slabHeight)
    : slabHeight;

  const faceW = faceDims.width;
  const faceH = faceDims.height;

  // Calculate how many columns and rows needed
  const numCols = Math.ceil(faceW / maxW);
  const numRows = Math.ceil(faceH / maxH);

  // Divide evenly for better aesthetics (avoids one tiny strip)
  const segmentW = Math.ceil(faceW / numCols);
  const segmentH = Math.ceil(faceH / numRows);

  const segments: Array<{ width: number; height: number }> = [];

  let remainingW = faceW;
  for (let col = 0; col < numCols; col++) {
    const thisW = col === numCols - 1
      ? remainingW
      : segmentW;

    let remainingH = faceH;
    for (let row = 0; row < numRows; row++) {
      const thisH = row === numRows - 1
        ? remainingH
        : segmentH;

      segments.push({ width: thisW, height: thisH });
      remainingH -= segmentH;
    }

    remainingW -= segmentW;
  }

  return segments;
}

/**
 * Build the OptimizationInput in the exact format the existing
 * slab optimizer expects.
 */
function buildOptimizerInput(
  pieces: SlabFitPiece[],
  config: SlabFitConfig
): OptimizationInput {
  return {
    pieces: pieces.map((p) => ({
      id: p.id,
      label: p.label,
      width: p.width,
      height: p.height,
      thickness: config.thickness,
      // Elevation faces are full-coverage stone — no specific finished edges
      // (lamination strips are for benchtop pieces, not elevation cladding)
      canRotate: config.allowRotation,
    })),
    slabWidth: config.slabWidth,
    slabHeight: config.slabHeight,
    kerfWidth: config.kerfWidth,
    allowRotation: config.allowRotation,
  };
}
