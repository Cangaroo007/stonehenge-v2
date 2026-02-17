import NewQuoteWizard from '@/components/quotes/NewQuoteWizard';
import ClassicQuoteBuilder from '@/components/quotes/ClassicQuoteBuilder';

export const dynamic = 'force-dynamic';

/**
 * /quotes/new — renders the New Quote wizard with 3 options:
 *   1. From Drawing — upload PDF, AI extracts pieces
 *   2. From Template — pick a starter template, assign materials
 *   3. Manual — blank draft quote, add pieces manually
 *
 * Accepts optional ?customerId=<id> to pre-assign a customer.
 *
 * ?mode=classic — bypasses wizard, shows the old pre-wizard builder
 *   (creates draft + redirects to edit mode). Accessible via "Build Quote" left nav.
 */
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; mode?: string }>;
}) {
  const { customerId: customerIdParam, mode } = await searchParams;
  const customerId = customerIdParam ? parseInt(customerIdParam, 10) : undefined;
  const safeCustomerId = customerId && !isNaN(customerId) ? customerId : undefined;

  // Classic mode → skip wizard, go straight to old builder
  if (mode === 'classic') {
    return (
      <div className="space-y-6">
        <ClassicQuoteBuilder customerId={safeCustomerId} />
      </div>
    );
  }

  // Default → show wizard (Manual / Drawing / Template)
  return (
    <div className="space-y-6">
      <NewQuoteWizard customerId={safeCustomerId} />
    </div>
  );
}
