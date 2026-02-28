import { optimizeSlabs } from '@/lib/services/slab-optimizer';
import { getDefaultSlabLength, getDefaultSlabWidth } from '@/lib/constants/slab-sizes';
import { logger } from '@/lib/logger';
import { decomposeShapeIntoRects } from '@/lib/types/shapes';
import type {
  OptimizationInput,
  MultiMaterialOptimisationResult,
  MaterialGroupResult,
  OversizePieceInfo,
} from '@/types/slab-optimization';

// ── Input types ──────────────────────────────────────────────────────────────

export interface MultiMaterialPiece {
  id: string;
  width: number;        // length_mm from quote_pieces
  height: number;       // width_mm from quote_pieces
  label: string;
  canRotate?: boolean;
  thickness?: number;
  finishedEdges?: {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  };
  edgeTypeNames?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  /** Material ID for grouping — null/undefined means unassigned */
  materialId?: string | null;
  /** Shape data for L/U decomposition in the optimizer */
  shapeType?: string;
  shapeConfig?: unknown;
  grainMatched?: boolean;
  /** Extra edges from shape_config.edges (INNER, R-BTM, etc.) */
  shapeConfigEdges?: Record<string, string | null>;
  /** Edges marked as wall edges — no lamination strip generated for these */
  noStripEdges?: string[];
}

export interface MaterialInfo {
  id: string;
  name: string;
  slabLengthMm?: number | null;
  slabWidthMm?: number | null;
  fabricationCategory?: string | null;
}

export interface MultiMaterialOptimizationInput {
  pieces: MultiMaterialPiece[];
  materials: MaterialInfo[];
  /** Fallback material ID when pieces have no material_id */
  primaryMaterialId?: string | null;
  kerfWidth: number;
  allowRotation: boolean;
  edgeAllowanceMm?: number;
  /** Kerf width (mm) for the MITRING machine — passed through to per-group optimisation */
  mitreKerfWidth?: number;
}

// ── Core orchestrator ────────────────────────────────────────────────────────

/**
 * Groups pieces by material and runs separate FFD optimisation per group.
 * Returns combined results with per-material slab counts and waste.
 */
