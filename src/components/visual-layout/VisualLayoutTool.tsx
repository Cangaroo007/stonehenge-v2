'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { 
  VisualLayoutToolProps, 
  PlacedPiece, 
  CanvasState, 
  ToolState,
  LayoutTool,
  LayoutCalculation,
  QualityZone,
  DEFAULT_QUALITY_ZONES,
} from './types';
import SlabCanvas from './SlabCanvas';
import { LayoutToolbar } from './LayoutToolbar';
import { LayoutStats } from './LayoutStats';
import { PiecePalette } from './PiecePalette';
import { calculateFitScale, calculateCenterOffset } from './utils/coordinate-transform';
import { findOptimalPlacement, calculateLayoutStats } from './utils/placement-optimizer';

/**
 * Visual Layout Tool
 * 
 * Interactive canvas-based tool for visualizing stone slab layouts.
 * Features:
 * - Drag-and-drop piece placement
 * - Auto-optimization
 * - Zoom/pan
 * - Quality zone marking
 * - Layout statistics
 */
export const VisualLayoutTool: React.FC<VisualLayoutToolProps> = ({
  slab,
  pieces,
  initialPlacedPieces = [],
  onLayoutChange,
  onOptimizationComplete,
  onPieceSelect,
  readOnly = false,
  showToolbar = true,
  className = '',
}) => {
  // State
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>(initialPlacedPieces);
  const [qualityZones, setQualityZones] = useState<QualityZone[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  
  // Canvas state
  const [canvasState, setCanvasState] = useState<CanvasState>(() => {
    // Calculate initial scale to fit slab
    const viewportWidth = 800;
    const viewportHeight = 600;
    const scale = calculateFitScale(slab.widthMm, slab.heightMm, viewportWidth, viewportHeight);
    const offset = calculateCenterOffset(slab.widthMm, slab.heightMm, scale, viewportWidth, viewportHeight);
    
    return {
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
    };
  });

  // Tool state
  const [toolState, setToolState] = useState<ToolState>({
    activeTool: 'SELECT',
    selectedPieceId: null,
    hoveredPieceId: null,
    snapToGrid: true,
    snapToPieces: false,
    showMeasurements: false,
    showQualityZones: false,
    showCutLines: true,
  });

  // Calculate layout stats
  const layoutStats: LayoutCalculation = useMemo(() => {
    return calculateLayoutStats(placedPieces, {
      width: slab.widthMm,
      height: slab.heightMm,
      padding: 20,
    });
  }, [placedPieces, slab]);

  // Get placed piece IDs
  const placedPieceIds = useMemo(() => 
    placedPieces.map(p => p.pieceId),
    [placedPieces]
  );

  // Handlers
  const handleToolChange = useCallback((tool: LayoutTool) => {
    setToolState(prev => ({ ...prev, activeTool: tool }));
  }, []);

  const handleZoomIn = useCallback(() => {
    setCanvasState(prev => ({
      ...prev,
      scale: Math.min(prev.scale * 1.2, 5),
    }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setCanvasState(prev => ({
      ...prev,
      scale: Math.max(prev.scale / 1.2, 0.1),
    }));
  }, []);

  const handleFitToScreen = useCallback(() => {
    const viewportWidth = 800;
    const viewportHeight = 600;
    const scale = calculateFitScale(slab.widthMm, slab.heightMm, viewportWidth, viewportHeight);
    const offset = calculateCenterOffset(slab.widthMm, slab.heightMm, scale, viewportWidth, viewportHeight);
    
    setCanvasState({
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
    });
  }, [slab]);

  const handleOptimize = useCallback(() => {
    const result = findOptimalPlacement(
      pieces.filter(p => !placedPieceIds.includes(p.id)).map(p => ({
        id: p.id,
        name: p.name,
        widthMm: p.widthMm,
        lengthMm: p.lengthMm,
        thicknessMm: p.thicknessMm,
      })),
      {
        width: slab.widthMm,
        height: slab.heightMm,
        padding: 20,
      }
    );

    setPlacedPieces(prev => [...prev, ...result.layout]);
    onOptimizationComplete?.(result);
  }, [pieces, placedPieceIds, slab, onOptimizationComplete]);

  const handleReset = useCallback(() => {
    setPlacedPieces([]);
    setSelectedPieceId(null);
    setToolState(prev => ({ ...prev, selectedPieceId: null }));
  }, []);

  const handleExport = useCallback(() => {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      slab,
      placedPieces,
      qualityZones,
      calculation: layoutStats,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `layout-${slab.materialName}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [slab, placedPieces, qualityZones, layoutStats]);

  const handlePieceUpdate = useCallback((piece: PlacedPiece) => {
    setPlacedPieces(prev => {
      const index = prev.findIndex(p => p.pieceId === piece.pieceId);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = piece;
        onLayoutChange?.(updated);
        return updated;
      }
      onLayoutChange?.([...prev, piece]);
      return [...prev, piece];
    });
  }, [onLayoutChange]);

  const handlePieceSelect = useCallback((pieceId: string | null) => {
    setSelectedPieceId(pieceId);
    setToolState(prev => ({ ...prev, selectedPieceId: pieceId }));
    onPieceSelect?.(pieceId);
  }, [onPieceSelect]);

  const handlePieceDelete = useCallback((pieceId: string) => {
    setPlacedPieces(prev => {
      const updated = prev.filter(p => p.pieceId !== pieceId);
      onLayoutChange?.(updated);
      return updated;
    });
    if (selectedPieceId === pieceId) {
      setSelectedPieceId(null);
      setToolState(prev => ({ ...prev, selectedPieceId: null }));
    }
  }, [selectedPieceId, onLayoutChange]);

  const handlePieceDragStart = useCallback((pieceId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;

    const newPlacedPiece: PlacedPiece = {
      pieceId: piece.id,
      pieceName: piece.name,
      lengthMm: piece.lengthMm,
      widthMm: piece.widthMm,
      thicknessMm: piece.thicknessMm,
      positionX: 50, // Default position
      positionY: 50,
      rotation: 0,
      selected: true,
      color: undefined,
      label: piece.name.substring(0, 10),
    };

    handlePieceUpdate(newPlacedPiece);
    handlePieceSelect(piece.id);
  }, [pieces, handlePieceUpdate, handlePieceSelect]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (selectedPieceId) {
            handlePieceDelete(selectedPieceId);
          }
          break;
        case 'Escape':
          handlePieceSelect(null);
          break;
        case 'r':
        case 'R':
          if (selectedPieceId) {
            const piece = placedPieces.find(p => p.pieceId === selectedPieceId);
            if (piece) {
              const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
              const currentIndex = rotations.indexOf(piece.rotation);
              const nextRotation = rotations[(currentIndex + 1) % 4];
              handlePieceUpdate({ ...piece, rotation: nextRotation });
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readOnly, selectedPieceId, placedPieces, handlePieceDelete, handlePieceSelect, handlePieceUpdate]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{slab.materialName}</h2>
          <p className="text-sm text-gray-500">{slab.widthMm}mm × {slab.heightMm}mm</p>
        </div>
        <LayoutStats calculation={layoutStats} compact />
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {showToolbar && !readOnly && (
          <LayoutToolbar
            activeTool={toolState.activeTool}
            onToolChange={handleToolChange}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFitToScreen={handleFitToScreen}
            onOptimize={handleOptimize}
            onReset={handleReset}
            onExport={handleExport}
            canOptimize={pieces.length > 0 && placedPieces.length < pieces.length}
            canExport={placedPieces.length > 0}
          />
        )}

        {/* Canvas area */}
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          <SlabCanvas
            slab={slab}
            placedPieces={placedPieces}
            qualityZones={qualityZones}
            toolState={{ ...toolState, selectedPieceId }}
            canvasState={canvasState}
            onCanvasStateChange={setCanvasState}
            onPieceUpdate={handlePieceUpdate}
            onPieceSelect={handlePieceSelect}
            onPieceDelete={handlePieceDelete}
          />

          {/* Floating stats */}
          <div className="absolute bottom-4 left-4">
            <LayoutStats calculation={layoutStats} />
          </div>
        </div>

        {/* Piece palette */}
        {!readOnly && (
          <PiecePalette
            pieces={pieces}
            placedPieceIds={placedPieceIds}
            onPieceDragStart={handlePieceDragStart}
          />
        )}
      </div>
    </div>
  );
};

export default VisualLayoutTool;
