import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { 
  DrawingAnalysisResult, 
  ExtractedPiece,
  ClarificationQuestion,
  ConfidenceLevel,
} from '@/lib/types/drawing-analysis';

interface RefineRequest {
  analysisResult: DrawingAnalysisResult;
  answers: Record<string, string>;
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  
  try {
    const body: RefineRequest = await request.json();
    const { analysisResult, answers } = body;
    
    // Apply answers to refine the extracted pieces
    const refinedPieces = applyAnswers(
      analysisResult.pieces, 
      analysisResult.clarificationQuestions,
      answers
    );
    
    // Remove answered questions, regenerate if needed
    const remainingQuestions = analysisResult.clarificationQuestions.filter(
      q => !answers[q.id]
    );
    
    return NextResponse.json({
      ...analysisResult,
      pieces: refinedPieces,
      clarificationQuestions: remainingQuestions,
      overallConfidence: calculateRefinedConfidence(refinedPieces),
    });
    
  } catch (error) {
    console.error('Refine error:', error);
    return NextResponse.json({ error: 'Failed to refine analysis' }, { status: 500 });
  }
}

function applyAnswers(
  pieces: ExtractedPiece[],
  questions: ClarificationQuestion[],
  answers: Record<string, string>
): ExtractedPiece[] {
  return pieces.map(piece => {
    const pieceCopy = JSON.parse(JSON.stringify(piece)) as ExtractedPiece;
    
    // Find questions for this piece
    const pieceQuestions = questions.filter(q => q.pieceId === piece.id);
    
    for (const question of pieceQuestions) {
      const answer = answers[question.id];
      if (!answer) continue;
      
      switch (question.category) {
        case 'DIMENSION':
          if (question.question.includes('length')) {
            const value = parseInt(answer, 10);
            if (!isNaN(value)) {
              pieceCopy.dimensions.length = { value, confidence: 'HIGH' };
            }
          } else if (question.question.includes('width')) {
            const value = parseInt(answer, 10);
            if (!isNaN(value)) {
              pieceCopy.dimensions.width = { value, confidence: 'HIGH' };
            }
          } else if (question.question.includes('thickness')) {
            const value = parseInt(answer.replace('mm', ''), 10);
            if (!isNaN(value)) {
              pieceCopy.dimensions.thickness = { value, confidence: 'HIGH' };
            }
          }
          break;
          
        case 'EDGE':
          // Find the edge mentioned in the question
          const sideMatch = question.question.match(/\b(front|back|left|right|top|bottom)\b/i);
          if (sideMatch) {
            const side = sideMatch[1].toUpperCase() as ExtractedPiece['edges'][0]['side'];
            const edge = pieceCopy.edges.find(e => e.side === side);
            if (edge) {
              edge.finish = mapAnswerToEdgeFinish(answer);
              edge.confidence = 'HIGH';
            }
          }
          break;
          
        case 'MATERIAL':
          if (question.question.includes('room')) {
            pieceCopy.room = answer;
          }
          break;
      }
    }
    
    // Recalculate extraction confidence
    pieceCopy.extractionConfidence = calculatePieceConfidence(pieceCopy);
    
    return pieceCopy;
  });
}

function mapAnswerToEdgeFinish(answer: string): ExtractedPiece['edges'][0]['finish'] {
  const normalized = answer.toLowerCase();
  if (normalized.includes('20mm') || normalized.includes('20 mm')) return 'POLISHED_20MM';
  if (normalized.includes('40mm') || normalized.includes('40 mm')) return 'POLISHED_40MM';
  if (normalized.includes('bullnose')) return 'BULLNOSE';
  if (normalized.includes('pencil')) return 'PENCIL_ROUND';
  if (normalized.includes('raw') || normalized.includes('unfinished')) return 'RAW';
  return 'UNKNOWN';
}

function calculatePieceConfidence(piece: ExtractedPiece): ConfidenceLevel {
  const confidences: ConfidenceLevel[] = [
    piece.dimensions.length.confidence,
    piece.dimensions.width.confidence,
    ...piece.edges.map(e => e.confidence),
    ...piece.cutouts.map(c => c.confidence),
  ];
  
  const lowCount = confidences.filter(c => c === 'LOW').length;
  const highCount = confidences.filter(c => c === 'HIGH').length;
  
  if (lowCount > 0) return 'LOW';
  if (highCount === confidences.length) return 'HIGH';
  return 'MEDIUM';
}

function calculateRefinedConfidence(pieces: ExtractedPiece[]): ConfidenceLevel {
  if (pieces.length === 0) return 'LOW';
  
  const confidences = pieces.map(p => p.extractionConfidence);
  const lowCount = confidences.filter(c => c === 'LOW').length;
  const highCount = confidences.filter(c => c === 'HIGH').length;
  
  if (lowCount > 0) return 'LOW';
  if (highCount === pieces.length) return 'HIGH';
  return 'MEDIUM';
}
