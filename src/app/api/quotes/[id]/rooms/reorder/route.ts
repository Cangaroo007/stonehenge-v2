import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

// PUT — Reorder rooms for a quote
export async function PUT(
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

    const body = await request.json();
    const { rooms } = body as { rooms: { id: number; sortOrder: number }[] };

    if (!Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json({ error: 'rooms array is required' }, { status: 400 });
    }

    // Verify all rooms belong to this quote
    const existingRooms = await prisma.quote_rooms.findMany({
      where: { quote_id: quoteId },
      select: { id: true },
    });
    const existingIds = new Set(existingRooms.map(r => r.id));

    for (const room of rooms) {
      if (!existingIds.has(room.id)) {
        return NextResponse.json(
          { error: `Room ${room.id} does not belong to this quote` },
          { status: 400 }
        );
      }
    }

    // Atomic reorder
    await prisma.$transaction(
      rooms.map(room =>
        prisma.quote_rooms.update({
          where: { id: room.id },
          data: { sort_order: room.sortOrder },
        })
      )
    );

    return NextResponse.json({ updated: rooms.length });
  } catch (error) {
    console.error('Error reordering rooms:', error);
    return NextResponse.json({ error: 'Failed to reorder rooms' }, { status: 500 });
  }
}
