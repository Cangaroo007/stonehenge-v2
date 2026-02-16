'use client';

import React from 'react';
import { Placement } from '@/types/slab-optimization';

interface SlabCanvasProps {
  slabWidth: number;
  slabHeight: number;
  placements: Placement[];
  scale?: number;
  showLabels?: boolean;
  showDimensions?: boolean;
  highlightPieceId?: string;
  maxWidth?: number;
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

export function SlabCanvas({
  slabWidth,
  slabHeight,
  placements,
  scale: propScale,
  showLabels = true,
  showDimensions = true,
  highlightPieceId,
  maxWidth = 600,
}: SlabCanvasProps) {
  // Calculate scale to fit container
  const scale = propScale ?? Math.min(maxWidth / slabWidth, 400 / slabHeight);

  const canvasWidth = slabWidth * scale;
  const canvasHeight = slabHeight * scale;

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

        {/* Placed pieces */}
        {placements.map((placement, index) => {
          const x = placement.x * scale;
          const y = placement.y * scale;
          const width = placement.width * scale;
          const height = placement.height * scale;
          const isHighlighted = highlightPieceId === placement.pieceId;
          const isLaminationStrip = placement.isLaminationStrip === true;
          const isSegment = placement.isSegment === true;

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
      </div>
    </div>
  );
}

export default SlabCanvas;
