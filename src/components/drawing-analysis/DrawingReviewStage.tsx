'use client';

import { useState, useMemo, useCallback } from 'react';
import { DrawingCatalogue } from '@/lib/types/drawing-catalogue';
import { logCorrection, CorrectionPayload } from '@/lib/services/correction-logger';

interface EdgeSelections {
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
}

interface ExtractedPiece {
  id: string;
  pieceNumber: number;
  name: string;
  shape?: string;
  length: number;
  width: number;
  thickness: number;
  room: string;
  confidence: number;
  notes: string | null;
  cutouts: { type: string }[];
  isEditing: boolean;
  edgeSelections: EdgeSelections;
}

interface DrawingReviewStageProps {
  pieces: ExtractedPiece[];
  catalogue: DrawingCatalogue;
  onConfirm: (pieces: ExtractedPiece[]) => void;
  onBack?: () => void;
  quoteId?: number;
  drawingId?: string;
  analysisId?: number;
}

function confidenceLevel(c: number): 'high' | 'amber' | 'red' {
  if (c >= 0.85) return 'high';
  if (c >= 0.50) return 'amber';
  return 'red';
}

function aiConfidenceLabel(c: number): CorrectionPayload['aiConfidence'] {
  if (c >= 0.85) return 'HIGH';
  if (c >= 0.50) return 'MEDIUM';
  return 'LOW';
}

function cellClassName(piece: ExtractedPiece, isNull: boolean): string {
  if (isNull || piece.confidence < 0.50) {
    return 'bg-red-50 border-red-200';
  }
  if (piece.confidence < 0.85) {
    return 'bg-amber-50 border-amber-200';
  }
  return '';
}

function cellTooltip(piece: ExtractedPiece, isNull: boolean): string | undefined {
  if (isNull) return 'Missing value — must be set before importing';
  if (piece.confidence < 0.50) return 'AI confidence is low — verify this value';
  if (piece.confidence < 0.85) return 'AI was less certain about this value — verify before importing';
  return undefined;
}

function countFinishedEdges(edges: EdgeSelections): number {
  return [edges.edgeTop, edges.edgeBottom, edges.edgeLeft, edges.edgeRight]
    .filter(e => e !== null && e !== '').length;
}

const SHAPE_LABELS: Record<string, string> = {
  RECTANGLE: 'Rectangle',
  L_SHAPE: 'L-Shape',
  U_SHAPE: 'U-Shape',
  IRREGULAR: 'Irregular',
  ROUNDED_RECTANGLE: 'Rounded Rect',
};

