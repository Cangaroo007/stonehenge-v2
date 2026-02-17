import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  transitionQuoteStatus,
  canTransition,
  getAvailableTransitions,
  getStatusDisplay,
} from '@/lib/services/quote-lifecycle-service';

/**
 * GET /api/quotes/[id]/status
 * Returns current status info and available transitions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { prisma } = await import('@/lib/db');

    const quote = await prisma.quotes.findUnique({
      where: { id: parseInt(id) },
      select: { status: true, status_changed_at: true, status_changed_by: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const available = getAvailableTransitions(quote.status);
    const display = getStatusDisplay(quote.status);

    return NextResponse.json({
      currentStatus: quote.status,
      display,
      availableTransitions: available.map((s) => ({
        status: s,
        ...getStatusDisplay(s),
      })),
      statusChangedAt: quote.status_changed_at,
      statusChangedBy: quote.status_changed_by,
    });
  } catch (error) {
    console.error('Error fetching quote status:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}

/**
 * PUT /api/quotes/[id]/status
 * Transition the quote to a new status.
 * Body: { status: string, declinedReason?: string }
 */
export async function PUT(
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
    const { status: targetStatus, declinedReason } = body;

    if (!targetStatus) {
      return NextResponse.json({ error: 'Target status is required' }, { status: 400 });
    }

    // Get user ID
    let userId = '1';
    try {
      const authResult = await requireAuth();
      if (!('error' in authResult)) {
        userId = String(authResult.user.id);
      }
    } catch { /* use fallback */ }

    const result = await transitionQuoteStatus(quoteId, targetStatus, userId, {
      declinedReason,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // If a revision was created, include the new quote ID
    if (result.newQuoteId) {
      return NextResponse.json({
        success: true,
        newQuoteId: result.newQuoteId,
        redirectUrl: `/quotes/${result.newQuoteId}?mode=edit`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error transitioning quote status:', error);
    return NextResponse.json(
      { error: 'Failed to transition status' },
      { status: 500 }
    );
  }
}
