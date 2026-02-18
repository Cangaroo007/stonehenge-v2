'use client';

import { useState, useCallback } from 'react';
import type { PiecePosition } from '@/lib/services/room-layout-engine';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface PieceData {
  id: string;
  description: string;
  length_mm: number;
  width_mm: number;
  piece_type: string | null;
  thickness_mm: number;
  edges?: Array<{ position: string; profile: string }>;
  cutouts?: Array<{ type: string; quantity: number }>;
}

interface RoomPieceSVGProps {
  piece: PieceData;
  position: PiecePosition;
  scale: number;
  isSelected?: boolean;
  isEditMode?: boolean;
  /** Whether paint mode is active in the room (Task D) */
  isPaintMode?: boolean;
  onPieceClick?: (pieceId: string, e?: React.MouseEvent) => void;
  /** Called when an edge is clicked in paint mode (pieceId, side) */
  onEdgeClick?: (pieceId: string, side: string) => void;
  /** Called on right-click (edit mode only) */
  onContextMenu?: (pieceId: string, e: React.MouseEvent) => void;
  onMouseEnter?: (pieceId: string) => void;
  onMouseLeave?: () => void;
}

// ─── Edge Colour (matches MiniSpatialDiagram / PieceVisualEditor) ────────────

function edgeColour(name: string | null | undefined): string {
  if (!name) return '#d1d5db';
  const lower = name.toLowerCase();
  if (lower.includes('pencil')) return '#2563eb';
  if (lower.includes('bullnose')) return '#16a34a';
  if (lower.includes('ogee')) return '#9333ea';
  if (lower.includes('mitr')) return '#ea580c';
  if (lower.includes('bevel')) return '#0d9488';
  if (lower.includes('raw')) return '#9ca3af';
  return '#6b7280';
}

function isRawEdge(name: string | null | undefined): boolean {
  if (!name) return true;
  const lower = name.toLowerCase();
  return lower.includes('raw') || lower === 'none';
}

// ─── Piece Type Styling ──────────────────────────────────────────────────────

const PIECE_TYPE_COLOURS: Record<string, string> = {
  BENCHTOP: '#3B82F6',
  ISLAND: '#8B5CF6',
  SPLASHBACK: '#10B981',
  WATERFALL: '#06B6D4',
  RETURN: '#F59E0B',
  WINDOW_SILL: '#EC4899',
};

const PIECE_TYPE_ABBREVIATIONS: Record<string, string> = {
  BENCHTOP: 'BT',
  ISLAND: 'IS',
  SPLASHBACK: 'SB',
  WATERFALL: 'WF',
  RETURN: 'RT',
  WINDOW_SILL: 'WS',
};

function getPieceTypeColour(pieceType: string | null): string {
  if (!pieceType) return '#6B7280';
  return PIECE_TYPE_COLOURS[pieceType.toUpperCase()] ?? '#6B7280';
}

