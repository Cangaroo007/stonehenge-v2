'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  SlabImage, 
  PlacedPiece, 
  CanvasState, 
  ToolState, 
  LayoutTool,
  LayoutCalculation,
  CanvasMouseEvent,
  QualityZone,
  DEFAULT_QUALITY_ZONES,
} from './types';
import { LayoutToolbar } from './LayoutToolbar';
import { LayoutStats } from './LayoutStats';
import { PiecePalette } from './PiecePalette';
import { coordinateToWorld, worldToCoordinate, snapToGrid } from './utils/coordinate-transform';
import { calculateLayoutStats, findOptimalPlacement } from './utils/placement-optimizer';

interface SlabCanvasProps {
  slab: SlabImage;
  placedPieces: PlacedPiece[];
  qualityZones: QualityZone[];
  toolState: ToolState;
  canvasState: CanvasState;
  onCanvasStateChange: (state: CanvasState) => void;
  onPieceUpdate: (piece: PlacedPiece) => void;
  onPieceSelect: (pieceId: string | null) => void;
  onPieceDelete: (pieceId: string) => void;
}

const SlabCanvas: React.FC<SlabCanvasProps> = ({
  slab,
  placedPieces,
  qualityZones,
  toolState,
  canvasState,
  onCanvasStateChange,
  onPieceUpdate,
  onPieceSelect,
  onPieceDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPieceId, setDragPieceId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context for transforms
    ctx.save();

    // Apply zoom and pan
    ctx.translate(canvasState.offsetX, canvasState.offsetY);
    ctx.scale(canvasState.scale, canvasState.scale);

    // Draw slab outline
    drawSlab(ctx, slab);

    // Draw quality zones
    if (toolState.showQualityZones) {
      drawQualityZones(ctx, qualityZones);
    }

    // Draw grid
    if (toolState.snapToGrid) {
      drawGrid(ctx, slab);
    }

    // Draw placed pieces
    placedPieces.forEach(piece => {
      drawPiece(ctx, piece, toolState.selectedPieceId === piece.id);
    });

    // Draw measurements
    if (toolState.showMeasurements) {
      drawMeasurements(ctx, placedPieces);
    }

    ctx.restore();
  }, [slab, placedPieces, qualityZones, toolState, canvasState]);

  // Redraw on changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldPos = coordinateToWorld(x, y, canvasState);

    // Check if clicked on a piece
    const clickedPiece = placedPieces.find(piece => 
      isPointInPiece(worldPos.x, worldPos.y, piece)
    );

    if (clickedPiece) {
      onPieceSelect(clickedPiece.pieceId);
      
      if (toolState.activeTool === 'MOVE_PIECE' || toolState.activeTool === 'SELECT') {
        setIsDragging(true);
        setDragPieceId(clickedPiece.pieceId);
        setDragOffset({
          x: worldPos.x - clickedPiece.positionX,
          y: worldPos.y - clickedPiece.positionY,
        });
      }
    } else {
      onPieceSelect(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragPieceId) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldPos = coordinateToWorld(x, y, canvasState);

    let newX = worldPos.x - dragOffset.x;
    let newY = worldPos.y - dragOffset.y;

    // Snap to grid
    if (toolState.snapToGrid) {
      newX = snapToGrid(newX, 50); // 50mm grid
      newY = snapToGrid(newY, 50);
    }

    // Update piece position
    const piece = placedPieces.find(p => p.pieceId === dragPieceId);
    if (piece) {
      onPieceUpdate({
        ...piece,
        positionX: newX,
        positionY: newY,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragPieceId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, canvasState.scale * zoomFactor));

    // Adjust offset to zoom toward mouse
    const worldPos = coordinateToWorld(x, y, canvasState);
    const newOffsetX = x - worldPos.x * newScale;
    const newOffsetY = y - worldPos.y * newScale;

    onCanvasStateChange({
      ...canvasState,
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    />
  );
};

// ============================================================================
// Drawing Functions
// ============================================================================

function drawSlab(ctx: CanvasRenderingContext2D, slab: SlabImage) {
  // Slab background
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, 0, slab.widthMm, slab.heightMm);

  // Slab border
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, slab.widthMm, slab.heightMm);

  // Slab label
  ctx.fillStyle = '#6b7280';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`${slab.materialName}`, 20, 40);
  ctx.font = '16px sans-serif';
  ctx.fillText(`${slab.widthMm}mm × ${slab.heightMm}mm`, 20, 65);

  // Edge trim indication (20mm typical)
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  ctx.setLineDash([10, 10]);
  ctx.strokeRect(20, 20, slab.widthMm - 40, slab.heightMm - 40);
  ctx.setLineDash([]);
}

function drawPiece(ctx: CanvasRenderingContext2D, piece: PlacedPiece, isSelected: boolean) {
  ctx.save();

  // Transform for rotation
  ctx.translate(piece.positionX + piece.widthMm / 2, piece.positionY + piece.lengthMm / 2);
  ctx.rotate((piece.rotation * Math.PI) / 180);
  ctx.translate(-piece.widthMm / 2, -piece.lengthMm / 2);

  // Piece fill
  ctx.fillStyle = piece.color || '#dbeafe';
  ctx.fillRect(0, 0, piece.widthMm, piece.lengthMm);

  // Selection highlight
  if (isSelected) {
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, piece.widthMm, piece.lengthMm);
  } else {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, piece.widthMm, piece.lengthMm);
  }

  // Piece label
  ctx.fillStyle = '#1e40af';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    piece.label || piece.pieceName,
    piece.widthMm / 2,
    piece.lengthMm / 2
  );

  // Dimensions
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `${piece.widthMm}×${piece.lengthMm}`,
    piece.widthMm / 2,
    piece.lengthMm / 2 + 16
  );

  ctx.restore();
}

function drawQualityZones(ctx: CanvasRenderingContext2D, zones: QualityZone[]) {
  zones.forEach(zone => {
    ctx.fillStyle = zone.color + '30'; // Add transparency
    ctx.fillRect(zone.x, zone.y, zone.widthMm, zone.heightMm);

    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(zone.x, zone.y, zone.widthMm, zone.heightMm);
    ctx.setLineDash([]);

    // Zone label
    ctx.fillStyle = zone.color;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${zone.label} Zone`, zone.x + 10, zone.y + 25);
  });
}

function drawGrid(ctx: CanvasRenderingContext2D, slab: SlabImage) {
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;

  const gridSize = 100; // 100mm grid

  // Vertical lines
  for (let x = 0; x <= slab.widthMm; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, slab.heightMm);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = 0; y <= slab.heightMm; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(slab.widthMm, y);
    ctx.stroke();
  }
}

function drawMeasurements(ctx: CanvasRenderingContext2D, pieces: PlacedPiece[]) {
  ctx.fillStyle = '#6b7280';
  ctx.font = '12px sans-serif';

  pieces.forEach(piece => {
    // Draw position coordinates
    ctx.fillText(
      `(${Math.round(piece.positionX)}, ${Math.round(piece.positionY)})`,
      piece.positionX,
      piece.positionY - 5
    );
  });
}

// ============================================================================
// Hit Testing
// ============================================================================

function isPointInPiece(x: number, y: number, piece: PlacedPiece): boolean {
  // Simplified hit test (ignores rotation for now)
  return (
    x >= piece.positionX &&
    x <= piece.positionX + piece.widthMm &&
    y >= piece.positionY &&
    y <= piece.positionY + piece.lengthMm
  );
}

export default SlabCanvas;
