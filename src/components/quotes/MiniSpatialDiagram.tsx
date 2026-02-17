'use client';

import { useMemo, useState } from 'react';
import type { PieceGroup, GroupedPiece } from '@/lib/types/piece-groups';

// ─── Props ──────────────────────────────────────────────────────────────────

interface MiniSpatialDiagramProps {
  group: PieceGroup;
  selectedPieceId?: number;
  onPieceClick: (pieceId: number) => void;
  onPieceExpand: (pieceId: number) => void;
  mode: 'view' | 'edit';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SVG_WIDTH = 400;
const SVG_HEIGHT = 250;
const PADDING = 40;
const BADGE_SIZE = 28;
const FONT_SIZE_DIM = 10;
const FONT_SIZE_BADGE = 12;

// Fill colours by relationship type
const FILL_COLOURS: Record<string, string> = {
  STANDALONE: '#f0f4f8',
  ISLAND: '#f0f4f8',
  WATERFALL: '#e8f5e9',
  SPLASHBACK: '#fff3e0',
  RETURN_END: '#f3e5f5',
  WINDOW_SILL: '#fff3e0',
  MITRE_JOIN: '#f0f4f8',
  BUTT_JOIN: '#f0f4f8',
  LAMINATION: '#f0f4f8',
};

// Edge profile colours (matches PieceVisualEditor)
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
  return name.toLowerCase().includes('raw') || name.toLowerCase() === 'none';
}

// ─── Layout helpers ─────────────────────────────────────────────────────────

interface LayoutRect {
  piece: GroupedPiece;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Calculate absolute pixel positions for all pieces in a group.
 * The primary is centred, and related pieces are positioned adjacent.
 */
function calculateLayout(group: PieceGroup): LayoutRect[] {
  const all = [group.primaryPiece, ...group.relatedPieces];

  // Find the max dimension to calculate scale
  const maxDim = Math.max(
    ...all.map((p) => Math.max(p.dimensions.lengthMm, p.dimensions.widthMm))
  );
  if (maxDim === 0) return [];

  // Available drawing area
  const drawW = SVG_WIDTH - PADDING * 2;
  const drawH = SVG_HEIGHT - PADDING * 2;

  // Calculate bounding box of the layout in mm-space first
  const primary = group.primaryPiece;
  const primaryW = primary.dimensions.lengthMm;
  const primaryH = primary.dimensions.widthMm;

  // Position all pieces in mm-space relative to primary origin (0,0)
  interface MmRect {
    piece: GroupedPiece;
    x: number;
    y: number;
    w: number;
    h: number;
  }
  const mmRects: MmRect[] = [];

  // Primary at origin
  mmRects.push({ piece: primary, x: 0, y: 0, w: primaryW, h: primaryH });

  // Place related pieces
  for (const rp of group.relatedPieces) {
    const rpW = rp.dimensions.lengthMm;
    const rpH = rp.dimensions.widthMm;

    let rx = 0;
    let ry = 0;
    let rw = rpW;
    let rh = rpH;

    switch (rp.relationship) {
      case 'WATERFALL':
        // Rotated 90deg, narrow side matches primary depth
        rw = rpH; // waterfall width becomes displayed height
        rh = rpW; // waterfall height (drop) becomes displayed width
        if (rp.position.side === 'right') {
          rx = primaryW + 4; // Small gap
          ry = 0;
        } else {
          rx = -(rw + 4);
          ry = 0;
        }
        break;

      case 'SPLASHBACK':
        rw = rpW;
        rh = rpH;
        rx = 0;
        ry = -(rh + 4);
        break;

      case 'RETURN_END':
        rw = rpW;
        rh = rpH;
        if (rp.position.side === 'right') {
          rx = primaryW + 4;
          ry = primaryH - rh;
        } else {
          rx = -(rw + 4);
          ry = primaryH - rh;
        }
        break;

      case 'WINDOW_SILL':
        rw = rpW;
        rh = rpH;
        rx = 0;
        ry = -(rh + 4);
        break;

      case 'MITRE_JOIN':
      case 'BUTT_JOIN':
        rw = rpW;
        rh = rpH;
        if (rp.position.side === 'right') {
          rx = primaryW + 4;
          ry = 0;
        } else if (rp.position.side === 'left') {
          rx = -(rw + 4);
          ry = 0;
        } else {
          rx = primaryW + 4;
          ry = 0;
        }
        break;

      default:
        // LAMINATION, STANDALONE, etc: skip spatial positioning
        continue;
    }

    mmRects.push({ piece: rp, x: rx, y: ry, w: rw, h: rh });
  }

  if (mmRects.length === 0) return [];

  // Calculate bounding box in mm-space
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of mmRects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }

