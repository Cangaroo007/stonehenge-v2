'use client';

import { useState, useMemo } from 'react';
import { useUnits } from '@/lib/contexts/UnitContext';
import { getDimensionUnitLabel, mmToDisplayUnit } from '@/lib/utils/units';

interface QuotePiece {
  id: number;
  name: string;
  description: string | null;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialName: string | null;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  sortOrder: number;
  totalCost: number;
  quote_rooms: {
    id: number;
    name: string;
  };
}

interface RoomGroupingProps {
  pieces: QuotePiece[];
  selectedPieceId: number | null;
  onSelectPiece: (pieceId: number) => void;
  onDeletePiece: (pieceId: number) => void;
  onDuplicatePiece: (pieceId: number) => void;
}

interface RoomGroup {
  name: string;
  pieces: QuotePiece[];
  isExpanded: boolean;
}

// Get edge summary string for a piece
const getEdgeSummary = (piece: QuotePiece): string => {
  const edges = [
    piece.edgeTop && `T`,
    piece.edgeBottom && `B`,
    piece.edgeLeft && `L`,
    piece.edgeRight && `R`,
  ].filter(Boolean);

  return edges.length > 0 ? edges.join(', ') : '';
};

// Check if piece has any edges
const hasEdges = (piece: QuotePiece): boolean => {
  return !!(piece.edgeTop || piece.edgeBottom || piece.edgeLeft || piece.edgeRight);
};

export default function RoomGrouping({
  pieces,
  selectedPieceId,
  onSelectPiece,
  onDeletePiece,
  onDuplicatePiece,
}: RoomGroupingProps) {
  const { unitSystem } = useUnits();
  const unitLabel = getDimensionUnitLabel(unitSystem);

  // Track expanded state for each room
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  // Group pieces by room
  const roomGroups = useMemo(() => {
    const groups: Record<string, QuotePiece[]> = {};

    pieces.forEach(piece => {
      const roomName = piece.room?.name || 'No Room Assigned';
      if (!groups[roomName]) {
        groups[roomName] = [];
      }
      groups[roomName].push(piece);
    });

    // Sort rooms alphabetically, but keep "No Room Assigned" at the end
    const sortedRoomNames = Object.keys(groups).sort((a, b) => {
      if (a === 'No Room Assigned') return 1;
      if (b === 'No Room Assigned') return -1;
      return a.localeCompare(b);
    });

    return sortedRoomNames.map(name => ({
      name,
      pieces: groups[name].sort((a, b) => a.sortOrder - b.sortOrder),
      isExpanded: expandedRooms[name] !== false, // Default to expanded
    }));
  }, [pieces, expandedRooms]);

  // Toggle room expansion
  const toggleRoom = (roomName: string) => {
    setExpandedRooms(prev => ({
      ...prev,
      [roomName]: prev[roomName] === false ? true : false,
    }));
  };

  // Format currency
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);

  // Calculate room total
  const getRoomTotal = (roomPieces: QuotePiece[]) => {
    return roomPieces.reduce((sum, p) => sum + Number(p.totalCost || 0), 0);
  };

  // Handle delete click
  const handleDelete = (pieceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeletePiece(pieceId);
  };

  // Handle duplicate click
  const handleDuplicate = (pieceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onDuplicatePiece(pieceId);
  };

  if (pieces.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <svg
          className="mx-auto h-12 w-12 text-gray-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
        <p className="mb-2">No pieces added yet</p>
        <p className="text-sm">Click &quot;Add Piece&quot; to start building your quote</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {roomGroups.map((room) => (
        <div key={quote_rooms.name} className="bg-white">
          {/* Room Header */}
          <button
            onClick={() => toggleRoom(quote_rooms.name)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {/* Expand/Collapse Icon */}
              <svg
                className={`h-4 w-4 text-gray-500 transition-transform ${
                  quote_rooms.isExpanded ? 'rotate-90' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>

              {/* Room Name */}
              <span className="font-medium text-gray-900">{quote_rooms.name}</span>

              {/* Piece Count */}
              <span className="text-sm text-gray-500">
                ({quote_rooms.pieces.length} piece{quote_rooms.pieces.length !== 1 ? 's' : ''})
              </span>
            </div>

            {/* Room Total */}
            <span className="text-sm font-medium text-gray-700">
              {formatCurrency(getRoomTotal(quote_rooms.pieces))}
            </span>
          </button>

          {/* Pieces List */}
          {quote_rooms.isExpanded && (
            <div className="bg-gray-50 border-t border-gray-100">
              {quote_rooms.pieces.map((piece) => (
                <div
                  key={piece.id}
                  onClick={() => onSelectPiece(piece.id)}
                  className={`px-4 py-3 pl-10 flex items-center justify-between cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                    selectedPieceId === piece.id
                      ? 'bg-primary-50 border-l-4 border-l-primary-500'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {/* Piece Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {piece.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span>{Math.round(mmToDisplayUnit(piece.lengthMm, unitSystem))} × {Math.round(mmToDisplayUnit(piece.widthMm, unitSystem))}{unitLabel}</span>
                      <span>{Math.round(mmToDisplayUnit(piece.thicknessMm, unitSystem))}{unitLabel}</span>
                      {piece.materialName && (
                        <span className="truncate">{piece.materialName}</span>
                      )}
                      {hasEdges(piece) && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          Edges: {getEdgeSummary(piece)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price and Actions */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">
                      {formatCurrency(Number(piece.totalCost || 0))}
                    </span>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                      {/* Duplicate */}
                      <button
                        onClick={(e) => handleDuplicate(piece.id, e)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Duplicate piece"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={(e) => handleDelete(piece.id, e)}
                        className="p-1 text-red-400 hover:text-red-600"
                        title="Delete piece"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
