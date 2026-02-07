import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

async function getCustomerQuotes(customerId: number) {
  return prisma.quotes.findMany({
    where: { customerId },
    include: {
      signature: {
        select: {
          id: true,
          signedAt: true,
        },
      },
      _count: {
        select: {
          rooms: true,
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });
}

export default async function CustomerPortalPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.CUSTOMER || !user.customerId) {
    redirect('/login');
  }

  const quotes = await getCustomerQuotes(user.customerId);

  // Calculate stats
  const totalQuotes = quotes.length;
  const pendingQuotes = quotes.filter(q => q.status === 'SENT' || q.status === 'DRAFT').length;
  const acceptedQuotes = quotes.filter(q => q.status === 'ACCEPTED').length;
  const totalValue = quotes.reduce((sum, q) => sum + Number(q.total), 0);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl shadow-lg overflow-hidden">
        <div className="px-8 py-6 text-white">
          <h1 className="text-3xl font-bold mb-2">
            Welcome, {user.name || 'valued customer'}!
          </h1>
          <p className="text-primary-100">
            View your quotes, track project status, and sign approvals all in one place.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Quotes</p>
              <p className="text-3xl font-bold text-gray-900">{totalQuotes}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Pending</p>
              <p className="text-3xl font-bold text-yellow-600">{pendingQuotes}</p>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Accepted</p>
              <p className="text-3xl font-bold text-green-600">{acceptedQuotes}</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Value</p>
              <p className="text-3xl font-bold text-primary-600">
                {formatCurrency(totalValue)}
              </p>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Quotes Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Your Quotes</h2>
        </div>

        {quotes.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium mb-1">No quotes yet</p>
            <p className="text-sm">Your quotes will appear here once they're created by our team.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Quote Number</th>
                  <th className="table-header">Project</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Items</th>
                  <th className="table-header text-right">Total</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium text-primary-600">
                      {quote.quoteNumber}
                    </td>
                    <td className="table-cell">
                      {quote.projectName || 'Unnamed Project'}
                    </td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                        {getStatusLabel(quote.status)}
                      </span>
                      {quote.signature && (
                        <svg className="inline-block ml-2 h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </td>
                    <td className="table-cell text-gray-500">
                      {formatDate(quote.createdAt)}
                    </td>
                    <td className="table-cell text-gray-500">
                      {quote._count.rooms} room{quote._count.rooms !== 1 ? 's' : ''}
                    </td>
                    <td className="table-cell text-right font-semibold text-gray-900">
                      {formatCurrency(Number(quote.total))}
                    </td>
                    <td className="table-cell text-right">
                      <Link
                        href={`/portal/quotes/${quote.id}`}
                        className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Need Help?</h3>
        <p className="text-blue-800 mb-4">
          If you have any questions about your quotes or need assistance, please contact our team.
        </p>
        <div className="flex gap-4">
          <a href="mailto:support@stonehenge.com" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
            Email Support
          </a>
          <a href="tel:+61234567890" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
            Call Us
          </a>
        </div>
      </div>
    </div>
  );
}