  const totalW = maxX - minX;
  const totalH = maxY - minY;

  // Scale to fit drawing area
  const scale = Math.min(drawW / totalW, drawH / totalH, 1);

  // Centre the layout
  const scaledW = totalW * scale;
  const scaledH = totalH * scale;
  const offsetX = PADDING + (drawW - scaledW) / 2;
  const offsetY = PADDING + (drawH - scaledH) / 2;

  // Convert to pixel coordinates
  return mmRects.map((r) => ({
    piece: r.piece,
    x: offsetX + (r.x - minX) * scale,
    y: offsetY + (r.y - minY) * scale,
    w: r.w * scale,
    h: r.h * scale,
  }));
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PieceRect({
  rect,
  pieceIndex,
  isSelected,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  rect: LayoutRect;
  pieceIndex: number;
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const { piece, x, y, w, h } = rect;
  const fill = FILL_COLOURS[piece.relationship] || '#f0f4f8';
  const isLaminated =
    piece.dimensions.thicknessMm >= 40 || piece.relationship === 'LAMINATION';

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Piece rectangle */}
      <rect
        x={x}
        y={y}
        width={Math.max(w, 2)}
        height={Math.max(h, 2)}
        fill={isHovered ? '#e3f2fd' : fill}
        stroke={isSelected ? '#1976d2' : isHovered ? '#90caf9' : '#94a3b8'}
        strokeWidth={isSelected ? 2.5 : isLaminated ? 2.5 : 1}
        strokeDasharray={isLaminated && !isSelected ? '4 2' : undefined}
        rx={3}
        ry={3}
      />

      {/* Edge profile lines */}
      {w > 20 && h > 20 && (
        <>
          {/* Top edge */}
          <line
            x1={x + 3}
            y1={y + 1}
            x2={x + w - 3}
            y2={y + 1}
            stroke={edgeColour(piece.edges.top)}
            strokeWidth={2}
            strokeDasharray={isRawEdge(piece.edges.top) ? '3 2' : undefined}
          />
          {/* Bottom edge */}
          <line
            x1={x + 3}
            y1={y + h - 1}
            x2={x + w - 3}
            y2={y + h - 1}
            stroke={edgeColour(piece.edges.bottom)}
            strokeWidth={2}
            strokeDasharray={isRawEdge(piece.edges.bottom) ? '3 2' : undefined}
          />
          {/* Left edge */}
          <line
            x1={x + 1}
            y1={y + 3}
            x2={x + 1}
            y2={y + h - 3}
            stroke={edgeColour(piece.edges.left)}
            strokeWidth={2}
            strokeDasharray={isRawEdge(piece.edges.left) ? '3 2' : undefined}
          />
          {/* Right edge */}
          <line
            x1={x + w - 1}
            y1={y + 3}
            x2={x + w - 1}
            y2={y + h - 3}
            stroke={edgeColour(piece.edges.right)}
            strokeWidth={2}
            strokeDasharray={isRawEdge(piece.edges.right) ? '3 2' : undefined}
          />
        </>
      )}

      {/* Piece number badge */}
      <rect
        x={x + w / 2 - BADGE_SIZE / 2}
        y={y + h / 2 - BADGE_SIZE / 2}
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        rx={6}
        fill="#111827"
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={FONT_SIZE_BADGE}
        fontWeight="bold"
      >
        {pieceIndex}
      </text>

      {/* Lamination indicator */}
      {isLaminated && (
        <text
          x={x + w / 2 + BADGE_SIZE / 2 + 4}
          y={y + h / 2 + 1}
          textAnchor="start"
          dominantBaseline="central"
          fill="#6b7280"
          fontSize={9}
          fontWeight="bold"
        >
          L
        </text>
      )}

      {/* Dimension label below piece */}
      <text
        x={x + w / 2}
        y={y + h + 14}
        textAnchor="middle"
        fill="#52525b"
        fontSize={FONT_SIZE_DIM}
      >
        {piece.dimensions.lengthMm}&times;{piece.dimensions.widthMm}
      </text>
    </g>
  );
}

