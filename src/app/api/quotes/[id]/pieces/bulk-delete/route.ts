import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// DELETE — Bulk delete multiple pieces (relationships cascade automatically)
export async function DELETE(
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
      select: { id: true, room_id: true },
    });

    if (pieces.length === 0) {
      return NextResponse.json({ error: 'No matching pieces found' }, { status: 404 });
    }

    const pieceIdsToDelete = pieces.map(p => p.id);

    // Delete pieces (piece_features and piece_relationships cascade via onDelete: Cascade)
    const result = await prisma.quote_pieces.deleteMany({
      where: { id: { in: pieceIdsToDelete } },
    });

    // Clean up empty rooms (except "Unassigned")
    const affectedRoomIds = Array.from(new Set(pieces.map(p => p.room_id)));
    for (const roomId of affectedRoomIds) {
      const remaining = await prisma.quote_pieces.count({
        where: { room_id: roomId },
      });
      if (remaining === 0) {
        const room = await prisma.quote_rooms.findUnique({
          where: { id: roomId },
          select: { name: true },
        });
        // Don't auto-delete rooms — leave them for user to manage
      }
    }

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error('Error bulk deleting pieces:', error);
    return NextResponse.json({ error: 'Failed to delete pieces' }, { status: 500 });
  }
}