export function optimizeMultiMaterial(
  input: MultiMaterialOptimizationInput
): MultiMaterialOptimisationResult {
  const {
    pieces,
    materials,
    primaryMaterialId,
    kerfWidth,
    allowRotation,
    edgeAllowanceMm = 0,
    mitreKerfWidth,
  } = input;

  const warnings: string[] = [];

  // Build material lookup
  const materialMap = new Map<string, MaterialInfo>();
  for (const mat of materials) {
    materialMap.set(mat.id, mat);
  }

  // ── Step 1: Group pieces by material ────────────────────────────────────
  const groupMap = new Map<string, MultiMaterialPiece[]>();
  const unassigned: MultiMaterialPiece[] = [];

  for (const piece of pieces) {
    const matId = piece.materialId ?? primaryMaterialId;

    if (!matId) {
      unassigned.push(piece);
      continue;
    }

    if (!groupMap.has(matId)) {
      groupMap.set(matId, []);
    }
    groupMap.get(matId)!.push(piece);
  }

  // Warn about unassigned pieces
  if (unassigned.length > 0) {
    const names = unassigned.map((p) => p.label).join(', ');
    warnings.push(
      `${unassigned.length} piece(s) have no material assigned — cannot optimise: ${names}`
    );
    logger.warn(
      `[MultiMaterialOptimizer] ${unassigned.length} unassigned pieces: ${names}`
    );
  }

  // ── Step 2: Run per-material optimisation ───────────────────────────────
  const materialGroups: MaterialGroupResult[] = [];

  for (const [materialId, groupPieces] of Array.from(groupMap.entries())) {
    const material = materialMap.get(materialId);
    const materialName = material?.name ?? `Material ${materialId}`;

    // Resolve slab dimensions for this material
    const slabLength = resolveSlabLength(material);
    const slabWidth = resolveSlabWidth(material);

    logger.info(
      `[MultiMaterialOptimizer] Group "${materialName}": ${groupPieces.length} pieces, slab ${slabLength}×${slabWidth}mm`
    );

    // Build optimisation input
    const optimInput: OptimizationInput = {
      pieces: groupPieces.map((p) => ({
        id: p.id,
        width: p.width,
        height: p.height,
        label: p.label,
        canRotate: p.canRotate,
        thickness: p.thickness,
        finishedEdges: p.finishedEdges,
        edgeTypeNames: p.edgeTypeNames,
        shapeType: p.shapeType,
        shapeConfig: p.shapeConfig,
        grainMatched: p.grainMatched,
        shapeConfigEdges: p.shapeConfigEdges,
        noStripEdges: p.noStripEdges,
      })),
      slabWidth: slabLength,   // optimizer "width" = slab length (longer dimension)
      slabHeight: slabWidth,   // optimizer "height" = slab width (shorter dimension)
      kerfWidth,
      allowRotation,
      edgeAllowanceMm,
      mitreKerfWidth,
    };

    // Run the existing FFD algorithm
    const result = optimizeSlabs(optimInput);

    // Detect oversize pieces from warnings
    const oversizePieces = detectOversizePieces(
      groupPieces,
      slabLength,
      slabWidth,
      result.warnings
    );

    materialGroups.push({
      materialId,
      materialName,
      slabDimensions: { length: slabLength, width: slabWidth },
      pieces: groupPieces.map((p) => ({
        pieceId: p.id,
        label: p.label,
        dimensions: { length: p.width, width: p.height },
      })),
      slabCount: result.totalSlabs,
      wastePercentage: result.wastePercent,
      slabLayouts: result.slabs,
      oversizePieces,
      optimizationResult: result,
    });

    // Forward per-group warnings
    if (result.warnings) {
      for (const w of result.warnings) {
        warnings.push(`[${materialName}] ${w}`);
      }
    }
  }

  // ── Step 3: Compute combined totals ─────────────────────────────────────
  const totalSlabCount = materialGroups.reduce(
    (sum, g) => sum + g.slabCount,
    0
  );

  const totalSlabArea = materialGroups.reduce(
    (sum, g) => sum + g.slabCount * g.slabDimensions.length * g.slabDimensions.width,
    0
  );
  const totalUsedArea = materialGroups.reduce(
    (sum, g) => sum + g.optimizationResult.totalUsedArea,
    0
  );
  const overallWastePercentage =
    totalSlabArea > 0 ? ((totalSlabArea - totalUsedArea) / totalSlabArea) * 100 : 0;

  logger.info(
    `[MultiMaterialOptimizer] Complete: ${materialGroups.length} material groups, ${totalSlabCount} total slabs, ${overallWastePercentage.toFixed(1)}% waste`
  );

  return {
    materialGroups,
    totalSlabCount,
    overallWastePercentage,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ── Slab dimension resolution ────────────────────────────────────────────────

function resolveSlabLength(material?: MaterialInfo | null): number {
  if (material?.slabLengthMm) return material.slabLengthMm;
  if (material?.fabricationCategory) {
    const catLength = getDefaultSlabLength(material.fabricationCategory);
    if (catLength) return catLength;
  }
  return 3200; // Ultimate fallback
}

function resolveSlabWidth(material?: MaterialInfo | null): number {
  if (material?.slabWidthMm) return material.slabWidthMm;
  if (material?.fabricationCategory) {
    const catWidth = getDefaultSlabWidth(material.fabricationCategory);
    if (catWidth) return catWidth;
  }
  return 1600; // Ultimate fallback
}

// ── Oversize piece detection ─────────────────────────────────────────────────

/**
 * Detect oversize pieces from the optimizer warnings and build OversizePieceInfo.
 * Uses slab dimensions to determine join strategy and suggested join position.
 *
 * For L/U shapes, uses decomposed leg dimensions (not bounding box) so the
 * oversize notice displays accurate per-leg dimensions.
 */
function detectOversizePieces(
  pieces: MultiMaterialPiece[],
  slabLength: number,
  slabWidth: number,
  optimizerWarnings?: string[]
): OversizePieceInfo[] {
  const oversizePieces: OversizePieceInfo[] = [];

  for (const piece of pieces) {
    // Decompose L/U shapes into actual leg rects; rectangles return a single rect
    const rects = decomposeShapeIntoRects({
      id: piece.id,
      lengthMm: piece.width,   // piece.width = length_mm from DB
      widthMm: piece.height,   // piece.height = width_mm from DB
      shapeType: piece.shapeType ?? null,
      shapeConfig: piece.shapeConfig ?? null,
      grainMatched: piece.grainMatched ?? null,
    });

    // Check each decomposed rect independently against slab dimensions
    for (const rect of rects) {
      const pw = rect.width;   // leg length
      const ph = rect.height;  // leg width

      const exceedsLength = pw > slabLength;
      const exceedsWidth = ph > slabWidth;

      if (!exceedsLength && !exceedsWidth) continue;

      let joinStrategy: OversizePieceInfo['joinStrategy'];
      let suggestedJoinPosition_mm: number;
      const segments: Array<{ length: number; width: number }> = [];

      const rectLabel = rect.label
        ? `${piece.label} — ${rect.label}`
        : piece.label;

      if (exceedsLength && exceedsWidth) {
        joinStrategy = 'MULTI_JOIN';
        suggestedJoinPosition_mm = slabLength;

        const lengthSegments = Math.ceil(pw / slabLength);
        const widthSegments = Math.ceil(ph / slabWidth);
        for (let r = 0; r < widthSegments; r++) {
          for (let c = 0; c < lengthSegments; c++) {
            segments.push({
              length: c === lengthSegments - 1 ? pw - slabLength * (lengthSegments - 1) : slabLength,
              width: r === widthSegments - 1 ? ph - slabWidth * (widthSegments - 1) : slabWidth,
            });
          }
        }
      } else if (exceedsLength) {
        joinStrategy = 'LENGTHWISE';
        suggestedJoinPosition_mm = slabLength;
        const lengthSegments = Math.ceil(pw / slabLength);
        for (let c = 0; c < lengthSegments; c++) {
          segments.push({
            length: c === lengthSegments - 1 ? pw - slabLength * (lengthSegments - 1) : slabLength,
            width: ph,
          });
        }
      } else {
        joinStrategy = 'WIDTHWISE';
        suggestedJoinPosition_mm = slabWidth;
        const widthSegments = Math.ceil(ph / slabWidth);
        for (let r = 0; r < widthSegments; r++) {
          segments.push({
            length: pw,
            width: r === widthSegments - 1 ? ph - slabWidth * (widthSegments - 1) : slabWidth,
          });
        }
      }

      oversizePieces.push({
        pieceId: piece.id,
        label: rectLabel,
        joinStrategy,
        segments,
        suggestedJoinPosition_mm,
      });
    }
  }

  return oversizePieces;
}
