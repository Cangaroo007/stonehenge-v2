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
  // Shape decomposition tracking (L/U shapes split into component rects)
  groupId?: string;       // parent pieceId — all rects with same groupId must share a slab
  partIndex?: number;     // 0-based index within the group
  partLabel?: string;     // e.g. "Leg A", "Leg B", "Back"
  totalParts?: number;    // total rects in the group
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
  // Edge allowance applied (mm per side)
  edgeAllowanceMm?: number;
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
    // Shape decomposition data (optional — L/U shapes decomposed into component rects)
    shapeType?: string;
    shapeConfig?: unknown;
    grainMatched?: boolean;
  }>;
  slabWidth: number;
  slabHeight: number;
  kerfWidth: number;
  allowRotation: boolean;
  /** Slab edge allowance in mm — unusable material per side. Reduces usable area. */
  edgeAllowanceMm?: number;
  /** Kerf width (mm) for the MITRING machine — used for mitre strip width calculations.
   *  Falls back to kerfWidth if not provided. */
  mitreKerfWidth?: number;
}

// ── Multi-Material Optimisation Types ─────────────────────────────────────

export interface MultiMaterialOptimisationResult {
  materialGroups: MaterialGroupResult[];
  totalSlabCount: number;
  overallWastePercentage: number;
  warnings?: string[];
}

export interface MaterialGroupResult {
  materialId: string;
  materialName: string;
  slabDimensions: { length: number; width: number };
  pieces: Array<{
    pieceId: string;
    label: string;
    dimensions: { length: number; width: number };
  }>;
  slabCount: number;
  wastePercentage: number;
  slabLayouts: SlabResult[];
  oversizePieces: OversizePieceInfo[];
  /** Full OptimizationResult from the per-group FFD run */
  optimizationResult: OptimizationResult;
}

export interface OversizePieceInfo {
  pieceId: string;
  label: string;
  joinStrategy: 'LENGTHWISE' | 'WIDTHWISE' | 'MULTI_JOIN';
  segments: Array<{ length: number; width: number }>;
  suggestedJoinPosition_mm: number;
}

// ── Cutout display info for slab canvas overlay ────────────────────────────

export interface SlabCutoutInfo {
  typeName: string;
  quantity: number;
  width?: number;
  height?: number;
}

// Re-export for convenience
export type { Placement as SlabPlacement };
