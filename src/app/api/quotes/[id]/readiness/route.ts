import { NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { checkQuoteReadiness } from '@/lib/services/quote-readiness-service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const result = await checkQuoteReadiness(quoteId, authResult.user.companyId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Quote readiness check error:', error);
    return NextResponse.json(
      { error: 'Failed to run readiness checks' },
      { status: 500 },
    );
  }
}
