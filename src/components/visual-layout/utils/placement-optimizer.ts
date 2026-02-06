/**
 * Placement Optimizer
 * 
 * Algorithms for optimal piece placement on slabs
 */

import { PlacedPiece, LayoutCalculation, OptimizationResult, RemnantPiece } from '../types';

interface Bounds {
  width: number;
  height: number;
  padding: number;
}

interface PieceToPlace {
  id: string;
  name: string;
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
}

/**
 * Find optimal placement for pieces on a slab
 * Uses a simple bin-packing algorithm
 */
export function findOptimalPlacement(
  pieces: PieceToPlace[],
  bounds: Bounds
): OptimizationResult {
  const placedPieces: PlacedPiece[] = [];
  const unplacedPieces: string[] = [];
  
  // Sort pieces by area (largest first) for better packing
  const sortedPieces = [...pieces].sort((a, b) => 
    (b.widthMm * b.lengthMm) - (a.widthMm * a.lengthMm)
  );

  // Track occupied spaces
  const occupiedSpaces: Array<{ x: number; y: number; w: number; h: number }> = [];

  for (const piece of sortedPieces) {
    const placement = findBestPosition(
      piece,
      bounds,
      occupiedSpaces
    );

    if (placement) {
      placedPieces.push({
        pieceId: piece.id,
        pieceName: piece.name,
        lengthMm: piece.lengthMm,
        widthMm: piece.widthMm,
        thicknessMm: piece.thicknessMm,
        positionX: placement.x,
        positionY: placement.y,
        rotation: placement.rotation,
        selected: false,
        color: generatePieceColor(placedPieces.length),
        label: piece.name.substring(0, 10),
      });

      occupiedSpaces.push({
        x: placement.x,
        y: placement.y,
        w: placement.rotation === 90 || placement.rotation === 270 ? piece.lengthMm : piece.widthMm,
        h: placement.rotation === 90 || placement.rotation === 270 ? piece.widthMm : piece.lengthMm,
      });
    } else {
      unplacedPieces.push(piece.id);
    }
  }

  const stats = calculateLayoutStats(placedPieces, bounds);

  return {
    layout: placedPieces,
    wastePercent: stats.wastePercent,
    utilizationPercent: stats.utilizationPercent,
    unplacedPieces,
  };
}

/**
 * Find the best position for a piece using bottom-left algorithm
 */
function findBestPosition(
  piece: PieceToPlace,
  bounds: Bounds,
  occupiedSpaces: Array<{ x: number; y: number; w: number; h: number }>
): { x: number; y: number; rotation: 0 | 90 | 180 | 270 } | null {
  const placements: Array<{ x: number; y: number; rotation: 0 | 90 | 180 | 270; score: number }> = [];

  // Try both orientations
  const orientations: Array<{ width: number; height: number; rotation: 0 | 90 }> = [
    { width: piece.widthMm, height: piece.lengthMm, rotation: 0 },
    { width: piece.lengthMm, height: piece.widthMm, rotation: 90 },
  ];

  for (const orientation of orientations) {
    // Try positions along the bottom
    for (let y = bounds.padding; y <= bounds.height - bounds.padding - orientation.height; y += 10) {
      for (let x = bounds.padding; x <= bounds.width - bounds.padding - orientation.width; x += 10) {
        if (isValidPlacement(x, y, orientation.width, orientation.height, bounds, occupiedSpaces)) {
          const score = evaluatePlacement(x, y, orientation.width, orientation.height, occupiedSpaces);
          placements.push({ x, y, rotation: orientation.rotation, score });
        }
      }
    }
  }

  if (placements.length === 0) return null;

  // Sort by score (lower is better - closer to bottom-left)
  placements.sort((a, b) => a.score - b.score);

  return placements[0];
}

/**
 * Check if a placement is valid (within bounds and no overlaps)
 */
