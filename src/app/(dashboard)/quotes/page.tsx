import Link from 'next/link';
import prisma from '@/lib/db';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function getQuotes() {
  return prisma.quotes.findMany({
      orderBy: { created_at: 'desc' },
    include: { customers: true },
  });
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

      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Quote #</th>
                <th className="table-header">Customer</th>
                <th className="table-header">Project</th>
                <th className="table-header">Total</th>
                <th className="table-header">Status</th>
                <th className="table-header">Date</th>
                <th className="table-header">Valid Until</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No quotes yet.{' '}
                    <Link href="/quotes/new" className="text-primary-600 hover:text-primary-700">
                      Create your first quote
                    </Link>
                  </td>
                </tr>
              ) : (
                quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{quote.quote_number}</td>
                    <td className="table-cell">{quote.customers?.name || '-'}</td>
                    <td className="table-cell">{quote.project_name || '-'}</td>
                    <td className="table-cell font-medium">{formatCurrency(Number(quote.total))}</td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                        {getStatusLabel(quote.status)}
                      </span>
                    </td>
                    <td className="table-cell">{formatDate(quote.createdAt)}</td>
                    <td className="table-cell">{quote.valid_until ? formatDate(quote.valid_until) : '-'}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          View
                        </Link>
                        <Link
                          href={`/quotes/${quote.id}/builder`}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
