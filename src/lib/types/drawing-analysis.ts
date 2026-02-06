// Document categories
export type DocumentCategory = 'JOB_SHEET' | 'HAND_DRAWN' | 'CAD_DRAWING' | 'MIXED';
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
}

// Classification-only result (Stage 1)
export interface ClassificationResult {
  category: DocumentCategory;
  confidence: number;
  reason: string;
}

// Multi-slab types (re-export from calculator)
export type {
  CutPlan,
  Segment,
  JoinLocation,
  JoinStrategy,
} from '@/lib/services/multi-slab-calculator';
