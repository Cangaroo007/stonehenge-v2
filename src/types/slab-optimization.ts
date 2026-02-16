/**
 * Slab Optimization Types
 * Used by the bin-packing algorithm and API endpoints
 */

// NEW: Which edges are finished (polished) - needed for 40mm+ lamination
export interface FinishedEdges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface Placement {
  pieceId: string;
  slabIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  label: string;
  // Lamination tracking
  isLaminationStrip?: boolean;
  parentPieceId?: string;
  stripPosition?: 'top' | 'bottom' | 'left' | 'right';
  // Oversize piece segment tracking
  isSegment?: boolean;
  segmentIndex?: number;
  totalSegments?: number;
  // Machine/cutting info
  machineName?: string;
  kerfWidthMm?: number;
}

export interface SlabResult {
  slabIndex: number;
  width: number;
  height: number;
  placements: Placement[];
  usedArea: number;
  wasteArea: number;
  wastePercent: number;
}

// NEW: Lamination summary for reporting
export interface LaminationSummary {
  totalStrips: number;
  totalStripArea: number; // m²
  stripsByParent: Array<{
    parentPieceId: string;
    parentLabel: string;
    strips: Array<{
      position: string;
      lengthMm: number;
      widthMm: number;
    }>;
  }>;
}

export interface OptimizationResult {
  placements: Placement[];
  slabs: SlabResult[];
  totalSlabs: number;
  totalUsedArea: number;
  totalWasteArea: number;
  wastePercent: number;
  unplacedPieces: string[];
  // Lamination summary
  laminationSummary?: LaminationSummary;
  // Warnings from the optimizer (oversize splits, etc.)
  warnings?: string[];
}

// Edge type info for each edge (used to determine strip width)
export interface EdgeTypeInfo {
  top?: string;    // Edge type name, e.g. '40mm Mitre', '20mm Polished'
  bottom?: string;
  left?: string;
  right?: string;
}

export interface OptimizationInput {
  pieces: Array<{
    id: string;
    width: number;
    height: number;
    label: string;
    canRotate?: boolean;
    // Thickness tracking (20mm, 40mm, 60mm, etc.)
    thickness?: number;
    // Which edges need lamination strips
    finishedEdges?: FinishedEdges;
    // Edge type names per edge (for determining strip widths)
    edgeTypeNames?: EdgeTypeInfo;
  }>;
  slabWidth: number;
  slabHeight: number;
  kerfWidth: number;
  allowRotation: boolean;
}

// Re-export for convenience
export type { Placement as SlabPlacement };
