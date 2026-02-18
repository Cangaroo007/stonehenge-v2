import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateQuoteNumber } from '@/lib/utils';
import { createInitialVersion } from '@/lib/services/quote-version-service';

/**
 * POST /api/quotes/create-draft
 *
 * Creates a minimal draft quote with one default room and returns the quoteId.
 * Used by the New Quote wizard for the Manual and Drawing flows.
 *
 * Query params:
 *   - customerId (optional): Pre-assign a customer
 *   - projectName (optional): Set project name
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    const { searchParams } = new URL(request.url);
    const customerIdParam = searchParams.get('customerId');
    const contactIdParam = searchParams.get('contactId');
    const projectNameParam = searchParams.get('projectName');

    const customerId = customerIdParam ? parseInt(customerIdParam, 10) : null;
    const contactId = contactIdParam ? parseInt(contactIdParam, 10) : null;

    const lastQuote = await prisma.quotes.findFirst({
      orderBy: { quote_number: 'desc' },
    });

    const quoteNumber = generateQuoteNumber(lastQuote?.quote_number || null);

    const quote = await prisma.quotes.create({
      data: {
        quote_number: quoteNumber,
        customer_id: customerId && !isNaN(customerId) ? customerId : null,
        contact_id: contactId && !isNaN(contactId) ? contactId : null,
        project_name: projectNameParam || null,
        status: 'draft',
        subtotal: 0,
        tax_rate: 10,
        tax_amount: 0,
        total: 0,
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        created_by: user?.id ?? null,
        updated_at: new Date(),
        quote_rooms: {
          create: {
            name: 'Room 1',
            sort_order: 0,
          },
        },
      },
    });

    // Create initial version for version history (non-blocking)
    try {
      await createInitialVersion(quote.id, user?.id ?? 1);
    } catch {
      // Non-blocking — version history is not critical for draft creation
    }

    return NextResponse.json({ quoteId: quote.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create draft quote';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
