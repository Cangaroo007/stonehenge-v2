'use client';

import { useMemo, useState, useCallback } from 'react';
import { calculateRoomLayout } from '@/lib/services/room-layout-engine';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import { RELATIONSHIP_DISPLAY, JOIN_POSITIONS } from '@/lib/types/piece-relationship';
import type { RelationshipType } from '@prisma/client';
import toast from 'react-hot-toast';
import RoomPieceSVG from './RoomPieceSVG';
import RelationshipConnector from './RelationshipConnector';

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
  /** Quote ID for relationship API calls (edit mode) */
  quoteId?: string;
  /** Callback when a relationship is changed via popover (edit mode) */
  onRelationshipChange?: () => void;
}

// Types that use join position
const POSITION_TYPES: RelationshipType[] = ['WATERFALL', 'SPLASHBACK', 'RETURN'];
const ALL_RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_DISPLAY) as RelationshipType[];

interface ConnectorPopover {
  relationshipId: string;
  x: number;
  y: number;
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
  quoteId,
  onRelationshipChange,
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

  // Hover state for relationship connector highlighting
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);

  // Connector popover state (edit mode)
  const [connectorPopover, setConnectorPopover] = useState<ConnectorPopover | null>(null);
  const [popoverType, setPopoverType] = useState<RelationshipType>('WATERFALL');
  const [popoverPosition, setPopoverPosition] = useState<string>('');
  const [popoverNotes, setPopoverNotes] = useState('');
  const [popoverSaving, setPopoverSaving] = useState(false);

  const handleConnectorClick = useCallback((relationshipId: string, midpoint: { x: number; y: number }) => {
    const rel = relationships.find(r => r.id === relationshipId);
    if (!rel) return;
    setConnectorPopover({ relationshipId, x: midpoint.x, y: midpoint.y });
    setPopoverType(rel.relationshipType);
    setPopoverPosition(rel.joinPosition ?? '');
    setPopoverNotes(rel.notes ?? '');
  }, [relationships]);

  const handlePopoverSave = useCallback(async () => {
    if (!connectorPopover || !quoteId) return;
    setPopoverSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/relationships/${connectorPopover.relationshipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationshipType: popoverType,
          joinPosition: POSITION_TYPES.includes(popoverType) ? popoverPosition || null : null,
          notes: popoverNotes || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Relationship updated');
      onRelationshipChange?.();
      setConnectorPopover(null);
    } catch {
      toast.error('Failed to update relationship');
    } finally {
      setPopoverSaving(false);
    }
  }, [connectorPopover, quoteId, popoverType, popoverPosition, popoverNotes, onRelationshipChange]);

  const handlePopoverDelete = useCallback(async () => {
    if (!connectorPopover || !quoteId) return;
    setPopoverSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/relationships/${connectorPopover.relationshipId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Relationship deleted');
      onRelationshipChange?.();
      setConnectorPopover(null);
    } catch {
      toast.error('Failed to delete relationship');
    } finally {
      setPopoverSaving(false);
    }
  }, [connectorPopover, quoteId, onRelationshipChange]);

  // Unique relationship types for the legend
  const uniqueRelationshipTypes = useMemo(() =>
    Array.from(new Set(relationships.map(r => r.relationshipType))),
    [relationships]
  );

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
        {/* Relationship connectors (rendered BELOW pieces for z-order) */}
        <g className="relationship-connectors">
          {relationships.map(rel => {
            const parentPos = layout.pieces.find(p => p.pieceId === rel.parentPieceId);
            const childPos = layout.pieces.find(p => p.pieceId === rel.childPieceId);
            if (!parentPos || !childPos) return null;

            const isInvolved = hoveredPieceId === rel.parentPieceId || hoveredPieceId === rel.childPieceId;
            return (
              <RelationshipConnector
                key={rel.id}
                relationship={rel}
                parentPosition={parentPos}
                childPosition={childPos}
                scale={layout.scale}
                isHighlighted={isInvolved}
                isDimmed={hoveredPieceId != null && !isInvolved}
                isEditMode={mode === 'edit'}
                onConnectorClick={mode === 'edit' ? handleConnectorClick : undefined}
              />
            );
          })}
        </g>

        {/* Piece rectangles */}
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
              onMouseEnter={setHoveredPieceId}
              onMouseLeave={() => setHoveredPieceId(null)}
            />
          );
        })}
      </svg>

      {/* Connector Popover Editor (edit mode) */}
      {connectorPopover && mode === 'edit' && quoteId && (
        <div className="relative">
          <div
            className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2"
            style={{
              left: `${(connectorPopover.x / layout.viewBox.width) * 100}%`,
              top: -8,
              transform: 'translateX(-50%)',
              width: 240,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">Edit Connector</span>
              <button
                onClick={() => setConnectorPopover(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Type</label>
              <select
                value={popoverType}
                onChange={e => setPopoverType(e.target.value as RelationshipType)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                {ALL_RELATIONSHIP_TYPES.map(t => (
                  <option key={t} value={t}>{RELATIONSHIP_DISPLAY[t].label}</option>
                ))}
              </select>
            </div>
            {POSITION_TYPES.includes(popoverType) && (
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Position</label>
                <select
                  value={popoverPosition}
                  onChange={e => setPopoverPosition(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">None</option>
                  {JOIN_POSITIONS.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
              <input
                type="text"
                value={popoverNotes}
                onChange={e => setPopoverNotes(e.target.value)}
                placeholder="Optional"
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handlePopoverDelete}
                disabled={popoverSaving}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConnectorPopover(null)}
                  className="px-2 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePopoverSave}
                  disabled={popoverSaving}
                  className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {popoverSaving ? 'Saving\u2026' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Relationship legend — only show if room has relationships */}
      {uniqueRelationshipTypes.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {uniqueRelationshipTypes.map(type => (
            <div key={type} className="flex items-center gap-1">
              <span
                className="w-4 h-0.5 inline-block"
                style={{ backgroundColor: RELATIONSHIP_DISPLAY[type].colour }}
              />
              <span className="text-muted-foreground">
                {RELATIONSHIP_DISPLAY[type].label}
              </span>
            </div>
          ))}
        </div>
      )}

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
