import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

// PATCH — Update room (rename and/or update notes)
export async function PATCH(
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
    const roomIdNum = parseInt(roomId);

    if (isNaN(quoteId) || isNaN(roomIdNum)) {
      return NextResponse.json({ error: 'Invalid quote or room ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, notes } = body;

    // At least one field must be provided
    const hasName = name !== undefined;
    const hasNotes = notes !== undefined;
    if (!hasName && !hasNotes) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Verify room belongs to this quote
    const room = await prisma.quote_rooms.findFirst({
      where: { id: roomIdNum, quote_id: quoteId },
    });

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Build update data
    const updateData: { name?: string; notes?: string | null } = {};

    if (hasName) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Room name is required' }, { status: 400 });
      }
      const trimmedName = name.trim();

      // Check for duplicate name
      const duplicate = await prisma.quote_rooms.findFirst({
        where: { quote_id: quoteId, name: trimmedName, id: { not: roomIdNum } },
      });
      if (duplicate) {
        return NextResponse.json({ error: 'A room with this name already exists' }, { status: 409 });
      }
      updateData.name = trimmedName;
    }

    if (hasNotes) {
      // Allow null or empty string to clear notes
      updateData.notes = typeof notes === 'string' ? (notes.trim() || null) : null;
    }

    const updated = await prisma.quote_rooms.update({
      where: { id: roomIdNum },
      data: updateData,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      sortOrder: updated.sort_order,
      notes: updated.notes,
    });
  } catch (error) {
    console.error('Error updating room:', error);
    return NextResponse.json({ error: 'Failed to update room' }, { status: 500 });
  }
}

// DELETE — Delete a room (moves pieces to Unassigned)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, roomId } = await params;
    const quoteId = parseInt(id);
    const roomIdNum = parseInt(roomId);

    if (isNaN(quoteId) || isNaN(roomIdNum)) {
      return NextResponse.json({ error: 'Invalid quote or room ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
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
