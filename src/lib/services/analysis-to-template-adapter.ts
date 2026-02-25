/**
 * Analysis-to-Template Adapter
 *
 * Converts drawing analysis results (ExtractedPiece[], DrawingAnalysisResult)
 * into the TemplateData format used by unit type templates.
 *
 * Supports two input modes:
 * 1. Full DrawingAnalysisResult (from quote_drawing_analyses.raw_results)
 *    — includes ExtractedEdge[], EdgeDetectionResult[], confidence levels
 * 2. Simplified UI data (from DrawingImport review step)
 *    — rooms with basic piece dimensions, cutouts, optional edges
 */

import type {
  ExtractedPiece,
  ExtractedEdge,
  ExtractedCutout,
  DrawingAnalysisResult,
  EdgeDetectionResult,
  DetectedEdge,
  EdgeFinish,
  ConfidenceLevel,
} from '@/lib/types/drawing-analysis';

import type {
  TemplateData,
  TemplateRoom,
  TemplatePiece,
  TemplateEdge,
  TemplateCutout,
  MaterialRole,
} from '@/lib/types/unit-templates';

// ──── Public Interfaces ────

export interface AdapterOptions {
  unitTypeCode: string;
  name: string;
  description?: string;
  projectId?: number;
  analysisId?: number;
  /** Skip pieces with LOW confidence on critical dimensions (default: true) */
  skipLowConfidence?: boolean;
}

export interface AdapterResult {
  templateData: TemplateData;
  warnings: string[];
  piecesConverted: number;
  piecesSkipped: number;
}

/** Simplified piece data from the DrawingImport UI */
export interface SimplifiedPiece {
  name?: string;
  pieceNumber?: number;
  length?: number;
  width?: number;
  thickness?: number;
  cutouts?: Array<{ type: string; quantity?: number }>;
  edges?: Array<{ side?: string; finish?: string; profileType?: string }>;
  notes?: string | null;
  confidence?: number;
}

/** Simplified room data from the DrawingImport UI */
export interface SimplifiedRoom {
  name: string;
  pieces: SimplifiedPiece[];
}

/** Simplified analysis data from the DrawingImport UI */
export interface SimplifiedAnalysisData {
  rooms?: SimplifiedRoom[];
  metadata?: {
    defaultThickness?: number;
  };
}

// ──── Main Adapter Functions ────

/**
 * Convert a full DrawingAnalysisResult into TemplateData.
 * Uses ExtractedPiece types with full confidence and edge detection data.
 */
