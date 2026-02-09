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

// Multi-slab types (re-export from calculator)
export type {
  CutPlan,
  Segment,
  JoinLocation,
  JoinStrategy,
} from '@/lib/services/multi-slab-calculator';
