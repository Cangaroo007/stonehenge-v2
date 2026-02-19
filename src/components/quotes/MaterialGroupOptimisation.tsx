'use client';

import React, { useState } from 'react';
import type { MaterialGroupResult, MultiMaterialOptimisationResult, SlabCutoutInfo } from '@/types/slab-optimization';
import { SlabCanvas } from '@/components/slab-optimizer/SlabCanvas';
import { PIECE_COLORS } from '@/components/slab-optimizer/SlabResults';
import { OversizePieceIndicator } from './OversizePieceIndicator';

// ── Per-material section ─────────────────────────────────────────────────────

interface MaterialGroupSectionProps {
  group: MaterialGroupResult;
  defaultExpanded?: boolean;
  pieceCutouts?: Record<string, SlabCutoutInfo[]>;
}

function MaterialGroupSection({ group, defaultExpanded = false, pieceCutouts }: MaterialGroupSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-gray-900">
            {group.materialName}
          </span>
          <span className="text-sm text-gray-500">
            ({group.slabDimensions.length} &times; {group.slabDimensions.width}mm)
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-700">
            {group.slabCount} {group.slabCount === 1 ? 'slab' : 'slabs'}
          </span>
          <span className="text-gray-400">&middot;</span>
          <span className={
            group.wastePercentage < 15 ? 'text-green-600' :
            group.wastePercentage < 25 ? 'text-amber-600' : 'text-red-600'
          }>
            {group.wastePercentage.toFixed(1)}% waste
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Piece list */}
          <div className="flex flex-wrap gap-1.5">
            {group.pieces.map((piece) => (
              <span
                key={piece.pieceId}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
              >
                {piece.label} ({piece.dimensions.length}&times;{piece.dimensions.width}mm)
              </span>
            ))}
          </div>

          {/* Oversize piece warnings */}
          {group.oversizePieces.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h4 className="text-sm font-medium text-amber-900 mb-2">
                {group.oversizePieces.length} oversize {group.oversizePieces.length === 1 ? 'piece' : 'pieces'}
              </h4>
              <div className="space-y-2">
                {group.oversizePieces.map((op) => (
                  <OversizePieceIndicator key={op.pieceId} oversizePiece={op} />
                ))}
              </div>
            </div>
          )}

          {/* Slab layouts */}
          {group.slabLayouts.map((slab) => (
            <div key={slab.slabIndex} className="border border-gray-100 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-medium text-gray-900">
                  Slab {slab.slabIndex + 1} of {group.slabCount}
                </h4>
                <span className="text-xs text-gray-500">
                  {slab.placements.length} pieces &middot; {slab.wastePercent.toFixed(1)}% waste
                </span>
              </div>

              <SlabCanvas
                slabWidth={group.slabDimensions.length}
                slabHeight={group.slabDimensions.width}
                placements={slab.placements}
                showLabels={true}
                showDimensions={true}
                pieceCutouts={pieceCutouts}
              />

              {/* Piece tags for this slab */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {slab.placements.map((p, i) => {
                  const isLamination = p.isLaminationStrip === true;
                  const isSegment = p.isSegment === true;
                  return (
                    <span
                      key={p.pieceId}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                        isLamination
                          ? 'bg-gray-300 text-gray-700 border border-gray-400'
                          : isSegment
                          ? 'text-white border-2 border-dashed border-white/50'
                          : 'text-white'
                      }`}
                      style={isLamination ? {} : { backgroundColor: PIECE_COLORS[i % PIECE_COLORS.length] }}
                    >
                      {isLamination && '\u25A6 '}
                      {isSegment && '\u229E '}
                      {p.label} ({p.width}&times;{p.height})
                      {p.rotated && ' \u21BB'}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Lamination summary for this group */}
          {group.optimizationResult.laminationSummary && group.optimizationResult.laminationSummary.totalStrips > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h4 className="text-sm font-medium text-blue-900 mb-1">
                Lamination Strips ({group.optimizationResult.laminationSummary.totalStrips})
              </h4>
              <div className="space-y-1">
                {group.optimizationResult.laminationSummary.stripsByParent.map((parent) => (
                  <div key={parent.parentPieceId} className="text-xs text-blue-700">
                    <span className="font-medium">{parent.parentLabel}:</span>{' '}
                    {parent.strips.map(s =>
                      `${s.position} (${s.lengthMm}\u00D7${s.widthMm}mm)`
                    ).join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Unassigned material warning ──────────────────────────────────────────────

interface UnassignedWarningProps {
  warnings: string[];
}

function UnassignedMaterialWarning({ warnings }: UnassignedWarningProps) {
  const unassignedWarnings = warnings.filter((w) =>
    w.includes('no material assigned')
  );

  if (unassignedWarnings.length === 0) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
      <div className="flex items-start gap-2">
        <svg className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div>
          {unassignedWarnings.map((w, i) => (
            <p key={i} className="text-sm text-yellow-800">{w}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface MultiMaterialOptimisationDisplayProps {
  multiMaterialResult: MultiMaterialOptimisationResult;
  isOptimising?: boolean;
  pieceCutouts?: Record<string, SlabCutoutInfo[]>;
}

export function MultiMaterialOptimisationDisplay({
  multiMaterialResult,
  isOptimising = false,
  pieceCutouts,
}: MultiMaterialOptimisationDisplayProps) {
  return (
    <div className={`space-y-4 ${isOptimising ? 'opacity-60' : ''}`}>
      {/* Unassigned material warning */}
      {multiMaterialResult.warnings && (
        <UnassignedMaterialWarning warnings={multiMaterialResult.warnings} />
      )}

      {/* Material group sections */}
      {multiMaterialResult.materialGroups.map((group, index) => (
        <MaterialGroupSection
          key={group.materialId}
          group={group}
          defaultExpanded={index === 0}
          pieceCutouts={pieceCutouts}
        />
      ))}

      {/* Combined totals */}
      {multiMaterialResult.materialGroups.length > 1 && (
        <div className="border-t-2 border-gray-300 pt-4">
          <div className="flex items-center justify-between px-1">
            <span className="font-bold text-gray-900">
              TOTAL: {multiMaterialResult.totalSlabCount} {multiMaterialResult.totalSlabCount === 1 ? 'slab' : 'slabs'}
            </span>
            <span className={`font-bold ${
              multiMaterialResult.overallWastePercentage < 15 ? 'text-green-600' :
              multiMaterialResult.overallWastePercentage < 25 ? 'text-amber-600' : 'text-red-600'
            }`}>
              Avg waste: {multiMaterialResult.overallWastePercentage.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* All warnings (excluding unassigned, already shown) */}
      {multiMaterialResult.warnings && multiMaterialResult.warnings.filter(
        (w) => !w.includes('no material assigned')
      ).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-amber-900 mb-1">Optimiser Notices</h4>
          <ul className="space-y-0.5">
            {multiMaterialResult.warnings
              .filter((w) => !w.includes('no material assigned'))
              .map((warning, i) => (
                <li key={i} className="text-xs text-amber-700">{warning}</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default MultiMaterialOptimisationDisplay;
