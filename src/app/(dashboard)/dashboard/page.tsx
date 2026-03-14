import Link from 'next/link';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function hasPricingSetup(companyId: number): Promise<boolean> {
  const organisationId = `company-${companyId}`;
  const settings = await prisma.pricing_settings.findUnique({
    where: { organisation_id: organisationId },
    select: { id: true, service_rates: { take: 1, select: { id: true } } },
  });
  // Wizard is "completed" if pricing_settings exists AND has at least one service_rate
  return !!settings && settings.service_rates.length > 0;
}

async function getStats(companyId: number) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalQuotes, quotesThisMonth, totalValue, recentQuotes] = await Promise.all([
    prisma.quotes.count({ where: { company_id: companyId } }),
    prisma.quotes.count({
      where: { company_id: companyId, created_at: { gte: startOfMonth } },
    }),
    prisma.quotes.aggregate({
      _sum: { total: true },
      where: { company_id: companyId, created_at: { gte: startOfMonth } },
    }),
    prisma.quotes.findMany({
      where: { company_id: companyId },
      take: 5,
      orderBy: { created_at: 'desc' },
      include: { customers: true },
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
  const auth = await requireAuth();
  if ('error' in auth) redirect('/login');
  const [stats, pricingReady] = await Promise.all([
    getStats(auth.user.companyId),
    hasPricingSetup(auth.user.companyId),
  ]);

  return (
    <div className="space-y-6">
      {/* Pricing wizard banner */}
      {!pricingReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-amber-900">Pricing not configured yet</p>
            <p className="text-sm text-amber-700 mt-1">
              Set up your cutting, edge, and installation rates so quotes calculate correctly.
            </p>
          </div>
          <Link
            href="/admin/pricing/wizard"
            className="shrink-0 ml-4 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            Set up pricing
          </Link>
        </div>
      )}

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
                    <td className="table-cell font-medium">{quote.quote_number}</td>
                    <td className="table-cell">{quote.customers?.name || '-'}</td>
                    <td className="table-cell">{quote.project_name || '-'}</td>
                    <td className="table-cell">{formatCurrency(Number(quote.total))}</td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                        {getStatusLabel(quote.status)}
                      </span>
                    </td>
                    <td className="table-cell">{formatDate(quote.created_at)}</td>
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
