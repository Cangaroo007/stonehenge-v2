import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { formatCurrency, formatDate, getStatusLabel } from '@/lib/utils';
import RoomLinearView from '@/components/quotes/RoomLinearView';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

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
    },
  });
}

export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quote = await getQuote(parseInt(id));

  if (!quote) {
    notFound();
  }

  // Serialise data
  const subtotal = Number(quote.subtotal);
  const taxRate = Number(quote.tax_rate);
  const taxAmount = Number(quote.tax_amount);
  const total = Number(quote.total);

  // Build relationships from source relationships across all rooms
  const seen = new Set<number>();
  const allRelationships: Array<{
    id: string;
    parentPieceId: string;
    childPieceId: string;
    relationshipType: string;
    joinPosition: string | null;
  }> = [];

  for (const room of quote.quote_rooms) {
    for (const piece of room.quote_pieces) {
      for (const sr of (piece as { sourceRelationships?: Array<{ id: number; source_piece_id: number; target_piece_id: number; relationship_type?: string; relation_type?: string; side: string | null }> }).sourceRelationships ?? []) {
        if (!seen.has(sr.id)) {
          seen.add(sr.id);
          allRelationships.push({
            id: String(sr.id),
            parentPieceId: String(sr.source_piece_id),
            childPieceId: String(sr.target_piece_id),
            relationshipType: sr.relationship_type || sr.relation_type || '',
            joinPosition: sr.side,
          });
        }
      }
    }
  }

  return (
    <div className="print-layout bg-white min-h-screen">
      {/* Print-only styles */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 15mm;
          }
          .print-layout nav,
          .print-layout aside,
          .print-layout .no-print {
            display: none !important;
          }
          .print-layout {
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-room-section {
            page-break-inside: avoid;
          }
        }
        @media screen {
          .print-layout {
            max-width: 1100px;
            margin: 0 auto;
            padding: 24px;
          }
        }
      `}</style>

      {/* Quote header */}
      <div className="print-header border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {quote.quote_number}
            </h1>
            {quote.project_name && (
              <p className="text-sm text-gray-600 mt-1">{quote.project_name}</p>
            )}
            {quote.project_address && (
              <p className="text-xs text-gray-500">{quote.project_address}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">
              {getStatusLabel(quote.status)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Created: {formatDate(quote.created_at)}
            </p>
            {quote.valid_until && (
              <p className="text-xs text-gray-500">
                Valid until: {formatDate(quote.valid_until)}
              </p>
            )}
          </div>
        </div>

        {/* Customer info */}
        {quote.customers && (
          <div className="mt-2 text-sm text-gray-600">
            <span className="font-medium">Customer:</span>{' '}
            {quote.customers.name}
            {quote.customers.company && ` (${quote.customers.company})`}
          </div>
        )}
      </div>

      {/* Rooms with linear piece views */}
      {quote.quote_rooms.map(room => {
        if (room.quote_pieces.length === 0) return null;

        const roomPieceIds = new Set(room.quote_pieces.map(p => String(p.id)));
        const roomRelationships = allRelationships.filter(
          r => roomPieceIds.has(r.parentPieceId) || roomPieceIds.has(r.childPieceId)
        );

        const roomTotal = room.quote_pieces.reduce(
          (sum, p) => sum + Number(p.total_cost),
          0
        );

        return (
          <div key={room.id} className="print-room-section">
            <RoomLinearView
              roomName={room.name || 'Unassigned'}
              roomNotes={room.notes}
              pieces={room.quote_pieces.map(p => ({
                id: p.id,
                description: p.description,
                name: p.name,
                length_mm: p.length_mm,
                width_mm: p.width_mm,
                thickness_mm: p.thickness_mm,
                area_sqm: Number(p.area_sqm),
                total_cost: Number(p.total_cost),
                edge_top: p.edge_top,
                edge_bottom: p.edge_bottom,
                edge_left: p.edge_left,
                edge_right: p.edge_right,
                piece_features: p.piece_features.map(f => ({
                  id: f.id,
                  name: f.name,
                  quantity: f.quantity,
                })),
              }))}
              relationships={roomRelationships}
              roomTotal={roomTotal}
            />
          </div>
        );
      })}

      {/* Pricing summary */}
      <div
        className="mt-8 border-t-2 border-gray-900 pt-4"
        style={{ pageBreakInside: 'avoid' }}
      >
        <h3 className="text-base font-bold text-gray-900 mb-3">
          Pricing Summary
        </h3>
        <div className="flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Materials &amp; Fabrication:</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                GST ({taxRate}%):
              </span>
              <span className="font-medium">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-lg border-t border-gray-300 pt-2">
              <span className="font-bold">Total:</span>
              <span className="font-bold">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Print button (screen only) */}
      <div className="no-print mt-8 flex justify-center print:hidden">
        <PrintButton />
      </div>
    </div>
  );
}
