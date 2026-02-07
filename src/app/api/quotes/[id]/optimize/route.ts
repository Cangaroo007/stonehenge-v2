import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { optimizeSlabs } from '@/lib/services/slab-optimizer';

// GET - Retrieve saved optimization for quote
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const optimization = await prisma.slab_optimizations.findFirst({
      where: { quoteId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(optimization);
  } catch (error) {
    console.error('Failed to fetch optimization:', error);
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
    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const body = await request.json();
    const { slabWidth = 3000, slabHeight = 1400, kerfWidth = 3, allowRotation = true } = body;

    console.log(`[Optimize API] Starting optimization for quote ${quoteId}`);
    console.log(`[Optimize API] Settings: ${slabWidth}x${slabHeight}mm, kerf: ${kerfWidth}mm, rotation: ${allowRotation}`);

    // Get quote with pieces
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      include: {
        quote_rooms: {
          include: {
            quote_pieces: true,
          },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Extract pieces from quote with thickness, finished edges, and edge type names
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
          top: piece.edge_top || undefined,
          bottom: piece.edge_bottom || undefined,
          left: piece.edge_left || undefined,
          right: piece.edge_right || undefined,
        },
      }))
    );

    if (pieces.length === 0) {
      return NextResponse.json(
        { error: 'Quote has no pieces to optimize' },
        { status: 400 }
      );
    }

    console.log(`[Optimize API] Processing ${pieces.length} pieces`);

    // Run optimization
    const result = optimizeSlabs({
      pieces,
      slabWidth,
      slabHeight,
      kerfWidth,
      allowRotation,
    });

    console.log(`[Optimize API] Optimization complete: ${result.totalSlabs} slabs, ${result.wastePercent.toFixed(2)}% waste`);

    // Save to database
    console.log('[Optimize API] Saving optimization to database...');
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
        placements: result.placements as object,
        laminationSummary: result.laminationSummary as object || null,
        updatedAt: new Date(),
      } as any,
    });

    console.log(`[Optimize API] ✅ Saved optimization ${optimization.id} to database`);

    // Verify save by reading it back
    const verification = await prisma.slab_optimizations.findUnique({
      where: { id: optimization.id },
    });

    if (!verification) {
      console.error('[Optimize API] ❌ CRITICAL: Save verification failed - data not found!');
    } else {
      console.log(`[Optimize API] ✅ Verified: optimization ${verification.id} persisted successfully`);
    }

    return NextResponse.json({
      optimization,
      result,
    });
  } catch (error) {
    console.error('[Optimize API] ❌ Failed to optimize:', error);
    return NextResponse.json(
      { error: 'Optimization failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
