'use client';

import React from 'react';
import { Placement } from '@/types/slab-optimization';
import type { SlabCutoutInfo } from '@/types/slab-optimization';

interface SlabCanvasProps {
  slabWidth: number;
  slabHeight: number;
  placements: Placement[];
  scale?: number;
  showLabels?: boolean;
  showDimensions?: boolean;
  highlightPieceId?: string;
  maxWidth?: number;
  /** Edge allowance in mm per side — shown as a shaded border zone */
  edgeAllowanceMm?: number;
  /** Cutout data per piece (keyed by pieceId) for overlay rendering */
  pieceCutouts?: Record<string, SlabCutoutInfo[]>;
}

// Color palette for main pieces
const PIECE_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

// Lamination strip colors
const LAMINATION_COLOR = '#D1D5DB'; // gray-300
const LAMINATION_PATTERN_COLOR = '#9CA3AF'; // gray-400

function getColorForPiece(index: number, isLaminationStrip?: boolean): string {
  if (isLaminationStrip) {
    return LAMINATION_COLOR;
  }
  return PIECE_COLORS[index % PIECE_COLORS.length];
}

/** Common SVG style for cutout shapes */
const CUTOUT_STYLE = {
  stroke: '#666',
  strokeWidth: 1,
  strokeDasharray: '4 2',
  fill: 'rgba(0,0,0,0.08)',
} as const;

/**
 * Render cutout shapes inside a piece on the slab layout.
 * Only renders when piece is large enough to show cutouts meaningfully.
 */
function renderCutouts(
  cutouts: SlabCutoutInfo[],
  pieceX: number,
  pieceY: number,
  pieceW: number,
  pieceH: number,
  scale: number,
  pieceId: string,
) {
  // Skip if piece is too small to show cutouts meaningfully
  if (pieceW < 40 || pieceH < 25) return null;

  // Expand quantity > 1 into individual cutout entries for positioning
  const expandedCutouts: Array<{ typeName: string; width?: number; height?: number; idx: number }> = [];
  cutouts.forEach((c) => {
    for (let q = 0; q < c.quantity; q++) {
      expandedCutouts.push({ typeName: c.typeName, width: c.width, height: c.height, idx: expandedCutouts.length });
    }
  });

  if (expandedCutouts.length === 0) return null;

  return expandedCutouts.map((cutout) => {
    const lower = cutout.typeName.toLowerCase();

    if (lower.includes('undermount') || lower.includes('drop')) {
      // Undermount / Drop-in Sink: dashed rectangle, centred
      const w = Math.min((cutout.width ?? 750) * scale, pieceW * 0.85);
      const h = Math.min((cutout.height ?? 450) * scale, pieceH * 0.7);
      const cx = pieceX + (pieceW - w) / 2;
      const cy = pieceY + (pieceH - h) / 2;
      return <rect key={`${pieceId}-cut-${cutout.idx}`} x={cx} y={cy} width={w} height={h} rx={4} {...CUTOUT_STYLE} />;
    }

    if (lower.includes('cooktop') || lower.includes('flush') || lower.includes('hotplate')) {
      // Cooktop / Flush Cooktop / Hotplate: dashed rectangle
      const w = Math.min((cutout.width ?? 600) * scale, pieceW * 0.8);
      const h = Math.min((cutout.height ?? 500) * scale, pieceH * 0.75);
      const cx = pieceX + (pieceW - w) / 2;
      const cy = pieceY + (pieceH - h) / 2;
      return <rect key={`${pieceId}-cut-${cutout.idx}`} x={cx} y={cy} width={w} height={h} {...CUTOUT_STYLE} />;
    }

    if (lower.includes('tap')) {
      // Tap Hole: small circle
      const r = Math.min(17.5 * scale, pieceW * 0.08, pieceH * 0.15);
      // Offset multiple tap holes horizontally
      const tapCount = expandedCutouts.filter(c => c.typeName.toLowerCase().includes('tap')).length;
      const tapIdx = expandedCutouts.filter(c => c.typeName.toLowerCase().includes('tap') && c.idx < cutout.idx).length;
      const spacing = pieceW / (tapCount + 1);
      const cx = pieceX + spacing * (tapIdx + 1);
      const cy = pieceY + Math.min(80 * scale, pieceH * 0.3);
      return <circle key={`${pieceId}-cut-${cutout.idx}`} cx={cx} cy={cy} r={r} {...CUTOUT_STYLE} />;
    }

    if (lower.includes('gpo')) {
      // GPO: small rounded rectangle
      const w = Math.min(50 * scale, pieceW * 0.15);
      const h = Math.min(50 * scale, pieceH * 0.25);
      // Offset multiple GPOs horizontally
      const gpoCount = expandedCutouts.filter(c => c.typeName.toLowerCase().includes('gpo')).length;
      const gpoIdx = expandedCutouts.filter(c => c.typeName.toLowerCase().includes('gpo') && c.idx < cutout.idx).length;
      const spacing = pieceW / (gpoCount + 1);
      const cx = pieceX + spacing * (gpoIdx + 1) - w / 2;
      const cy = pieceY + Math.min(80 * scale, pieceH * 0.3) - h / 2;
      return <rect key={`${pieceId}-cut-${cutout.idx}`} x={cx} y={cy} width={w} height={h} rx={2} {...CUTOUT_STYLE} />;
    }

    if (lower.includes('basin')) {
      // Basin: ellipse, centred
      const w = Math.min((cutout.width ?? 400) * scale, pieceW * 0.7);
      const h = Math.min((cutout.height ?? 350) * scale, pieceH * 0.65);
      const cx = pieceX + pieceW / 2;
      const cy = pieceY + pieceH / 2;
      return <ellipse key={`${pieceId}-cut-${cutout.idx}`} cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...CUTOUT_STYLE} />;
    }

    if (lower.includes('drain') || lower.includes('groove')) {
      // Drainer Grooves: parallel lines pattern
      const startX = pieceX + pieceW * 0.1;
      const endX = pieceX + pieceW * 0.4;
      const startY = pieceY + pieceH * 0.2;
      const lineCount = 5;
      const spacing = (pieceH * 0.6) / lineCount;
      return (
        <g key={`${pieceId}-cut-${cutout.idx}`}>
          {Array.from({ length: lineCount }).map((_, j) => (
            <line
              key={j}
              x1={startX} y1={startY + j * spacing}
              x2={endX} y2={startY + j * spacing}
              stroke="#666" strokeWidth={0.5} opacity={0.5}
            />
          ))}
        </g>
      );
    }

    return null;
  });
}

