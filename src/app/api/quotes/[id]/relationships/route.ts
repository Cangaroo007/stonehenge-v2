import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { RelationshipType } from '@prisma/client';
import {
  getRelationshipsForQuote,
  createRelationship,
} from '@/lib/services/piece-relationship-service';

const VALID_RELATIONSHIP_TYPES = Object.values(RelationshipType);

/**
 * GET /api/quotes/[id]/relationships
 * Returns all piece relationships for a quote.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id);
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const relationships = await getRelationshipsForQuote(quoteId);
    return NextResponse.json(relationships);
  } catch (error) {
    console.error('Error fetching relationships:', error);
    return NextResponse.json({ error: 'Failed to fetch relationships' }, { status: 500 });
  }
}

/**
 * POST /api/quotes/[id]/relationships
 * Creates a new piece relationship.
 *
 * Body: { sourcePieceId: number, targetPieceId: number, relationType: string, side?: string, notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id);
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const body = await request.json();
    const { sourcePieceId, targetPieceId, relationType, side, notes } = body;

    if (!sourcePieceId || !targetPieceId || !relationType) {
      return NextResponse.json(
        { error: 'sourcePieceId, targetPieceId, and relationType are required' },
        { status: 400 }
      );
    }

    if (!VALID_RELATIONSHIP_TYPES.includes(relationType)) {
      return NextResponse.json(
        { error: `Invalid relationType. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const relationship = await createRelationship({
      source_piece_id: sourcePieceId,
      target_piece_id: targetPieceId,
      relation_type: relationType as RelationshipType,
      side: side || undefined,
      notes: notes || undefined,
    });

    return NextResponse.json(relationship, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'A relationship between these two pieces already exists' },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to create relationship';
    console.error('Error creating relationship:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
