import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import prisma from '@/lib/db';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import { buildQuotePricingUpdate } from '@/lib/services/quote-pricing-persistence';
import {
  getRelationshipsForQuote,
  createRelationship,
} from '@/lib/services/piece-relationship-service';

async function recalculateQuote(quoteId: number) {
  const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
  await prisma.quotes.update({
    where: { id: quoteId },
    data: buildQuotePricingUpdate(calcResult),
  });
}

/**
 * GET /api/quotes/[id]/relationships
 * Returns all typed relationships for the quote.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { id } = await params;
  const quoteId = parseInt(id);
  if (isNaN(quoteId)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
  if (!quoteCheck) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  try {
    const relationships = await getRelationshipsForQuote(quoteId);
    return NextResponse.json(relationships);
  } catch (error) {
    console.error('Error fetching relationships:', error);
    // Graceful fallback: return empty array so UI doesn't crash
    return NextResponse.json([]);
  }
}

/**
 * POST /api/quotes/[id]/relationships
 * Creates a new typed relationship between two pieces.
 *
 * Body: { parentPieceId, childPieceId, relationshipType, joinPosition?, notes? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { id } = await params;
  const quoteId = parseInt(id);
  if (isNaN(quoteId)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
  if (!quoteCheck) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  const body = await request.json();

  // Validate required fields
  if (!body.parentPieceId || !body.childPieceId || !body.relationshipType) {
    return NextResponse.json(
      { error: 'parentPieceId, childPieceId, and relationshipType are required' },
      { status: 400 }
    );
  }

  try {
    const parentPieceId = Number(body.parentPieceId);
    const childPieceId = Number(body.childPieceId);
    if (!Number.isInteger(parentPieceId) || !Number.isInteger(childPieceId)) {
      return NextResponse.json(
        { error: 'parentPieceId and childPieceId must be valid piece IDs' },
        { status: 400 }
      );
    }

    const pieces = await prisma.quote_pieces.findMany({
      where: {
        id: { in: [parentPieceId, childPieceId] },
        quote_rooms: { quote_id: quoteId },
      },
      select: { id: true },
    });
    const foundPieceIds = new Set(pieces.map(piece => piece.id));
    if (!foundPieceIds.has(parentPieceId) || !foundPieceIds.has(childPieceId)) {
      return NextResponse.json(
        { error: 'Both pieces must belong to this quote' },
        { status: 400 }
      );
    }

    const relationship = await createRelationship(body);
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });
    await recalculateQuote(quoteId);
    return NextResponse.json(relationship, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create relationship';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
