'use client';

import React, { useState, useEffect } from 'react';
import { SlabResults } from '@/components/slab-optimizer';
import { OptimizationResult } from '@/types/slab-optimization';

interface OptimizationDisplayProps {
  quoteId: string;
  refreshKey?: number;
}

export function OptimizationDisplay({ quoteId, refreshKey = 0 }: OptimizationDisplayProps) {
  const [optimization, setOptimization] = useState<any>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const loadOptimization = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/quotes/${quoteId}/optimize`);
        if (response.ok) {
          const data = await response.json();
          
          if (data && data.placements) {
            console.log('✅ Loaded saved optimization:', data.id);
            setOptimization(data);
            
            // Reconstruct result for SlabResults component
            const reconstructedResult: OptimizationResult = {
              placements: data.placements,
              slabs: [], // Will be grouped by slabIndex
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
        console.log('No saved optimization found');
        setOptimization(null);
        setResult(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadOptimization();
  }, [quoteId, refreshKey]);

  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-center py-6">
          <div className="flex items-center gap-2 text-gray-500">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">Checking for optimization...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!optimization || !result) {
    return (
      <div className="card p-4">
        <div className="text-center py-6 text-gray-500">
          <svg className="h-12 w-12 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <p className="text-sm font-medium">No slab optimization yet</p>
          <p className="text-xs mt-1">Click "Optimize Slabs" to create an optimization</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <h3 className="font-semibold text-gray-900">Slab Optimization</h3>
          <span className="text-xs text-gray-500">
            {new Date(optimization.createdAt).toLocaleDateString()} at{' '}
            {new Date(optimization.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="btn-secondary text-sm py-1 px-3"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Quick Summary (Always Visible) */}
      <div className="p-4 bg-gray-50 grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{result.totalSlabs}</div>
          <div className="text-xs text-gray-500">Slabs Required</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {(result.totalUsedArea / 1000000).toFixed(2)} m²
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

      {/* Slab Settings */}
      <div className="px-4 py-2 border-t border-gray-100 flex gap-4 text-xs text-gray-600">
        <span>Slab: {optimization.slabWidth}×{optimization.slabHeight}mm</span>
        <span>Kerf: {optimization.kerfWidth}mm</span>
      </div>

      {/* Detailed Results (Collapsible) */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          <SlabResults
            result={result}
            slabWidth={optimization.slabWidth}
            slabHeight={optimization.slabHeight}
          />
        </div>
      )}
    </div>
  );
}
