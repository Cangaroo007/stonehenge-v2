import { redirect } from 'next/navigation';

// Redirect old edit route to the new builder
// The builder provides all editing functionality with improved UX
export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/quotes/${id}/builder`);
}
