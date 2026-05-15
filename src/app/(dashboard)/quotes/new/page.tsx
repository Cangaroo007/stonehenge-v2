import NewQuoteWizard from '@/components/quotes/NewQuoteWizard';
import ClassicQuoteBuilder from '@/components/quotes/ClassicQuoteBuilder';
import CreateDraftQuoteRedirect from '@/components/quotes/CreateDraftQuoteRedirect';

export const dynamic = 'force-dynamic';

/**
 * /quotes/new — creates a blank draft and opens the quote editor.
 * The editor itself exposes Import Drawing, From Template, and Manual controls.
 *
 * Accepts optional ?customerId=<id> to pre-assign a customer.
 *
 * ?mode=classic — bypasses wizard, shows the old pre-wizard builder
 *   (creates draft + redirects to edit mode). Accessible via "Build Quote" left nav.
 * ?mode=wizard — shows the old 3-choice creation wizard.
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

  if (mode === 'wizard') {
    return (
      <div className="space-y-6">
        <NewQuoteWizard customerId={safeCustomerId} />
      </div>
    );
  }

  // Default → create a blank draft and use the quote editor as the main workspace.
  return (
    <div className="space-y-6">
      <CreateDraftQuoteRedirect customerId={safeCustomerId} />
    </div>
  );
}