export function convertAnalysisToTemplate(
  analysisResult: DrawingAnalysisResult,
  options: AdapterOptions
): AdapterResult {
  const warnings: string[] = [];
  let piecesConverted = 0;
  let piecesSkipped = 0;
  const skipLow = options.skipLowConfidence !== false;

  // Build a lookup of edge detection results by piece ID
  const edgeResultsMap = new Map<string, DetectedEdge[]>();
  if (analysisResult.edgeDetectionResults) {
    for (const result of analysisResult.edgeDetectionResults) {
      edgeResultsMap.set(result.pieceId, result.edges);
    }
  }

  // Group pieces by room
  const roomMap = new Map<string, ExtractedPiece[]>();
  for (const piece of analysisResult.pieces) {
    const roomName = piece.room || 'Kitchen';
    const existing = roomMap.get(roomName);
    if (existing) {
      existing.push(piece);
    } else {
      roomMap.set(roomName, [piece]);
    }
  }

  const templateRooms: TemplateRoom[] = [];
  let totalArea = 0;

  for (const [roomName, pieces] of Array.from(roomMap)) {
    const convertedPieces: TemplatePiece[] = [];

    for (const piece of pieces) {
      // Skip pieces with LOW confidence on critical dimensions
      if (skipLow && piece.extractionConfidence === 'LOW') {
        const hasLowDimension =
          piece.dimensions.length.confidence === 'LOW' ||
          piece.dimensions.width.confidence === 'LOW';

        if (hasLowDimension) {
          piecesSkipped++;
          warnings.push(
            `Skipped "${piece.description || piece.id}": LOW confidence on critical dimensions ` +
            `(length: ${piece.dimensions.length.confidence}, width: ${piece.dimensions.width.confidence})`
          );
          continue;
        }
      }

      const lengthMm = Math.round(piece.dimensions.length.value);
      const widthMm = Math.round(piece.dimensions.width.value);
      const thicknessMm = piece.dimensions.thickness
        ? Math.round(piece.dimensions.thickness.value)
        : 20;

      if (lengthMm <= 0 || widthMm <= 0) {
        piecesSkipped++;
        warnings.push(
          `Skipped "${piece.description || piece.id}": invalid dimensions (${lengthMm} x ${widthMm}mm)`
        );
        continue;
      }

      const pieceName = piece.description || `Piece ${piecesConverted + 1}`;

      // Convert edges — prefer edge detection results, fall back to extracted edges
      const detectedEdges = edgeResultsMap.get(piece.id);
      const edges = detectedEdges
        ? convertDetectedEdges(detectedEdges, pieceName, warnings)
        : convertExtractedEdges(piece.edges, pieceName, warnings);

      // Convert cutouts
      const cutouts = convertCutouts(piece.cutouts);

      // Assign material role
      const materialRole = assignMaterialRole(roomName, pieceName);

      // Add confidence notes
      const notes = buildPieceNotes(piece, detectedEdges);

      const templatePiece: TemplatePiece = {
        label: pieceName,
        length_mm: lengthMm,
        width_mm: widthMm,
        thickness_mm: thicknessMm,
        edges,
        cutouts,
        materialRole,
        notes: notes || undefined,
      };

      convertedPieces.push(templatePiece);
      piecesConverted++;
      totalArea += (lengthMm * widthMm) / 1_000_000;
    }

    if (convertedPieces.length > 0) {
      templateRooms.push({
        name: roomName,
        roomType: inferRoomType(roomName),
        pieces: convertedPieces,
      });
    }
  }

  const templateData: TemplateData = {
    rooms: templateRooms,
    totalPieces: piecesConverted,
    estimatedArea_sqm: Math.round(totalArea * 10000) / 10000,
  };

  return { templateData, warnings, piecesConverted, piecesSkipped };
}

/**
 * Convert simplified analysis data (from DrawingImport UI) into TemplateData.
 * This handles the less-typed data that comes from the review step.
 */
