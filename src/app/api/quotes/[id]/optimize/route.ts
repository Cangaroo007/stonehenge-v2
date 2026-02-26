import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { optimizeSlabs } from '@/lib/services/slab-optimizer';
import { optimizeMultiMaterial } from '@/lib/services/multi-material-optimizer';
import type { MultiMaterialPiece, MaterialInfo } from '@/lib/services/multi-material-optimizer';
import { calculateCutPlan } from '@/lib/services/multi-slab-calculator';
import { logger } from '@/lib/logger';
import { getDefaultSlabLength, getDefaultSlabWidth } from '@/lib/constants/slab-sizes';

/**
 * Fetch operation-specific kerfs from machine_operation_defaults.
 * Returns a map of operationType -> kerfWidthMm.
 */
async function getOperationKerfs(): Promise<Record<string, number>> {
  try {
    const defaults = await prisma.machine_operation_defaults.findMany({
      include: { machine: true },
    });
    const kerfs: Record<string, number> = {};
    for (const d of defaults) {
      kerfs[d.operation_type] = d.machine.kerf_width_mm;
    }
    return kerfs;
  } catch {
    return {};
  }
}

/**
 * OVERSIZE PERSISTENCE — Phase 2.5
 * Write optimizer oversize detection back to quote_pieces so the
 * pricing calculator and manufacturing export can read isOversize,
 * joinCount, joinLengthMm, requiresGrainMatch.
 *
 * Uses calculateCutPlan (same function the pricing calculator uses)
 * to determine oversize status per piece with the actual slab dimensions.
 */
async function persistOversizeToQuotePieces(
  quoteId: number,
  allPieceRows: Array<{
    id: number;
    length_mm: number;
    width_mm: number;
    materials: { slab_length_mm: number | null; slab_width_mm: number | null; name: string } | null;
  }>,
  fallbackSlabLengthMm: number,
  fallbackSlabWidthMm: number
): Promise<void> {
  const oversizePieceIds: number[] = [];

  for (const piece of allPieceRows) {
    // Use per-piece material slab dimensions if available, otherwise the optimizer's resolved dims
    const slabLengthMm = piece.materials?.slab_length_mm ?? fallbackSlabLengthMm;
    const slabWidthMm = piece.materials?.slab_width_mm ?? fallbackSlabWidthMm;
    const materialName = piece.materials?.name ?? 'caesarstone';

    const cutPlan = calculateCutPlan(
      { lengthMm: piece.length_mm, widthMm: piece.width_mm },
      materialName,
      20,
      slabLengthMm,
      slabWidthMm
    );

    if (!cutPlan.fitsOnSingleSlab) {
      oversizePieceIds.push(piece.id);
      await prisma.quote_pieces.update({
        where: { id: piece.id },
        data: {
          isOversize: true,
          joinCount: cutPlan.joins.length,
          joinLengthMm: Math.round(cutPlan.joinLengthMm),
          requiresGrainMatch: true,
        },
      });
    }
  }

  // Reset oversize flags on any pieces NOT detected as oversize
  // (handles case where user resizes a piece smaller after a prior optimize)
  if (oversizePieceIds.length > 0) {
    await prisma.quote_pieces.updateMany({
      where: {
        id: { notIn: oversizePieceIds },
        quote_rooms: { quote_id: quoteId },
      },
      data: {
        isOversize: false,
        joinCount: 0,
        joinLengthMm: null,
        requiresGrainMatch: false,
      },
    });
  } else {
    // No oversize pieces at all — reset everything
    await prisma.quote_pieces.updateMany({
      where: {
        quote_rooms: { quote_id: quoteId },
      },
      data: {
        isOversize: false,
        joinCount: 0,
        joinLengthMm: null,
        requiresGrainMatch: false,
      },
    });
  }

  logger.info(
    `[Optimize API] Persisted oversize flags: ${oversizePieceIds.length} oversize piece(s) out of ${allPieceRows.length} total`
  );
}

