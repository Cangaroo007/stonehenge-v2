import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import {
  ClassificationResult,
  ClarificationQuestion,
  ConfidenceLevel,
  DocumentCategory,
  DrawingAnalysisResult,
  EdgeDetectionResult,
  ExtractedPiece,
} from '@/lib/types/drawing-analysis';
import { detectEdgesForAllPieces, getEdgesNeedingReview } from './edge-detector';
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  CLASSIFICATION_USER_PROMPT,
} from '@/lib/prompts/classification';
import {
  JOB_SHEET_EXTRACTION_SYSTEM_PROMPT,
  JOB_SHEET_EXTRACTION_USER_PROMPT,
} from '@/lib/prompts/extraction-job-sheet';
import {
  HAND_DRAWN_EXTRACTION_SYSTEM_PROMPT,
  HAND_DRAWN_EXTRACTION_USER_PROMPT,
} from '@/lib/prompts/extraction-hand-drawn';
import {
  CAD_EXTRACTION_SYSTEM_PROMPT,
  CAD_EXTRACTION_USER_PROMPT,
} from '@/lib/prompts/extraction-cad';
import { extractElevationAreas } from './spatial-extractor';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Stage 1: Classify the document type
 */
export async function classifyDocument(
  imageBase64: string,
  mimeType: string
): Promise<ClassificationResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: CLASSIFICATION_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: imageBase64,
          },
        },
        { type: 'text', text: CLASSIFICATION_USER_PROMPT },
      ],
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Clean up response (remove markdown code blocks if present)
  const jsonStr = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    return JSON.parse(jsonStr) as ClassificationResult;
  } catch {
    console.error('Failed to parse classification response:', text);
    return {
      category: 'MIXED',
      confidence: 0.5,
      reason: 'Failed to parse AI response',
    };
  }
}

function getExtractionPrompts(category: DocumentCategory): { system: string; user: string } {
  switch (category) {
    case 'JOB_SHEET':
      return {
        system: JOB_SHEET_EXTRACTION_SYSTEM_PROMPT,
        user: JOB_SHEET_EXTRACTION_USER_PROMPT,
      };
    case 'HAND_DRAWN':
      return {
        system: HAND_DRAWN_EXTRACTION_SYSTEM_PROMPT,
        user: HAND_DRAWN_EXTRACTION_USER_PROMPT,
      };
    case 'CAD_DRAWING':
      return {
        system: CAD_EXTRACTION_SYSTEM_PROMPT,
        user: CAD_EXTRACTION_USER_PROMPT,
      };
    default:
      // Use job sheet as default - most common
      return {
        system: JOB_SHEET_EXTRACTION_SYSTEM_PROMPT,
        user: JOB_SHEET_EXTRACTION_USER_PROMPT,
      };
  }
}

/**
 * Stage 2: Extract pieces based on document type
 */
export async function extractPieces(
  imageBase64: string,
  mimeType: string,
  category: DocumentCategory
): Promise<ExtractedPiece[]> {
  const prompts = getExtractionPrompts(category);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: prompts.system,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: imageBase64,
          },
        },
        { type: 'text', text: prompts.user },
      ],
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const result = JSON.parse(jsonStr);
    return result.pieces || [];
  } catch (error) {
    console.error('Failed to parse extraction response:', text);
    return [];
  }
}

function calculateOverallConfidence(pieces: ExtractedPiece[]): ConfidenceLevel {
  if (pieces.length === 0) return 'LOW';

  const confidences = pieces.map(p => p.extractionConfidence);
  const lowCount = confidences.filter(c => c === 'LOW').length;
  const highCount = confidences.filter(c => c === 'HIGH').length;

  if (lowCount > pieces.length / 2) return 'LOW';
  if (highCount > pieces.length / 2) return 'HIGH';
  return 'MEDIUM';
}

/**
 * Stage 3: Generate clarification questions for uncertain extractions
 */
