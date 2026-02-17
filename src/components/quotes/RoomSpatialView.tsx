'use client';

import { useMemo } from 'react';
import { calculateRoomLayout } from '@/lib/services/room-layout-engine';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import RoomPieceSVG from './RoomPieceSVG';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface QuotePiece {
  id: number;
  description: string | null;
  name: string | null;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  piece_type?: string | null;
  area_sqm: number;
  total_cost: number;
  edge_top: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  edge_right: string | null;
  piece_features?: Array<{ id: number; name: string; quantity: number }>;
  cutouts?: unknown;
}

interface RoomSpatialViewProps {
  roomName: string;
  pieces: QuotePiece[];
  relationships: PieceRelationshipData[];
  mode: 'view' | 'edit';
  selectedPieceId?: string | null;
  onPieceSelect?: (pieceId: string) => void;
  roomTotal?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatArea(sqm: number): string {
  return sqm.toFixed(2) + ' m\u00B2';
}

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function inferPieceType(piece: QuotePiece): string | null {
  if (piece.piece_type) return piece.piece_type;

  // Infer from name/description
  const name = (piece.name ?? piece.description ?? '').toLowerCase();
  if (name.includes('splashback') || name.includes('splash back')) return 'SPLASHBACK';
  if (name.includes('waterfall')) return 'WATERFALL';
  if (name.includes('island')) return 'ISLAND';
  if (name.includes('return')) return 'RETURN';
  if (name.includes('window') || name.includes('sill')) return 'WINDOW_SILL';
  if (name.includes('benchtop') || name.includes('bench top')) return 'BENCHTOP';
  return null;
}

function countCutouts(piece: QuotePiece): number {
  if (!piece.piece_features) return 0;
  // Count features that look like cutouts
  return piece.piece_features.reduce((sum, f) => sum + f.quantity, 0);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RoomSpatialView({
  roomName,
  pieces,
  relationships,
  mode,
  selectedPieceId,
  onPieceSelect,
  roomTotal,
}: RoomSpatialViewProps) {
  // Calculate layout using the engine (memoised — expensive calculation)
  const layout = useMemo(() => {
    const layoutPieces = pieces.map(p => ({
      id: String(p.id),
      description: p.name ?? p.description ?? 'Piece',
      length_mm: p.length_mm,
      width_mm: p.width_mm,
      piece_type: inferPieceType(p),
    }));

    const layoutRelationships = relationships.map(r => ({
      parentPieceId: r.parentPieceId,
      childPieceId: r.childPieceId,
      relationshipType: r.relationshipType,
      joinPosition: r.joinPosition,
    }));

    return calculateRoomLayout(layoutPieces, layoutRelationships);
  }, [pieces, relationships]);

  // Summary calculations
  const totalArea = useMemo(
    () => pieces.reduce((sum, p) => sum + p.area_sqm, 0),
    [pieces]
  );

  const totalCutouts = useMemo(
    () => pieces.reduce((sum, p) => sum + countCutouts(p), 0),
    [pieces]
  );

  // Build a piece lookup map for RoomPieceSVG
  const pieceMap = useMemo(() => {
    const map = new Map<string, QuotePiece>();
    for (const p of pieces) {
      map.set(String(p.id), p);
    }
    return map;
  }, [pieces]);

  // ── Empty room ──
  if (pieces.length === 0) {
    return (
      <div className="border rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-gray-700">{roomName}</h3>
        </div>
        <div className="text-centre py-8">
          <p className="text-sm text-gray-400">No pieces in this room yet</p>
          {mode === 'edit' && (
            <button
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              onClick={() => onPieceSelect?.('new')}
            >
              + Add Piece
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 mb-6">
      {/* Room header */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{roomName}</h3>
        <span className="text-xs text-gray-500">
          {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
          {roomTotal != null && ` | ${formatCurrency(roomTotal)}`}
        </span>
      </div>

      {/* SVG canvas */}
      <svg
        viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
        className="w-full h-auto"
        style={{ maxHeight: 500 }}
      >
        {layout.pieces.map(pos => {
          const piece = pieceMap.get(pos.pieceId);
          if (!piece) return null;

          return (
            <RoomPieceSVG
              key={pos.pieceId}
              piece={{
                id: String(piece.id),
                description: piece.name ?? piece.description ?? 'Piece',
                length_mm: piece.length_mm,
                width_mm: piece.width_mm,
                piece_type: inferPieceType(piece),
                thickness_mm: piece.thickness_mm,
                edges: [
                  { position: 'top', profile: piece.edge_top ?? '' },
                  { position: 'bottom', profile: piece.edge_bottom ?? '' },
                  { position: 'left', profile: piece.edge_left ?? '' },
                  { position: 'right', profile: piece.edge_right ?? '' },
                ],
                cutouts: piece.piece_features?.map(f => ({
                  type: f.name,
                  quantity: f.quantity,
                })),
              }}
              position={pos}
              scale={layout.scale}
              isSelected={selectedPieceId === String(piece.id)}
              isEditMode={mode === 'edit'}
              onPieceClick={onPieceSelect}
            />
          );
        })}
      </svg>

      {/* Room summary bar */}
      <div className="flex gap-4 text-xs text-gray-500 mt-2">
        <span>{pieces.length} piece{pieces.length !== 1 ? 's' : ''}</span>
        <span>{formatArea(totalArea)}</span>
        {totalCutouts > 0 && <span>{totalCutouts} cutout{totalCutouts !== 1 ? 's' : ''}</span>}
        {relationships.length > 0 && (
          <span>{relationships.length} connection{relationships.length !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}
