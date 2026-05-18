import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import prisma from '@/lib/db';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import { buildQuotePricingUpdate } from '@/lib/services/quote-pricing-persistence';
import {
  updateRelationship,
  deleteRelationship,
} from '@/lib/services/piece-relationship-service';

async function recalculateQuote(quoteId: number) {
  const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
  await prisma.quotes.update({
    where: { id: quoteId },
    data: buildQuotePricingUpdate(calcResult),
  });
}

async function verifyRelationshipBelongsToQuote(relationshipId: string, quoteId: number) {
  const numericRelationshipId = parseInt(relationshipId, 10);
  if (isNaN(numericRelationshipId)) return false;

  const relationship = await prisma.piece_relationships.findUnique({
    where: { id: numericRelationshipId },
    select: {
      sourcePiece: {
        select: {
          quote_rooms: {
            select: { quote_id: true },
          },
        },
      },
      targetPiece: {
        select: {
          quote_rooms: {
            select: { quote_id: true },
          },
        },
      },
    },
  });

  if (!relationship) return false;
  return (
    relationship.sourcePiece.quote_rooms.quote_id === quoteId &&
    relationship.targetPiece.quote_rooms.quote_id === quoteId
  );
}

/**
 * PATCH /api/quotes/[id]/relationships/[relationshipId]
 * Updates an existing relationship.
 *
 * Body: { relationshipType?, joinPosition?, notes? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; relationshipId: string }> }
) {
  const authResult = await requireAuth();
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { id, relationshipId } = await params;
  const quoteId = parseInt(id);
  if (isNaN(quoteId)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
  if (!quoteCheck) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  const body = await request.json();

  try {
    const relationshipBelongsToQuote = await verifyRelationshipBelongsToQuote(relationshipId, quoteId);
    if (!relationshipBelongsToQuote) {
      return NextResponse.json(
        { error: 'Relationship not found for this quote' },
        { status: 404 }
      );
    }

    const updated = await updateRelationship(relationshipId, body);
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });
    await recalculateQuote(quoteId);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: 'Failed to update relationship' },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/quotes/[id]/relationships/[relationshipId]
 * Deletes a relationship.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; relationshipId: string }> }
) {
  const authResult = await requireAuth();
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { id, relationshipId } = await params;
  const quoteId = parseInt(id);
  if (isNaN(quoteId)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
  if (!quoteCheck) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  try {
    const relationshipBelongsToQuote = await verifyRelationshipBelongsToQuote(relationshipId, quoteId);
    if (!relationshipBelongsToQuote) {
      return NextResponse.json(
        { error: 'Relationship not found for this quote' },
        { status: 404 }
      );
    }

    await deleteRelationship(relationshipId);
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });
    await recalculateQuote(quoteId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to delete relationship' },
      { status: 400 }
    );
  }
}
