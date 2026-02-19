// Document categories
export type DocumentCategory = 'JOB_SHEET' | 'HAND_DRAWN' | 'CAD_DRAWING' | 'ELEVATION' | 'MIXED';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

// Dimension with confidence
export interface ExtractedDimension {
  value: number;           // Always in mm
  confidence: ConfidenceLevel;
  note?: string;           // e.g., "unclear handwriting"
}

// Cutout types matching Northcoast Stone's terminology
export type CutoutType =
  | 'HOTPLATE'
  | 'UNDERMOUNT_SINK'
  | 'DROP_IN_SINK'
  | 'BASIN'
  | 'GPO'
  | 'TAP'
  | 'DRAINER'
  | 'FLUSH_COOKTOP'
  | 'OTHER';

// Edge finishes
export type EdgeFinish =
  | 'POLISHED_20MM'
  | 'POLISHED_40MM'
  | 'BULLNOSE'
  | 'PENCIL_ROUND'
  | 'BEVELLED'
  | 'RAW'
  | 'UNKNOWN';

// Extracted cutout from drawing
export interface ExtractedCutout {
  type: CutoutType;
  position?: string;       // e.g., "centre", "left side"
  dimensions?: {
    length: ExtractedDimension;
    width: ExtractedDimension;
  };
  confidence: ConfidenceLevel;
}

// Extracted edge from drawing
export interface ExtractedEdge {
  side: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'FRONT' | 'BACK';
  finish: EdgeFinish;
  lengthMm?: number;
  confidence: ConfidenceLevel;
  notation?: string;  // Raw symbol/text observed on drawing (e.g., "X", "//", "○")
}

// Piece shapes
export type PieceShape = 'RECTANGLE' | 'L_SHAPE' | 'U_SHAPE' | 'IRREGULAR';

// Complete extracted piece
export interface ExtractedPiece {
  id: string;
  description?: string;    // e.g., "Main Benchtop"
  room?: string;           // e.g., "Kitchen", "Bathroom"
  shape: PieceShape;
  dimensions: {
    length: ExtractedDimension;
    width: ExtractedDimension;
    thickness?: ExtractedDimension;
  };
  cutouts: ExtractedCutout[];
  edges: ExtractedEdge[];
  extractionConfidence: ConfidenceLevel;
}

// Clarification question for uncertain extractions
export interface ClarificationQuestion {
  id: string;
  pieceId?: string;
  category: 'DIMENSION' | 'CUTOUT' | 'EDGE' | 'MATERIAL' | 'QUANTITY';
  priority: 'CRITICAL' | 'IMPORTANT' | 'NICE_TO_KNOW';
  question: string;
  options?: string[];      // For multiple choice
  defaultValue?: string;
}

// Complete analysis result
export interface DrawingAnalysisResult {
  documentCategory: DocumentCategory;
  categoryConfidence: number;  // 0.0 - 1.0
  pieces: ExtractedPiece[];
  clarificationQuestions: ClarificationQuestion[];
  rawNotes?: string;           // Any text extracted from drawing
  overallConfidence: ConfidenceLevel;
  elevationAnalysis?: ElevationAnalysis;       // Populated when category is ELEVATION
  edgeDetectionResults?: EdgeDetectionResult[]; // Populated after edge detection (8.2)
  deductionSummary?: ElevationDeductionSummary; // Populated for ELEVATION documents (8.3)
}

// Classification-only result (Stage 1)
export interface ClassificationResult {
  category: DocumentCategory;
  confidence: number;
  reason: string;
}

// ──── Elevation Analysis Types (8.1) ────

export type OpeningType = 'WINDOW' | 'DOOR' | 'NICHE' | 'OTHER';

export interface ElevationOpening {
  type: OpeningType;
  dimensions: {
    width: number;   // mm
    height: number;  // mm
  };
  position: {
    x: number;       // mm from left edge of face
    y: number;       // mm from bottom edge of face
  };
  confidence: number; // 0-1
}

