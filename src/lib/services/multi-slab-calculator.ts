import {
  type SlabSize,
  getSlabSize,
  getMaxUsableDimensions,
} from '@/lib/constants/slab-sizes';

export type JoinStrategy = 'NONE' | 'LENGTHWISE' | 'WIDTHWISE' | 'MULTI_JOIN';

export interface Segment {
  lengthMm: number;
  widthMm: number;
  slabIndex: number;  // Which slab this comes from
}

export interface JoinLocation {
  positionMm: number;      // Distance from left/top edge
  orientation: 'VERTICAL' | 'HORIZONTAL';
  lengthMm: number;        // Length of the join line
}

export interface CutPlan {
  fitsOnSingleSlab: boolean;
  strategy: JoinStrategy;
  segments: Segment[];
  joins: JoinLocation[];
  totalSlabsRequired: number;
  joinLengthMm: number;
  joinCost: number;
  warnings: string[];
}

export interface PieceDimensions {
  lengthMm: number;
  widthMm: number;
  thicknessMm?: number;
}

/**
 * Calculate a cut plan for a piece.
 * Determines if it fits on one slab or needs joins.
 * When slabLength_mm and slabWidth_mm are provided (from the material DB record),
 * they take precedence over the category-level defaults from getSlabSize.
 */
export function calculateCutPlan(
  piece: PieceDimensions,
  materialCategory: string,
  edgeTrimMm: number = 20,
  slabLength_mm?: number | null,
  slabWidth_mm?: number | null,
  joinRatePerMetre: number = 0
): CutPlan {
  const slabSize: SlabSize = (slabLength_mm && slabWidth_mm)
    ? { lengthMm: slabLength_mm, widthMm: slabWidth_mm, name: 'material-db' }
    : getSlabSize(materialCategory);
  const usable = getMaxUsableDimensions(slabSize, edgeTrimMm);

  // Try normal orientation first
  const fitsNormal = piece.lengthMm <= usable.maxLength && piece.widthMm <= usable.maxWidth;

  // Try rotated 90 degrees
  const fitsRotated = piece.widthMm <= usable.maxLength && piece.lengthMm <= usable.maxWidth;

  if (fitsNormal || fitsRotated) {
    return {
      fitsOnSingleSlab: true,
      strategy: 'NONE',
      segments: [{
        lengthMm: piece.lengthMm,
        widthMm: piece.widthMm,
        slabIndex: 0,
      }],
      joins: [],
      totalSlabsRequired: 1,
      joinLengthMm: 0,
      joinCost: 0,
      warnings: fitsRotated && !fitsNormal
        ? ['Piece must be rotated 90° to fit on slab']
        : [],
    };
  }

  // Piece doesn't fit - calculate join strategy

  // Check if only length exceeds (most common)
  if (piece.lengthMm > usable.maxLength && piece.widthMm <= usable.maxWidth) {
    return calculateLengthwiseJoin(piece, usable, joinRatePerMetre);
  }

  // Check if only width exceeds
  if (piece.widthMm > usable.maxWidth && piece.lengthMm <= usable.maxLength) {
    return calculateWidthwiseJoin(piece, usable, joinRatePerMetre);
  }

  // Both dimensions exceed - complex multi-join
  return calculateMultiJoin(piece, usable, joinRatePerMetre);
}

function calculateLengthwiseJoin(
  piece: PieceDimensions,
  usable: { maxLength: number; maxWidth: number },
  joinRatePerMetre: number
): CutPlan {
  const warnings: string[] = [];

  // Calculate optimal split point
  // Prefer splits away from centre (better aesthetics)
  const numSegments = Math.ceil(piece.lengthMm / usable.maxLength);
  const segmentLength = Math.ceil(piece.lengthMm / numSegments);

  const segments: Segment[] = [];
  const joins: JoinLocation[] = [];

  let remainingLength = piece.lengthMm;
  let currentPosition = 0;

  for (let i = 0; i < numSegments; i++) {
    const thisSegmentLength = Math.min(segmentLength, remainingLength);

    segments.push({
      lengthMm: thisSegmentLength,
      widthMm: piece.widthMm,
      slabIndex: i,
    });

    if (i < numSegments - 1) {
      currentPosition += thisSegmentLength;
      joins.push({
        positionMm: currentPosition,
        orientation: 'VERTICAL',
        lengthMm: piece.widthMm,
      });
    }

    remainingLength -= thisSegmentLength;
  }

  const totalJoinLength = joins.reduce((sum, j) => sum + j.lengthMm, 0);
  const joinCost = (totalJoinLength / 1000) * joinRatePerMetre;

  // Warning if join is near centre
  for (const join of joins) {
    const centrePosition = piece.lengthMm / 2;
    const distanceFromCentre = Math.abs(join.positionMm - centrePosition);
    if (distanceFromCentre < 200) {
      warnings.push('Join is near centre of piece - consider adjusting if possible');
    }
  }

  return {
    fitsOnSingleSlab: false,
    strategy: 'LENGTHWISE',
    segments,
    joins,
    totalSlabsRequired: numSegments,
    joinLengthMm: totalJoinLength,
    joinCost: Math.round(joinCost * 100) / 100,
    warnings,
  };
}

