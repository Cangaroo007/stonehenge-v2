import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import QuoteDetailClient from './QuoteDetailClient';
import type { ServerQuoteData } from './QuoteDetailClient';
import type { QuoteMode } from '@/components/quotes/QuoteLayout';

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const quote = await getQuote(parseInt(id));

  if (!quote) {
    notFound();
  }

  const initialMode: QuoteMode = modeParam === 'edit' ? 'edit' : 'view';

  // Serialise Prisma data (Dates, Decimals) to JSON-safe values for the client
  const serverData: ServerQuoteData = {
    id: quote.id,
    quote_number: quote.quote_number,
    project_name: quote.project_name,
    project_address: quote.project_address,
    status: quote.status,
    subtotal: Number(quote.subtotal),
    tax_rate: Number(quote.tax_rate),
    tax_amount: Number(quote.tax_amount),
    total: Number(quote.total),
    notes: quote.notes,
    calculation_breakdown: quote.calculation_breakdown as ServerQuoteData['calculation_breakdown'],
    created_at: quote.created_at.toISOString(),
    valid_until: quote.valid_until ? quote.valid_until.toISOString() : null,
    customers: quote.customers
      ? {
          id: quote.customers.id,
          name: quote.customers.name,
          company: quote.customers.company,
        }
      : null,
    quote_rooms: quote.quote_rooms.map((room) => ({
      id: room.id,
      name: room.name,
      notes: room.notes,
      quote_pieces: room.quote_pieces.map((piece) => ({
        id: piece.id,
        description: piece.description,
        name: piece.name,
        length_mm: piece.length_mm,
        width_mm: piece.width_mm,
        thickness_mm: piece.thickness_mm,
        area_sqm: Number(piece.area_sqm),
        material_id: piece.material_id,
        material_name: piece.material_name,
        material_cost: Number(piece.material_cost),
        features_cost: Number(piece.features_cost),
        total_cost: Number(piece.total_cost),
        edge_top: piece.edge_top,
        edge_bottom: piece.edge_bottom,
        edge_left: piece.edge_left,
        edge_right: piece.edge_right,
        piece_features: piece.piece_features.map((f) => ({
          id: f.id,
          name: f.name,
          quantity: f.quantity,
        })),
        materials: piece.materials ? { name: piece.materials.name } : null,
        sourceRelationships: ((piece as { sourceRelationships?: Array<{ id: number; source_piece_id: number; target_piece_id: number; relationship_type: string; relation_type: string; side: string | null }> }).sourceRelationships ?? []).map((rel) => ({
          id: rel.id,
          source_piece_id: rel.source_piece_id,
          target_piece_id: rel.target_piece_id,
          relationship_type: rel.relationship_type,
          relation_type: rel.relation_type,
          side: rel.side,
        })),
        targetRelationships: ((piece as { targetRelationships?: Array<{ id: number; source_piece_id: number; target_piece_id: number; relationship_type: string; relation_type: string; side: string | null }> }).targetRelationships ?? []).map((rel) => ({
          id: rel.id,
          source_piece_id: rel.source_piece_id,
          target_piece_id: rel.target_piece_id,
          relationship_type: rel.relationship_type,
          relation_type: rel.relation_type,
          side: rel.side,
        })),
      })),
    })),
    quote_drawing_analyses: quote.quote_drawing_analyses
      ? {
          id: quote.quote_drawing_analyses.id,
          filename: quote.quote_drawing_analyses.filename,
          analyzed_at: quote.quote_drawing_analyses.analyzed_at.toISOString(),
          drawing_type: quote.quote_drawing_analyses.drawing_type,
          raw_results: quote.quote_drawing_analyses.raw_results as ServerQuoteData['quote_drawing_analyses'] extends null ? never : NonNullable<ServerQuoteData['quote_drawing_analyses']>['raw_results'],
        }
      : null,
    quote_signatures: quote.quote_signatures
      ? {
          id: quote.quote_signatures.id,
          signature_type: quote.quote_signatures.signature_type,
          signed_at: quote.quote_signatures.signed_at.toISOString(),
          signer_name: quote.quote_signatures.signer_name,
          signer_email: quote.quote_signatures.signer_email,
          ip_address: quote.quote_signatures.ip_address,
          user: quote.quote_signatures.user
            ? {
                name: quote.quote_signatures.user.name,
                email: quote.quote_signatures.user.email,
              }
            : null,
        }
      : null,
  };

  return (
    <QuoteDetailClient
      quoteId={quote.id}
      initialMode={initialMode}
      serverData={serverData}
    />
  );
}