export function convertSimplifiedToTemplate(
  data: SimplifiedAnalysisData,
  options: AdapterOptions
): AdapterResult {
  const warnings: string[] = [];
  let piecesConverted = 0;
  let piecesSkipped = 0;
  const defaultThickness = data.metadata?.defaultThickness || 20;

  const templateRooms: TemplateRoom[] = [];
  let totalArea = 0;

  if (!data.rooms || data.rooms.length === 0) {
    return {
      templateData: { rooms: [], totalPieces: 0, estimatedArea_sqm: 0 },
      warnings: ['No rooms found in analysis data'],
      piecesConverted: 0,
      piecesSkipped: 0,
    };
  }

  for (const room of data.rooms) {
    const convertedPieces: TemplatePiece[] = [];

    for (const piece of room.pieces) {
      const lengthMm = Math.round(piece.length || 0);
      const widthMm = Math.round(piece.width || 0);
      const thicknessMm = piece.thickness || defaultThickness;

      if (lengthMm <= 0 || widthMm <= 0) {
        piecesSkipped++;
        continue;
      }

      const pieceName = piece.name || `Piece ${piecesConverted + 1}`;

      // Map edges from simplified format — default to ARRIS (Northcoast default)
      const edgeMap: Record<string, TemplateEdge> = {
        top: { finish: 'ARRIS' },
        bottom: { finish: 'ARRIS' },
        left: { finish: 'ARRIS' },
        right: { finish: 'ARRIS' },
      };

      if (piece.edges && Array.isArray(piece.edges)) {
        for (const edge of piece.edges) {
          const side = (edge.side || '').toLowerCase();
          const mappedSide = side === 'front' ? 'top' : side === 'back' ? 'bottom' : side;
          if (mappedSide in edgeMap) {
            edgeMap[mappedSide] = mapEdgeFinishString(edge.finish, edge.profileType);
          }
        }
      }

      // Map cutouts from simplified format
      const cutouts: TemplateCutout[] = [];
      if (piece.cutouts && Array.isArray(piece.cutouts)) {
        for (const cutout of piece.cutouts) {
          cutouts.push({
            type: mapCutoutType(cutout.type),
            quantity: cutout.quantity || 1,
          });
        }
      }

      const templatePiece: TemplatePiece = {
        label: pieceName,
        length_mm: lengthMm,
        width_mm: widthMm,
        thickness_mm: thicknessMm,
        edges: {
          top: edgeMap.top,
          bottom: edgeMap.bottom,
          left: edgeMap.left,
          right: edgeMap.right,
        },
        cutouts,
        materialRole: assignMaterialRole(room.name, pieceName),
        notes: piece.notes || undefined,
      };

      convertedPieces.push(templatePiece);
      piecesConverted++;
      totalArea += (lengthMm * widthMm) / 1_000_000;
    }

    if (convertedPieces.length > 0) {
      templateRooms.push({
        name: room.name,
        roomType: inferRoomType(room.name),
        pieces: convertedPieces,
      });
    }
  }

  const templateData: TemplateData = {
    rooms: templateRooms,
    totalPieces: piecesConverted,
    estimatedArea_sqm: Math.round(totalArea * 10000) / 10000,
  };

  return { templateData, warnings, piecesConverted, piecesSkipped };
}

// ──── Material Role Assignment ────

/**
 * Assign a MaterialRole based on room name and piece name.
 * Piece-level keywords take priority over room-level defaults.
 */
export function assignMaterialRole(
  roomName: string,
  pieceName: string
): MaterialRole {
  const room = roomName.toUpperCase();
  const piece = pieceName.toUpperCase();

  // Splashbacks get their own role regardless of room
  if (piece.includes('SPLASH') || piece.includes('SPLASHBACK')) {
    return 'SPLASHBACK';
  }

  // Shower shelves / niches
  if (piece.includes('SHOWER') && (piece.includes('SHELF') || piece.includes('NICHE'))) {
    return 'SHOWER_SHELF';
  }

  // Window sills
  if (piece.includes('SILL') || piece.includes('WINDOW')) {
    return 'WINDOW_SILL';
  }

  // Feature panels
  if (piece.includes('FEATURE') || piece.includes('PANEL')) {
    return 'FEATURE_PANEL';
  }

  // Room-based assignment
  if (room.includes('KITCHEN') || room.includes('ISLAND') || room.includes('PANTRY')) {
    return 'PRIMARY_BENCHTOP';
  }
  if (room.includes('BATHROOM') || room.includes('ENSUITE') || room.includes('VANITY')) {
    return 'VANITY';
  }
  if (room.includes('LAUNDRY')) {
    return 'LAUNDRY';
  }
  if (room.includes('BAR') || room.includes('OUTDOOR')) {
    return 'SECONDARY_BENCHTOP';
  }

  return 'PRIMARY_BENCHTOP';
}

// ──── Edge Conversion ────

/**
 * Convert DetectedEdge[] (from edge-detector.ts) to template edge format.
 * Prefers edge detection results which include profileType and needsReview flags.
 */
