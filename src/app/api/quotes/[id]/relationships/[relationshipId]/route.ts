import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { RelationshipType } from '@prisma/client';
import {
  updateRelationship,
  deleteRelationship,
} from '@/lib/services/piece-relationship-service';
import prisma from '@/lib/db';

const VALID_RELATIONSHIP_TYPES = Object.values(RelationshipType);

/**
 * PATCH /api/quotes/[id]/relationships/[relationshipId]
 * Updates an existing piece relationship.
 *
 * Body: { relationType?: string, side?: string | null, notes?: string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; relationshipId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, relationshipId } = await params;
    const quoteId = parseInt(id);
    const relId = parseInt(relationshipId);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }
    if (isNaN(relId)) {
      return NextResponse.json({ error: 'Invalid relationship ID' }, { status: 400 });
    }

    // Verify relationship exists and belongs to this quote
    const existing = await prisma.piece_relationships.findUnique({
      where: { id: relId },
      include: {
        sourcePiece: {
          include: { quote_rooms: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    if (existing.sourcePiece.quote_rooms.quote_id !== quoteId) {
      return NextResponse.json(
        { error: 'Relationship does not belong to this quote' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { relationType, side, notes } = body;

    if (relationType !== undefined && !VALID_RELATIONSHIP_TYPES.includes(relationType)) {
      return NextResponse.json(
        { error: `Invalid relationType. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const updated = await updateRelationship(relId, {
      ...(relationType !== undefined && { relation_type: relationType as RelationshipType }),
      ...(side !== undefined && { side }),
      ...(notes !== undefined && { notes }),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating relationship:', error);
    return NextResponse.json({ error: 'Failed to update relationship' }, { status: 500 });
  }
}

/**
 * DELETE /api/quotes/[id]/relationships/[relationshipId]
 * Deletes a piece relationship.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; relationshipId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, relationshipId } = await params;
    const quoteId = parseInt(id);
    const relId = parseInt(relationshipId);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }
    if (isNaN(relId)) {
      return NextResponse.json({ error: 'Invalid relationship ID' }, { status: 400 });
    }

    // Verify relationship exists and belongs to this quote
    const existing = await prisma.piece_relationships.findUnique({
      where: { id: relId },
      include: {
        sourcePiece: {
          include: { quote_rooms: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    if (existing.sourcePiece.quote_rooms.quote_id !== quoteId) {
      return NextResponse.json(
        { error: 'Relationship does not belong to this quote' },
        { status: 403 }
      );
    }

    await deleteRelationship(relId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting relationship:', error);
    return NextResponse.json({ error: 'Failed to delete relationship' }, { status: 500 });
  }
}
