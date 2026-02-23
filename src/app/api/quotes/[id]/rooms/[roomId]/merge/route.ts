import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

// POST — Merge a room into another room
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, roomId } = await params;
    const quoteId = parseInt(id);
    const sourceRoomId = parseInt(roomId);

    if (isNaN(quoteId) || isNaN(sourceRoomId)) {
      return NextResponse.json({ error: 'Invalid quote or room ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();
    const { targetRoomId } = body;

    if (!targetRoomId || typeof targetRoomId !== 'number') {
      return NextResponse.json({ error: 'targetRoomId is required' }, { status: 400 });
    }

    if (sourceRoomId === targetRoomId) {
      return NextResponse.json({ error: 'Cannot merge a room into itself' }, { status: 400 });
    }

    // Verify both rooms belong to this quote
    const [sourceRoom, targetRoom] = await Promise.all([
      prisma.quote_rooms.findFirst({
        where: { id: sourceRoomId, quote_id: quoteId },
        include: { quote_pieces: { select: { id: true } } },
      }),
      prisma.quote_rooms.findFirst({
        where: { id: targetRoomId, quote_id: quoteId },
      }),
    ]);

    if (!sourceRoom) {
      return NextResponse.json({ error: 'Source room not found' }, { status: 404 });
    }
    if (!targetRoom) {
      return NextResponse.json({ error: 'Target room not found' }, { status: 404 });
    }

    const pieceCount = sourceRoom.quote_pieces.length;

    // Get max sort_order in target room for appending pieces
    const maxPiece = await prisma.quote_pieces.findFirst({
      where: { room_id: targetRoomId },
      orderBy: { sort_order: 'desc' },
    });
    const startOrder = (maxPiece?.sort_order ?? -1) + 1;

    // Move all pieces and delete source room
    await prisma.$transaction(async (tx) => {
      // Update sort orders for moved pieces
      const piecesToMove = await tx.quote_pieces.findMany({
        where: { room_id: sourceRoomId },
        orderBy: { sort_order: 'asc' },
      });

      for (let i = 0; i < piecesToMove.length; i++) {
        await tx.quote_pieces.update({
          where: { id: piecesToMove[i].id },
          data: {
            room_id: targetRoomId,
            sort_order: startOrder + i,
          },
        });
      }

      // Delete the source room
      await tx.quote_rooms.delete({ where: { id: sourceRoomId } });
    });

    return NextResponse.json({
      merged: true,
      piecesMoved: pieceCount,
      targetRoomId,
      targetRoomName: targetRoom.name,
    });
  } catch (error) {
    console.error('Error merging rooms:', error);
    return NextResponse.json({ error: 'Failed to merge rooms' }, { status: 500 });
  }
}
