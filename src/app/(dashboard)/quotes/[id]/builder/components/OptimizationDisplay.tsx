'use client';

import React, { useState, useEffect } from 'react';
import { SlabResults } from '@/components/slab-optimizer';
import { OptimizationResult } from '@/types/slab-optimization';

interface OptimizationDisplayProps {
  quoteId: string;
  refreshKey?: number;
  /** True while the background optimiser is running */
  isOptimising?: boolean;
  /** Whether the quote has any pieces */
  hasPieces?: boolean;
  /** Whether any piece has a material assigned */
  hasMaterial?: boolean;
}

export function OptimizationDisplay({
  quoteId,
  refreshKey = 0,
  isOptimising = false,
  hasPieces = true,
  hasMaterial = true,
}: OptimizationDisplayProps) {
  const [optimization, setOptimization] = useState<any>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadOptimization = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/quotes/${quoteId}/optimize`);
        if (response.ok) {
          const data = await response.json();

          if (data && data.placements) {
            setOptimization(data);

            // Reconstruct result for SlabResults component
            const reconstructedResult: OptimizationResult = {
              placements: data.placements,
              slabs: [],
              totalSlabs: data.totalSlabs,
              totalUsedArea: 0,
              totalWasteArea: data.totalWaste,
              wastePercent: Number(data.wastePercent),
              unplacedPieces: [],
              laminationSummary: data.laminationSummary,
            };

            // Group placements by slab
            const slabMap = new Map<number, typeof data.placements>();
            data.placements.forEach((placement: any) => {
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

            reconstructedResult.totalUsedArea = data.placements.reduce(
              (sum: number, p: any) => sum + (p.width * p.height),
              0
            );

            setResult(reconstructedResult);
          } else {
            setOptimization(null);
            setResult(null);
          }
        } else {
          setOptimization(null);
          setResult(null);
        }
      } catch (err) {
        setOptimization(null);
        setResult(null);
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

  // ── Results display ──────────────────────────────────────────────────────

  return (
    <div className="card">
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
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Slab: {optimization.slabWidth}&times;{optimization.slabHeight}mm &middot; Kerf: {optimization.kerfWidth}mm
          </span>
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

      {/* Detailed slab visualisation (always expanded) */}
      <div className={`p-4 border-t border-gray-200 ${isOptimising ? 'opacity-60' : ''}`}>
        <SlabResults
          result={result}
          slabWidth={optimization.slabWidth}
          slabHeight={optimization.slabHeight}
        />
      </div>
    </div>
  );
}
