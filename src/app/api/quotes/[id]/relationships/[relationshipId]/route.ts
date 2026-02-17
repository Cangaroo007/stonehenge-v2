import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  updateRelationship,
  deleteRelationship,
} from '@/lib/services/piece-relationship-service';

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

  const body = await request.json();

  try {
    const updated = await updateRelationship(relationshipId, body);
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

  try {
    await deleteRelationship(relationshipId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to delete relationship' },
      { status: 400 }
    );
  }
}
