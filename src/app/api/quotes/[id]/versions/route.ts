import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET - List all versions for a quote
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const quoteId = parseInt(id);

    // Verify quote exists and user has access
    const quote = await prisma.quotes.findFirst({
      where: {
        id: quoteId,
        OR: [
          { created_by: authResult.user.id },
          { customers: { user: { some: { id: authResult.user.id } } } },
        ],
      },
      select: { id: true, quote_number: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Fetch all versions
    const versions = await prisma.quote_versions.findMany({
      where: { quoteId },
      orderBy: { version: 'desc' },
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      quote: {
        id: quote.id,
        quote_number: quote.quote_number,
      },
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        changeType: v.changeType,
        changeReason: v.changeReason,
        changeSummary: v.changeSummary,
        changedBy: v.changedByUser,
        changedAt: v.changedAt,
        rolledBackFromVersion: v.rolledBackFromVersion,
        subtotal: v.subtotal,
        tax_amount: v.tax_amount,
        totalAmount: v.totalAmount,
        pieceCount: v.pieceCount,
        isCurrent: false,
        snapshotData: v.snapshotData ?? null,
      })),
    });
  } catch (error) {
    console.error('Error fetching quote versions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote versions' },
      { status: 500 }
    );
  }
}