// GET - Retrieve saved optimization for quote
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const optimization = await prisma.slab_optimizations.findFirst({
      where: { quoteId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(optimization);
  } catch (error) {
    logger.error('Failed to fetch optimization:', error);
    return NextResponse.json(
      { error: 'Failed to fetch optimization' },
      { status: 500 }
    );
  }
}

// POST - Run optimization and save
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();

    // Fetch operation-specific kerfs from machine_operation_defaults
    const operationKerfs = await getOperationKerfs();
    const initialCutKerf = operationKerfs['INITIAL_CUT'] ?? 3;
    const mitreKerf = operationKerfs['MITRING'] ?? initialCutKerf;

    // Use INITIAL_CUT kerf as the default for slab nesting (primary cuts)
    // MITRING kerf is passed separately for mitre strip width calculations
    const {
      kerfWidth = initialCutKerf,
      allowRotation = true,
    } = body;

    // Get quote with pieces and their materials
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      include: {
        quote_rooms: {
          include: {
            quote_pieces: {
              include: { materials: true },
            },
          },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Resolve slab edge allowance: quote override → tenant default → 0
    let edgeAllowanceMm = (quote as unknown as { slabEdgeAllowanceMm: number | null }).slabEdgeAllowanceMm;
    if (edgeAllowanceMm === null || edgeAllowanceMm === undefined) {
      try {
        const pricingSettings = await prisma.pricing_settings.findFirst({
          select: { slab_edge_allowance_mm: true },
        });
        edgeAllowanceMm = pricingSettings?.slab_edge_allowance_mm ?? 0;
      } catch {
        edgeAllowanceMm = 0;
      }
    }

    // Resolve primary material from first piece that has one
    type QuotePiece = { materials: { slab_length_mm: number | null; slab_width_mm: number | null; fabrication_category: string; name: string } | null };
    const primaryMaterial = quote.quote_rooms
      .flatMap((r: { quote_pieces: QuotePiece[] }) => r.quote_pieces)
      .find((p: QuotePiece) => p.materials)?.materials;

    // Slab dimension fallback chain:
    //   1. Explicit body value from the client
    //   2. Material record's slab dimensions (length → optimizer width, width → optimizer height)
    //   3. Default for the material's fabrication category (from SLAB_SIZES)
    //   4. Ultimate fallback: 3200 × 1600 (jumbo engineered quartz)
    const slabWidth = body.slabWidth
      ?? primaryMaterial?.slab_length_mm
      ?? getDefaultSlabLength(primaryMaterial?.fabrication_category)
      ?? 3200;
    const slabHeight = body.slabHeight
      ?? primaryMaterial?.slab_width_mm
      ?? getDefaultSlabWidth(primaryMaterial?.fabrication_category)
      ?? 1600;

    logger.info('[Optimize API] Starting optimization for quote', quoteId,
      'settings:', slabWidth + 'x' + slabHeight + 'mm, kerf:' + kerfWidth + 'mm (INITIAL_CUT), mitre kerf:' + mitreKerf + 'mm (MITRING), edge allowance:' + edgeAllowanceMm + 'mm',
      'material:', primaryMaterial?.name ?? 'none',
      'source:', body.slabWidth ? 'user-provided' : primaryMaterial?.slab_length_mm ? 'material-record' : primaryMaterial?.fabrication_category ? 'category-default' : 'ultimate-fallback'
    );

    // Collect all unique edge type IDs from pieces for name resolution
    const allEdgeTypeIds = new Set<string>();
    for (const room of quote.quote_rooms) {
      for (const piece of room.quote_pieces as Array<{ edge_top: string | null; edge_bottom: string | null; edge_left: string | null; edge_right: string | null }>) {
        if (piece.edge_top) allEdgeTypeIds.add(piece.edge_top);
        if (piece.edge_bottom) allEdgeTypeIds.add(piece.edge_bottom);
        if (piece.edge_left) allEdgeTypeIds.add(piece.edge_left);
        if (piece.edge_right) allEdgeTypeIds.add(piece.edge_right);
      }
    }

    // Resolve edge type IDs to names (needed for mitre/waterfall strip width calculation)
    const edgeTypeMap = new Map<string, string>();
    if (allEdgeTypeIds.size > 0) {
      const edgeTypes = await prisma.edge_types.findMany({
        where: { id: { in: Array.from(allEdgeTypeIds) } },
        select: { id: true, name: true },
      });
      for (const et of edgeTypes) {
        edgeTypeMap.set(et.id, et.name);
      }
    }

    // Extract pieces from quote with thickness, finished edges, material, and resolved edge type names
    type QuotePieceRow = {
      id: number;
      length_mm: number;
      width_mm: number;
      thickness_mm: number;
      name: string;
      material_id: number | null;
      edge_top: string | null;
      edge_bottom: string | null;
      edge_left: string | null;
      edge_right: string | null;
      shape_type: string | null;
      shape_config: unknown;
      requiresGrainMatch: boolean | null;
      materials: { id: number; name: string; slab_length_mm: number | null; slab_width_mm: number | null; fabrication_category: string } | null;
    };

    const pieces = quote.quote_rooms.flatMap((room: {
      name: string;
      quote_pieces: QuotePieceRow[];
    }) =>
      room.quote_pieces.map((piece) => ({
        id: piece.id.toString(),
        width: piece.length_mm,
        height: piece.width_mm,
        label: `${room.name}: ${piece.name || 'Piece'}`,
        thickness: piece.thickness_mm || 20,
        finishedEdges: {
          top: piece.edge_top !== null,
          bottom: piece.edge_bottom !== null,
          left: piece.edge_left !== null,
          right: piece.edge_right !== null,
        },
        edgeTypeNames: {
          top: piece.edge_top ? edgeTypeMap.get(piece.edge_top) : undefined,
          bottom: piece.edge_bottom ? edgeTypeMap.get(piece.edge_bottom) : undefined,
          left: piece.edge_left ? edgeTypeMap.get(piece.edge_left) : undefined,
          right: piece.edge_right ? edgeTypeMap.get(piece.edge_right) : undefined,
        },
        materialId: piece.material_id?.toString() ?? null,
        // Shape data for L/U decomposition in the optimizer
        shapeType: piece.shape_type ?? undefined,
        shapeConfig: piece.shape_config ?? undefined,
        grainMatched: piece.requiresGrainMatch === true,
      }))
    );

    if (pieces.length === 0) {
      return NextResponse.json(
        { error: 'Quote has no pieces to optimize' },
        { status: 400 }
      );
    }

    // ── Detect distinct materials to decide single vs multi-material path ──
    const distinctMaterialIds = new Set(
      pieces.map((p: { materialId: string | null }) => p.materialId).filter(Boolean)
    );
    const isMultiMaterial = distinctMaterialIds.size > 1;

    // Collect unique material records from the pieces
    const materialRecords = new Map<string, QuotePieceRow['materials']>();
    for (const room of quote.quote_rooms) {
      for (const piece of room.quote_pieces as QuotePieceRow[]) {
        if (piece.materials && piece.material_id) {
          materialRecords.set(piece.material_id.toString(), piece.materials);
        }
      }
    }

    if (isMultiMaterial) {
      // ── Multi-material optimisation path ──────────────────────────────
      logger.info(
        `[Optimize API] Multi-material mode: ${distinctMaterialIds.size} materials detected for quote ${quoteId}`
      );

      const materialsInfo: MaterialInfo[] = Array.from(materialRecords.entries()).map(
        ([id, mat]) => ({
          id,
          name: mat?.name ?? `Material ${id}`,
          slabLengthMm: mat?.slab_length_mm,
          slabWidthMm: mat?.slab_width_mm,
          fabricationCategory: mat?.fabrication_category,
        })
      );

      const multiMaterialPieces: MultiMaterialPiece[] = pieces.map(
        (p: { id: string; width: number; height: number; label: string; thickness: number; finishedEdges: { top: boolean; bottom: boolean; left: boolean; right: boolean }; edgeTypeNames: { top?: string; bottom?: string; left?: string; right?: string }; materialId: string | null; shapeType?: string; shapeConfig?: unknown; grainMatched?: boolean }) => ({
          id: p.id,
          width: p.width,
          height: p.height,
          label: p.label,
          thickness: p.thickness,
          finishedEdges: p.finishedEdges,
          edgeTypeNames: p.edgeTypeNames,
          materialId: p.materialId,
          shapeType: p.shapeType,
          shapeConfig: p.shapeConfig,
          grainMatched: p.grainMatched,
        })
      );

      const primaryMaterialId = primaryMaterial
        ? Array.from(materialRecords.entries()).find(([, mat]) => mat?.name === primaryMaterial.name)?.[0] ?? null
        : null;

      const multiResult = optimizeMultiMaterial({
        pieces: multiMaterialPieces,
        materials: materialsInfo,
        primaryMaterialId,
        kerfWidth,
        allowRotation,
        edgeAllowanceMm,
        mitreKerfWidth: mitreKerf,
      });

      // Build a combined single-material-compatible result for backward-compat DB storage
      const allPlacements = multiResult.materialGroups.flatMap((g) =>
        g.optimizationResult.placements
      );
      const allUnplaced = multiResult.materialGroups.flatMap((g) =>
        g.optimizationResult.unplacedPieces
      );
      const allWarnings = multiResult.warnings ?? [];

      logger.info(
        `[Optimize API] Multi-material complete: ${multiResult.totalSlabCount} total slabs, ${multiResult.overallWastePercentage.toFixed(2)}% waste`
      );

      // Save to database
      const optimization = await prisma.slab_optimizations.create({
        data: {
          id: crypto.randomUUID(),
          quoteId,
          slabWidth,
          slabHeight,
          kerfWidth,
          totalSlabs: multiResult.totalSlabCount,
          totalWaste: multiResult.materialGroups.reduce(
            (sum, g) => sum + g.optimizationResult.totalWasteArea,
            0
          ),
          wastePercent: multiResult.overallWastePercentage,
          placements: {
            items: allPlacements,
            unplacedPieces: allUnplaced,
            warnings: allWarnings,
            inputPieceCount: pieces.length,
            edgeAllowanceMm,
            // Multi-material metadata stored alongside
            multiMaterial: {
              materialGroups: multiResult.materialGroups.map((g) => ({
                materialId: g.materialId,
                materialName: g.materialName,
                slabDimensions: g.slabDimensions,
                slabCount: g.slabCount,
                wastePercentage: g.wastePercentage,
                oversizePieces: g.oversizePieces,
                pieceIds: g.pieces.map((p) => p.pieceId),
              })),
              totalSlabCount: multiResult.totalSlabCount,
              overallWastePercentage: multiResult.overallWastePercentage,
            },
          } as object,
          laminationSummary: multiResult.materialGroups.reduce((acc, g) => {
            const ls = g.optimizationResult.laminationSummary;
            if (!ls) return acc;
            return {
              totalStrips: (acc?.totalStrips ?? 0) + ls.totalStrips,
              totalStripArea: (acc?.totalStripArea ?? 0) + ls.totalStripArea,
              stripsByParent: [...(acc?.stripsByParent ?? []), ...ls.stripsByParent],
            };
          }, null as any) as object || null,
          updatedAt: new Date(),
        } as any,
      });

      logger.info('[Optimize API] Saved multi-material optimization', optimization.id);

      // OVERSIZE PERSISTENCE — Phase 2.5 (multi-material path)
      const allPieceRowsMulti = quote.quote_rooms.flatMap(
        (room: { quote_pieces: Array<{ id: number; length_mm: number; width_mm: number; materials: { slab_length_mm: number | null; slab_width_mm: number | null; name: string } | null }> }) =>
          room.quote_pieces.map(p => ({
            id: p.id,
            length_mm: p.length_mm,
            width_mm: p.width_mm,
            materials: p.materials,
          }))
      );
      await persistOversizeToQuotePieces(quoteId, allPieceRowsMulti, slabWidth, slabHeight);

      // Persist total slab count to quote record
      await prisma.quotes.update({
        where: { id: quoteId },
        data: {
          optimizer_slab_count: multiResult.totalSlabCount,
          optimizer_run_at: new Date(),
        },
      });

      return NextResponse.json({
        optimization,
        result: {
          placements: allPlacements,
          slabs: multiResult.materialGroups.flatMap((g) => g.slabLayouts),
          totalSlabs: multiResult.totalSlabCount,
          totalUsedArea: multiResult.materialGroups.reduce(
            (sum, g) => sum + g.optimizationResult.totalUsedArea,
            0
          ),
          totalWasteArea: multiResult.materialGroups.reduce(
            (sum, g) => sum + g.optimizationResult.totalWasteArea,
            0
          ),
          wastePercent: multiResult.overallWastePercentage,
          unplacedPieces: allUnplaced,
          warnings: allWarnings.length > 0 ? allWarnings : undefined,
        },
        multiMaterialResult: multiResult,
        operationKerfs,
      });
    }

    // ── Single-material optimisation path (existing, backward compatible) ──
    // Run optimization — pass mitreKerfWidth for operation-specific kerf on mitre strips
    const result = optimizeSlabs({
      pieces,
      slabWidth,
      slabHeight,
      kerfWidth,
      allowRotation,
      edgeAllowanceMm,
      mitreKerfWidth: mitreKerf,
    });

    // Piece count validation at the API level
    const totalPiecesIn = pieces.length;
    const placedMainPieces = result.placements.filter(
      (p: { isLaminationStrip?: boolean }) => !p.isLaminationStrip
    ).length;
    const unplacedCount = result.unplacedPieces.length;

    if (unplacedCount > 0) {
      logger.error(
        `[Optimize API] ${unplacedCount} piece(s) could not be placed for quote ${quoteId}:`,
        result.unplacedPieces
      );
    }

    if (result.warnings && result.warnings.length > 0) {
      logger.info(`[Optimize API] Warnings: ${result.warnings.join('; ')}`);
    }

    logger.info(
      `[Optimize API] Optimization complete: ${result.totalSlabs} slabs, ${result.wastePercent.toFixed(2)}% waste, ${totalPiecesIn} input pieces → ${placedMainPieces} placed + ${unplacedCount} unplaced`
    );

    // Save to database — wrap placements in an object to include unplacedPieces and warnings
    // (the slab_optimizations table has a single Json column for placements)
    const optimization = await prisma.slab_optimizations.create({
      data: {
        id: crypto.randomUUID(),
        quoteId,
        slabWidth,
        slabHeight,
        kerfWidth,
        totalSlabs: result.totalSlabs,
        totalWaste: result.totalWasteArea,
        wastePercent: result.wastePercent,
        placements: {
          items: result.placements,
          unplacedPieces: result.unplacedPieces,
          warnings: result.warnings || [],
          inputPieceCount: totalPiecesIn,
          edgeAllowanceMm,
        } as object,
        laminationSummary: result.laminationSummary as object || null,
        updatedAt: new Date(),
      } as any,
    });

    logger.info('[Optimize API] Saved optimization', optimization.id);

    // Verify save by reading it back
    const verification = await prisma.slab_optimizations.findUnique({
      where: { id: optimization.id },
    });

    if (!verification) {
      logger.error('[Optimize API] CRITICAL: Save verification failed - data not found!');
    }

    // OVERSIZE PERSISTENCE — Phase 2.5
    // Write optimizer oversize detection back to quote_pieces.
    // slabWidth in the optimizer = slab length (longer dimension), slabHeight = slab width (shorter).
    const allPieceRows = quote.quote_rooms.flatMap(
      (room: { quote_pieces: Array<{ id: number; length_mm: number; width_mm: number; materials: { slab_length_mm: number | null; slab_width_mm: number | null; name: string } | null }> }) =>
        room.quote_pieces.map(p => ({
          id: p.id,
          length_mm: p.length_mm,
          width_mm: p.width_mm,
          materials: p.materials,
        }))
    );
    await persistOversizeToQuotePieces(quoteId, allPieceRows, slabWidth, slabHeight);

    // Persist total slab count to quote record
    await prisma.quotes.update({
      where: { id: quoteId },
      data: {
        optimizer_slab_count: result.totalSlabs,
        optimizer_run_at: new Date(),
      },
    });

    return NextResponse.json({
      optimization,
      result,
      operationKerfs,
    });
  } catch (error) {
    logger.error('[Optimize API] Failed to optimize:', error);
    return NextResponse.json(
      { error: 'Optimization failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