export function generateClarificationQuestions(
  pieces: ExtractedPiece[]
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  
  for (const piece of pieces) {
    const pieceLabel = piece.description || piece.room || piece.id;
    
    // Check for LOW confidence dimensions
    if (piece.dimensions.length.confidence === 'LOW') {
      questions.push({
        id: uuidv4(),
        pieceId: piece.id,
        category: 'DIMENSION',
        priority: 'CRITICAL',
        question: `What is the length of "${pieceLabel}"?`,
        options: piece.dimensions.length.note 
          ? undefined 
          : ['Check measurement', 'Confirm as shown'],
      });
    }
    
    if (piece.dimensions.width.confidence === 'LOW') {
      questions.push({
        id: uuidv4(),
        pieceId: piece.id,
        category: 'DIMENSION',
        priority: 'CRITICAL',
        question: `What is the width of "${pieceLabel}"?`,
      });
    }
    
    // Check for missing thickness
    if (!piece.dimensions.thickness) {
      questions.push({
        id: uuidv4(),
        pieceId: piece.id,
        category: 'DIMENSION',
        priority: 'IMPORTANT',
        question: `What thickness is "${pieceLabel}"?`,
        options: ['20mm', '30mm', '40mm'],
        defaultValue: '20mm',
      });
    }
    
    // Check for LOW confidence cutouts
    for (const cutout of piece.cutouts) {
      if (cutout.confidence === 'LOW') {
        questions.push({
          id: uuidv4(),
          pieceId: piece.id,
          category: 'CUTOUT',
          priority: 'IMPORTANT',
          question: `Confirm cutout type in "${pieceLabel}": Is this a ${cutout.type.replace(/_/g, ' ').toLowerCase()}?`,
          options: ['Yes', 'No - Different type', 'No cutout here'],
        });
      }
      
      // Cutouts without dimensions (for undermount sinks, etc.)
      if (cutout.type === 'UNDERMOUNT_SINK' && !cutout.dimensions) {
        questions.push({
          id: uuidv4(),
          pieceId: piece.id,
          category: 'CUTOUT',
          priority: 'IMPORTANT',
          question: `What are the dimensions of the undermount sink cutout in "${pieceLabel}"?`,
        });
      }
    }
    
    // Check for UNKNOWN edge finishes
    for (const edge of piece.edges) {
      if (edge.finish === 'UNKNOWN') {
        questions.push({
          id: uuidv4(),
          pieceId: piece.id,
          category: 'EDGE',
          priority: 'IMPORTANT',
          question: `What is the edge finish for the ${edge.side.toLowerCase()} edge of "${pieceLabel}"?`,
          options: ['20mm Polished', '40mm Polished', 'Raw/Unfinished', 'Bullnose', 'Pencil Round'],
        });
      }
    }
    
    // Check for missing room
    if (!piece.room) {
      questions.push({
        id: uuidv4(),
        pieceId: piece.id,
        category: 'MATERIAL',
        priority: 'NICE_TO_KNOW',
        question: `Which room is "${pieceLabel}" for?`,
        options: ['Kitchen', 'Bathroom', 'Laundry', 'Outdoor', 'Other'],
      });
    }
  }
  
  // Sort by priority: CRITICAL first, then IMPORTANT, then NICE_TO_KNOW
  const priorityOrder = { CRITICAL: 0, IMPORTANT: 1, NICE_TO_KNOW: 2 };
  questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return questions;
}

/**
 * Full analysis pipeline (Stages 1-3)
 */
export async function analyzeDrawing(
  imageBase64: string,
  mimeType: string
): Promise<DrawingAnalysisResult> {
  // Stage 1: Classify
  const classification = await classifyDocument(imageBase64, mimeType);

  // Elevation drawings use a separate extraction pipeline
  if (classification.category === 'ELEVATION') {
    const elevationAnalysis = await extractElevationAreas(imageBase64, mimeType);

    return {
      documentCategory: 'ELEVATION',
      categoryConfidence: classification.confidence,
      pieces: [],
      clarificationQuestions: [],
      overallConfidence: elevationAnalysis.overallConfidence >= 0.7 ? 'HIGH'
        : elevationAnalysis.overallConfidence >= 0.4 ? 'MEDIUM' : 'LOW',
      elevationAnalysis,
    };
  }

  // Stage 2: Extract pieces based on category
  const pieces = await extractPieces(imageBase64, mimeType, classification.category);

  // Stage 2.5: Run edge detection on extracted pieces
  const edgeResults = detectEdgesForAllPieces(pieces, classification.category);

  // Merge detected edges back into pieces (overwrite the raw extraction edges)
  for (const result of edgeResults) {
    const piece = pieces.find((p) => p.id === result.pieceId);
    if (piece) {
      piece.edges = result.edges.map((de) => ({
        side: de.side,
        finish: de.finish,
        confidence: de.confidence,
        notation: de.notation,
      }));
    }
  }

  // Stage 3: Generate clarification questions
  const clarificationQuestions = generateClarificationQuestions(pieces);

  // Add edge review items as additional clarification questions
  const reviewItems = getEdgesNeedingReview(edgeResults);
  for (const item of reviewItems) {
    const piece = pieces.find((p) => p.id === item.pieceId);
    clarificationQuestions.push({
      id: `${item.pieceId}-edge-${item.edge.side.toLowerCase()}`,
      pieceId: item.pieceId,
      category: 'EDGE',
      priority: 'IMPORTANT',
      question: `What is the edge finish on the ${item.edge.side.toLowerCase()} side of ${
        piece?.description || item.pieceId
      }?${item.edge.reviewReason ? ` (${item.edge.reviewReason})` : ''}`,
      options: ['Polished 20mm', 'Polished 40mm', 'Bullnose', 'Pencil Round', 'Raw'],
    });
  }

  // Calculate overall confidence
  const overallConfidence = calculateOverallConfidence(pieces);

  return {
    documentCategory: classification.category,
    categoryConfidence: classification.confidence,
    pieces,
    clarificationQuestions,
    overallConfidence,
    edgeDetectionResults: edgeResults,
  };
}

/**
 * Helper to convert file to base64
 */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
