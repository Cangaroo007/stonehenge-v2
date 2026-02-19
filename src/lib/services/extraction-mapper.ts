import { v4 as uuidv4 } from 'uuid';
import {
  DrawingAnalysisResult,
  ExtractedPiece,
  ExtractedCutout,
  ExtractedEdge,
  ClarificationQuestion,
  ConfidenceLevel,
  CutoutType,
  EdgeFinish,
  PieceShape,
} from '@/lib/types/drawing-analysis';
import type {
  DrawingAnalysisResultV2,
  ExtractedPieceV2,
  ExtractedRoomV2,
  ExtractedValue,
  ExtractedEdgeV2,
  ExtractedCutoutV2,
  UncertaintyFlag,
} from '@/lib/types/drawing-analysis';

/**
 * Converts v2 extraction results (with per-field confidence) to v1 format
 * for backwards compatibility with the existing import pipeline.
 *
 * LOW confidence values with null are converted to reasonable defaults
 * (0 for dimensions) so the user can fill them in via the UI.
 */
export function mapV2ToV1(v2Result: DrawingAnalysisResultV2): DrawingAnalysisResult {
  const pieces: ExtractedPiece[] = [];
  const clarificationQuestions: ClarificationQuestion[] = [];

  for (const room of v2Result.rooms) {
    for (const v2Piece of room.pieces) {
      const piece = mapPieceV2ToV1(v2Piece, room);
      pieces.push(piece);
    }
  }

  // Generate clarification questions from uncertainties
  for (const uncertainty of v2Result.uncertainties) {
    clarificationQuestions.push(mapUncertaintyToQuestion(uncertainty, pieces));
  }

  // Generate clarification questions from LOW confidence fields
  for (const piece of pieces) {
    const pieceQuestions = generateQuestionsFromPiece(piece);
    clarificationQuestions.push(...pieceQuestions);
  }

  // Build raw notes from summary notes
  const rawNotes = v2Result.summaryNotes.length > 0
    ? v2Result.summaryNotes.join('\n')
    : undefined;

  return {
    documentCategory: v2Result.documentCategory,
    categoryConfidence: v2Result.categoryConfidence,
    pieces,
    clarificationQuestions,
    rawNotes,
    overallConfidence: v2Result.overallConfidence,
  };
}

/** Extract the raw value from an ExtractedValue, using a fallback for null */
function unwrap<T>(ev: ExtractedValue<T | null>, fallback: T): T {
  return ev.value ?? fallback;
}

function mapPieceV2ToV1(v2Piece: ExtractedPieceV2, room: ExtractedRoomV2): ExtractedPiece {
  const id = uuidv4();

  // Map shape — v2 uses CUSTOM, v1 uses IRREGULAR
  const shapeValue = v2Piece.shape.value === 'CUSTOM' ? 'IRREGULAR' : v2Piece.shape.value;

  // Map edges
  const edges: ExtractedEdge[] = v2Piece.edges.map(mapEdgeV2ToV1);

  // Map cutouts
  const cutouts: ExtractedCutout[] = v2Piece.cutouts.map(mapCutoutV2ToV1);

  return {
    id,
    description: v2Piece.name.value,
    room: unwrap(v2Piece.room, room.name.value),
    shape: shapeValue as PieceShape,
    dimensions: {
      length: {
        value: unwrap(v2Piece.length_mm, 0),
        confidence: v2Piece.length_mm.confidence,
        note: v2Piece.length_mm.note,
      },
      width: {
        value: unwrap(v2Piece.width_mm, 0),
        confidence: v2Piece.width_mm.confidence,
        note: v2Piece.width_mm.note,
      },
      thickness: {
        value: v2Piece.thickness_mm.value,
        confidence: v2Piece.thickness_mm.confidence,
        note: v2Piece.thickness_mm.note,
      },
    },
    cutouts,
    edges,
    extractionConfidence: v2Piece.overallConfidence,
  };
}

