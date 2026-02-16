'use client';

import React from 'react';
import { OptimizationResult } from '@/types/slab-optimization';
import { SlabCanvas } from './SlabCanvas';

interface SlabResultsProps {
  result: OptimizationResult;
  slabWidth: number;
  slabHeight: number;
}

// Color palette for pieces (must match SlabCanvas)
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

export function SlabResults({ result, slabWidth, slabHeight }: SlabResultsProps) {
  if (result.totalSlabs === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No pieces to display
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4 flex flex-wrap gap-6">
        <div>
          <div className="text-sm text-gray-500">Total Slabs</div>
          <div className="text-2xl font-bold text-gray-900">{result.totalSlabs}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Material Used</div>
          <div className="text-2xl font-bold text-gray-900">
            {(result.totalUsedArea / 1000000).toFixed(2)} m²
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Waste</div>
          <div className={`text-2xl font-bold ${
            result.wastePercent < 15 ? 'text-green-600' :
            result.wastePercent < 25 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {result.wastePercent.toFixed(1)}%
          </div>
        </div>
        {result.unplacedPieces.length > 0 && (
          <div>
            <div className="text-sm text-gray-500">Unplaced Pieces</div>
            <div className="text-2xl font-bold text-red-600">
              {result.unplacedPieces.length}
            </div>
          </div>
        )}
      </div>

      {/* Optimizer warnings (oversize splits, etc.) */}
      {result.warnings && result.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="font-medium text-amber-900 mb-2">Optimizer Notices</h4>
          <ul className="space-y-1">
            {result.warnings.map((warning, i) => (
              <li key={i} className="text-sm text-amber-700">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lamination Summary */}
      {result.laminationSummary && result.laminationSummary.totalStrips > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
            Lamination Strips (40mm Build-Up)
          </h4>
          
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <span className="text-sm text-blue-700">Total Strips:</span>
              <span className="ml-2 font-semibold text-blue-900">{result.laminationSummary.totalStrips}</span>
            </div>
            <div>
              <span className="text-sm text-blue-700">Strip Area:</span>
              <span className="ml-2 font-semibold text-blue-900">
                {result.laminationSummary.totalStripArea.toFixed(4)} m²
              </span>
            </div>
          </div>
          
          {/* Detailed breakdown by piece */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-blue-800 mb-1">Strip Details:</div>
            {result.laminationSummary.stripsByParent.map((parent) => (
              <div key={parent.parentPieceId} className="text-xs text-blue-700 bg-white/50 rounded px-2 py-1">
                <span className="font-medium">{parent.parentLabel}:</span>
                {' '}
                {parent.strips.map(s => 
                  `${s.position} (${s.lengthMm}×${s.widthMm}mm)`
                ).join(', ')}
              </div>
            ))}
          </div>
          
          <p className="text-xs text-blue-600 mt-3">
            ℹ️ Lamination strips are cut from the same slab material and glued underneath finished edges
          </p>
        </div>
      )}

      {/* Unplaced warning */}
      {result.unplacedPieces.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-red-800 font-medium">
            {result.unplacedPieces.length} piece(s) could not be placed
          </h4>
          <p className="text-red-600 text-sm mt-1">
            These pieces exceed slab dimensions and need manual review.
            The slab count and material cost below may be underestimated.
          </p>
          <ul className="mt-2 space-y-1">
            {result.unplacedPieces.map((id) => (
              <li key={id} className="text-sm text-red-700">
                Piece ID: {id}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Individual slabs */}
      <div className="grid gap-6">
        {result.slabs.map((slab) => (
          <div key={slab.slabIndex} className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-gray-900">
                Slab {slab.slabIndex + 1}
              </h3>
              <div className="text-sm text-gray-500">
                {slab.placements.length} pieces · {slab.wastePercent.toFixed(1)}% waste
              </div>
            </div>

            <SlabCanvas
              slabWidth={slabWidth}
              slabHeight={slabHeight}
              placements={slab.placements}
              showLabels={true}
              showDimensions={true}
            />

            {/* Piece list for this slab */}
            <div className="mt-3 flex flex-wrap gap-2">
              {slab.placements.map((p, i) => {
                const isLamination = p.isLaminationStrip === true;
                const isSegment = p.isSegment === true;
                return (
                  <span
                    key={p.pieceId}
                    className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                      isLamination
                        ? 'bg-gray-300 text-gray-700 border border-gray-400'
                        : isSegment
                        ? 'text-white border-2 border-dashed border-white/50'
                        : 'text-white'
                    }`}
                    style={isLamination ? {} : { backgroundColor: PIECE_COLORS[i % PIECE_COLORS.length] }}
                  >
                    {isLamination && '▦ '}
                    {isSegment && '⊞ '}
                    {p.label} ({p.width}×{p.height})
                    {p.rotated && ' ↻'}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { PIECE_COLORS };
export default SlabResults;