function isValidPlacement(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: Bounds,
  occupiedSpaces: Array<{ x: number; y: number; w: number; h: number }>
): boolean {
  // Check bounds
  if (
    x < bounds.padding ||
    y < bounds.padding ||
    x + width > bounds.width - bounds.padding ||
    y + height > bounds.height - bounds.padding
  ) {
    return false;
  }

  // Check overlaps
  for (const space of occupiedSpaces) {
    if (rectanglesOverlap(x, y, width, height, space.x, space.y, space.w, space.h)) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate placement quality (lower score is better)
 * Prefers bottom-left placement
 */
function evaluatePlacement(
  x: number,
  y: number,
  width: number,
  height: number,
  occupiedSpaces: Array<{ x: number; y: number; w: number; h: number }>
): number {
  // Score based on position (prefer lower Y, then lower X)
  const positionScore = y * 1000 + x;
  
  // Bonus for tight packing (proximity to other pieces)
  let proximityScore = 0;
  for (const space of occupiedSpaces) {
    const dist = Math.abs(x - space.x) + Math.abs(y - space.y);
    if (dist < 100) proximityScore -= 10;
  }

  return positionScore + proximityScore;
}

/**
 * Calculate layout statistics
 */
export function calculateLayoutStats(
  placedPieces: PlacedPiece[],
  bounds: Bounds
): LayoutCalculation {
  const totalSlabArea = (bounds.width - bounds.padding * 2) * (bounds.height - bounds.padding * 2);
  const usedArea = placedPieces.reduce(
    (sum, p) => sum + (p.widthMm * p.lengthMm),
    0
  );
  const wasteArea = totalSlabArea - usedArea;

  // Calculate remnants
  const remnants = calculateRemnants(placedPieces, bounds);

  return {
    totalPieces: placedPieces.length,
    placedPieces: placedPieces.length,
    totalSlabAreaSqm: totalSlabArea / 1_000_000,
    usedAreaSqm: usedArea / 1_000_000,
    wasteAreaSqm: wasteArea / 1_000_000,
    wastePercent: Math.round((wasteArea / totalSlabArea) * 1000) / 10,
    utilizationPercent: Math.round((usedArea / totalSlabArea) * 1000) / 10,
    remainingRemnants: remnants,
    estimatedMaterialCost: 0,
    estimatedWastageCost: 0,
  };
}

/**
 * Calculate remnant pieces from layout
 */
function calculateRemnants(
  placedPieces: PlacedPiece[],
  bounds: Bounds
): RemnantPiece[] {
  // Simplified remnant calculation
  // In production, this would use a proper 2D bin packing algorithm
  
  const remnants: RemnantPiece[] = [];
  const effectiveWidth = bounds.width - bounds.padding * 2;
  const effectiveHeight = bounds.height - bounds.padding * 2;

  // Find gaps between pieces (simplified)
  // This is a placeholder - real implementation would be more complex
  
  return remnants;
}

/**
 * Check if two rectangles overlap
 */
function rectanglesOverlap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number
): boolean {
  return (
    x1 < x2 + w2 &&
    x1 + w1 > x2 &&
    y1 < y2 + h2 &&
    y1 + h1 > y2
  );
}

/**
 * Generate a color for a piece
 */
function generatePieceColor(index: number): string {
  const colors = [
    '#dbeafe', // blue-100
    '#dcfce7', // green-100
    '#fef3c7', // amber-100
    '#fce7f3', // pink-100
    '#e0e7ff', // indigo-100
    '#d1fae5', // emerald-100
    '#fee2e2', // red-100
    '#f3e8ff', // purple-100
    '#cffafe', // cyan-100
    '#ffedd5', // orange-100
  ];
  return colors[index % colors.length];
}

/**
 * Calculate if a piece can fit in a specific remnant
 */
export function canFitInRemnant(
  piece: { widthMm: number; lengthMm: number },
  remnant: RemnantPiece
): boolean {
  return (
    (piece.widthMm <= remnant.widthMm && piece.lengthMm <= remnant.heightMm) ||
    (piece.lengthMm <= remnant.widthMm && piece.widthMm <= remnant.heightMm)
  );
}
