import Link from 'next/link';
import prisma from '@/lib/db';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function getStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalQuotes, quotesThisMonth, totalValue, recentQuotes] = await Promise.all([
    prisma.quotes.count(),
    prisma.quotes.count({
      where: { createdAt: { gte: startOfMonth } },
    }),
    prisma.quotes.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: startOfMonth } },
    }),
    prisma.quotes.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { customer: true },
    }),
  ]);

  return {
    totalQuotes,
    quotesThisMonth,
    totalValue: totalValue._sum.total || 0,
    recentQuotes,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link href="/quotes/new" className="btn-primary">
          + New Quote
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-6">
          <p className="text-sm font-medium text-gray-500">Total Quotes</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.totalQuotes}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm font-medium text-gray-500">Quotes This Month</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.quotesThisMonth}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm font-medium text-gray-500">Value This Month</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatCurrency(Number(stats.totalValue))}
          </p>
        </div>
        <div className="card p-6">
          <p className="text-sm font-medium text-gray-500">Avg Quote Value</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {stats.quotesThisMonth > 0
              ? formatCurrency(Number(stats.totalValue) / stats.quotesThisMonth)
              : '$0.00'}
          </p>
        </div>
      </div>

      {/* Recent Quotes */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Quotes</h2>
        </div>
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
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.recentQuotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No quotes yet.{' '}
                    <Link href="/quotes/new" className="text-primary-600 hover:text-primary-700">
                      Create your first quote
                    </Link>
                  </td>
                </tr>
              ) : (
                stats.recentQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{quote.quoteNumber}</td>
                    <td className="table-cell">{quote.customer?.name || '-'}</td>
                    <td className="table-cell">{quote.projectName || '-'}</td>
                    <td className="table-cell">{formatCurrency(Number(quote.total))}</td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                        {getStatusLabel(quote.status)}
                      </span>
                    </td>
                    <td className="table-cell">{formatDate(quote.createdAt)}</td>
                    <td className="table-cell">
                      <Link
                        href={`/quotes/${quote.id}`}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {stats.recentQuotes.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <Link href="/quotes" className="text-sm text-primary-600 hover:text-primary-700">
              View all quotes →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
