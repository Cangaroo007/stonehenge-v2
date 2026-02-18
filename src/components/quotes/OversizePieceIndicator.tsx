'use client';

import React from 'react';
import type { OversizePieceInfo } from '@/types/slab-optimization';

interface OversizePieceIndicatorProps {
  oversizePiece: OversizePieceInfo;
}

const STRATEGY_LABELS: Record<OversizePieceInfo['joinStrategy'], string> = {
  LENGTHWISE: 'Vertical join',
  WIDTHWISE: 'Horizontal join',
  MULTI_JOIN: 'Multiple joins',
};

/**
 * Displays join information for an oversize piece, including a simple
 * SVG diagram showing the suggested join position as a dashed line.
 *
 * NOTE: The join position is display-only for now. Series SI will make
 * the dashed line draggable.
 */
export function OversizePieceIndicator({ oversizePiece }: OversizePieceIndicatorProps) {
  const { label, joinStrategy, segments, suggestedJoinPosition_mm } = oversizePiece;

  // Compute total piece dimensions from segments
  const totalLength = segments.reduce((max, s) => Math.max(max, s.length), 0) *
    (joinStrategy === 'LENGTHWISE' || joinStrategy === 'MULTI_JOIN' ? segments.length : 1);
  const totalWidth = segments.reduce((max, s) => Math.max(max, s.width), 0) *
    (joinStrategy === 'WIDTHWISE' || joinStrategy === 'MULTI_JOIN' ? segments.length : 1);

  // For the diagram, use first segment + total
  const diagramWidth = 200;
  const diagramHeight = joinStrategy === 'WIDTHWISE' || joinStrategy === 'MULTI_JOIN' ? 60 : 40;

  // Calculate join line position as a fraction
  const pieceTotalLength = joinStrategy === 'LENGTHWISE' || joinStrategy === 'MULTI_JOIN'
    ? segments.reduce((sum, s) => sum + s.length, 0)
    : segments[0]?.length ?? 0;
  const pieceTotalWidth = joinStrategy === 'WIDTHWISE' || joinStrategy === 'MULTI_JOIN'
    ? segments.reduce((sum, s) => sum + s.width, 0)
    : segments[0]?.width ?? 0;

  const joinFractionX = pieceTotalLength > 0
    ? suggestedJoinPosition_mm / pieceTotalLength
    : 0.5;
  const joinFractionY = pieceTotalWidth > 0
    ? suggestedJoinPosition_mm / pieceTotalWidth
    : 0.5;

  return (
    <div className="flex items-start gap-3 text-xs">
      {/* Mini diagram */}
      <svg
        width={diagramWidth}
        height={diagramHeight}
        className="flex-shrink-0 border border-gray-200 rounded bg-white"
      >
        {/* Piece rectangle */}
        <rect
          x={2}
          y={2}
          width={diagramWidth - 4}
          height={diagramHeight - 4}
          fill="#E5E7EB"
          stroke="#6B7280"
          strokeWidth={1}
          rx={2}
        />

        {/* Vertical join line */}
        {(joinStrategy === 'LENGTHWISE' || joinStrategy === 'MULTI_JOIN') && (
          <line
            x1={2 + joinFractionX * (diagramWidth - 4)}
            y1={2}
            x2={2 + joinFractionX * (diagramWidth - 4)}
            y2={diagramHeight - 2}
            stroke="#EF4444"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}

        {/* Horizontal join line */}
        {(joinStrategy === 'WIDTHWISE' || joinStrategy === 'MULTI_JOIN') && (
          <line
            x1={2}
            y1={2 + joinFractionY * (diagramHeight - 4)}
            x2={diagramWidth - 2}
            y2={2 + joinFractionY * (diagramHeight - 4)}
            stroke="#EF4444"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}

        {/* Label */}
        <text
          x={diagramWidth / 2}
          y={diagramHeight / 2 + 3}
          textAnchor="middle"
          fill="#374151"
          fontSize={9}
        >
          {label.length > 25 ? label.substring(0, 25) + '...' : label}
        </text>
      </svg>

      {/* Text description */}
      <div className="space-y-0.5">
        <div className="font-medium text-amber-900">
          {label}
        </div>
        <div className="text-amber-700">
          {STRATEGY_LABELS[joinStrategy]} at {suggestedJoinPosition_mm}mm from{' '}
          {joinStrategy === 'WIDTHWISE' ? 'top edge' : 'left edge'}
        </div>
        <div className="text-amber-600">
          {segments.length} {segments.length === 1 ? 'segment' : 'segments'}:{' '}
          {segments.map((s) => `${s.length}\u00D7${s.width}mm`).join(', ')}
        </div>
        <div className="text-gray-500 italic">
          Join position is a suggestion based on slab constraints
        </div>
      </div>
    </div>
  );
}

export default OversizePieceIndicator;
