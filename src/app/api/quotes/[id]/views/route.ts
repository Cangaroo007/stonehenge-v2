import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermissionAsync, Permission } from '@/lib/permissions';
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
    const { id } = await params;
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quoteId = parseInt(id);
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Check if user can view this quote
    const canViewAll = await hasPermissionAsync(currentUser.id, Permission.VIEW_ALL_QUOTES);
    
    // Get the quote to check ownership
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { 
        id: true,
        customerId: true,
        created_by: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Check access
    const hasAccess = 
      canViewAll || 
      quote.created_by === currentUser.id || 
      (currentUser.customerId && quote.customerId === currentUser.customerId);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get view history
    const views = await prisma.quote_views.findMany({
      where: { quoteId },
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
      orderBy: { viewedAt: 'desc' },
      take: 50, // Limit to last 50 views
    });

    return NextResponse.json(views);
  } catch (error) {
    console.error('Error fetching quote views:', error);
    return NextResponse.json(
      { error: 'Failed to fetch views' },
      { status: 500 }
    );
  }
}
