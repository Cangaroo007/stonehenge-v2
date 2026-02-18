import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { trackQuoteView, getClientIp, getUserAgent } from '@/lib/audit';

/**
 * POST /api/quotes/[id]/track-view
 * Track that a quote was viewed
 */
export async function POST(
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

    // Track the view
    await trackQuoteView(
      quoteId,
      auth.user.id,
      getClientIp(request.headers),
      getUserAgent(request.headers)
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking quote view:', error);
    // Don't fail the request if tracking fails
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