function mapEdgeV2ToV1(v2Edge: ExtractedEdgeV2): ExtractedEdge {
  // Map v2 finish values to v1 EdgeFinish
  const finishMap: Record<string, EdgeFinish> = {
    'RAW': 'RAW',
    'POLISHED': 'POLISHED_20MM',
    'LAMINATED': 'POLISHED_40MM',
    'MITRED': 'POLISHED_20MM', // Mitred edges have polished finish in v1
  };

  const finish = finishMap[v2Edge.finish.value] || 'UNKNOWN';

  return {
    side: v2Edge.side,
    finish,
    confidence: v2Edge.finish.confidence,
    notation: v2Edge.finish.source,
  };
}

function mapCutoutV2ToV1(v2Cutout: ExtractedCutoutV2): ExtractedCutout {
  // Map v2 cutout type string to v1 CutoutType
  const typeMap: Record<string, CutoutType> = {
    'UNDERMOUNT_SINK': 'UNDERMOUNT_SINK',
    'DROP_IN_SINK': 'DROP_IN_SINK',
    'COOKTOP': 'HOTPLATE',
    'HOTPLATE': 'HOTPLATE',
    'BASIN': 'BASIN',
    'GPO': 'GPO',
    'TAP_HOLE': 'TAP',
    'TAP': 'TAP',
    'DRAINER': 'DRAINER',
    'FLUSH_COOKTOP': 'FLUSH_COOKTOP',
  };

  const cutoutType = typeMap[v2Cutout.type.value] || 'OTHER';

  return {
    type: cutoutType,
    position: v2Cutout.position?.value,
    confidence: v2Cutout.type.confidence,
  };
}

function mapUncertaintyToQuestion(
  uncertainty: UncertaintyFlag,
  pieces: ExtractedPiece[]
): ClarificationQuestion {
  const piece = uncertainty.pieceIndex !== undefined
    ? pieces[uncertainty.pieceIndex]
    : undefined;

  const pieceLabel = piece?.description || piece?.room || piece?.id;

  // Determine priority based on field type
  let priority: 'CRITICAL' | 'IMPORTANT' | 'NICE_TO_KNOW' = 'IMPORTANT';
  let category: 'DIMENSION' | 'CUTOUT' | 'EDGE' | 'MATERIAL' | 'QUANTITY' = 'DIMENSION';

  if (uncertainty.field.includes('length') || uncertainty.field.includes('width')) {
    priority = 'CRITICAL';
    category = 'DIMENSION';
  } else if (uncertainty.field.includes('cutout')) {
    priority = 'IMPORTANT';
    category = 'CUTOUT';
  } else if (uncertainty.field.includes('edge') || uncertainty.field.includes('finish')) {
    priority = 'IMPORTANT';
    category = 'EDGE';
  }

  const question = pieceLabel
    ? `${uncertainty.issue} (${pieceLabel})`
    : uncertainty.issue;

  return {
    id: uuidv4(),
    pieceId: piece?.id,
    category,
    priority,
    question,
    defaultValue: uncertainty.suggestion,
  };
}

function generateQuestionsFromPiece(piece: ExtractedPiece): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  const pieceLabel = piece.description || piece.room || piece.id;

  // Flag 0-value dimensions (which came from null v2 values)
  if (piece.dimensions.length.value === 0) {
    questions.push({
      id: uuidv4(),
      pieceId: piece.id,
      category: 'DIMENSION',
      priority: 'CRITICAL',
      question: `What is the length of "${pieceLabel}"?${piece.dimensions.length.note ? ` (${piece.dimensions.length.note})` : ''}`,
    });
  }

  if (piece.dimensions.width.value === 0) {
    questions.push({
      id: uuidv4(),
      pieceId: piece.id,
      category: 'DIMENSION',
      priority: 'CRITICAL',
      question: `What is the width of "${pieceLabel}"?${piece.dimensions.width.note ? ` (${piece.dimensions.width.note})` : ''}`,
    });
  }

  return questions;
}