function convertDetectedEdges(
  detectedEdges: DetectedEdge[],
  pieceName: string,
  warnings: string[]
): TemplatePiece['edges'] {
  const edges: TemplatePiece['edges'] = {
    top: { finish: 'ARRIS' },
    bottom: { finish: 'ARRIS' },
    left: { finish: 'ARRIS' },
    right: { finish: 'ARRIS' },
  };

  for (const edge of detectedEdges) {
    const side = normalizeSide(edge.side);
    if (!side) continue;

    if (edge.finish === 'RAW') {
      edges[side] = { finish: 'RAW' };
    } else if (edge.finish === 'ARRIS') {
      edges[side] = { finish: 'ARRIS' };
    } else if (edge.finish === 'UNKNOWN') {
      edges[side] = { finish: 'ARRIS' };
    } else {
      edges[side] = mapDetectedEdgeToTemplate(edge);
    }

    if (edge.needsReview) {
      warnings.push(
        `"${pieceName}" ${edge.side} edge needs review: ${edge.reviewReason || 'low confidence'}`
      );
    }
  }

  return edges;
}

/**
 * Convert ExtractedEdge[] (from drawing-analysis.ts) to template edge format.
 * Fallback when no edge detection results are available.
 */
function convertExtractedEdges(
  extractedEdges: ExtractedEdge[],
  pieceName: string,
  warnings: string[]
): TemplatePiece['edges'] {
  const edges: TemplatePiece['edges'] = {
    top: { finish: 'ARRIS' },
    bottom: { finish: 'ARRIS' },
    left: { finish: 'ARRIS' },
    right: { finish: 'ARRIS' },
  };

  for (const edge of extractedEdges) {
    const side = normalizeSide(edge.side);
    if (!side) continue;

    if (edge.finish === 'RAW') {
      edges[side] = { finish: 'RAW' };
    } else if (edge.finish === 'ARRIS') {
      edges[side] = { finish: 'ARRIS' };
    } else if (edge.finish === 'UNKNOWN') {
      edges[side] = { finish: 'ARRIS' };
    } else {
      edges[side] = mapEdgeFinishToTemplate(edge.finish);
    }

    if (edge.confidence === 'LOW') {
      warnings.push(
        `"${pieceName}" ${edge.side} edge has LOW confidence — review recommended`
      );
    }
  }

  return edges;
}

/**
 * Map a DetectedEdge to a TemplateEdge.
 */
function mapDetectedEdgeToTemplate(edge: DetectedEdge): TemplateEdge {
  const finish = mapEdgeFinishCategory(edge.finish);
  const profileType = edge.profileType !== 'NONE' ? edge.profileType : undefined;

  return { finish, profileType };
}

/**
 * Map an EdgeFinish string to a TemplateEdge.
 */
function mapEdgeFinishToTemplate(finish: EdgeFinish): TemplateEdge {
  const templateFinish = mapEdgeFinishCategory(finish);
  const profileType = mapProfileFromFinish(finish);

  return {
    finish: templateFinish,
    profileType: profileType || undefined,
  };
}

/**
 * Map an EdgeFinish to the template finish category.
 */
function mapEdgeFinishCategory(finish: EdgeFinish): TemplateEdge['finish'] {
  switch (finish) {
    case 'POLISHED_40MM':
      return 'LAMINATED';
    case 'POLISHED_20MM':
    case 'BULLNOSE':
    case 'PENCIL_ROUND':
    case 'BEVELLED':
      return 'POLISHED';
    case 'ARRIS':
      return 'ARRIS';
    case 'RAW':
      return 'RAW';
    case 'UNKNOWN':
    default:
      return 'ARRIS';
  }
}

/**
 * Infer profile type from an EdgeFinish value.
 */
function mapProfileFromFinish(finish: EdgeFinish): string | undefined {
  switch (finish) {
    case 'BULLNOSE':
      return 'BULLNOSE';
    case 'PENCIL_ROUND':
      return 'PENCIL_ROUND';
    case 'BEVELLED':
      return 'BEVELED';
    case 'POLISHED_20MM':
    case 'POLISHED_40MM':
      return 'PENCIL_ROUND'; // default profile for polished edges
    default:
      return undefined;
  }
}

/**
 * Map an edge finish string (from simplified data) to a TemplateEdge.
 */
