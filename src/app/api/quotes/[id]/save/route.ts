import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { generateQuoteNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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
    const quoteId = parseInt(id, 10);

    // Check quote exists and has no number yet
    const quote = await prisma.quotes.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    if (quote.quote_number) {
      return NextResponse.json({ quoteNumber: quote.quote_number }); // Already saved
    }

    // Get last quote number and generate next
    const lastQuote = await prisma.quotes.findFirst({
      where: { quote_number: { not: null } },
      orderBy: { quote_number: 'desc' },
      select: { quote_number: true },
    });
    const quoteNumber = generateQuoteNumber(lastQuote?.quote_number || null);

    const updated = await prisma.quotes.update({
      where: { id: quoteId },
      data: { quote_number: quoteNumber },
    });

    return NextResponse.json({ quoteNumber: updated.quote_number });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save quote';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
