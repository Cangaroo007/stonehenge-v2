import { NextRequest, NextResponse } from 'next/server';
import { calculateOptionPricing } from '@/lib/services/quote-option-calculator';

/**
 * POST /api/quotes/[id]/options/[optionId]/calculate
 * Recalculate pricing for a specific option.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { id, optionId } = await params;
    const quoteId = parseInt(id, 10);
    const optId = parseInt(optionId, 10);
    if (isNaN(quoteId) || isNaN(optId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const result = await calculateOptionPricing(quoteId, optId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error calculating option pricing:', error);

    if (error instanceof Error) {
      if (error.message === 'Quote option not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message === 'Option does not belong to this quote') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to calculate option pricing' },
      { status: 500 }
    );
  }
}
