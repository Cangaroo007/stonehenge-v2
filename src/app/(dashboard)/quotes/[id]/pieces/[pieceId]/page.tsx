import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import ExpandedPieceViewClient from './ExpandedPieceViewClient';

export const dynamic = 'force-dynamic';

export default async function PieceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pieceId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id: quoteId, pieceId } = await params;
  const { mode: modeParam } = await searchParams;

  const quoteIdNum = parseInt(quoteId);
  const pieceIdNum = parseInt(pieceId);

  if (isNaN(quoteIdNum) || isNaN(pieceIdNum)) {
    notFound();
  }

  // Verify quote + piece exist
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteIdNum },
    select: { id: true, quote_number: true },
  });

  if (!quote) {
    notFound();
  }

  const piece = await prisma.quote_pieces.findUnique({
    where: { id: pieceIdNum },
    include: { quote_rooms: { select: { quote_id: true } } },
  });

  if (!piece || piece.quote_rooms.quote_id !== quoteIdNum) {
    notFound();
  }

  const initialMode = modeParam === 'edit' ? 'edit' : 'view';

  return (
    <ExpandedPieceViewClient
      quoteId={String(quoteIdNum)}
      pieceId={String(pieceIdNum)}
      quoteNumber={quote.quote_number}
      initialMode={initialMode as 'view' | 'edit'}
    />
  );
}
