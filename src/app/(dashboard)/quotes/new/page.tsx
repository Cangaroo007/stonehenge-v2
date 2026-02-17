import NewQuoteWizard from '@/components/quotes/NewQuoteWizard';

export const dynamic = 'force-dynamic';

/**
 * /quotes/new — renders the New Quote wizard with 3 options:
 *   1. From Drawing — upload PDF, AI extracts pieces
 *   2. From Template — pick a starter template, assign materials
 *   3. Manual — blank draft quote, add pieces manually
 *
 * Accepts optional ?customerId=<id> to pre-assign a customer.
 */
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId: customerIdParam } = await searchParams;
  const customerId = customerIdParam ? parseInt(customerIdParam, 10) : undefined;

  return (
    <div className="space-y-6">
      <NewQuoteWizard customerId={customerId && !isNaN(customerId) ? customerId : undefined} />
    </div>
  );
}
