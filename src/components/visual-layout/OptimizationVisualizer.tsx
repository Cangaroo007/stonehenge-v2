'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { OptimizationResult, Placement, SlabResult } from '@/types/slab-optimization';
import { 
  SlabImage, 
  PlacedPiece, 
  LayoutCalculation,
  QualityZone,
  DEFAULT_QUALITY_ZONES,
} from './types';
import SlabCanvas from './SlabCanvas';
import { LayoutStats } from './LayoutStats';
import { calculateFitScale, calculateCenterOffset } from './utils/coordinate-transform';
import { calculateLayoutStats } from './utils/placement-optimizer';

interface OptimizationVisualizerProps {
  result: OptimizationResult;
  slabWidth: number;
  slabHeight: number;
  materialName?: string;
  className?: string;
}

/**
 * Optimization Visualizer
 * 
 * Displays slab optimization results in a visual canvas format.
 * Shows each slab with piece placements, waste areas, and statistics.
 * 
 * This is a read-only view of optimization results - for interactive
 * editing, use the full VisualLayoutTool.
 */
export const OptimizationVisualizer: React.FC<OptimizationVisualizerProps> = ({
  result,
  slabWidth,
  slabHeight,
  materialName = 'Stone Slab',
  className = '',
}) => {
  const [selectedSlabIndex, setSelectedSlabIndex] = useState(0);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);

  // Group placements by slab
  const slabs = useMemo(() => {
    const slabMap = new Map<number, Placement[]>();
    
    result.placements.forEach(placement => {
      const existing = slabMap.get(placement.slabIndex) || [];
      existing.push(placement);
      slabMap.set(placement.slabIndex, existing);
    });

    // Convert to array, ensuring all slabs are represented
    const maxSlabIndex = Math.max(...Array.from(slabMap.keys()), 0);
    const result_slabs: { index: number; placements: Placement[] }[] = [];
    
    for (let i = 0; i <= maxSlabIndex; i++) {
      result_slabs.push({
        index: i,
        placements: slabMap.get(i) || [],
      });
    }
    
    return result_slabs;
  }, [result.placements]);

  // Current slab data
  const currentSlab = slabs[selectedSlabIndex] || { index: 0, placements: [] };

  // Convert placements to PlacedPiece format for the canvas
  const placedPieces: PlacedPiece[] = useMemo(() => {
    return currentSlab.placements.map(placement => ({
      pieceId: placement.pieceId,
      pieceName: placement.label,
      lengthMm: placement.width,
      widthMm: placement.height,
      thicknessMm: 20, // Default, could be enhanced
      positionX: placement.x,
      positionY: placement.y,
      rotation: placement.rotated ? 90 : 0,
      selected: placement.pieceId === selectedPieceId,
      label: placement.label,
    }));
  }, [currentSlab.placements, selectedPieceId]);

  // Create slab image data
  const slab: SlabImage = useMemo(() => ({
    id: `slab-${selectedSlabIndex}`,
    url: '', // No actual image, just dimensions
    widthMm: slabWidth,
    heightMm: slabHeight,
    materialId: 'default',
    materialName: `${materialName} - Slab ${selectedSlabIndex + 1}`,
  }), [selectedSlabIndex, slabWidth, slabHeight, materialName]);

  // Calculate layout stats for current slab
  const layoutStats: LayoutCalculation = useMemo(() => {
    return calculateLayoutStats(placedPieces, {
      width: slabWidth,
      height: slabHeight,
      padding: 20,
    });
  }, [placedPieces, slabWidth, slabHeight]);

  // Canvas state
  const [canvasState, setCanvasState] = useState(() => {
    const viewportWidth = 800;
    const viewportHeight = 500;
    const scale = calculateFitScale(slabWidth, slabHeight, viewportWidth, viewportHeight);
    const offset = calculateCenterOffset(slabWidth, slabHeight, scale, viewportWidth, viewportHeight);
    
    return {
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
    };
  });

  // Recalculate canvas state when slab dimensions change
  useEffect(() => {
    const viewportWidth = 800;
    const viewportHeight = 500;
    const scale = calculateFitScale(slabWidth, slabHeight, viewportWidth, viewportHeight);
    const offset = calculateCenterOffset(slabWidth, slabHeight, scale, viewportWidth, viewportHeight);
    
    setCanvasState(prev => ({
      ...prev,
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
    }));
  }, [slabWidth, slabHeight]);

  // Tool state (read-only)
  const toolState = useMemo(() => ({
    activeTool: 'SELECT' as const,
    selectedPieceId,
    hoveredPieceId: null as string | null,
    snapToGrid: false,
    snapToPieces: false,
    showMeasurements: true,
    showQualityZones: false,
    showCutLines: true,
  }), [selectedPieceId]);

  // Quality zones (empty for now)
  const qualityZones: QualityZone[] = [];

  // Calculate waste stats for current slab
  const slabArea = slabWidth * slabHeight;
  const usedArea = currentSlab.placements.reduce((sum, p) => sum + (p.width * p.height), 0);
  const wasteArea = slabArea - usedArea;
  const wastePercent = slabArea > 0 ? (wasteArea / slabArea) * 100 : 0;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header with slab selector */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            {materialName} - Slab {selectedSlabIndex + 1} of {result.totalSlabs}
          </h2>
          <p className="text-sm text-gray-500">
            {slabWidth}mm × {slabHeight}mm | 
            Waste: {wastePercent.toFixed(1)}% | 
            Pieces: {currentSlab.placements.length}
          </p>
        </div>
        
        {/* Slab selector */}
        {result.totalSlabs > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">View Slab:</span>
            <div className="flex gap-1">
              {slabs.map((s) => (
                <button
                  key={s.index}
                  onClick={() => setSelectedSlabIndex(s.index)}
                  className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                    selectedSlabIndex === s.index
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {s.index + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          <SlabCanvas
            slab={slab}
            placedPieces={placedPieces}
            qualityZones={qualityZones}
            toolState={toolState}
            canvasState={canvasState}
            onCanvasStateChange={setCanvasState}
            onPieceUpdate={() => {}} // Read-only
            onPieceSelect={(id) => setSelectedPieceId(id)}
            onPieceDelete={() => {}} // Read-only
          />

          {/* Floating stats */}
          <div className="absolute bottom-4 left-4">
            <LayoutStats calculation={layoutStats} />
          </div>
        </div>

        {/* Piece list sidebar */}
        <div className="w-64 bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Pieces on Slab</h3>
            <p className="text-sm text-gray-500">{currentSlab.placements.length} pieces</p>
          </div>
          
          <div className="divide-y divide-gray-100">
            {currentSlab.placements.map((placement) => (
              <div
                key={placement.pieceId}
                onClick={() => setSelectedPieceId(placement.pieceId)}
                className={`p-3 cursor-pointer transition-colors ${
                  selectedPieceId === placement.pieceId
                    ? 'bg-blue-50 border-l-4 border-blue-500'
                    : 'hover:bg-gray-50 border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-900">
                    {placement.label}
                  </span>
                  {placement.rotated && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                      Rotated
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {placement.width}mm × {placement.height}mm
                </div>
                <div className="text-xs text-gray-400">
                  Position: ({placement.x}, {placement.y})
                </div>
                {placement.machineName && (
                  <div className="text-xs text-blue-600 mt-1">
                    Machine: {placement.machineName} ({placement.kerfWidthMm}mm kerf)
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Overall stats */}
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <h4 className="font-medium text-sm text-gray-900 mb-2">Slab Statistics</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Area:</span>
                <span className="font-medium">{(slabArea / 1_000_000).toFixed(2)} m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Used:</span>
                <span className="font-medium">{(usedArea / 1_000_000).toFixed(2)} m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Waste:</span>
                <span className="font-medium text-red-600">{(wasteArea / 1_000_000).toFixed(2)} m²</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200">
                <span className="text-gray-600">Waste %:</span>
                <span className={`font-medium ${wastePercent > 30 ? 'text-red-600' : 'text-green-600'}`}>
                  {wastePercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OptimizationVisualizer;
