'use client';

import { useState, useEffect, useRef } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

const WATERFALL_EDGE_ID = 'cmlar3eu60007znatm9qddvfd';
const SPLASHBACK_EDGE_ID = 'et-splashback';
const MITERED_EDGE_ID = 'cmlar3eu20006znatmv7mbivv';

/** Max strip width (mm) before auto-promoting to a piece */
const MAX_STRIP_WIDTH_MM = 300;

// ── Interfaces ───────────────────────────────────────────────────────────────

interface PieceOption {
  id: string;
  name: string;
}

interface WaterfallSplashbackModalProps {
  isOpen: boolean;
  /** Which type was selected — determines labels */
  edgeTypeName: 'Waterfall' | 'Splashback';
  /** Which side the edge was set on */
  side: string;
  /** Pieces in this quote (excluding the source piece) */
  otherPieces: PieceOption[];
  /** Called when user selects "Adjoin existing piece" */
  onAdjoinPiece: (pieceId: string) => void;
  /** Called when user selects "Create new piece" */
  onCreatePiece: () => void;
  /** Called when user selects "Create new strip" */
  onCreateStrip: () => void;
  /** Called to dismiss */
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the given edge type ID is Waterfall or Splashback */
export function isWaterfallOrSplashback(edgeTypeId: string | null): boolean {
  return edgeTypeId === WATERFALL_EDGE_ID || edgeTypeId === SPLASHBACK_EDGE_ID;
}

/** Returns the display name for a Waterfall/Splashback edge type ID */
export function getRelationshipEdgeName(edgeTypeId: string): 'Waterfall' | 'Splashback' | null {
  if (edgeTypeId === WATERFALL_EDGE_ID) return 'Waterfall';
  if (edgeTypeId === SPLASHBACK_EDGE_ID) return 'Splashback';
  return null;
}

export { WATERFALL_EDGE_ID, SPLASHBACK_EDGE_ID, MITERED_EDGE_ID, MAX_STRIP_WIDTH_MM };

// ── Component ────────────────────────────────────────────────────────────────

export default function WaterfallSplashbackModal({
  isOpen,
  edgeTypeName,
  side,
  otherPieces,
  onAdjoinPiece,
  onCreatePiece,
  onCreateStrip,
  onClose,
}: WaterfallSplashbackModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedPieceId, setSelectedPieceId] = useState('');

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) setSelectedPieceId('');
  }, [isOpen]);

  if (!isOpen) return null;

  const directionLabel = edgeTypeName === 'Waterfall' ? 'down' : 'up';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        ref={ref}
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {edgeTypeName} requires a connected piece
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 mb-6">
            A {edgeTypeName} drops {directionLabel} from this edge and is typically joined with a
            Mitred edge. Would you like to:
          </p>

          <div className="space-y-3">
            {/* Option 1: Adjoin existing piece */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-900 mb-2">Adjoin existing piece</p>
              <div className="flex gap-2">
                <select
                  value={selectedPieceId}
                  onChange={(e) => setSelectedPieceId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a piece...</option>
                  {otherPieces.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (selectedPieceId) onAdjoinPiece(selectedPieceId);
                  }}
                  disabled={!selectedPieceId}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Adjoin
                </button>
              </div>
            </div>

            {/* Option 2: Create new piece */}
            <button
              onClick={onCreatePiece}
              className="w-full text-left border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">Create new piece</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Opens the add piece wizard with the joining edge pre-set to Mitred
              </p>
            </button>

            {/* Option 3: Create new strip */}
            <button
              onClick={onCreateStrip}
              className="w-full text-left border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">Create new strip</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Creates a strip linked to this edge with Mitred join. Strips wider than {MAX_STRIP_WIDTH_MM}mm auto-promote to pieces.
              </p>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
