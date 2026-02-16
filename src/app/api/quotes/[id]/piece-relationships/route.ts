import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const VALID_RELATION_TYPES = [
  'WATERFALL',
  'SPLASHBACK',
  'RETURN_END',
  'WINDOW_SILL',
  'ISLAND',
  'MITRE_JOIN',
  'BUTT_JOIN',
  'LAMINATION',
] as const;

const VALID_SIDES = ['top', 'bottom', 'left', 'right'] as const;

/**
 * GET /api/quotes/[id]/piece-relationships
 * List all piece relationships for a quote.
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

    // Get all piece IDs for this quote
    const rooms = await prisma.quote_rooms.findMany({
      where: { quote_id: quoteId },
      select: {
        quote_pieces: {
          select: { id: true },
        },
      },
    });

    const pieceIds = rooms.flatMap((r) => r.quote_pieces.map((p) => p.id));

    if (pieceIds.length === 0) {
      return NextResponse.json([]);
    }

    const relationships = await prisma.piece_relationships.findMany({
      where: {
        source_piece_id: { in: pieceIds },
      },
      orderBy: { created_at: 'asc' },
    });

    return NextResponse.json(relationships);
  } catch (error) {
    console.error('Error fetching piece relationships:', error);
    return NextResponse.json({ error: 'Failed to fetch piece relationships' }, { status: 500 });
  }
}

/**
 * POST /api/quotes/[id]/piece-relationships
 * Create a relationship between two pieces.
 *
 * Body: { sourcePieceId: number, targetPieceId: number, relationType: string, side?: string }
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
    const { sourcePieceId, targetPieceId, relationType, side } = body;

    // Validate required fields
    if (!sourcePieceId || !targetPieceId || !relationType) {
      return NextResponse.json(
        { error: 'sourcePieceId, targetPieceId, and relationType are required' },
        { status: 400 }
      );
    }

    // Validate relation type
    if (!VALID_RELATION_TYPES.includes(relationType)) {
      return NextResponse.json(
        { error: `Invalid relationType. Must be one of: ${VALID_RELATION_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate side if provided
    if (side && !VALID_SIDES.includes(side)) {
      return NextResponse.json(
        { error: `Invalid side. Must be one of: ${VALID_SIDES.join(', ')}` },
        { status: 400 }
      );
    }

    // Cannot relate a piece to itself
    if (sourcePieceId === targetPieceId) {
      return NextResponse.json(
        { error: 'A piece cannot be related to itself' },
        { status: 400 }
      );
    }

    // Verify both pieces belong to this quote
    const rooms = await prisma.quote_rooms.findMany({
      where: { quote_id: quoteId },
      select: {
        quote_pieces: {
          select: { id: true },
        },
      },
    });

    const quotePieceIds = new Set(rooms.flatMap((r) => r.quote_pieces.map((p) => p.id)));

    if (!quotePieceIds.has(sourcePieceId) || !quotePieceIds.has(targetPieceId)) {
      return NextResponse.json(
        { error: 'Both pieces must belong to this quote' },
        { status: 400 }
      );
    }

    const relationship = await prisma.piece_relationships.create({
      data: {
        source_piece_id: sourcePieceId,
        target_piece_id: targetPieceId,
        relation_type: relationType,
        side: side || null,
      },
    });

    return NextResponse.json(relationship, { status: 201 });
  } catch (error: unknown) {
    // Handle unique constraint violation
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
    console.error('Error creating piece relationship:', error);
    return NextResponse.json({ error: 'Failed to create piece relationship' }, { status: 500 });
  }
}

/**
 * DELETE /api/quotes/[id]/piece-relationships
 * Delete a piece relationship by its ID.
 *
 * Query param: ?relationshipId=123
 */
export async function DELETE(
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

    const { searchParams } = new URL(request.url);
    const relationshipId = parseInt(searchParams.get('relationshipId') || '');
    if (isNaN(relationshipId)) {
      return NextResponse.json(
        { error: 'relationshipId query parameter is required' },
        { status: 400 }
      );
    }

    // Verify the relationship belongs to a piece in this quote
    const relationship = await prisma.piece_relationships.findUnique({
      where: { id: relationshipId },
      include: {
        sourcePiece: {
          include: {
            quote_rooms: true,
          },
        },
      },
    });

    if (!relationship) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    if (relationship.sourcePiece.quote_rooms.quote_id !== quoteId) {
      return NextResponse.json(
        { error: 'Relationship does not belong to this quote' },
        { status: 403 }
      );
    }

    await prisma.piece_relationships.delete({
      where: { id: relationshipId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting piece relationship:', error);
    return NextResponse.json({ error: 'Failed to delete piece relationship' }, { status: 500 });
  }
}
