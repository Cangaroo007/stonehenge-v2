import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// PATCH — Move multiple pieces to a different room
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const data = await request.json();
    const { pieceIds, targetRoomId, newRoomName } = data as {
      pieceIds: number[];
      targetRoomId?: number;
      newRoomName?: string;
    };

    if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
      return NextResponse.json({ error: 'pieceIds array is required' }, { status: 400 });
    }

    if (!targetRoomId && !newRoomName) {
      return NextResponse.json({ error: 'Either targetRoomId or newRoomName is required' }, { status: 400 });
    }

    // Verify pieces belong to this quote
    const pieces = await prisma.quote_pieces.findMany({
      where: {
        id: { in: pieceIds },
        quote_rooms: { quote_id: quoteId },
      },
      select: { id: true },
    });

    if (pieces.length === 0) {
      return NextResponse.json({ error: 'No matching pieces found' }, { status: 404 });
    }

    let roomId: number;

    if (targetRoomId) {
      // Verify target room belongs to this quote
      const targetRoom = await prisma.quote_rooms.findFirst({
        where: { id: targetRoomId, quote_id: quoteId },
      });

      if (!targetRoom) {
        return NextResponse.json({ error: 'Target room not found' }, { status: 404 });
      }

      roomId = targetRoomId;
    } else {
      // Create new room
      const trimmedName = newRoomName!.trim();

      const existing = await prisma.quote_rooms.findFirst({
        where: { quote_id: quoteId, name: trimmedName },
      });

      if (existing) {
        roomId = existing.id;
      } else {
        const maxRoom = await prisma.quote_rooms.findFirst({
          where: { quote_id: quoteId },
          orderBy: { sort_order: 'desc' },
        });

        const newRoom = await prisma.quote_rooms.create({
          data: {
            quote_id: quoteId,
            name: trimmedName,
            sort_order: (maxRoom?.sort_order ?? -1) + 1,
          },
        });

        roomId = newRoom.id;
      }
    }

    // Get max sort_order in target room
    const maxPiece = await prisma.quote_pieces.findFirst({
      where: { room_id: roomId },
      orderBy: { sort_order: 'desc' },
    });
    const startOrder = (maxPiece?.sort_order ?? -1) + 1;

    // Move pieces with sequential sort orders
    await prisma.$transaction(
      pieces.map((piece, i) =>
        prisma.quote_pieces.update({
          where: { id: piece.id },
          data: {
            room_id: roomId,
            sort_order: startOrder + i,
          },
        })
      )
    );

    return NextResponse.json({
      moved: pieces.length,
      targetRoomId: roomId,
    });
  } catch (error) {
    console.error('Error moving pieces:', error);
    return NextResponse.json({ error: 'Failed to move pieces' }, { status: 500 });
  }
}
