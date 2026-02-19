export interface CorrectionPayload {
  drawingId?: string;
  analysisId?: number;
  quoteId?: number;
  pieceId?: number;
  correctionType:
    | 'DIMENSION'
    | 'SHAPE'
    | 'CUTOUT_TYPE'
    | 'CUTOUT_QUANTITY'
    | 'EDGE_PROFILE'
    | 'ROOM_ASSIGNMENT'
    | 'MISSING_PIECE'
    | 'EXTRA_PIECE'
    | 'MATERIAL';
  fieldName: string;
  originalValue?: unknown;
  correctedValue: unknown;
  aiConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Log a correction to the API. Fire-and-forget — never blocks the UI.
 * Failures are silently logged to console, never shown to user.
 */
export async function logCorrection(
  payload: CorrectionPayload
): Promise<void> {
  try {
    await fetch('/api/drawing-corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawing_id: payload.drawingId,
        analysis_id: payload.analysisId,
        quote_id: payload.quoteId,
        piece_id: payload.pieceId,
        correction_type: payload.correctionType,
        field_name: payload.fieldName,
        original_value: payload.originalValue,
        corrected_value: payload.correctedValue,
        ai_confidence: payload.aiConfidence,
      }),
    });
  } catch (err) {
    console.error('Failed to log correction:', err);
    // Never throw — corrections are non-blocking
  }
}

/**
 * Helper: log a dimension correction (most common type)
 */
export function logDimensionCorrection(
  pieceId: number,
  field: 'length_mm' | 'width_mm' | 'thickness_mm',
  originalValue: number | null,
  correctedValue: number,
  quoteId?: number,
  drawingId?: string
): void {
  logCorrection({
    pieceId,
    quoteId,
    drawingId,
    correctionType: 'DIMENSION',
    fieldName: field,
    originalValue,
    correctedValue,
  });
}