function getPieceTypeAbbr(pieceType: string | null): string {
  if (!pieceType) return 'PC';
  return PIECE_TYPE_ABBREVIATIONS[pieceType.toUpperCase()] ?? pieceType.substring(0, 2).toUpperCase();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateLabel(label: string, maxWidth: number): string {
  // Approximate: 7px per character at font size 11
  const maxChars = Math.floor(maxWidth / 7);
  if (label.length <= maxChars) return label;
  return label.substring(0, maxChars - 1) + '\u2026';
}

function getEdgeProfile(edges: PieceData['edges'], position: string): string | null {
  if (!edges) return null;
  const edge = edges.find(e => e.position.toLowerCase() === position.toLowerCase());
  return edge?.profile ?? null;
}

/** Return a human-readable display name for an edge profile string */
function edgeProfileDisplayName(profile: string | null | undefined): string {
  if (!profile) return 'Raw / Unfinished';
  const lower = profile.toLowerCase();
  if (lower.includes('raw') || lower === 'none') return 'Raw / Unfinished';
  return profile;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RoomPieceSVG({
  piece,
  position,
  scale: _scale,
  isSelected = false,
  isEditMode = false,
  isPaintMode = false,
  onPieceClick,
  onEdgeClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}: RoomPieceSVGProps) {
  const { x, y, width, height } = position;

  // Minimum rendered sizes for visibility
  const w = Math.max(width, 20);
  const h = Math.max(height, 16);

  const typeColour = getPieceTypeColour(piece.piece_type);
  const typeAbbr = getPieceTypeAbbr(piece.piece_type);

  // Edge profiles
  const topEdge = getEdgeProfile(piece.edges, 'top');
  const bottomEdge = getEdgeProfile(piece.edges, 'bottom');
  const leftEdge = getEdgeProfile(piece.edges, 'left');
  const rightEdge = getEdgeProfile(piece.edges, 'right');

  // Cutout count
  const cutoutCount = piece.cutouts
    ? piece.cutouts.reduce((sum, c) => sum + c.quantity, 0)
    : 0;

  // Edge hover state for paint mode
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (isEditMode && onPieceClick) {
      onPieceClick(piece.id, e);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isEditMode && onContextMenu) {
      onContextMenu(piece.id, e);
    }
  }, [isEditMode, onContextMenu, piece.id]);

  const handleEdgeClick = useCallback((side: string, e: React.MouseEvent) => {
    if (!onEdgeClick) return;
    e.stopPropagation();
    onEdgeClick(piece.id, side);
  }, [onEdgeClick, piece.id]);

  // Stroke styling based on selection state
  const strokeColour = isSelected ? '#2563eb' : '#94a3b8';
  const strokeWidth = isSelected ? 3 : 2;

  // Edge hit area width — at least 20px for reliable click targets
  const edgeHitWidth = 20;

  return (
    <g
      style={{ cursor: isEditMode ? 'pointer' : 'default' }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => onMouseEnter?.(piece.id)}
      onMouseLeave={() => { onMouseLeave?.(); setHoveredEdge(null); }}
      className={isEditMode ? 'room-piece-svg-interactive' : undefined}
    >
      {/* Selection glow */}
      {isSelected && (
        <rect
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          rx={4}
          ry={4}
          fill="none"
          stroke="#3B82F6"
          strokeWidth={1}
          opacity={0.4}
        />
      )}

      {/* Main piece rectangle */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        ry={2}
        fill="rgba(255, 255, 255, 0.95)"
        stroke={strokeColour}
        strokeWidth={strokeWidth}
      />

      {/* Edge profile lines (only if piece is large enough) */}
      {w > 30 && h > 24 && (
        <>
          {/* Hover highlight glow (edit mode only) */}
          {hoveredEdge === 'top' && isEditMode && (
            <line
              x1={x + 3} y1={y + 1} x2={x + w - 3} y2={y + 1}
              stroke="#3b82f6" strokeWidth={10} opacity={0.15}
              className="pointer-events-none"
            />
          )}
          {hoveredEdge === 'bottom' && isEditMode && (
            <line
              x1={x + 3} y1={y + h - 1} x2={x + w - 3} y2={y + h - 1}
              stroke="#3b82f6" strokeWidth={10} opacity={0.15}
              className="pointer-events-none"
            />
          )}
          {hoveredEdge === 'left' && isEditMode && (
            <line
              x1={x + 1} y1={y + 3} x2={x + 1} y2={y + h - 3}
              stroke="#3b82f6" strokeWidth={10} opacity={0.15}
              className="pointer-events-none"
            />
          )}
          {hoveredEdge === 'right' && isEditMode && (
            <line
              x1={x + w - 1} y1={y + 3} x2={x + w - 1} y2={y + h - 3}
              stroke="#3b82f6" strokeWidth={10} opacity={0.15}
              className="pointer-events-none"
            />
          )}

          {/* Top edge */}
          <line
            x1={x + 3}
            y1={y + 1}
            x2={x + w - 3}
            y2={y + 1}
            stroke={hoveredEdge === 'top' && isEditMode ? '#3b82f6' : edgeColour(topEdge)}
            strokeWidth={hoveredEdge === 'top' && isEditMode ? 4 : 2}
            strokeDasharray={isRawEdge(topEdge) ? '3 2' : undefined}
          >
            <title>{edgeProfileDisplayName(topEdge)}</title>
          </line>
          {/* Bottom edge */}
          <line
            x1={x + 3}
            y1={y + h - 1}
            x2={x + w - 3}
            y2={y + h - 1}
            stroke={hoveredEdge === 'bottom' && isEditMode ? '#3b82f6' : edgeColour(bottomEdge)}
            strokeWidth={hoveredEdge === 'bottom' && isEditMode ? 4 : 2}
            strokeDasharray={isRawEdge(bottomEdge) ? '3 2' : undefined}
          >
            <title>{edgeProfileDisplayName(bottomEdge)}</title>
          </line>
          {/* Left edge */}
          <line
            x1={x + 1}
            y1={y + 3}
            x2={x + 1}
            y2={y + h - 3}
            stroke={hoveredEdge === 'left' && isEditMode ? '#3b82f6' : edgeColour(leftEdge)}
            strokeWidth={hoveredEdge === 'left' && isEditMode ? 4 : 2}
            strokeDasharray={isRawEdge(leftEdge) ? '3 2' : undefined}
          >
            <title>{edgeProfileDisplayName(leftEdge)}</title>
          </line>
          {/* Right edge */}
          <line
            x1={x + w - 1}
            y1={y + 3}
            x2={x + w - 1}
            y2={y + h - 3}
            stroke={hoveredEdge === 'right' && isEditMode ? '#3b82f6' : edgeColour(rightEdge)}
            strokeWidth={hoveredEdge === 'right' && isEditMode ? 4 : 2}
            strokeDasharray={isRawEdge(rightEdge) ? '3 2' : undefined}
          >
            <title>{edgeProfileDisplayName(rightEdge)}</title>
          </line>

          {/* Edge hit areas for clicking individual edges (edit mode) */}
          {isEditMode && onEdgeClick && (
            <>
              <line
                x1={x + 3} y1={y + 1} x2={x + w - 3} y2={y + 1}
                stroke="transparent" strokeWidth={edgeHitWidth}
                style={{ cursor: 'pointer' }}
                onClick={e => handleEdgeClick('top', e)}
                onMouseEnter={() => setHoveredEdge('top')}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <title>{edgeProfileDisplayName(topEdge)}</title>
              </line>
              <line
                x1={x + 3} y1={y + h - 1} x2={x + w - 3} y2={y + h - 1}
                stroke="transparent" strokeWidth={edgeHitWidth}
                style={{ cursor: 'pointer' }}
                onClick={e => handleEdgeClick('bottom', e)}
                onMouseEnter={() => setHoveredEdge('bottom')}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <title>{edgeProfileDisplayName(bottomEdge)}</title>
              </line>
              <line
                x1={x + 1} y1={y + 3} x2={x + 1} y2={y + h - 3}
                stroke="transparent" strokeWidth={edgeHitWidth}
                style={{ cursor: 'pointer' }}
                onClick={e => handleEdgeClick('left', e)}
                onMouseEnter={() => setHoveredEdge('left')}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <title>{edgeProfileDisplayName(leftEdge)}</title>
              </line>
              <line
                x1={x + w - 1} y1={y + 3} x2={x + w - 1} y2={y + h - 3}
                stroke="transparent" strokeWidth={edgeHitWidth}
                style={{ cursor: 'pointer' }}
                onClick={e => handleEdgeClick('right', e)}
                onMouseEnter={() => setHoveredEdge('right')}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <title>{edgeProfileDisplayName(rightEdge)}</title>
              </line>
            </>
          )}
        </>
      )}

      {/* Piece type badge (top-left corner) */}
      <circle
        cx={x + 14}
        cy={y + 14}
        r={10}
        fill={typeColour}
      />
      <text
        x={x + 14}
        y={y + 14}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={8}
        fontWeight="bold"
      >
        {typeAbbr}
      </text>

      {/* Piece label (centre of piece) */}
      {w > 60 && h > 30 && (
        <text
          x={x + w / 2}
          y={y + h / 2 - 4}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#374151"
          fontSize={11}
          fontWeight="500"
        >
          {truncateLabel(piece.description, w - 30)}
        </text>
      )}

      {/* Dimensions label (below centre) */}
      {w > 50 && h > 24 && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 10}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#6B7280"
          fontSize={9}
        >
          {piece.length_mm}&times;{piece.width_mm}
        </text>
      )}

      {/* Cutout count indicator (top-right) */}
      {cutoutCount > 0 && w > 40 && (
        <g>
          <title>{`${cutoutCount} cutout${cutoutCount !== 1 ? 's' : ''}: ${piece.cutouts?.map(c => `${c.quantity}x ${c.type}`).join(', ')}`}</title>
          <circle
            cx={x + w - 12}
            cy={y + 12}
            r={8}
            fill="#F59E0B"
          />
          <text
            x={x + w - 12}
            y={y + 12}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={8}
            fontWeight="bold"
          >
            {cutoutCount}
          </text>
        </g>
      )}

      {/* Hover effect styles (edit mode only) */}
      {isEditMode && (
        <style>{`
          .room-piece-svg-interactive:hover rect:first-of-type {
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
          }
        `}</style>
      )}
    </g>
  );
}
