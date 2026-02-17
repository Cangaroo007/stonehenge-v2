import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// PATCH — Rename a room
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  try {
    const { id, roomId } = await params;
    const quoteId = parseInt(id);
    const roomIdNum = parseInt(roomId);

    if (isNaN(quoteId) || isNaN(roomIdNum)) {
      return NextResponse.json({ error: 'Invalid quote or room ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Room name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Verify room belongs to this quote
    const room = await prisma.quote_rooms.findFirst({
      where: { id: roomIdNum, quote_id: quoteId },
    });

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Check for duplicate name
    const duplicate = await prisma.quote_rooms.findFirst({
      where: { quote_id: quoteId, name: trimmedName, id: { not: roomIdNum } },
    });

    if (duplicate) {
      return NextResponse.json({ error: 'A room with this name already exists' }, { status: 409 });
    }

    const updated = await prisma.quote_rooms.update({
      where: { id: roomIdNum },
      data: { name: trimmedName },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      sortOrder: updated.sort_order,
    });
  } catch (error) {
    console.error('Error renaming room:', error);
    return NextResponse.json({ error: 'Failed to rename room' }, { status: 500 });
  }
}

// DELETE — Delete a room (moves pieces to Unassigned)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  try {
    const { id, roomId } = await params;
    const quoteId = parseInt(id);
    const roomIdNum = parseInt(roomId);

    if (isNaN(quoteId) || isNaN(roomIdNum)) {
      return NextResponse.json({ error: 'Invalid quote or room ID' }, { status: 400 });
    }

    // Verify room belongs to this quote
    const room = await prisma.quote_rooms.findFirst({
      where: { id: roomIdNum, quote_id: quoteId },
      include: { quote_pieces: { select: { id: true } } },
    });

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const pieceCount = room.quote_pieces.length;

    // Find or create "Unassigned" room
    let unassignedRoom = await prisma.quote_rooms.findFirst({
      where: { quote_id: quoteId, name: 'Unassigned' },
    });

    if (!unassignedRoom && pieceCount > 0) {
      const maxRoom = await prisma.quote_rooms.findFirst({
        where: { quote_id: quoteId },
        orderBy: { sort_order: 'desc' },
      });
      unassignedRoom = await prisma.quote_rooms.create({
        data: {
          quote_id: quoteId,
          name: 'Unassigned',
          sort_order: (maxRoom?.sort_order ?? -1) + 1,
        },
      });
    }

    // Move pieces to Unassigned room, then delete the room
    await prisma.$transaction(async (tx) => {
      if (pieceCount > 0 && unassignedRoom) {
        await tx.quote_pieces.updateMany({
          where: { room_id: roomIdNum },
          data: { room_id: unassignedRoom.id },
        });
      }
      await tx.quote_rooms.delete({ where: { id: roomIdNum } });
    });

    return NextResponse.json({
      deleted: true,
      piecesMovedToUnassigned: pieceCount,
    });
  } catch (error) {
    console.error('Error deleting room:', error);
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 });
  }
}
