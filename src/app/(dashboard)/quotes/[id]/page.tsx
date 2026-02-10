import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import { DimensionsDisplay, AreaDisplay } from '@/components/ui/DimensionDisplay';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import ManufacturingExportButton from './components/ManufacturingExportButton';
import QuoteViewTracker from './components/QuoteViewTracker';
import QuoteSignatureSection from './components/QuoteSignatureSection';

export const dynamic = 'force-dynamic';

interface AnalysisRoom {
  name: string;
  pieces: Array<{
    pieceNumber?: number;
    name: string;
    length: number;
    width: number;
    thickness: number;
    confidence: number;
  }>;
}

interface RawResults {
  drawingType?: string;
  metadata?: {
    jobNumber?: string | null;
    defaultThickness?: number;
  };
  rooms?: AnalysisRoom[];
  warnings?: string[];
}

async function getQuote(id: number) {
  return prisma.quotes.findUnique({
    where: { id },
    include: {
      customers: true,
      quote_rooms: {
        orderBy: { sort_order: 'asc' },
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
            include: {
              piece_features: true,
              materials: true,
            },
          },
        },
      },
      quote_drawing_analyses: true,
      quote_signatures: {
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

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quote = await getQuote(parseInt(id));

  if (!quote) {
    notFound();
  }

  // Parse drawing analysis results if available
  const analysisResults = quote.quote_drawing_analyses?.raw_results as RawResults | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
              {getStatusLabel(quote.status)}
            </span>
          </div>
          <p className="text-gray-500 mt-1">{quote.project_name}</p>
        </div>
        <div className="flex gap-3">
          <Link href={`/quotes/${quote.id}/builder`} className="btn-primary">
            Edit Quote
          </Link>
          <Link href={`/api/quotes/${quote.id}/pdf`} target="_blank" className="btn-secondary">
            Download PDF
          </Link>
          {['locked', 'accepted'].includes(quote.status.toLowerCase()) && (
            <ManufacturingExportButton
              quoteId={quote.id}
              quoteNumber={quote.quote_number}
            />
          )}
          <DeleteQuoteButton quoteId={quote.id} />
        </div>
      </div>

      {/* Quote Info */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-500">Customer</p>
            <p className="font-medium">{quote.customers?.name || '-'}</p>
            {quote.customers?.company && (
              <p className="text-sm text-gray-500">{quote.customers.company}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">Project Address</p>
            <p className="font-medium">{quote.project_address || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Created</p>
            <p className="font-medium">{formatDate(quote.created_at)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Valid Until</p>
            <p className="font-medium">{quote.valid_until ? formatDate(quote.valid_until) : '-'}</p>
          </div>
        </div>
      </div>

      {/* View Tracking */}
      <QuoteViewTracker quoteId={quote.id} showHistory={true} />

      {/* Signature Section */}
      <QuoteSignatureSection
        quoteId={quote.id}
        quoteNumber={quote.quote_number}
        customerName={quote.customers?.company || quote.customers?.name || 'Customer'}
        totalAmount={formatCurrency(Number(quote.total))}
        status={quote.status}
        signature={quote.quote_signatures ? {
          id: quote.quote_signatures.id,
          signatureType: quote.quote_signatures.signature_type,
          signedAt: quote.quote_signatures.signed_at.toISOString(),
          signerName: quote.quote_signatures.signer_name,
          signerEmail: quote.quote_signatures.signer_email,
          ipAddress: quote.quote_signatures.ip_address,
          user: quote.quote_signatures.user ? {
            name: quote.quote_signatures.user.name,
            email: quote.quote_signatures.user.email,
          } : null,
        } : null}
      />

      {/* Drawing Analysis Section */}
      {quote.quote_drawing_analyses && (
        <div className="card">
          <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-semibold">Drawing Analysis</h3>
            </div>
            <span className="text-sm text-gray-500">
              Analyzed {formatDate(quote.quote_drawing_analyses.analyzed_at)}
            </span>
          </div>
          <div className="p-6">
            {/* Analysis Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <span className="text-xs text-gray-500 block">Filename</span>
                <span className="font-medium text-gray-900 truncate block" title={quote.quote_drawing_analyses.filename}>
                  {quote.quote_drawing_analyses.filename}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Drawing Type</span>
                <span className="font-medium text-gray-900">
                  {quote.quote_drawing_analyses.drawing_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </span>
              </div>
              {analysisResults?.metadata?.jobNumber && (
                <div>
                  <span className="text-xs text-gray-500 block">Job Number</span>
                  <span className="font-medium text-gray-900">{analysisResults.metadata.jobNumber}</span>
                </div>
              )}
              {analysisResults?.metadata?.defaultThickness && (
                <div>
                  <span className="text-xs text-gray-500 block">Default Thickness</span>
                  <span className="font-medium text-gray-900">{analysisResults.metadata.defaultThickness}mm</span>
                </div>
              )}
            </div>

            {/* Warnings from analysis */}
            {analysisResults?.warnings && analysisResults.warnings.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                <div className="flex items-start gap-2">
                  <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <strong>Analysis Warnings:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {analysisResults.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Detected pieces summary */}
            {analysisResults?.rooms && analysisResults.rooms.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Originally Detected Pieces</h4>
                <div className="space-y-3">
                  {analysisResults.rooms.map((room, roomIndex) => (
                    <div key={roomIndex} className="border border-gray-200 rounded-lg p-3">
                      <h5 className="text-sm font-medium text-gray-600 mb-2">
                        {room.name} ({room.pieces.length} piece{room.pieces.length !== 1 ? 's' : ''})
                      </h5>
                      <div className="space-y-1">
                        {room.pieces.map((piece, pieceIndex) => (
                          <div
                            key={pieceIndex}
                            className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2"
                          >
                            <span className="text-gray-700">
                              {piece.pieceNumber ? `#${piece.pieceNumber} ` : ''}{piece.name}
                            </span>
                            <span className="text-gray-500">
                              {piece.length} × {piece.width}mm
                              <span
                                className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                                  piece.confidence >= 0.7
                                    ? 'bg-green-100 text-green-700'
                                    : piece.confidence >= 0.5
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {Math.round(piece.confidence * 100)}%
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rooms and Pieces */}
      <div className="space-y-4">
        {quote.quote_rooms.map((room) => (
          <div key={room.id} className="card">
            <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
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
                    <th className="table-header text-right">Base Price</th>
                    <th className="table-header text-right">Tier Discount</th>
                    <th className="table-header text-right">Final Cost</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {room.quote_pieces.map((piece) => {
                    const baseCost = Number(piece.material_cost) + Number(piece.features_cost);
                    const discount = baseCost - Number(piece.total_cost);
                    return (
                    <tr key={piece.id}>
                      <td className="table-cell font-medium">
                        {piece.description || piece.name || 'Unnamed piece'}
                      </td>
                      <td className="table-cell">
                        <DimensionsDisplay lengthMm={piece.length_mm} widthMm={piece.width_mm} thicknessMm={piece.thickness_mm} />
                        <br />
                        <span className="text-xs text-gray-500">
                          (<AreaDisplay sqm={Number(piece.area_sqm)} />)
                        </span>
                      </td>
                      <td className="table-cell">{piece.material_name || '-'}</td>
                      <td className="table-cell">
                        {piece.piece_features.length > 0 ? (
                          <ul className="text-sm">
                            {piece.piece_features.map((f) => (
                              <li key={f.id}>
                                {f.quantity}× {f.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="table-cell text-right text-sm text-gray-600">
                        {formatCurrency(baseCost)}
                      </td>
                      <td className="table-cell text-right text-sm">
                        <span className={discount > 0 ? 'text-green-600' : 'text-gray-400'}>
                          {discount > 0 ? '-' : ''}{formatCurrency(discount)}
                        </span>
                      </td>
                      <td className="table-cell text-right font-medium">
                        {formatCurrency(Number(piece.total_cost))}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="card p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Notes</h3>
          <p className="text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      {/* Totals */}
      <div className="card p-6">
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">{formatCurrency(Number(quote.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">GST ({Number(quote.tax_rate)}%):</span>
              <span className="font-medium">{formatCurrency(Number(quote.tax_amount))}</span>
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
    </div>
  );
}