export interface StoneFace {
  id: string;
  name: string;                    // e.g., "Feature Wall A", "Kitchen Splashback"
  grossDimensions: {
    width: number;                 // mm
    height: number;                // mm
  };
  openings: ElevationOpening[];
  netArea_sqm: number;            // gross minus openings
  stoneFinish?: string;           // if annotated on drawing
  materialCallout?: string;       // e.g., "Caesarstone Calacatta Maximus"
  confidence: number;             // 0-1
}

export interface ElevationAnalysis {
  stoneFaces: StoneFace[];
  overallConfidence: number;       // 0-1
  drawingScale?: string;          // e.g., "1:50", "1:100" if detected
  notes?: string[];               // any relevant observations
}

// ──── Edge Detection Types (8.2) ────

export type EdgeProfileType = 'PENCIL_ROUND' | 'BULLNOSE' | 'OGEE' | 'BEVELED' | 'NONE';

export interface DetectedEdge {
  side: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'FRONT' | 'BACK';
  finish: EdgeFinish;
  profileType: EdgeProfileType;
  confidence: ConfidenceLevel;
  notation?: string;          // raw symbol/text seen on drawing (e.g., "X", "//", "○")
  needsReview: boolean;       // true if confidence is LOW or finish is UNKNOWN
  reviewReason?: string;      // why it needs review (e.g., "Ambiguous notation near corner")
}

export interface EdgeDetectionResult {
  pieceId: string;
  edges: DetectedEdge[];
  overallConfidence: ConfidenceLevel;
  notationSystem?: string;    // e.g., "NORTHCOAST_STANDARD" if recognised
}

/**
 * Notation mapping for a specific tenant.
 * Keys are the notation symbols found on drawings.
 * Values are the edge finish they represent.
 */
export interface EdgeNotationMap {
  [notation: string]: {
    finish: EdgeFinish;
    profileType?: EdgeProfileType;
    description: string;
  };
}

// ──── Cutout Deduction Types (8.3) ────

