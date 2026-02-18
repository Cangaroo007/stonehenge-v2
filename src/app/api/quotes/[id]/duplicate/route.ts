import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { duplicateQuote } from '@/lib/services/quote-lifecycle-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const userId = String(auth.user.id);
    const { companyId } = auth.user;

    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Verify quote belongs to user's company
    const { verifyQuoteOwnership } = await import('@/lib/auth');
    const quoteCheck = await verifyQuoteOwnership(quoteId, companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Parse optional body
    let body: { asRevision?: boolean; newTitle?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine — simple duplicate
    }

    const newQuote = await duplicateQuote(quoteId, userId, {
      asRevision: body.asRevision,
      newTitle: body.newTitle,
    });

    return NextResponse.json({
      id: newQuote.id,
      quote_number: newQuote.quote_number,
      redirectUrl: `/quotes/${newQuote.id}?mode=edit`,
    });
  } catch (error) {
    console.error('Error duplicating quote:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to duplicate quote' },
      { status: 500 }
    );
  }
}
