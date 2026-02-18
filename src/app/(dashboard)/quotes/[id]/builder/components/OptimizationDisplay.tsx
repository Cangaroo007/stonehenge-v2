'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SlabResults } from '@/components/slab-optimizer';
import { OptimizationResult } from '@/types/slab-optimization';
import type { MultiMaterialOptimisationResult, MaterialGroupResult, OversizePieceInfo } from '@/types/slab-optimization';
import { MultiMaterialOptimisationDisplay } from '@/components/quotes/MaterialGroupOptimisation';
import { SlabEdgeAllowancePrompt } from './SlabEdgeAllowancePrompt';

interface OptimizationDisplayProps {
  quoteId: string;
  refreshKey?: number;
  /** True while the background optimiser is running */
  isOptimising?: boolean;
  /** Whether the quote has any pieces */
  hasPieces?: boolean;
  /** Whether any piece has a material assigned */
  hasMaterial?: boolean;
  /** Non-null when the last optimisation attempt failed */
  optimiserError?: string | null;
  /** Quote-level slab edge allowance (mm), null if not set */
  quoteEdgeAllowanceMm?: number | null;
  /** Callback when edge allowance changes (triggers re-optimisation) */
  onEdgeAllowanceApplied?: () => void;
}

export function OptimizationDisplay({
  quoteId,
  refreshKey = 0,
  isOptimising = false,
  hasPieces = true,
  hasMaterial = true,
  optimiserError = null,
  quoteEdgeAllowanceMm,
  onEdgeAllowanceApplied,
}: OptimizationDisplayProps) {
  const [optimization, setOptimization] = useState<any>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [multiMaterialResult, setMultiMaterialResult] = useState<MultiMaterialOptimisationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Edge allowance state
  const [pricingDefaultAllowance, setPricingDefaultAllowance] = useState<number | null | undefined>(undefined);
  const [localQuoteAllowance, setLocalQuoteAllowance] = useState<number | null | undefined>(quoteEdgeAllowanceMm);

  // Resolved allowance: quote override -> tenant default -> 0
  const resolvedAllowance = localQuoteAllowance
    ?? pricingDefaultAllowance
    ?? 0;

  // Whether to show the inline prompt
  const needsPrompt = localQuoteAllowance === null && pricingDefaultAllowance === null;

  // Fetch pricing settings for edge allowance default
  useEffect(() => {
    const fetchDefault = async () => {
      try {
        const res = await fetch('/api/admin/pricing/settings');
        if (res.ok) {
          const data = await res.json();
          setPricingDefaultAllowance(data.slabEdgeAllowanceMm ?? null);
        }
      } catch {
        setPricingDefaultAllowance(null);
      }
    };
    fetchDefault();
  }, []);

  // Sync with prop changes
  useEffect(() => {
    setLocalQuoteAllowance(quoteEdgeAllowanceMm);
  }, [quoteEdgeAllowanceMm]);

  const handleEdgeAllowanceApplied = useCallback((allowanceMm: number) => {
    setLocalQuoteAllowance(allowanceMm);
    onEdgeAllowanceApplied?.();
  }, [onEdgeAllowanceApplied]);

  useEffect(() => {
    const loadOptimization = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/quotes/${quoteId}/optimize`);
        if (response.ok) {
          const data = await response.json();

          if (data && data.placements) {
            setOptimization(data);

            // Handle both old format (array) and new format (object with items/unplacedPieces)
            const rawPlacements = data.placements;
            const placementsArray = Array.isArray(rawPlacements)
              ? rawPlacements
              : rawPlacements.items || [];
            const unplacedPieceIds: string[] = Array.isArray(rawPlacements)
              ? []
              : rawPlacements.unplacedPieces || [];
            const optimizerWarnings: string[] = Array.isArray(rawPlacements)
              ? []
              : rawPlacements.warnings || [];

            // Check for multi-material metadata
            const multiMaterialMeta = !Array.isArray(rawPlacements)
              ? rawPlacements.multiMaterial
              : null;

            if (multiMaterialMeta && multiMaterialMeta.materialGroups?.length > 1) {
              // Reconstruct multi-material result from saved metadata
              const reconstructedMulti = reconstructMultiMaterialResult(
                multiMaterialMeta,
                placementsArray,
                optimizerWarnings,
                data
              );
              setMultiMaterialResult(reconstructedMulti);
            } else {
              setMultiMaterialResult(null);
            }

            // Reconstruct result for SlabResults component (backward compat)
            const reconstructedResult: OptimizationResult = {
              placements: placementsArray,
              slabs: [],
              totalSlabs: data.totalSlabs,
              totalUsedArea: 0,
              totalWasteArea: data.totalWaste,
              wastePercent: Number(data.wastePercent),
              unplacedPieces: unplacedPieceIds,
              laminationSummary: data.laminationSummary,
              warnings: optimizerWarnings.length > 0 ? optimizerWarnings : undefined,
            };

            // Group placements by slab
            const slabMap = new Map<number, typeof placementsArray>();
            placementsArray.forEach((placement: any) => {
              const slabIndex = placement.slabIndex;
              if (!slabMap.has(slabIndex)) {
                slabMap.set(slabIndex, []);
              }
              slabMap.get(slabIndex)?.push(placement);
            });

            // Reconstruct slabs array
            reconstructedResult.slabs = Array.from(slabMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([slabIndex, placements]) => {
                const slabArea = data.slabWidth * data.slabHeight;
                const usedArea = placements.reduce((sum: number, p: any) => sum + (p.width * p.height), 0);
                const wasteArea = slabArea - usedArea;

                return {
                  slabIndex,
                  width: data.slabWidth,
                  height: data.slabHeight,
                  placements,
                  usedArea,
                  wasteArea,
                  wastePercent: (wasteArea / slabArea) * 100,
                };
              });

            reconstructedResult.totalUsedArea = placementsArray.reduce(
              (sum: number, p: any) => sum + (p.width * p.height),
              0
            );

            setResult(reconstructedResult);
          } else {
            setOptimization(null);
            setResult(null);
            setMultiMaterialResult(null);
          }
        } else {
          setOptimization(null);
          setResult(null);
          setMultiMaterialResult(null);
        }
      } catch (err) {
        setOptimization(null);
        setResult(null);
        setMultiMaterialResult(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadOptimization();
  }, [quoteId, refreshKey]);

  // ── Loading state (initial fetch) ────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-center py-6">
          <div className="flex items-center gap-2 text-gray-500">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">Loading slab layout...</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty states ─────────────────────────────────────────────────────────

  if (!hasPieces) {
    return (
      <div className="card p-4">
        <div className="text-center py-12 text-gray-500">
          <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <p className="text-sm font-medium">Add pieces to see slab layout</p>
          <p className="text-xs mt-1 text-gray-400">
            The slab layout updates automatically as you add and edit pieces
          </p>
        </div>
      </div>
    );
  }

  if (!hasMaterial) {
    return (
      <div className="card p-4">
        <div className="text-center py-12 text-gray-500">
          <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <p className="text-sm font-medium">Assign a material to see slab layout</p>
          <p className="text-xs mt-1 text-gray-400">
            Material determines slab dimensions for the layout calculation
          </p>
        </div>
      </div>
    );
  }

  // ── Optimising state (no result yet, but optimiser is running) ──────────

  if ((!optimization || !result) && isOptimising) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-gray-500">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">Optimising slab layout...</span>
          </div>
        </div>
      </div>
    );
  }

  // ── No data yet (pieces exist but optimiser hasn't run) ─────────────────

  if (!optimization || !result) {
    return (
      <div className="card p-4">
        {optimiserError && (
          <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
            {optimiserError} — slab count may be outdated
          </div>
        )}
        {/* Edge allowance prompt when no default is set */}
        {needsPrompt && hasPieces && (
          <div className="mb-3">
            <SlabEdgeAllowancePrompt
              quoteId={quoteId}
              onApply={handleEdgeAllowanceApplied}
            />
          </div>
        )}
        {/* Warning when running with no allowance */}
        {needsPrompt && (
          <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
            No edge allowance set — slab count may be underestimated
          </div>
        )}
        <div className="text-center py-12 text-gray-500">
          <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <p className="text-sm font-medium">Slab layout will appear here</p>
          <p className="text-xs mt-1 text-gray-400">
            The layout calculates automatically when pieces are saved
          </p>
        </div>
      </div>
    );
  }

  // ── Usable slab area info ──────────────────────────────────────────────
  const usableWidth = optimization.slabWidth - (resolvedAllowance * 2);
  const usableHeight = optimization.slabHeight - (resolvedAllowance * 2);

  // ── Results display ──────────────────────────────────────────────────────

  return (
    <div className="card">
      {optimiserError && (
        <div className="text-sm text-amber-600 bg-amber-50 border-b border-amber-200 px-4 py-2">
          {optimiserError} — slab count may be outdated
        </div>
      )}

      {/* Edge allowance prompt when no default is set */}
      {needsPrompt && (
        <div className="p-4 border-b border-gray-200">
          <SlabEdgeAllowancePrompt
            quoteId={quoteId}
            onApply={handleEdgeAllowanceApplied}
          />
        </div>
      )}

      {/* Warning when running with no allowance */}
      {needsPrompt && (
        <div className="text-sm text-amber-600 bg-amber-50 border-b border-amber-200 px-4 py-2">
          No edge allowance set — slab count may be underestimated
        </div>
      )}

      {/* Header with optimising indicator */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <h3 className="font-semibold text-gray-900">Slab Layout</h3>
          {isOptimising && (
            <div className="flex items-center gap-1.5 text-primary-600">
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs font-medium">Updating...</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-gray-500">
            Slab: {optimization.slabWidth}&times;{optimization.slabHeight}mm &middot; Kerf: {optimization.kerfWidth}mm
          </span>
          {resolvedAllowance > 0 && (
            <span className="text-xs text-gray-500">
              Usable: {usableWidth.toLocaleString()}&times;{usableHeight.toLocaleString()}mm ({resolvedAllowance}mm edge allowance per side)
            </span>
          )}
        </div>
      </div>

      {/* Quick Summary */}
      <div className={`p-4 bg-gray-50 grid grid-cols-3 gap-4 ${isOptimising ? 'opacity-60' : ''}`}>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{result.totalSlabs}</div>
          <div className="text-xs text-gray-500">Slabs Required</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {(result.totalUsedArea / 1000000).toFixed(2)} m&sup2;
          </div>
          <div className="text-xs text-gray-500">Material Used</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${
            result.wastePercent < 15 ? 'text-green-600' :
            result.wastePercent < 25 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {result.wastePercent.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">Waste</div>
        </div>
      </div>

      {/* Detailed slab visualisation */}
      <div className={`p-4 border-t border-gray-200 ${isOptimising ? 'opacity-60' : ''}`}>
        {multiMaterialResult && multiMaterialResult.materialGroups.length > 1 ? (
          <MultiMaterialOptimisationDisplay
            multiMaterialResult={multiMaterialResult}
            isOptimising={isOptimising}
          />
        ) : (
          <SlabResults
            result={result}
            slabWidth={optimization.slabWidth}
            slabHeight={optimization.slabHeight}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Reconstruct a MultiMaterialOptimisationResult from saved DB metadata.
 * The DB stores per-group summary info + all placements in a flat array.
 * We re-group placements by materialId (via pieceIds stored in each group).
 */
function reconstructMultiMaterialResult(
  multiMaterialMeta: any,
  allPlacements: any[],
  warnings: string[],
  dbRecord: any
): MultiMaterialOptimisationResult {
  const groups: MaterialGroupResult[] = multiMaterialMeta.materialGroups.map((gMeta: any) => {
    const pieceIdSet = new Set<string>(gMeta.pieceIds || []);

    // Filter placements belonging to this material group
    // Include placements whose pieceId is in the group's piece list,
    // and also lamination strips whose parentPieceId is in the group
    const groupPlacements = allPlacements.filter((p: any) => {
      if (pieceIdSet.has(p.pieceId)) return true;
      // Check for segments (pieceId is "originalId-seg-N")
      const basePieceId = p.pieceId?.split('-seg-')[0]?.split('-lam-')[0];
      if (basePieceId && pieceIdSet.has(basePieceId)) return true;
      // Check parentPieceId for lamination strips
      if (p.parentPieceId && pieceIdSet.has(p.parentPieceId)) return true;
      return false;
    });

    // Group by slabIndex within this material
    const slabMap = new Map<number, any[]>();
    groupPlacements.forEach((p: any) => {
      const si = p.slabIndex;
      if (!slabMap.has(si)) slabMap.set(si, []);
      slabMap.get(si)!.push(p);
    });

    const slabLayouts = Array.from(slabMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([slabIndex, placements], idx) => {
        const slabArea = gMeta.slabDimensions.length * gMeta.slabDimensions.width;
        const usedArea = placements.reduce((s: number, p: any) => s + (p.width * p.height), 0);
        const wasteArea = slabArea - usedArea;
        return {
          slabIndex: idx, // Re-index within this group
          width: gMeta.slabDimensions.length,
          height: gMeta.slabDimensions.width,
          placements: placements.map((p: any) => ({ ...p, slabIndex: idx })),
          usedArea,
          wasteArea,
          wastePercent: slabArea > 0 ? (wasteArea / slabArea) * 100 : 0,
        };
      });

    const totalUsedArea = groupPlacements.reduce(
      (s: number, p: any) => s + (p.width * p.height),
      0
    );

    return {
      materialId: gMeta.materialId,
      materialName: gMeta.materialName,
      slabDimensions: gMeta.slabDimensions,
      pieces: (gMeta.pieceIds || []).map((pid: string) => ({
        pieceId: pid,
        label: groupPlacements.find((p: any) => p.pieceId === pid)?.label ?? pid,
        dimensions: {
          length: groupPlacements.find((p: any) => p.pieceId === pid)?.width ?? 0,
          width: groupPlacements.find((p: any) => p.pieceId === pid)?.height ?? 0,
        },
      })),
      slabCount: gMeta.slabCount,
      wastePercentage: gMeta.wastePercentage,
      slabLayouts,
      oversizePieces: (gMeta.oversizePieces || []) as OversizePieceInfo[],
      optimizationResult: {
        placements: groupPlacements,
        slabs: slabLayouts,
        totalSlabs: gMeta.slabCount,
        totalUsedArea,
        totalWasteArea: gMeta.slabCount * gMeta.slabDimensions.length * gMeta.slabDimensions.width - totalUsedArea,
        wastePercent: gMeta.wastePercentage,
        unplacedPieces: [],
        laminationSummary: reconstructGroupLaminationSummary(groupPlacements),
      },
    } as MaterialGroupResult;
  });

  return {
    materialGroups: groups,
    totalSlabCount: multiMaterialMeta.totalSlabCount,
    overallWastePercentage: multiMaterialMeta.overallWastePercentage,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Reconstruct a LaminationSummary from saved placements for a single material group.
 */
function reconstructGroupLaminationSummary(placements: any[]) {
  const strips = placements.filter((p: any) => p.isLaminationStrip === true);
  if (strips.length === 0) return undefined;

  const parentIds = Array.from(new Set(strips.map((s: any) => s.parentPieceId).filter(Boolean)));

  return {
    totalStrips: strips.length,
    totalStripArea: strips.reduce((sum: number, s: any) => sum + (s.width * s.height) / 1_000_000, 0),
    stripsByParent: parentIds.map((parentId: string) => {
      const parentStrips = strips.filter((s: any) => s.parentPieceId === parentId);
      const parent = placements.find((p: any) => p.pieceId === parentId);
      return {
        parentPieceId: parentId,
        parentLabel: parent?.label ?? 'Unknown',
        strips: parentStrips.map((s: any) => ({
          position: s.stripPosition || 'unknown',
          lengthMm: s.stripPosition === 'left' || s.stripPosition === 'right' ? s.height : s.width,
          widthMm: s.stripPosition === 'left' || s.stripPosition === 'right' ? s.width : s.height,
        })),
      };
    }),
  };
}
