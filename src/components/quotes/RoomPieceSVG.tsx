'use client';

import { useState, useCallback } from 'react';
import { edgeColour, edgeCode } from '@/lib/utils/edge-utils';
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
  laminationMethod?: string | null;
  mitredCornerTreatment?: string | null;
}

export interface SuppressedEdgeDisplay {
  code: string;
  colour: string;
  label: string;
}

interface RoomPieceSVGProps {
  piece: PieceData;
  position: PiecePosition;
  scale: number;
  isSelected?: boolean;
  isEditMode?: boolean;
  /** Whether Quick Edge mode is active in the room */
  isQuickEdgeMode?: boolean;
  onPieceClick?: (pieceId: string, e?: React.MouseEvent) => void;
  /** Called when an edge is clicked in Quick Edge mode (pieceId, side) */
  onEdgeClick?: (pieceId: string, side: string) => void;
  /** Called on right-click (edit mode only) */
  onContextMenu?: (pieceId: string, e: React.MouseEvent) => void;
  onMouseEnter?: (pieceId: string) => void;
  onMouseLeave?: () => void;
  /** Join cut positions in mm from left edge — for oversize pieces */
  joinPositionsMm?: number[];
  /** Edges suppressed by wall/join rules; shown but not editable in quick edge mode */
  suppressedEdges?: Partial<Record<'top' | 'bottom' | 'left' | 'right', SuppressedEdgeDisplay>>;
}

