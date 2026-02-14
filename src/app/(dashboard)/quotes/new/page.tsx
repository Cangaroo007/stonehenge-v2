import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateQuoteNumber } from '@/lib/utils';
import { createInitialVersion } from '@/lib/services/quote-version-service';

export const dynamic = 'force-dynamic';

/**
 * /quotes/new — creates an empty draft quote server-side and redirects to
 * the unified quote detail page in edit mode.
 *
 * Accepts optional ?customerId=<id> to pre-assign a customer.
 *
 * This ensures all quote editing flows through QuoteLayout → QuoteDetailClient,
 * eliminating the parallel QuoteForm rendering path (Route Consolidation 12.4).
 */
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId: customerIdParam } = await searchParams;
  const customerId = customerIdParam ? parseInt(customerIdParam, 10) : null;

  const [user, lastQuote] = await Promise.all([
    getCurrentUser(),
    prisma.quotes.findFirst({ orderBy: { quote_number: 'desc' } }),
  ]);

  const quoteNumber = generateQuoteNumber(lastQuote?.quote_number || null);

  // Create a minimal draft quote with one default room
  const quote = await prisma.quotes.create({
    data: {
      quote_number: quoteNumber,
      customer_id: customerId && !isNaN(customerId) ? customerId : null,
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
  } catch (e) {
    console.error('Error creating initial version (non-blocking):', e);
  }

  redirect(`/quotes/${quote.id}?mode=edit`);
}
