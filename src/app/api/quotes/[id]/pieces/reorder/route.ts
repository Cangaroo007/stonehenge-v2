import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

interface ReorderItem {
  id: number;
  sortOrder: number;
}

// PUT - Reorder pieces
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

    const data = await request.json();
    const { pieces } = data as { pieces: ReorderItem[] };

    if (!pieces || !Array.isArray(pieces)) {
      return NextResponse.json(
        { error: 'Invalid request body. Expected { pieces: [{ id, sortOrder }] }' },
        { status: 400 }
      );
    }

    // Update all pieces in a transaction
    await prisma.$transaction(
      pieces.map((piece: ReorderItem) =>
        prisma.quote_pieces.update({
          where: { id: piece.id },
          data: { sort_order: piece.sortOrder },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering pieces:', error);
    return NextResponse.json({ error: 'Failed to reorder pieces' }, { status: 500 });
  }
}
