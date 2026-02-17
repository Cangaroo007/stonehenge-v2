import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import FullJobViewClient from './FullJobViewClient';
import type { CalculationResult } from '@/lib/types/pricing';

export const dynamic = 'force-dynamic';

export default async function FullJobViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quoteId = parseInt(id);

  if (isNaN(quoteId)) {
    notFound();
  }

  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      customers: true,
      quote_rooms: {
        orderBy: { sort_order: 'asc' },
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
            include: {
              materials: true,
              sourceRelationships: true,
              targetRelationships: true,
            },
          },
        },
      },
    },
  });

  if (!quote) {
    notFound();
  }

  const calcBreakdown = quote.calculation_breakdown as unknown as CalculationResult | null;

  // Build serialised data for the client component
  const pieces = quote.quote_rooms.flatMap((room) =>
    room.quote_pieces.map((piece) => ({
      id: piece.id,
      name: piece.name,
      roomId: room.id,
      lengthMm: piece.length_mm,
      widthMm: piece.width_mm,
      thicknessMm: piece.thickness_mm,
      areaSqm: Number(piece.area_sqm),
      materialCost: Number(piece.material_cost),
      featuresCost: Number(piece.features_cost),
      totalCost: Number(piece.total_cost),
      edgeTop: piece.edge_top,
      edgeBottom: piece.edge_bottom,
      edgeLeft: piece.edge_left,
      edgeRight: piece.edge_right,
      materialId: piece.material_id,
      materialName: piece.material_name ?? piece.materials?.name ?? null,
      laminationMethod: piece.lamination_method,
      waterfallHeightMm: piece.waterfall_height_mm,
      sortOrder: piece.sort_order,
      sourceRelationships: piece.sourceRelationships.map((rel) => ({
        id: rel.id,
        sourcePieceId: rel.source_piece_id,
        targetPieceId: rel.target_piece_id,
        relationType: rel.relation_type,
        side: rel.side,
      })),
      targetRelationships: piece.targetRelationships.map((rel) => ({
        id: rel.id,
        sourcePieceId: rel.source_piece_id,
        targetPieceId: rel.target_piece_id,
        relationType: rel.relation_type,
        side: rel.side,
      })),
    }))
  );

  const rooms = quote.quote_rooms.map((room) => ({
    id: room.id,
    name: room.name,
    sortOrder: room.sort_order,
  }));

  const data = {
    id: quote.id,
    quoteNumber: quote.quote_number,
    projectName: quote.project_name,
    status: quote.status,
    subtotal: Number(quote.subtotal),
    taxAmount: Number(quote.tax_amount),
    total: Number(quote.total),
    customer: quote.customers
      ? {
          name: quote.customers.name,
          company: quote.customers.company,
        }
      : null,
    materialBreakdown: calcBreakdown?.breakdown?.materials ?? null,
    pieces,
    rooms,
  };

  return <FullJobViewClient data={data} />;
}