function isWallSuppression(suppression: SuppressedEdgeDisplay | undefined): boolean {
  return suppression?.code.toUpperCase() === 'WALL';
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
  isQuickEdgeMode = false,
  onPieceClick,
  onEdgeClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  joinPositionsMm,
  suppressedEdges,
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
  const topSuppression = suppressedEdges?.top;
  const bottomSuppression = suppressedEdges?.bottom;
  const leftSuppression = suppressedEdges?.left;
  const rightSuppression = suppressedEdges?.right;

  // Cutout count
  const cutoutCount = piece.cutouts
    ? piece.cutouts.reduce((sum, c) => sum + c.quantity, 0)
    : 0;

  // Edge hover state for Quick Edge mode
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
    if (suppressedEdges?.[side as keyof typeof suppressedEdges]) return;
    onEdgeClick(piece.id, side);
  }, [onEdgeClick, piece.id, suppressedEdges]);

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

      {/* Join cut lines — shown when piece requires joins */}
      {joinPositionsMm && joinPositionsMm.length > 0 && joinPositionsMm.map((joinMm, idx) => {
        const joinX = x + (joinMm / piece.length_mm) * w;
        if (joinX <= x || joinX >= x + w) return null;
        return (
          <g key={`join-${idx}`}>
            <line
              x1={joinX}
              y1={y}
              x2={joinX}
              y2={y + h}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.85}
            />
            {h > 20 && (
              <text
                x={joinX + 3}
                y={y + h / 2}
                fontSize={Math.min(9, h / 3)}
                fill="#ef4444"
                dominantBaseline="middle"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                Join
              </text>
            )}
          </g>
        );
      })}

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
            stroke={topSuppression?.colour ?? (hoveredEdge === 'top' && isEditMode ? '#3b82f6' : edgeColour(topEdge))}
            strokeWidth={hoveredEdge === 'top' && isEditMode ? 4 : 2}
            strokeDasharray={isWallSuppression(topSuppression) ? '4 2' : (isRawEdge(topEdge) && !topSuppression ? '3 2' : undefined)}
          >
            <title>{topSuppression?.label ?? edgeProfileDisplayName(topEdge)}</title>
          </line>
          {/* Bottom edge */}
          <line
            x1={x + 3}
            y1={y + h - 1}
            x2={x + w - 3}
            y2={y + h - 1}
            stroke={bottomSuppression?.colour ?? (hoveredEdge === 'bottom' && isEditMode ? '#3b82f6' : edgeColour(bottomEdge))}
            strokeWidth={hoveredEdge === 'bottom' && isEditMode ? 4 : 2}
            strokeDasharray={isWallSuppression(bottomSuppression) ? '4 2' : (isRawEdge(bottomEdge) && !bottomSuppression ? '3 2' : undefined)}
          >
            <title>{bottomSuppression?.label ?? edgeProfileDisplayName(bottomEdge)}</title>
          </line>
          {/* Left edge */}
          <line
            x1={x + 1}
            y1={y + 3}
            x2={x + 1}
            y2={y + h - 3}
            stroke={leftSuppression?.colour ?? (hoveredEdge === 'left' && isEditMode ? '#3b82f6' : edgeColour(leftEdge))}
            strokeWidth={hoveredEdge === 'left' && isEditMode ? 4 : 2}
            strokeDasharray={isWallSuppression(leftSuppression) ? '4 2' : (isRawEdge(leftEdge) && !leftSuppression ? '3 2' : undefined)}
          >
            <title>{leftSuppression?.label ?? edgeProfileDisplayName(leftEdge)}</title>
          </line>
          {/* Right edge */}
          <line
            x1={x + w - 1}
            y1={y + 3}
            x2={x + w - 1}
            y2={y + h - 3}
            stroke={rightSuppression?.colour ?? (hoveredEdge === 'right' && isEditMode ? '#3b82f6' : edgeColour(rightEdge))}
            strokeWidth={hoveredEdge === 'right' && isEditMode ? 4 : 2}
            strokeDasharray={isWallSuppression(rightSuppression) ? '4 2' : (isRawEdge(rightEdge) && !rightSuppression ? '3 2' : undefined)}
          >
            <title>{rightSuppression?.label ?? edgeProfileDisplayName(rightEdge)}</title>
          </line>

          {/* Edge hit areas for clicking individual edges (edit mode) */}
          {isEditMode && onEdgeClick && (
            <>
              <line
                x1={x + 3} y1={y + 1} x2={x + w - 3} y2={y + 1}
                stroke="transparent" strokeWidth={edgeHitWidth}
                style={{ cursor: topSuppression ? 'not-allowed' : 'pointer' }}
                onClick={e => handleEdgeClick('top', e)}
                onMouseEnter={() => setHoveredEdge('top')}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <title>{topSuppression?.label ?? edgeProfileDisplayName(topEdge)}</title>
              </line>
              <line
                x1={x + 3} y1={y + h - 1} x2={x + w - 3} y2={y + h - 1}
                stroke="transparent" strokeWidth={edgeHitWidth}
                style={{ cursor: bottomSuppression ? 'not-allowed' : 'pointer' }}
                onClick={e => handleEdgeClick('bottom', e)}
                onMouseEnter={() => setHoveredEdge('bottom')}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <title>{bottomSuppression?.label ?? edgeProfileDisplayName(bottomEdge)}</title>
              </line>
              <line
                x1={x + 1} y1={y + 3} x2={x + 1} y2={y + h - 3}
                stroke="transparent" strokeWidth={edgeHitWidth}
                style={{ cursor: leftSuppression ? 'not-allowed' : 'pointer' }}
                onClick={e => handleEdgeClick('left', e)}
                onMouseEnter={() => setHoveredEdge('left')}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <title>{leftSuppression?.label ?? edgeProfileDisplayName(leftEdge)}</title>
              </line>
              <line
                x1={x + w - 1} y1={y + 3} x2={x + w - 1} y2={y + h - 3}
                stroke="transparent" strokeWidth={edgeHitWidth}
                style={{ cursor: rightSuppression ? 'not-allowed' : 'pointer' }}
                onClick={e => handleEdgeClick('right', e)}
                onMouseEnter={() => setHoveredEdge('right')}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <title>{rightSuppression?.label ?? edgeProfileDisplayName(rightEdge)}</title>
              </line>
            </>
          )}

          {/* Edge profile code labels (only when piece is large enough) */}
          {w >= 40 && h >= 40 && (
            <>
              {/* Top edge label */}
              {(topSuppression || !isRawEdge(topEdge)) && (
                <text
                  x={x + w / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill={topSuppression?.colour ?? edgeColour(topEdge)}
                  style={{ pointerEvents: 'none' }}
                >
                  <title>{topSuppression?.label ?? edgeProfileDisplayName(topEdge)}</title>
                  {topSuppression?.code ?? edgeCode(topEdge)}
                </text>
              )}
              {/* Bottom edge label */}
              {(bottomSuppression || !isRawEdge(bottomEdge)) && (
                <text
                  x={x + w / 2}
                  y={y + h + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill={bottomSuppression?.colour ?? edgeColour(bottomEdge)}
                  style={{ pointerEvents: 'none' }}
                >
                  <title>{bottomSuppression?.label ?? edgeProfileDisplayName(bottomEdge)}</title>
                  {bottomSuppression?.code ?? edgeCode(bottomEdge)}
                </text>
              )}
              {/* Left edge label */}
              {(leftSuppression || !isRawEdge(leftEdge)) && (
                <text
                  x={x - 6}
                  y={y + h / 2}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill={leftSuppression?.colour ?? edgeColour(leftEdge)}
                  style={{ pointerEvents: 'none' }}
                  transform={`rotate(-90, ${x - 6}, ${y + h / 2})`}
                >
                  <title>{leftSuppression?.label ?? edgeProfileDisplayName(leftEdge)}</title>
                  {leftSuppression?.code ?? edgeCode(leftEdge)}
                </text>
              )}
              {/* Right edge label */}
              {(rightSuppression || !isRawEdge(rightEdge)) && (
                <text
                  x={x + w + 6}
                  y={y + h / 2}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill={rightSuppression?.colour ?? edgeColour(rightEdge)}
                  style={{ pointerEvents: 'none' }}
                  transform={`rotate(90, ${x + w + 6}, ${y + h / 2})`}
                >
                  <title>{rightSuppression?.label ?? edgeProfileDisplayName(rightEdge)}</title>
                  {rightSuppression?.code ?? edgeCode(rightEdge)}
                </text>
              )}
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

      {/* Build-up construction badge */}
      {piece.laminationMethod === 'MITRED' && w > 50 && h > 36 && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 22}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: '9px', fill: '#92400e', pointerEvents: 'none' }}
        >
          {piece.mitredCornerTreatment === 'SQUARE_TOP' ? 'Build-up SQ'
            : piece.mitredCornerTreatment === 'ROUND_TOP' ? 'Build-up RD'
            : 'Build-up'}
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
