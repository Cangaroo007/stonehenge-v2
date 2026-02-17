'use client';

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
  onPieceClick?: (pieceId: string) => void;
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function RoomPieceSVG({
  piece,
  position,
  scale: _scale,
  isSelected = false,
  isEditMode = false,
  onPieceClick,
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

  const handleClick = () => {
    if (isEditMode && onPieceClick) {
      onPieceClick(piece.id);
    }
  };

  // Stroke styling based on selection state
  const strokeColour = isSelected ? '#2563eb' : '#94a3b8';
  const strokeWidth = isSelected ? 3 : 2;

  return (
    <g
      style={{ cursor: isEditMode ? 'pointer' : 'default' }}
      onClick={handleClick}
      onMouseEnter={() => onMouseEnter?.(piece.id)}
      onMouseLeave={() => onMouseLeave?.()}
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
          {/* Top edge */}
          <line
            x1={x + 3}
            y1={y + 1}
            x2={x + w - 3}
            y2={y + 1}
            stroke={edgeColour(topEdge)}
            strokeWidth={2}
            strokeDasharray={isRawEdge(topEdge) ? '3 2' : undefined}
          />
          {/* Bottom edge */}
          <line
            x1={x + 3}
            y1={y + h - 1}
            x2={x + w - 3}
            y2={y + h - 1}
            stroke={edgeColour(bottomEdge)}
            strokeWidth={2}
            strokeDasharray={isRawEdge(bottomEdge) ? '3 2' : undefined}
          />
          {/* Left edge */}
          <line
            x1={x + 1}
            y1={y + 3}
            x2={x + 1}
            y2={y + h - 3}
            stroke={edgeColour(leftEdge)}
            strokeWidth={2}
            strokeDasharray={isRawEdge(leftEdge) ? '3 2' : undefined}
          />
          {/* Right edge */}
          <line
            x1={x + w - 1}
            y1={y + 3}
            x2={x + w - 1}
            y2={y + h - 3}
            stroke={edgeColour(rightEdge)}
            strokeWidth={2}
            strokeDasharray={isRawEdge(rightEdge) ? '3 2' : undefined}
          />
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
        <>
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
        </>
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
