/**
 * Visual Layout Tool Types
 * 
 * Type definitions for the interactive stone slab visualizer
 */

// ============================================================================
// Core Types
// ============================================================================

export interface SlabImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  widthMm: number;
  heightMm: number;
  resolutionDpi?: number;
  materialId: string;
  materialName: string;
  batchNumber?: string;
}

export interface PlacedPiece {
  pieceId: string;
  pieceName: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  
  // Position on slab (in mm from top-left)
  positionX: number;
  positionY: number;
  
  // Rotation
  rotation: 0 | 90 | 180 | 270;
  
  // Visual properties
  color?: string;
  label?: string;
  selected: boolean;
  
  // Quality zone placement
  qualityZone?: 'A' | 'B' | 'C' | 'D';
}

export interface RemnantPiece {
  id: string;
  positionX: number;
  positionY: number;
  widthMm: number;
  heightMm: number;
  areaSqm: number;
  isUsable: boolean;
  canFitPieces: string[]; // Piece IDs that could fit
}

export interface CutLine {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  type: 'CUT' | 'JOIN' | 'SCORE';
  associatedPieceId?: string;
}

// ============================================================================
// Canvas State
// ============================================================================

export interface CanvasState {
  scale: number;  // pixels per mm
  offsetX: number;
  offsetY: number;
  isDragging: boolean;
  lastMouseX: number;
  lastMouseY: number;
}

export interface ViewportState {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
}

// ============================================================================
// Tool State
// ============================================================================

export type LayoutTool = 
  | 'SELECT'
  | 'PLACE_PIECE'
  | 'MOVE_PIECE'
  | 'ROTATE_PIECE'
  | 'DELETE_PIECE'
  | 'MARK_QUALITY'
  | 'ADD_CUT'
  | 'MEASURE'
  | 'ZOOM_PAN';

export interface ToolState {
  activeTool: LayoutTool;
  selectedPieceId: string | null;
  hoveredPieceId: string | null;
  snapToGrid: boolean;
  snapToPieces: boolean;
  showMeasurements: boolean;
  showQualityZones: boolean;
  showCutLines: boolean;
}

// ============================================================================
// Layout Calculation Results
// ============================================================================

export interface LayoutCalculation {
  totalPieces: number;
  placedPieces: number;
  totalSlabAreaSqm: number;
  usedAreaSqm: number;
  wasteAreaSqm: number;
  wastePercent: number;
  
  // Efficiency metrics
  utilizationPercent: number;
  remainingRemnants: RemnantPiece[];
  
  // Costs
  estimatedMaterialCost: number;
  estimatedWastageCost: number;
}

export interface OptimizationResult {
  layout: PlacedPiece[];
  wastePercent: number;
  utilizationPercent: number;
  unplacedPieces: string[];
  alternativeLayouts?: PlacedPiece[][];
}

// ============================================================================
// Event Types
// ============================================================================

export interface CanvasMouseEvent {
  canvasX: number;
  canvasY: number;
  worldX: number;  // In mm
  worldY: number;  // In mm
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export interface PieceDragEvent {
  pieceId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
}

// ============================================================================
// Component Props
// ============================================================================

export interface VisualLayoutToolProps {
  slab: SlabImage;
  pieces: Array<{
    id: string;
    name: string;
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  }>;
  initialPlacedPieces?: PlacedPiece[];
  onLayoutChange?: (pieces: PlacedPiece[]) => void;
  onOptimizationComplete?: (result: OptimizationResult) => void;
  onPieceSelect?: (pieceId: string | null) => void;
  readOnly?: boolean;
  showToolbar?: boolean;
  className?: string;
}

export interface LayoutToolbarProps {
  activeTool: LayoutTool;
  onToolChange: (tool: LayoutTool) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onOptimize: () => void;
  onReset: () => void;
  onExport: () => void;
  canOptimize: boolean;
  canExport: boolean;
}

export interface LayoutStatsProps {
  calculation: LayoutCalculation;
  compact?: boolean;
}

export interface PiecePaletteProps {
  pieces: Array<{
    id: string;
    name: string;
    lengthMm: number;
    widthMm: number;
    thumbnail?: string;
  }>;
  placedPieceIds: string[];
  onPieceDragStart: (pieceId: string) => void;
}

// ============================================================================
// Quality Zones
// ============================================================================

export interface QualityZone {
  id: string;
  label: 'A' | 'B' | 'C' | 'D';
  name: string;
  color: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  description?: string;
}

export const DEFAULT_QUALITY_ZONES: QualityZone[] = [
  { id: 'zone-a', label: 'A', name: 'Premium', color: '#22c55e', x: 0, y: 0, widthMm: 0, heightMm: 0, description: 'Best quality, consistent pattern' },
  { id: 'zone-b', label: 'B', name: 'Standard', color: '#3b82f6', x: 0, y: 0, widthMm: 0, heightMm: 0, description: 'Good quality, minor variations' },
  { id: 'zone-c', label: 'C', name: 'Commercial', color: '#f59e0b', x: 0, y: 0, widthMm: 0, heightMm: 0, description: 'Some veining/color variation' },
  { id: 'zone-d', label: 'D', name: 'Budget', color: '#ef4444', x: 0, y: 0, widthMm: 0, heightMm: 0, description: 'Visible imperfections, suitable for cuts' },
];

// ============================================================================
// Export/Import
// ============================================================================

export interface LayoutExport {
  version: string;
  exportedAt: string;
  slab: SlabImage;
  placedPieces: PlacedPiece[];
  cutLines: CutLine[];
  qualityZones: QualityZone[];
  calculation: LayoutCalculation;
}

export interface LayoutImport {
  placedPieces: PlacedPiece[];
  qualityZones?: QualityZone[];
}
