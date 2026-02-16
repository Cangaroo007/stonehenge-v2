import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// PATCH /api/quotes/[id]/edge-allowance — update slab edge allowance for a quote
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const body = await request.json();
    const { slabEdgeAllowanceMm } = body;

    // Validate: null (clear), or 0-50
    if (slabEdgeAllowanceMm !== null && slabEdgeAllowanceMm !== undefined) {
      const val = Number(slabEdgeAllowanceMm);
      if (isNaN(val) || val < 0 || val > 50) {
        return NextResponse.json(
          { error: 'Slab edge allowance must be between 0 and 50mm' },
          { status: 400 }
        );
      }
    }

    const quote = await prisma.quotes.update({
      where: { id: quoteId },
      data: {
        slabEdgeAllowanceMm: slabEdgeAllowanceMm === null || slabEdgeAllowanceMm === undefined
          ? null
          : parseInt(String(slabEdgeAllowanceMm), 10),
        updated_at: new Date(),
      },
      select: {
        id: true,
        slabEdgeAllowanceMm: true,
      },
    });

    return NextResponse.json(quote);
  } catch (error) {
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || 'Failed to update edge allowance' },
      { status: 500 }
    );
  }
}