export function SlabCanvas({
  slabWidth,
  slabHeight,
  placements,
  scale: propScale,
  showLabels = true,
  showDimensions = true,
  highlightPieceId,
  maxWidth = 600,
  edgeAllowanceMm = 0,
  pieceCutouts,
}: SlabCanvasProps) {
  // Calculate scale to fit container
  const scale = propScale ?? Math.min(maxWidth / slabWidth, 400 / slabHeight);

  const canvasWidth = slabWidth * scale;
  const canvasHeight = slabHeight * scale;

  // Track whether any cutouts are rendered (for legend)
  const hasCutouts = pieceCutouts && Object.values(pieceCutouts).some(c => c.length > 0);

  return (
    <div className="inline-block">
      <svg
        width={canvasWidth}
        height={canvasHeight}
        className="border border-gray-300 bg-gray-100 rounded"
        style={{ maxWidth: '100%', height: 'auto' }}
      >
        {/* Slab background */}
        <rect
          x={0}
          y={0}
          width={canvasWidth}
          height={canvasHeight}
          fill="#f5f5f5"
          stroke="#d1d5db"
          strokeWidth={2}
        />

        {/* Grid lines and patterns */}
        <defs>
          {/* Grid pattern */}
          <pattern
            id="grid"
            width={100 * scale}
            height={100 * scale}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${100 * scale} 0 L 0 0 0 ${100 * scale}`}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
          </pattern>

          {/* Diagonal stripe pattern for lamination strips */}
          <pattern
            id="laminationPattern"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill={LAMINATION_COLOR} />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke={LAMINATION_PATTERN_COLOR}
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width={canvasWidth} height={canvasHeight} fill="url(#grid)" />

        {/* Edge allowance zone — shaded border around the slab perimeter */}
        {edgeAllowanceMm > 0 && (
          <>
            {/* Top allowance strip */}
            <rect x={0} y={0} width={canvasWidth} height={edgeAllowanceMm * scale}
              fill="#FEF3C7" opacity={0.6} />
            {/* Bottom allowance strip */}
            <rect x={0} y={canvasHeight - edgeAllowanceMm * scale}
              width={canvasWidth} height={edgeAllowanceMm * scale}
              fill="#FEF3C7" opacity={0.6} />
            {/* Left allowance strip */}
            <rect x={0} y={edgeAllowanceMm * scale}
              width={edgeAllowanceMm * scale}
              height={canvasHeight - edgeAllowanceMm * scale * 2}
              fill="#FEF3C7" opacity={0.6} />
            {/* Right allowance strip */}
            <rect x={canvasWidth - edgeAllowanceMm * scale}
              y={edgeAllowanceMm * scale}
              width={edgeAllowanceMm * scale}
              height={canvasHeight - edgeAllowanceMm * scale * 2}
              fill="#FEF3C7" opacity={0.6} />
            {/* Inner usable area border */}
            <rect
              x={edgeAllowanceMm * scale}
              y={edgeAllowanceMm * scale}
              width={canvasWidth - edgeAllowanceMm * scale * 2}
              height={canvasHeight - edgeAllowanceMm * scale * 2}
              fill="none"
              stroke="#F59E0B"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
          </>
        )}

        {/* Placed pieces — rendered bottom-up (Y-axis flipped) */}
        {placements.map((placement, index) => {
          const x = placement.x * scale;
          // Bottom-up: flip Y so (0,0) is at bottom-left visually
          const visualY = slabHeight - placement.y - placement.height;
          const y = visualY * scale;
          const width = placement.width * scale;
          const height = placement.height * scale;
          const isHighlighted = highlightPieceId === placement.pieceId;
          const isLaminationStrip = placement.isLaminationStrip === true;
          const isSegment = placement.isSegment === true;

          // Look up cutouts for this piece (skip for lamination strips)
          const cutouts = (!isLaminationStrip && pieceCutouts)
            ? pieceCutouts[placement.pieceId] ?? []
            : [];

          return (
            <g key={`${placement.pieceId}-${index}`}>
              {/* Piece rectangle */}
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={isLaminationStrip ? 'url(#laminationPattern)' : getColorForPiece(index)}
                stroke={isHighlighted ? '#000' : isLaminationStrip ? '#9CA3AF' : isSegment ? '#FFF' : '#333'}
                strokeWidth={isHighlighted ? 3 : isSegment ? 2 : 1}
                strokeDasharray={isSegment ? '6 3' : undefined}
                opacity={isLaminationStrip ? 0.7 : 0.85}
                className="transition-opacity hover:opacity-100"
              />

              {/* Cutout overlay shapes (inside piece rectangle) */}
              {cutouts.length > 0 && renderCutouts(cutouts, x, y, width, height, scale, placement.pieceId)}

              {/* Label */}
              {showLabels && width > 40 && height > 20 && (
                <text
                  x={x + width / 2}
                  y={y + height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={Math.min(12, width / 8, height / 3)}
                  fontWeight="500"
                  style={{
                    textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
                    pointerEvents: 'none',
                  }}
                >
                  {placement.label.length > 15
                    ? placement.label.substring(0, 15) + '...'
                    : placement.label
                  }
                </text>
              )}

              {/* Dimensions */}
              {showDimensions && width > 60 && height > 40 && (
                <text
                  x={x + width / 2}
                  y={y + height / 2 + 14}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={Math.min(10, width / 10)}
                  opacity={0.9}
                  style={{ pointerEvents: 'none' }}
                >
                  {placement.width}×{placement.height}
                </text>
              )}

              {/* Rotation indicator */}
              {placement.rotated && width > 30 && height > 30 && (
                <text
                  x={x + 8}
                  y={y + 14}
                  fill="white"
                  fontSize={10}
                  opacity={0.8}
                >
                  ↻
                </text>
              )}
            </g>
          );
        })}

        {/* Slab dimensions */}
        {showDimensions && (
          <>
            {/* Width dimension */}
            <text
              x={canvasWidth / 2}
              y={canvasHeight + 16}
              textAnchor="middle"
              fill="#666"
              fontSize={11}
            >
              {slabWidth}mm
            </text>

            {/* Height dimension */}
            <text
              x={-canvasHeight / 2}
              y={-8}
              textAnchor="middle"
              fill="#666"
              fontSize={11}
              transform={`rotate(-90)`}
            >
              {slabHeight}mm
            </text>
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-gray-600 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-blue-500 border border-gray-700 rounded-sm"></div>
          <span>Main Pieces</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="16" className="border border-gray-400 rounded-sm">
            <defs>
              <pattern
                id="legendPattern"
                width="4"
                height="4"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="4" height="4" fill="#D1D5DB" />
                <line x1="0" y1="0" x2="0" y2="4" stroke="#9CA3AF" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="16" height="16" fill="url(#legendPattern)" />
          </svg>
          <span>Lamination Strips (40mm+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-blue-500 border-2 border-dashed border-white rounded-sm" style={{ borderColor: '#fff', outline: '1px solid #333' }}></div>
          <span>Joined Segment</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span>Rotated 90°</span>
        </div>
        {edgeAllowanceMm > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-sm border border-amber-400" style={{ backgroundColor: '#FEF3C7' }}></div>
            <span>Edge Allowance ({edgeAllowanceMm}mm)</span>
          </div>
        )}
        {hasCutouts && (
          <div className="flex items-center gap-1.5">
            <svg width="16" height="16" className="border border-gray-400 rounded-sm">
              <rect x={2} y={2} width={12} height={12} rx={1}
                fill="rgba(0,0,0,0.08)" stroke="#666" strokeWidth={1} strokeDasharray="3 1" />
            </svg>
            <span>Cutout/Feature</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SlabCanvas;