function mapEdgeFinishString(finish?: string, profileType?: string): TemplateEdge {
  if (!finish || finish === 'UNKNOWN') {
    return { finish: 'ARRIS' };
  }
  if (finish === 'RAW') {
    return { finish: 'RAW' };
  }

  let templateFinish: TemplateEdge['finish'] = 'POLISHED';
  if (finish.includes('40MM') || finish === 'POLISHED_40MM') {
    templateFinish = 'LAMINATED';
  }

  return {
    finish: templateFinish,
    profileType: profileType || mapProfileFromFinishString(finish),
  };
}

function mapProfileFromFinishString(finish: string): string | undefined {
  if (finish.includes('PENCIL') || finish === 'PENCIL_ROUND') return 'PENCIL_ROUND';
  if (finish.includes('BULLNOSE') || finish === 'BULLNOSE') return 'BULLNOSE';
  if (finish.includes('BEVEL')) return 'BEVELED';
  return 'PENCIL_ROUND';
}

/**
 * Normalize edge side values (FRONT→top, BACK→bottom, etc.)
 */
function normalizeSide(
  side: string
): 'top' | 'bottom' | 'left' | 'right' | null {
  const lower = side.toLowerCase();
  switch (lower) {
    case 'top':
    case 'front':
      return 'top';
    case 'bottom':
    case 'back':
      return 'bottom';
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    default:
      return null;
  }
}

// ──── Cutout Conversion ────

/**
 * Convert ExtractedCutout[] to TemplateCutout[].
 * Groups by type and sums quantities.
 */
function convertCutouts(extractedCutouts: ExtractedCutout[]): TemplateCutout[] {
  const cutoutMap = new Map<string, number>();

  for (const cutout of extractedCutouts) {
    const type = mapCutoutType(cutout.type);
    const existing = cutoutMap.get(type) || 0;
    cutoutMap.set(type, existing + 1);
  }

  const result: TemplateCutout[] = [];
  for (const [type, quantity] of Array.from(cutoutMap)) {
    result.push({ type, quantity });
  }

  return result;
}

/**
 * Map cutout types from analysis format to template format.
 */
function mapCutoutType(type: string): string {
  const typeMap: Record<string, string> = {
    HOTPLATE: 'COOKTOP',
    FLUSH_COOKTOP: 'COOKTOP',
    UNDERMOUNT_SINK: 'UNDERMOUNT_SINK',
    DROP_IN_SINK: 'DROP_IN_SINK',
    BASIN: 'BASIN',
    GPO: 'GPO',
    TAP: 'TAP_HOLE',
    DRAINER: 'DRAINER',
  };
  return typeMap[type] || type;
}

// ──── Room Type Inference ────

function inferRoomType(roomName: string): string {
  const lower = roomName.toLowerCase();
  if (lower.includes('kitchen') || lower.includes('island') || lower.includes('pantry'))
    return 'KITCHEN';
  if (lower.includes('bathroom')) return 'BATHROOM';
  if (lower.includes('ensuite')) return 'ENSUITE';
  if (lower.includes('laundry')) return 'LAUNDRY';
  return 'OTHER';
}

// ──── Notes Builder ────

/**
 * Build notes for a template piece based on confidence and edge review flags.
 */
function buildPieceNotes(
  piece: ExtractedPiece,
  detectedEdges?: DetectedEdge[]
): string | null {
  const notes: string[] = [];

  // Add dimension confidence notes
  if (piece.dimensions.length.note) {
    notes.push(`Length: ${piece.dimensions.length.note}`);
  }
  if (piece.dimensions.width.note) {
    notes.push(`Width: ${piece.dimensions.width.note}`);
  }

  // Add extraction confidence
  if (piece.extractionConfidence === 'MEDIUM') {
    notes.push('Medium confidence extraction — verify dimensions');
  }

  // Count edges needing review
  if (detectedEdges) {
    const reviewCount = detectedEdges.filter((e) => e.needsReview).length;
    if (reviewCount > 0) {
      notes.push(`${reviewCount} edge(s) flagged for review`);
    }
  }

  return notes.length > 0 ? notes.join('; ') : null;
}
