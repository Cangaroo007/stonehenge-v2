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
          { createdBy: authResult.user.id },
          { customer: { users: { some: { id: authResult.user.id } } } },
        ],
      },
      select: { id: true, quoteNumber: true, currentVersion: true },
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
        quoteNumber: quote.quote_number,
        currentVersion: quote.currentVersion,
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
        taxAmount: v.tax_amount,
        totalAmount: v.totalAmount,
        pieceCount: v.pieceCount,
        isCurrent: v.version === quote.currentVersion,
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
