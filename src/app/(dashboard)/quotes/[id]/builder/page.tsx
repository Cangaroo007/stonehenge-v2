import { redirect } from 'next/navigation';

/**
 * Legacy builder route — redirects to the unified quote page in edit mode.
 * Kept for backwards compatibility with existing bookmarks and links.
 */
export default async function QuoteBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/quotes/${id}?mode=edit`);
}
