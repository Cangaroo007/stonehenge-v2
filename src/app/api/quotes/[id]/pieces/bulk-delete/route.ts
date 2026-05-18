import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import { buildQuotePricingUpdate } from '@/lib/services/quote-pricing-persistence';
import { deleteRelationshipsForPieceInTransaction } from '@/lib/services/piece-relationship-service';

// DELETE — Bulk delete multiple pieces (relationships cascade automatically)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const data = await request.json();
    const { pieceIds } = data as { pieceIds: number[] };

    if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
      return NextResponse.json({ error: 'pieceIds array is required' }, { status: 400 });
    }

    // Verify pieces belong to this quote
    const pieces = await prisma.quote_pieces.findMany({
      where: {
        id: { in: pieceIds },
        quote_rooms: { quote_id: quoteId },
      },
      select: {
        id: true,
        room_id: true,
        promoted_from_piece_id: true,
        promoted_edge_position: true,
      },
    });

    if (pieces.length === 0) {
      return NextResponse.json({ error: 'No matching pieces found' }, { status: 404 });
    }

    const requestedPieceIds = Array.from(new Set(pieceIds));
    const foundPieceIds = new Set(pieces.map(piece => piece.id));
    if (requestedPieceIds.some(pieceId => !foundPieceIds.has(pieceId))) {
      return NextResponse.json(
        { error: 'All deleted pieces must belong to this quote' },
        { status: 400 }
      );
    }

    const pieceIdsToDelete = pieces.map(p => p.id);
    const affectedRoomIds = Array.from(new Set(pieces.map(p => p.room_id)));

    const result = await prisma.$transaction(async (tx) => {
      for (const piece of pieces) {
        if (!piece.promoted_from_piece_id || !piece.promoted_edge_position) continue;

        const parentPiece = await tx.quote_pieces.findUnique({
          where: { id: piece.promoted_from_piece_id },
          select: { no_strip_edges: true },
        });
        if (!parentPiece) continue;

        const currentNoStrip = (parentPiece.no_strip_edges as unknown as string[]) ?? [];
        const restored = currentNoStrip.filter(edge => edge !== piece.promoted_edge_position);
        await tx.quote_pieces.update({
          where: { id: piece.promoted_from_piece_id },
          data: { no_strip_edges: restored as unknown as Prisma.InputJsonValue },
        });
      }

      for (const pieceId of pieceIdsToDelete) {
        await deleteRelationshipsForPieceInTransaction(tx, pieceId);
      }

      const deleteResult = await tx.quote_pieces.deleteMany({
        where: { id: { in: pieceIdsToDelete } },
      });

      for (const roomId of affectedRoomIds) {
        const remaining = await tx.quote_pieces.count({
          where: { room_id: roomId },
        });
        if (remaining === 0) {
          await tx.quote_rooms.delete({ where: { id: roomId } });
        }
      }

      return deleteResult;
    });

    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    try {
      const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
      await prisma.quotes.update({
        where: { id: quoteId },
        data: buildQuotePricingUpdate(calcResult),
      });
    } catch (recalcError) {
      console.error('Post-bulk-delete recalculation failed:', recalcError);
    }

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error('Error bulk deleting pieces:', error);
    return NextResponse.json({ error: 'Failed to delete pieces' }, { status: 500 });
  }
}
