import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import { DimensionsDisplay, AreaDisplay } from '@/components/ui/DimensionDisplay';
import { UserRole } from '@prisma/client';
import { hasPermissionAsync, Permission } from '@/lib/permissions';
import QuoteViewTracker from '@/app/(dashboard)/quotes/[id]/components/QuoteViewTracker';
import QuoteSignatureSection from '@/app/(dashboard)/quotes/[id]/components/QuoteSignatureSection';

export const dynamic = 'force-dynamic';

async function getQuote(id: number, customerId: number) {
  return prisma.quotes.findFirst({
    where: {
      id,
      customerId, // Ensure customer can only see their own quotes
    },
    include: {
      customer: true,
      rooms: {
        orderBy: { sortOrder: 'asc' },
        include: {
          pieces: {
            orderBy: { sortOrder: 'asc' },
            include: {
              features: true,
              material: true,
            },
          },
        },
      },
      signature: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      },
    },
  });
}

export default async function CustomerQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.CUSTOMER || !user.customerId) {
    redirect('/login');
  }

  const quote = await getQuote(parseInt(id), user.customerId);

  if (!quote) {
    notFound();
  }

  // Check permissions
  const canDownload = await hasPermissionAsync(user.id, Permission.DOWNLOAD_QUOTES);
  const canApprove = await hasPermissionAsync(user.id, Permission.APPROVE_QUOTES);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/portal"
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Dashboard
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{quote.quoteNumber}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                {getStatusLabel(quote.status)}
              </span>
            </div>
            <p className="text-gray-500 mt-1">{quote.projectName}</p>
          </div>
          {canDownload && (
            <Link href={`/api/quotes/${quote.id}/pdf`} target="_blank" className="btn-secondary">
              Download PDF
            </Link>
          )}
        </div>

        {/* Quote Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t">
          <div>
            <p className="text-sm text-gray-500">Project Address</p>
            <p className="font-medium">{quote.projectAddress || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Created</p>
            <p className="font-medium">{formatDate(quote.createdAt)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Valid Until</p>
            <p className="font-medium">{quote.validUntil ? formatDate(quote.validUntil) : '-'}</p>
          </div>
        </div>
      </div>

      {/* View Tracking (silent) */}
      <QuoteViewTracker quoteId={quote.id} showHistory={false} />

      {/* Signature Section - Only for users with approval permission */}
      {canApprove ? (
        <QuoteSignatureSection
          quoteId={quote.id}
          quoteNumber={quote.quoteNumber}
          customerName={quote.customer?.company || quote.customer?.name || 'Customer'}
          totalAmount={formatCurrency(Number(quote.total))}
          status={quote.status}
          signature={quote.signature ? {
            ...quote.signature,
            signedAt: quote.signature.signedAt.toISOString(),
          } : null}
        />
      ) : quote.signature && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quote Status</h2>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-900">
              ✓ This quote was signed on {formatDate(quote.signature.signedAt)}
            </p>
          </div>
        </div>
      )}

      {/* Rooms and Pieces */}
      <div className="space-y-4">
        {quote.rooms.map((room) => (
          <div key={room.id} className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-semibold">{room.name}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">Description</th>
                    <th className="table-header">Dimensions</th>
                    <th className="table-header">Material</th>
                    <th className="table-header">Features</th>
                    <th className="table-header text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {room.pieces.map((piece) => (
                    <tr key={piece.id}>
                      <td className="table-cell font-medium">
                        {piece.description || 'Unnamed piece'}
                      </td>
                      <td className="table-cell">
                        <DimensionsDisplay lengthMm={piece.lengthMm} widthMm={piece.widthMm} thicknessMm={piece.thicknessMm} />
                        <br />
                        <span className="text-xs text-gray-500">
                          (<AreaDisplay sqm={Number(piece.areaSqm)} />)
                        </span>
                      </td>
                      <td className="table-cell">{piece.materialName || '-'}</td>
                      <td className="table-cell">
                        {piece.features.length > 0 ? (
                          <ul className="text-sm">
                            {piece.features.map((f) => (
                              <li key={f.id}>
                                {f.quantity}× {f.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="table-cell text-right font-medium">
                        {formatCurrency(Number(piece.totalCost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Notes</h3>
          <p className="text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      {/* Totals */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">{formatCurrency(Number(quote.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">GST ({Number(quote.taxRate)}%):</span>
              <span className="font-medium">{formatCurrency(Number(quote.taxAmount))}</span>
            </div>
            <div className="flex justify-between text-lg border-t pt-2">
              <span className="font-semibold">Total:</span>
              <span className="font-bold text-primary-600">
                {formatCurrency(Number(quote.total))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Questions about this quote?</strong> Contact your sales representative or email us at{' '}
          <a href="mailto:support@stonehenge.com" className="underline">support@stonehenge.com</a>
        </p>
      </div>
    </div>
  );
}
