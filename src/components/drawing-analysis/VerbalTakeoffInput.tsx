'use client';

import { useState } from 'react';
import { DrawingCatalogue } from '@/lib/types/drawing-catalogue';

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

interface VerbalTakeoffInputProps {
  catalogue: DrawingCatalogue;
  onPiecesExtracted: (pieces: ExtractedPiece[]) => void;
  onCancel: () => void;
}

export function VerbalTakeoffInput({ catalogue, onPiecesExtracted, onCancel }: VerbalTakeoffInputProps) {
  const [description, setDescription] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseNotes, setParseNotes] = useState<string | null>(null);

  const handleParse = async () => {
    if (!description.trim()) return;

    setIsParsing(true);
    setError(null);
    setParseNotes(null);

    try {
      const response = await fetch('/api/analyze-drawing/verbal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to parse description');
      }

      const data = await response.json();

      if (!data.pieces || data.pieces.length === 0) {
        throw new Error('No pieces could be extracted from the description. Try adding dimensions like "3600 x 600".');
      }

      if (data.parseNotes) {
        setParseNotes(data.parseNotes);
      }

      // Map API pieces to the ExtractedPiece shape DrawingImport expects
      const mappedPieces: ExtractedPiece[] = data.pieces.map((p: Record<string, unknown>, idx: number) => ({
        id: (p.id as string) || `verbal-${idx}`,
        pieceNumber: (p.pieceNumber as number) || idx + 1,
        name: (p.name as string) || `Piece ${idx + 1}`,
        shape: (p.shape as string) || undefined,
        length: (p.length as number) || 0,
        width: (p.width as number) || 0,
        thickness: (p.thickness as number) || 20,
        room: (p.room as string) || 'Kitchen',
        confidence: (p.confidence as number) || 0.9,
        notes: (p.notes as string) || null,
        cutouts: Array.isArray(p.cutouts) ? p.cutouts : [],
        isEditing: false,
        edgeSelections: {
          edgeTop: null,
          edgeBottom: null,
          edgeLeft: null,
          edgeRight: null,
        },
      }));

      onPiecesExtracted(mappedPieces);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse description');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div>
      <label htmlFor="verbal-takeoff" className="block text-sm font-medium text-gray-700 mb-2">
        Describe the job in plain English
      </label>
      <textarea
        id="verbal-takeoff"
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Kitchen bench 3600 x 600, 20mm Caesarstone, undermount sink, pencil round on front edge"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-y"
        disabled={isParsing}
      />

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {parseNotes && (
        <p className="mt-2 text-sm text-gray-600">{parseNotes}</p>
      )}

      <div className="mt-4 flex justify-between">
        <button
          onClick={onCancel}
          className="btn-secondary text-sm"
          disabled={isParsing}
        >
          Cancel
        </button>
        <button
          onClick={handleParse}
          disabled={isParsing || !description.trim()}
          className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isParsing ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Parsing...
            </>
          ) : (
            'Parse Job →'
          )}
        </button>
      </div>
    </div>
  );
}
