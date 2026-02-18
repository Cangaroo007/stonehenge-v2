import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import {
  getRelationshipsForQuote,
  createRelationship,
} from '@/lib/services/piece-relationship-service';

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
    const relationship = await createRelationship(body);
    return NextResponse.json(relationship, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create relationship';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