function calculateWidthwiseJoin(
  piece: PieceDimensions,
  usable: { maxLength: number; maxWidth: number },
  joinRatePerMetre: number
): CutPlan {
  const numSegments = Math.ceil(piece.widthMm / usable.maxWidth);
  const segmentWidth = Math.ceil(piece.widthMm / numSegments);

  const segments: Segment[] = [];
  const joins: JoinLocation[] = [];

  let remainingWidth = piece.widthMm;
  let currentPosition = 0;

  for (let i = 0; i < numSegments; i++) {
    const thisSegmentWidth = Math.min(segmentWidth, remainingWidth);

    segments.push({
      lengthMm: piece.lengthMm,
      widthMm: thisSegmentWidth,
      slabIndex: i,
    });

    if (i < numSegments - 1) {
      currentPosition += thisSegmentWidth;
      joins.push({
        positionMm: currentPosition,
        orientation: 'HORIZONTAL',
        lengthMm: piece.lengthMm,
      });
    }

    remainingWidth -= thisSegmentWidth;
  }

  const totalJoinLength = joins.reduce((sum, j) => sum + j.lengthMm, 0);
  const joinCost = (totalJoinLength / 1000) * joinRatePerMetre;

  return {
    fitsOnSingleSlab: false,
    strategy: 'WIDTHWISE',
    segments,
    joins,
    totalSlabsRequired: numSegments,
    joinLengthMm: totalJoinLength,
    joinCost: Math.round(joinCost * 100) / 100,
    warnings: ['Widthwise join - ensure waterfall continuity if applicable'],
  };
}

function calculateMultiJoin(
  piece: PieceDimensions,
  usable: { maxLength: number; maxWidth: number },
  joinRatePerMetre: number
): CutPlan {
  // Complex case: both dimensions exceed slab
  const lengthSegments = Math.ceil(piece.lengthMm / usable.maxLength);
  const widthSegments = Math.ceil(piece.widthMm / usable.maxWidth);
  const totalSlabs = lengthSegments * widthSegments;

  const segments: Segment[] = [];
  const joins: JoinLocation[] = [];

  const segmentLength = Math.ceil(piece.lengthMm / lengthSegments);
  const segmentWidth = Math.ceil(piece.widthMm / widthSegments);

  // Create grid of segments
  for (let row = 0; row < widthSegments; row++) {
    for (let col = 0; col < lengthSegments; col++) {
      segments.push({
        lengthMm: col === lengthSegments - 1
          ? piece.lengthMm - (segmentLength * (lengthSegments - 1))
          : segmentLength,
        widthMm: row === widthSegments - 1
          ? piece.widthMm - (segmentWidth * (widthSegments - 1))
          : segmentWidth,
        slabIndex: row * lengthSegments + col,
      });
    }
  }

  // Vertical joins
  for (let col = 1; col < lengthSegments; col++) {
    joins.push({
      positionMm: col * segmentLength,
      orientation: 'VERTICAL',
      lengthMm: piece.widthMm,
    });
  }

  // Horizontal joins
  for (let row = 1; row < widthSegments; row++) {
    joins.push({
      positionMm: row * segmentWidth,
      orientation: 'HORIZONTAL',
      lengthMm: piece.lengthMm,
    });
  }

  const totalJoinLength = joins.reduce((sum, j) => sum + j.lengthMm, 0);
  const joinCost = (totalJoinLength / 1000) * joinRatePerMetre;

  return {
    fitsOnSingleSlab: false,
    strategy: 'MULTI_JOIN',
    segments,
    joins,
    totalSlabsRequired: totalSlabs,
    joinLengthMm: totalJoinLength,
    joinCost: Math.round(joinCost * 100) / 100,
    warnings: [
      `Complex piece requires ${totalSlabs} slabs and ${joins.length} joins`,
      'Consider breaking into separate pieces if possible',
    ],
  };
}

/**
 * Check if a piece will require joins
 */
export function willRequireJoin(
  piece: PieceDimensions,
  materialCategory: string
): boolean {
  const plan = calculateCutPlan(piece, materialCategory);
  return !plan.fitsOnSingleSlab;
}

/**
 * Estimate material waste for a piece
 */
export function estimateWaste(
  piece: PieceDimensions,
  materialCategory: string
): { wastePercentage: number; wasteMm2: number } {
  const plan = calculateCutPlan(piece, materialCategory);
  const slabSize = getSlabSize(materialCategory);

  const pieceArea = piece.lengthMm * piece.widthMm;
  const totalSlabArea = plan.totalSlabsRequired * slabSize.lengthMm * slabSize.widthMm;
  const wasteMm2 = totalSlabArea - pieceArea;
  const wastePercentage = (wasteMm2 / totalSlabArea) * 100;

  return {
    wastePercentage: Math.round(wastePercentage * 10) / 10,
    wasteMm2,
  };
}