function JoinIndicator({
  rect1,
  rect2,
  joinType,
}: {
  rect1: LayoutRect;
  rect2: LayoutRect;
  joinType: 'MITRE_JOIN' | 'BUTT_JOIN';
}) {
  // Draw between the two closest edges
  const isRight = rect2.x > rect1.x;
  const x1 = isRight ? rect1.x + rect1.w : rect1.x;
  const x2 = isRight ? rect2.x : rect2.x + rect2.w;
  const midX = (x1 + x2) / 2;
  const topY = Math.min(rect1.y, rect2.y);
  const bottomY = Math.max(rect1.y + rect1.h, rect2.y + rect2.h);

  return (
    <g>
      <line
        x1={midX}
        y1={topY}
        x2={midX}
        y2={bottomY}
        stroke="#94a3b8"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <text
        x={midX}
        y={topY - 4}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={8}
      >
        {joinType === 'MITRE_JOIN' ? 'mitre' : 'butt'}
      </text>
    </g>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function MiniSpatialDiagram({
  group,
  selectedPieceId,
  onPieceClick,
  onPieceExpand,
  mode,
}: MiniSpatialDiagramProps) {
  const [hoveredPieceId, setHoveredPieceId] = useState<number | null>(null);

  const layout = useMemo(() => calculateLayout(group), [group]);

  // Build a piece index map (for badge numbers)
  const allPieces = useMemo(() => {
    return [group.primaryPiece, ...group.relatedPieces];
  }, [group]);

  // Build a map from pieceId to its index in the overall group
  const pieceIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    allPieces.forEach((p, i) => map.set(p.pieceId, i + 1));
    return map;
  }, [allPieces]);

  if (layout.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-sm text-zinc-400">
        No spatial data
      </div>
    );
  }

  // Find join indicators
  const primaryRect = layout.find(
    (r) => r.piece.pieceId === group.primaryPiece.pieceId
  );
  const joinRects = layout.filter(
    (r) =>
      r.piece.relationship === 'MITRE_JOIN' ||
      r.piece.relationship === 'BUTT_JOIN'
  );

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full max-w-[400px] h-auto"
        style={{ minHeight: 140 }}
      >
        {/* Join indicators */}
        {primaryRect &&
          joinRects.map((jr) => (
            <JoinIndicator
              key={`join-${jr.piece.pieceId}`}
              rect1={primaryRect}
              rect2={jr}
              joinType={
                jr.piece.relationship as 'MITRE_JOIN' | 'BUTT_JOIN'
              }
            />
          ))}

        {/* Piece rectangles */}
        {layout.map((rect) => (
          <PieceRect
            key={rect.piece.pieceId}
            rect={rect}
            pieceIndex={pieceIndexMap.get(rect.piece.pieceId) ?? 0}
            isSelected={selectedPieceId === rect.piece.pieceId}
            isHovered={hoveredPieceId === rect.piece.pieceId}
            onMouseEnter={() => setHoveredPieceId(rect.piece.pieceId)}
            onMouseLeave={() => setHoveredPieceId(null)}
            onClick={() => onPieceClick(rect.piece.pieceId)}
          />
        ))}
      </svg>

      {/* Expand button — only in edit mode or when a piece is selected */}
      {mode === 'edit' && selectedPieceId && (
        <button
          onClick={() => onPieceExpand(selectedPieceId)}
          className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow-sm hover:bg-white hover:shadow-md transition-all"
          title="Open piece in new tab"
        >
          <svg
            className="h-3.5 w-3.5 text-gray-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
