import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

// POST - Duplicate a piece
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, pieceId } = await params;
    const quoteId = parseInt(id);
    const pieceIdNum = parseInt(pieceId);

    if (isNaN(quoteId) || isNaN(pieceIdNum)) {
      return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Get the original piece
    const originalPiece = await prisma.quote_pieces.findUnique({
      where: { id: pieceIdNum },
      include: {
        quote_rooms: true,
      },
    });

    if (!originalPiece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    // Verify the piece belongs to the correct quote
    const room = await prisma.quote_rooms.findUnique({
      where: { id: originalPiece.room_id },
    });

    if (!room || room.quote_id !== quoteId) {
      return NextResponse.json({ error: 'Piece does not belong to this quote' }, { status: 400 });
    }

    // Get the max sortOrder for the quote
    const maxSortOrderPiece = await prisma.quote_pieces.findFirst({
      where: {
        quote_rooms: {
          quote_id: quoteId,
        },
      },
      orderBy: { sort_order: 'desc' },
    });
    const newSortOrder = (maxSortOrderPiece?.sort_order ?? -1) + 1;

    // Create the duplicate piece
    const duplicatedPiece = await prisma.quote_pieces.create({
      data: {
        room_id: originalPiece.room_id,
        name: `${originalPiece.name} (copy)`,
        description: originalPiece.description,
        length_mm: originalPiece.length_mm,
        width_mm: originalPiece.width_mm,
        thickness_mm: originalPiece.thickness_mm,
        area_sqm: originalPiece.area_sqm,
        material_id: originalPiece.material_id,
        material_name: originalPiece.material_name,
        // DEPRECATED: material_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        material_cost: originalPiece.material_cost,
        features_cost: originalPiece.features_cost,
        // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        total_cost: originalPiece.total_cost,
        edge_top: originalPiece.edge_top,
        edge_bottom: originalPiece.edge_bottom,
        edge_left: originalPiece.edge_left,
        edge_right: originalPiece.edge_right,
        cutouts: originalPiece.cutouts ?? [],
        sort_order: newSortOrder,
      },
      include: {
        quote_rooms: true,
      },
    });

    // Invalidate stale optimizer results — piece data has changed
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    return NextResponse.json({
      ...duplicatedPiece,
      quote_rooms: { id: duplicatedPiece.quote_rooms.id, name: duplicatedPiece.quote_rooms.name },
    }, { status: 201 });
  } catch (error) {
    console.error('Error duplicating piece:', error);
    return NextResponse.json({ error: 'Failed to duplicate piece' }, { status: 500 });
  }
}
