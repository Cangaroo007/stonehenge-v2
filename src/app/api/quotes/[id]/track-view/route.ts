import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
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
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Get current user (may be null for public/shared links in future)
    const currentUser = await getCurrentUser();

    // Track the view
    await trackQuoteView(
      quoteId,
      currentUser?.id,
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
