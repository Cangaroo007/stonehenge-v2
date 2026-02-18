import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { optimizeSlabs } from '@/lib/services/slab-optimizer';
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

    // Use INITIAL_CUT kerf as the default for slab nesting (primary cuts)
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
      'settings:', slabWidth + 'x' + slabHeight + 'mm, kerf:' + kerfWidth + 'mm, edge allowance:' + edgeAllowanceMm + 'mm',
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

    // Extract pieces from quote with thickness, finished edges, and resolved edge type names
    const pieces = quote.quote_rooms.flatMap((room: {
      name: string;
      quote_pieces: Array<{
        id: number;
        length_mm: number;
        width_mm: number;
        thickness_mm: number;
        name: string;
        edge_top: string | null;
        edge_bottom: string | null;
        edge_left: string | null;
        edge_right: string | null;
      }>
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
      }))
    );

    if (pieces.length === 0) {
      return NextResponse.json(
        { error: 'Quote has no pieces to optimize' },
        { status: 400 }
      );
    }

    // Run optimization
    const result = optimizeSlabs({
      pieces,
      slabWidth,
      slabHeight,
      kerfWidth,
      allowRotation,
      edgeAllowanceMm,
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
