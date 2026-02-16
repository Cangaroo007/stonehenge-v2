import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// POST - Create a new room for a quote
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Room name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Check if room already exists for this quote
    const existing = await prisma.quote_rooms.findFirst({
      where: { quote_id: quoteId, name: trimmedName },
    });

    if (existing) {
      return NextResponse.json({ error: 'A room with this name already exists' }, { status: 409 });
    }

    // Get max sort_order for this quote
    const maxRoom = await prisma.quote_rooms.findFirst({
      where: { quote_id: quoteId },
      orderBy: { sort_order: 'desc' },
    });

    const room = await prisma.quote_rooms.create({
      data: {
        quote_id: quoteId,
        name: trimmedName,
        sort_order: (maxRoom?.sort_order ?? -1) + 1,
      },
    });

    return NextResponse.json({
      id: room.id,
      name: room.name,
      sortOrder: room.sort_order,
    });
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
  }
}
