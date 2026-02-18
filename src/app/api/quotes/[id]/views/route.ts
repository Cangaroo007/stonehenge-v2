import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import prisma from '@/lib/db';

/**
 * GET /api/quotes/[id]/views
 * Get view history for a quote
 */
export async function GET(
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

    // Get view history
    const views = await prisma.quote_views.findMany({
      where: { quote_id: quoteId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { viewed_at: 'desc' },
      take: 50, // Limit to last 50 views
    });

    // Map snake_case Prisma fields to camelCase for the frontend
    const mapped = views.map((v) => ({
      id: v.id,
      viewedAt: v.viewed_at,
      ipAddress: v.ip_address,
      userAgent: v.user_agent,
      user: v.user,
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error('Error fetching quote views:', error);
    return NextResponse.json(
      { error: 'Failed to fetch views' },
      { status: 500 }
    );
  }
}
