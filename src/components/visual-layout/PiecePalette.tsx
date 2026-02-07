import React from 'react';
import { PiecePaletteProps } from '../types';

export const PiecePalette: React.FC<PiecePaletteProps> = ({
  pieces,
  placedPieceIds,
  onPieceDragStart,
}) => {
  const unplacedPieces = pieces.filter(p => !placedPieceIds.includes(p.id));

  return (
    <div className="w-64 bg-white border-l border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800">Pieces</h3>
        <p className="text-xs text-gray-500 mt-1">
          {unplacedPieces.length} of {pieces.length} unplaced
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {pieces.map(piece => {
          const isPlaced = placedPieceIds.includes(piece.id);
          
          return (
            <div
              key={piece.id}
              draggable={!isPlaced}
              onDragStart={() => !isPlaced && onPieceDragStart(piece.id)}
              className={`p-3 rounded-lg border transition-all ${
                isPlaced
                  ? 'bg-gray-50 border-gray-200 opacity-50'
                  : 'bg-white border-gray-300 hover:border-blue-400 hover:shadow-sm cursor-move'
              }`}
            >
              <div className="flex items-start gap-3">
                {piece.thumbnail ? (
                  <img
                    src={piece.thumbnail}
                    alt={piece.name}
                    className="w-12 h-12 rounded object-cover bg-gray-100"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                    {piece.name.charAt(0).toUpperCase()}
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${
                    isPlaced ? 'text-gray-400' : 'text-gray-800'
                  }`}>
                    {piece.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {piece.widthMm} × {piece.lengthMm} mm
                  </p>
                  <p className="text-xs text-gray-400">
                    {(piece.widthMm * piece.lengthMm / 1_000_000).toFixed(2)} m²
                  </p>
                </div>

                {isPlaced && (
                  <span className="text-xs text-green-600 font-medium">
                    Placed
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {unplacedPieces.length === 0 && pieces.length > 0 && (
          <div className="text-center py-8 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm">All pieces placed!</p>
          </div>
        )}

        {pieces.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No pieces to place</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PiecePalette;