export interface DeductionWarning {
  faceId: string;
  type: 'OPENING_EXCEEDS_FACE' | 'TOTAL_DEDUCTION_EXCEEDS_GROSS' | 'ZERO_DIMENSION' | 'OVERLAPPING_OPENINGS';
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export interface OpeningDeduction {
  type: string;                    // 'WINDOW' | 'DOOR' | 'NICHE' | 'OTHER'
  dimensions: {
    width: number;                 // mm
    height: number;                // mm
  };
  area_sqm: number;               // area of this opening
  perimeter_Lm: number;           // perimeter of this opening (for cutting)
}

export interface DeductionResult {
  faceId: string;
  faceName: string;
  grossDimensions: {
    width: number;                 // mm
    height: number;                // mm
  };
  grossArea_sqm: number;
  openings: OpeningDeduction[];
  totalDeduction_sqm: number;      // sum of all opening areas
  netArea_sqm: number;             // grossArea - totalDeduction
  outerPerimeter_Lm: number;       // perimeter of the stone face itself
  openingPerimeters_Lm: number;    // sum of all opening perimeters
  totalCuttingPerimeter_Lm: number; // outer + opening perimeters (for cutting cost)
  deductionPercentage: number;     // % of gross area that is openings
  warnings: DeductionWarning[];
}

export interface ElevationDeductionSummary {
  faceResults: DeductionResult[];
  totalGrossArea_sqm: number;
  totalNetArea_sqm: number;
  totalDeduction_sqm: number;
  totalCuttingPerimeter_Lm: number;
  overallDeductionPercentage: number;
  warnings: DeductionWarning[];    // aggregated from all faces
}

// ──── V2 Uncertainty-First Extraction Types (DA2.1) ────

/**
 * A value extracted by AI with confidence metadata.
 * HIGH = clearly readable on drawing, confident in extraction
 * MEDIUM = partially readable or inferred from context, may need verification
 * LOW = uncertain, guessed, or not visible — needs manual input
 */
export interface ExtractedValue<T> {
  value: T;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source?: string;  // e.g., 'dimension line', 'inferred from adjacent piece', 'label text'
  note?: string;    // e.g., 'dimension partially obscured by annotation'
}

export interface ExtractedPieceV2 {
  name: ExtractedValue<string>;
  room: ExtractedValue<string>;
  length_mm: ExtractedValue<number | null>;   // null = couldn't determine
  width_mm: ExtractedValue<number | null>;
  thickness_mm: ExtractedValue<number>;
  shape: ExtractedValue<'RECTANGLE' | 'L_SHAPE' | 'U_SHAPE' | 'CUSTOM'>;
  edges: ExtractedEdgeV2[];
  cutouts: ExtractedCutoutV2[];
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  extractionNotes: string[];  // meaningful notes only, not filler
}

export interface ExtractedEdgeV2 {
  side: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT';
  finish: ExtractedValue<'RAW' | 'POLISHED' | 'LAMINATED' | 'MITRED'>;
  profileType?: ExtractedValue<string>;
}

export interface ExtractedCutoutV2 {
  type: ExtractedValue<string>;   // UNDERMOUNT_SINK, COOKTOP, TAP_HOLE, etc.
  quantity: ExtractedValue<number>;
  position?: ExtractedValue<string>;  // 'centred', '450mm from left', etc.
}

export interface DrawingAnalysisResultV2 {
  documentCategory: DocumentCategory;
  categoryConfidence: number;
  rooms: ExtractedRoomV2[];
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  summaryNotes: string[];         // high-level observations
  uncertainties: UncertaintyFlag[];  // specific things needing human review
}

export interface ExtractedRoomV2 {
  name: ExtractedValue<string>;
  pieces: ExtractedPieceV2[];
  roomConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface UncertaintyFlag {
  pieceIndex?: number;
  field: string;         // e.g., 'length_mm', 'cutout.type'
  issue: string;         // human-readable: 'Dimension line partially obscured'
  suggestion?: string;   // 'Appears to be ~2400mm based on adjacent piece'
}

// Multi-slab types (re-export from calculator)
export type {
  CutPlan,
  Segment,
  JoinLocation,
  JoinStrategy,
} from '@/lib/services/multi-slab-calculator';

// ──── Slab Fit Adapter Types (8.4) ────

/**
 * Configuration for the slab fit pipeline.
 * Combines material info with slab dimensions.
 */
export interface SlabFitConfig {
  materialCategory: string;           // e.g., 'ENGINEERED_QUARTZ_JUMBO'
  slabWidth: number;                  // mm (maps to slab lengthMm)
  slabHeight: number;                 // mm (maps to slab widthMm)
  kerfWidth: number;                  // mm (default 8)
  allowRotation: boolean;             // default true
  thickness: number;                  // mm (20 or 40) — affects lamination strips
}

/**
 * A piece derived from an elevation stone face for slab fitting.
 */
export interface SlabFitPiece {
  id: string;
  label: string;
  sourceFaceId: string;               // links back to the StoneFace this came from
  width: number;                      // mm
  height: number;                     // mm
  isSplitPiece: boolean;              // true if face was split to fit on slab
  splitIndex?: number;                // 0, 1, 2... if split
}

/**
 * Result of the full pipeline:
 * Elevation Analysis → Deduction → Optimiser → Pricing Data
 */
export interface SlabFitResult {
  /** Pieces generated from elevation faces (may include split pieces for oversized faces) */
  pieces: SlabFitPiece[];
  /** Raw optimizer result */
  optimizerResult: {
    placements: Array<{
      pieceId: string;
      slabIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      rotated: boolean;
      label: string;
    }>;
    slabs: Array<{
      slabIndex: number;
      width: number;
      height: number;
      usedArea: number;
      wasteArea: number;
      wastePercent: number;
    }>;
    totalSlabs: number;
    totalUsedArea: number;
    totalWasteArea: number;
    wastePercent: number;
    unplacedPieces: string[];
  };
  /** Summary for pricing */
  slabCount: number;
  totalWastePercent: number;
  unplacedPieces: string[];           // IDs of pieces that didn't fit
  /** Pricing inputs */
  totalNetArea_sqm: number;           // for PER_SQUARE_METRE pricing
  totalCuttingPerimeter_Lm: number;   // for cutting cost
}
