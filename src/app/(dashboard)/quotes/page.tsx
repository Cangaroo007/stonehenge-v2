import Link from 'next/link';
import prisma from '@/lib/db';
import QuotesListClient from './QuotesListClient';

export const dynamic = 'force-dynamic';

async function getQuotes() {
  const quotes = await prisma.quotes.findMany({
    orderBy: [
      { status_changed_at: 'desc' },
      { created_at: 'desc' },
    ],
    include: { customers: true },
  });

  return quotes.map((q) => ({
    id: q.id,
    quote_number: q.quote_number,
    project_name: q.project_name,
    status: q.status,
    total: Number(q.total),
    created_at: q.created_at.toISOString(),
    valid_until: q.valid_until?.toISOString() || null,
    status_changed_at: q.status_changed_at?.toISOString() || null,
    customers: q.customers ? { name: q.customers.name } : null,
  }));
}

export default async function QuotesPage() {
  const quotes = await getQuotes();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
        <Link href="/quotes/new" className="btn-primary">
          + New Quote
        </Link>
      </div>

      <QuotesListClient quotes={quotes} />
    </div>
  );
}
