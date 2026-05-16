import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { optimizeSlabs } from '@/lib/services/slab-optimizer';
import { optimizeMultiMaterial } from '@/lib/services/multi-material-optimizer';
import type { MaterialInfo, MultiMaterialPiece } from '@/lib/services/multi-material-optimizer';
import type { OptimizationInput } from '@/types/slab-optimization';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalisePieces(rawPieces: unknown): MultiMaterialPiece[] {
  if (!Array.isArray(rawPieces)) return [];

  return rawPieces
    .map((piece) => {
      const p = piece as Record<string, unknown>;
      return {
        id: String(p.id ?? ''),
        width: toPositiveNumber(p.width, 0),
        height: toPositiveNumber(p.height, 0),
        label: String(p.label ?? p.id ?? 'Piece'),
        canRotate: typeof p.canRotate === 'boolean' ? p.canRotate : undefined,
        thickness: toPositiveNumber(p.thickness, 20),
        finishedEdges: p.finishedEdges as MultiMaterialPiece['finishedEdges'],
        edgeTypeNames: p.edgeTypeNames as MultiMaterialPiece['edgeTypeNames'],
        materialId: p.materialId == null ? null : String(p.materialId),
        shapeType: p.shapeType == null ? undefined : String(p.shapeType),
        shapeConfig: p.shapeConfig,
        groupId: p.groupId == null ? undefined : String(p.groupId),
        grainMatched: typeof p.grainMatched === 'boolean' ? p.grainMatched : undefined,
        shapeConfigEdges: p.shapeConfigEdges as Record<string, string | null> | undefined,
        noStripEdges: Array.isArray(p.noStripEdges) ? p.noStripEdges.map(String) : undefined,
        stripWidthOverrides: p.stripWidthOverrides as Record<string, number> | null | undefined,
        laminationMethod: p.laminationMethod == null ? null : String(p.laminationMethod),
        edgeBuildups: p.edgeBuildups as MultiMaterialPiece['edgeBuildups'],
      };
    })
    .filter((piece) => piece.id && piece.width > 0 && piece.height > 0);
}

function normaliseMaterials(rawMaterials: unknown): MaterialInfo[] {
  if (!Array.isArray(rawMaterials)) return [];

  return rawMaterials
    .map((material) => {
      const m = material as Record<string, unknown>;
      return {
        id: String(m.id ?? ''),
        name: String(m.name ?? m.id ?? 'Material'),
        slabLengthMm: m.slabLengthMm == null ? null : toPositiveNumber(m.slabLengthMm, 0) || null,
        slabWidthMm: m.slabWidthMm == null ? null : toPositiveNumber(m.slabWidthMm, 0) || null,
        fabricationCategory: m.fabricationCategory == null ? null : String(m.fabricationCategory),
        slabLengthOverrideMm: m.slabLengthOverrideMm == null ? null : toPositiveNumber(m.slabLengthOverrideMm, 0) || null,
        slabWidthOverrideMm: m.slabWidthOverrideMm == null ? null : toPositiveNumber(m.slabWidthOverrideMm, 0) || null,
      };
    })
    .filter((material) => material.id);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const slabWidth = toPositiveNumber(body.slabWidth, 3200);
    const slabHeight = toPositiveNumber(body.slabHeight, 1600);
    const kerfWidth = toNonNegativeNumber(body.kerfWidth, 3);
    const edgeAllowanceMm = toNonNegativeNumber(body.edgeAllowanceMm, 0);
    const allowRotation = typeof body.allowRotation === 'boolean' ? body.allowRotation : true;

    const pieces = normalisePieces(body.pieces);
    if (pieces.length === 0) {
      return NextResponse.json({ error: 'Add at least one valid piece' }, { status: 400 });
    }

    const materials = normaliseMaterials(body.materials);
    const distinctMaterialIds = new Set(
      pieces.map((piece) => piece.materialId).filter((id): id is string => Boolean(id))
    );

    if (distinctMaterialIds.size > 1 && materials.length > 0) {
      const multiMaterialResult = await optimizeMultiMaterial({
        pieces,
        materials,
        kerfWidth,
        allowRotation,
        edgeAllowanceMm,
        companyId: auth.user.companyId,
      });

      const allPlacements = multiMaterialResult.materialGroups.flatMap(g => g.optimizationResult.placements);
      const allSlabs = multiMaterialResult.materialGroups.flatMap(g => g.slabLayouts);
      const totalUsedArea = allPlacements.reduce((sum, p) => sum + (p.width * p.height), 0);
      const totalWasteArea = multiMaterialResult.materialGroups.reduce(
        (sum, g) => sum + g.optimizationResult.totalWasteArea,
        0
      );

      return NextResponse.json({
        result: {
          placements: allPlacements,
          slabs: allSlabs,
          totalSlabs: multiMaterialResult.totalSlabCount,
          totalUsedArea,
          totalWasteArea,
          wastePercent: multiMaterialResult.overallWastePercentage,
          unplacedPieces: multiMaterialResult.materialGroups.flatMap(g => g.optimizationResult.unplacedPieces),
          warnings: multiMaterialResult.warnings,
          edgeAllowanceMm: edgeAllowanceMm > 0 ? edgeAllowanceMm : undefined,
        },
        multiMaterialResult,
      });
    }

    const input: OptimizationInput = {
      pieces,
      slabWidth,
      slabHeight,
      kerfWidth,
      allowRotation,
      edgeAllowanceMm,
      companyId: auth.user.companyId,
    };

    const result = await optimizeSlabs(input);
    return NextResponse.json({ result, multiMaterialResult: null });
  } catch (error) {
    logger.error('[Standalone Optimize API] Failed to optimise:', error);
    return NextResponse.json(
      { error: 'Optimisation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