export function DrawingReviewStage({
  pieces: initialPieces,
  catalogue,
  onConfirm,
  onBack,
  quoteId,
  drawingId,
  analysisId,
}: DrawingReviewStageProps) {
  const [pieces, setPieces] = useState<ExtractedPiece[]>(initialPieces);
  const [editingCutouts, setEditingCutouts] = useState<string | null>(null);

  // Group pieces by room for visual sections
  const roomGroups = useMemo(() => {
    const groups: { name: string; pieces: ExtractedPiece[] }[] = [];
    const roomMap = new Map<string, ExtractedPiece[]>();
    for (const piece of pieces) {
      const room = piece.room || 'Unassigned';
      if (!roomMap.has(room)) {
        roomMap.set(room, []);
        groups.push({ name: room, pieces: roomMap.get(room)! });
      }
      roomMap.get(room)!.push(piece);
    }
    return groups;
  }, [pieces]);

  // Count red and amber cells
  const { redCount, amberCount } = useMemo(() => {
    let red = 0;
    let amber = 0;
    for (const p of pieces) {
      const level = confidenceLevel(p.confidence);
      // Each dimension cell (length, width, thickness) counts individually
      if (p.length === 0 || p.length === null) red++;
      else if (level === 'red') red++;
      else if (level === 'amber') amber++;

      if (p.width === 0 || p.width === null) red++;
      else if (level === 'red') red++;
      else if (level === 'amber') amber++;

      // Thickness: always has a value (20 or 40), but low confidence still flags
      if (level === 'red') red++;
      else if (level === 'amber') amber++;
    }
    return { redCount: red, amberCount: amber };
  }, [pieces]);

  const canConfirm = redCount === 0;

  // Unique rooms for room dropdown
  const roomOptions = useMemo(() => {
    const rooms = new Set(pieces.map(p => p.room));
    // Add standard rooms
    ['Kitchen', 'Bathroom', 'Laundry', 'Ensuite', 'Butler\'s Pantry', 'Other'].forEach(r => rooms.add(r));
    return Array.from(rooms).sort();
  }, [pieces]);

  // Fire correction log — fire-and-forget
  const fireCorrection = useCallback((
    correctionType: CorrectionPayload['correctionType'],
    fieldName: string,
    originalValue: unknown,
    correctedValue: unknown,
    pieceConfidence: number,
  ) => {
    logCorrection({
      drawingId,
      analysisId,
      quoteId,
      correctionType,
      fieldName,
      originalValue,
      correctedValue,
      aiConfidence: aiConfidenceLabel(pieceConfidence),
    });
  }, [drawingId, analysisId, quoteId]);

  // Update a single piece field
  const updatePiece = useCallback((
    pieceId: string,
    field: keyof ExtractedPiece,
    value: unknown,
    correctionType: CorrectionPayload['correctionType'],
  ) => {
    setPieces(prev => {
      const updated = prev.map(p => {
        if (p.id !== pieceId) return p;
        const originalValue = p[field];
        if (originalValue !== value) {
          fireCorrection(correctionType, field, originalValue, value, p.confidence);
        }
        return { ...p, [field]: value };
      });
      return updated;
    });
  }, [fireCorrection]);

  // Apply material to all pieces
  const applyMaterialToAll = useCallback((materialName: string) => {
    if (!materialName) return;
    setPieces(prev => prev.map(p => {
      fireCorrection('MATERIAL', 'material', p.notes, materialName, p.confidence);
      return { ...p, notes: p.notes ? `${p.notes} | Material: ${materialName}` : `Material: ${materialName}` };
    }));
  }, [fireCorrection]);

  // Apply thickness to all pieces
  const applyThicknessToAll = useCallback((thickness: number) => {
    setPieces(prev => prev.map(p => {
      if (p.thickness !== thickness) {
        fireCorrection('DIMENSION', 'thickness', p.thickness, thickness, p.confidence);
      }
      return { ...p, thickness };
    }));
  }, [fireCorrection]);

  // Update cutout for a piece
  const updateCutout = useCallback((pieceId: string, cutoutIndex: number, field: 'type', value: string) => {
    setPieces(prev => prev.map(p => {
      if (p.id !== pieceId) return p;
      const newCutouts = [...p.cutouts];
      const original = newCutouts[cutoutIndex]?.type;
      newCutouts[cutoutIndex] = { ...newCutouts[cutoutIndex], [field]: value };
      if (original !== value) {
        fireCorrection('CUTOUT_TYPE', `cutout_${cutoutIndex}_type`, original, value, p.confidence);
      }
      return { ...p, cutouts: newCutouts };
    }));
  }, [fireCorrection]);

  const addCutout = useCallback((pieceId: string) => {
    setPieces(prev => prev.map(p => {
      if (p.id !== pieceId) return p;
      return { ...p, cutouts: [...p.cutouts, { type: 'SINK' }] };
    }));
  }, []);

  const removeCutout = useCallback((pieceId: string, cutoutIndex: number) => {
    setPieces(prev => prev.map(p => {
      if (p.id !== pieceId) return p;
      const newCutouts = p.cutouts.filter((_, i) => i !== cutoutIndex);
      fireCorrection('CUTOUT_TYPE', `cutout_${cutoutIndex}_removed`, p.cutouts[cutoutIndex]?.type, null, p.confidence);
      return { ...p, cutouts: newCutouts };
    }));
  }, [fireCorrection]);

  // Button label
  const buttonLabel = useMemo(() => {
    if (redCount > 0) return `${redCount} issue${redCount !== 1 ? 's' : ''} to fix`;
    if (amberCount > 0) return `Import (${amberCount} warning${amberCount !== 1 ? 's' : ''})`;
    return 'Confirm & Import →';
  }, [redCount, amberCount]);

  const buttonClass = useMemo(() => {
    if (redCount > 0) return 'bg-red-100 text-red-700 cursor-not-allowed';
    if (amberCount > 0) return 'bg-amber-500 hover:bg-amber-600 text-white';
    return 'bg-green-600 hover:bg-green-700 text-white';
  }, [redCount, amberCount]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold">Review Extracted Pieces</h2>
          <p className="text-sm text-zinc-600">
            Check each piece before importing. Edit anything that looks wrong.
          </p>
        </div>
        <button
          onClick={() => onConfirm(pieces)}
          disabled={!canConfirm}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${buttonClass}`}
        >
          {buttonLabel}
        </button>
      </div>

      <p className="text-xs text-zinc-500 mb-4">
        {pieces.length} piece{pieces.length !== 1 ? 's' : ''} across {roomGroups.length} room{roomGroups.length !== 1 ? 's' : ''}
      </p>

      {/* Apply to all pieces controls */}
      <div className="flex items-center gap-4 mb-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
        <span className="text-sm font-medium text-zinc-700">Apply to all:</span>
        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-600">Material</label>
          <select
            className="px-2 py-1 border border-zinc-300 rounded text-sm focus:ring-primary-500 focus:border-primary-500"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) applyMaterialToAll(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">Select...</option>
            {catalogue.materials.map(m => (
              <option key={m.id} value={m.name}>
                {m.name}{m.collection ? ` (${m.collection})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-600">Thickness</label>
          <div className="inline-flex rounded-lg border border-zinc-300 overflow-hidden">
            <button
              onClick={() => applyThicknessToAll(20)}
              className="px-3 py-1 text-sm hover:bg-zinc-100 transition-colors"
            >
              20mm
            </button>
            <button
              onClick={() => applyThicknessToAll(40)}
              className="px-3 py-1 text-sm border-l border-zinc-300 hover:bg-zinc-100 transition-colors"
            >
              40mm
            </button>
          </div>
        </div>
      </div>

      {/* Per-room sections */}
      {roomGroups.map(group => (
        <div key={group.name} className="mb-6">
          <h3 className="text-sm font-semibold text-zinc-800 mb-2 px-1">{group.name}</h3>
          <div className="overflow-x-auto border border-zinc-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 text-zinc-600 text-xs uppercase tracking-wider">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Shape</th>
                  <th className="px-3 py-2 text-left font-medium">Length</th>
                  <th className="px-3 py-2 text-left font-medium">Width</th>
                  <th className="px-3 py-2 text-left font-medium">Thickness</th>
                  <th className="px-3 py-2 text-left font-medium">Cutouts</th>
                  <th className="px-3 py-2 text-left font-medium">Edges</th>
                  <th className="px-3 py-2 text-left font-medium">Room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {group.pieces.map((piece) => {
                  const lengthNull = piece.length === 0 || piece.length === null;
                  const widthNull = piece.width === 0 || piece.width === null;
                  const edgeCount = countFinishedEdges(piece.edgeSelections);

                  return (
                    <tr key={piece.id} className="hover:bg-zinc-50">
                      {/* # */}
                      <td className="px-3 py-2 text-zinc-500">{piece.pieceNumber}</td>

                      {/* Name — inline editable */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          defaultValue={piece.name}
                          onBlur={(e) => {
                            if (e.target.value !== piece.name) {
                              updatePiece(piece.id, 'name', e.target.value, 'DIMENSION');
                            }
                          }}
                          className="w-full px-1 py-0.5 border border-transparent hover:border-zinc-300 focus:border-primary-500 rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                        />
                      </td>

                      {/* Shape — display only */}
                      <td className="px-3 py-2">
                        {piece.shape ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-700">
                            {SHAPE_LABELS[piece.shape] || piece.shape}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>

                      {/* Length — confidence-coloured */}
                      <td
                        className={`px-3 py-2 border ${cellClassName(piece, lengthNull)}`}
                        title={cellTooltip(piece, lengthNull)}
                      >
                        <input
                          type="number"
                          defaultValue={piece.length || ''}
                          placeholder="mm"
                          onBlur={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val !== piece.length) {
                              updatePiece(piece.id, 'length', val, 'DIMENSION');
                            }
                          }}
                          className="w-20 px-1 py-0.5 border border-transparent hover:border-zinc-300 focus:border-primary-500 rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                        />
                      </td>

                      {/* Width — confidence-coloured */}
                      <td
                        className={`px-3 py-2 border ${cellClassName(piece, widthNull)}`}
                        title={cellTooltip(piece, widthNull)}
                      >
                        <input
                          type="number"
                          defaultValue={piece.width || ''}
                          placeholder="mm"
                          onBlur={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val !== piece.width) {
                              updatePiece(piece.id, 'width', val, 'DIMENSION');
                            }
                          }}
                          className="w-20 px-1 py-0.5 border border-transparent hover:border-zinc-300 focus:border-primary-500 rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                        />
                      </td>

                      {/* Thickness — confidence-coloured, toggle */}
                      <td
                        className={`px-3 py-2 border ${cellClassName(piece, false)}`}
                        title={cellTooltip(piece, false)}
                      >
                        <div className="inline-flex rounded border border-zinc-300 overflow-hidden">
                          <button
                            onClick={() => {
                              if (piece.thickness !== 20) {
                                updatePiece(piece.id, 'thickness', 20, 'DIMENSION');
                              }
                            }}
                            className={`px-2 py-0.5 text-xs transition-colors ${
                              piece.thickness === 20
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-zinc-600 hover:bg-zinc-50'
                            }`}
                          >
                            20
                          </button>
                          <button
                            onClick={() => {
                              if (piece.thickness !== 40) {
                                updatePiece(piece.id, 'thickness', 40, 'DIMENSION');
                              }
                            }}
                            className={`px-2 py-0.5 text-xs border-l border-zinc-300 transition-colors ${
                              piece.thickness === 40
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-zinc-600 hover:bg-zinc-50'
                            }`}
                          >
                            40
                          </button>
                        </div>
                      </td>

                      {/* Cutouts — comma-separated with edit popover */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-zinc-600">
                            {piece.cutouts.length > 0
                              ? piece.cutouts.map(c => c.type).join(', ')
                              : 'None'}
                          </span>
                          <button
                            onClick={() => setEditingCutouts(editingCutouts === piece.id ? null : piece.id)}
                            className="text-xs text-primary-600 hover:text-primary-700 ml-1"
                          >
                            Edit
                          </button>
                        </div>
                        {editingCutouts === piece.id && (
                          <div className="absolute z-10 mt-1 p-3 bg-white border border-zinc-200 rounded-lg shadow-lg min-w-[200px]">
                            <div className="space-y-2">
                              {piece.cutouts.map((cutout, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <select
                                    value={cutout.type}
                                    onChange={(e) => updateCutout(piece.id, idx, 'type', e.target.value)}
                                    className="flex-1 px-2 py-1 border border-zinc-300 rounded text-xs"
                                  >
                                    {catalogue.cutoutTypes.map(ct => (
                                      <option key={ct.id} value={ct.name}>{ct.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => removeCutout(piece.id, idx)}
                                    className="text-red-500 hover:text-red-700 text-xs"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addCutout(piece.id)}
                                className="text-xs text-primary-600 hover:text-primary-700"
                              >
                                + Add cutout
                              </button>
                              <button
                                onClick={() => setEditingCutouts(null)}
                                className="block text-xs text-zinc-500 hover:text-zinc-700 mt-1"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Edges — display only count */}
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {edgeCount > 0
                          ? `${edgeCount} finished`
                          : <span className="text-zinc-400">None</span>}
                      </td>

                      {/* Room — dropdown */}
                      <td className="px-3 py-2">
                        <select
                          value={piece.room}
                          onChange={(e) => {
                            if (e.target.value !== piece.room) {
                              updatePiece(piece.id, 'room', e.target.value, 'ROOM_ASSIGNMENT');
                            }
                          }}
                          className="px-1 py-0.5 border border-transparent hover:border-zinc-300 focus:border-primary-500 rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                        >
                          {roomOptions.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Confidence legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200" />
          Low confidence / missing — blocks import
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-200" />
          Medium confidence — verify
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-white border border-zinc-200" />
          High confidence
        </span>
      </div>

      {/* Footer */}
      <div className="mt-6 flex justify-between">
        {onBack && (
          <button onClick={onBack} className="btn-secondary">
            ← Back to Questions
          </button>
        )}
        <div className="ml-auto">
          <button
            onClick={() => onConfirm(pieces)}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
