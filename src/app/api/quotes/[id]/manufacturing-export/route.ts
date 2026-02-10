import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generateManufacturingExport } from '@/lib/services/manufacturing-export';

/**
 * GET /api/quotes/[id]/manufacturing-export
 *
 * Returns the manufacturing-ready JSON payload for a locked/accepted quote.
 * Only available when the quote status is "locked" or "accepted".
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json(
        { error: 'Invalid quote ID' },
        { status: 400 }
      );
    }

    const exportData = await generateManufacturingExport(quoteId);

    return NextResponse.json(exportData);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate manufacturing export';

    // Distinguish business-rule errors from unexpected failures
    if (
      message.includes('not found') ||
      message.includes('only available for')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('Error generating manufacturing export:', error);
    return NextResponse.json(
      { error: 'Failed to generate manufacturing export' },
      { status: 500 }
    );
  }
}
