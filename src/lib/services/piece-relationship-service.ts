import prisma from '@/lib/db';
import type {
  PieceRelationshipData,
  CreatePieceRelationshipInput,
  UpdatePieceRelationshipInput,
} from '@/lib/types/piece-relationship';

/**
 * Get all relationships for a quote (via its pieces).
 */
export async function getRelationshipsForQuote(quoteId: number): Promise<PieceRelationshipData[]> {
  const rooms = await prisma.quote_rooms.findMany({
    where: { quote_id: quoteId },
    select: { quote_pieces: { select: { id: true } } },
  });

  const pieceIds = rooms.flatMap((r) => r.quote_pieces.map((p) => p.id));

  if (pieceIds.length === 0) {
    return [];
  }

  const relationships = await prisma.piece_relationships.findMany({
    where: {
      OR: [
        { source_piece_id: { in: pieceIds } },
        { target_piece_id: { in: pieceIds } },
      ],
    },
    orderBy: { created_at: 'asc' },
  });

  return relationships as unknown as PieceRelationshipData[];
}

/**
 * Get all relationships for a specific piece (as source or target).
 */
export async function getRelationshipsForPiece(pieceId: number): Promise<PieceRelationshipData[]> {
  const relationships = await prisma.piece_relationships.findMany({
    where: {
      OR: [
        { source_piece_id: pieceId },
        { target_piece_id: pieceId },
      ],
    },
  });

  return relationships as unknown as PieceRelationshipData[];
}

/**
 * Create a new relationship between two pieces.
 */
export async function createRelationship(
  input: CreatePieceRelationshipInput
): Promise<PieceRelationshipData> {
  // Validate pieces exist and belong to the same quote
  const [source, target] = await Promise.all([
    prisma.quote_pieces.findUnique({
      where: { id: input.source_piece_id },
      select: { room_id: true, quote_rooms: { select: { quote_id: true } } },
    }),
    prisma.quote_pieces.findUnique({
      where: { id: input.target_piece_id },
      select: { room_id: true, quote_rooms: { select: { quote_id: true } } },
    }),
  ]);

  if (!source || !target) {
    throw new Error('One or both pieces not found');
  }
  if (source.quote_rooms.quote_id !== target.quote_rooms.quote_id) {
    throw new Error('Pieces must belong to the same quote');
  }
  if (input.source_piece_id === input.target_piece_id) {
    throw new Error('A piece cannot have a relationship with itself');
  }

  const relationship = await prisma.piece_relationships.create({
    data: {
      source_piece_id: input.source_piece_id,
      target_piece_id: input.target_piece_id,
      relation_type: input.relation_type,
      side: input.side ?? null,
      notes: input.notes ?? null,
    },
  });

  return relationship as unknown as PieceRelationshipData;
}

/**
 * Update an existing relationship.
 */
export async function updateRelationship(
  id: number,
  input: UpdatePieceRelationshipInput
): Promise<PieceRelationshipData> {
  const relationship = await prisma.piece_relationships.update({
    where: { id },
    data: {
      ...(input.relation_type !== undefined && { relation_type: input.relation_type }),
      ...(input.side !== undefined && { side: input.side }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });

  return relationship as unknown as PieceRelationshipData;
}

/**
 * Delete a relationship.
 */
export async function deleteRelationship(id: number): Promise<void> {
  await prisma.piece_relationships.delete({ where: { id } });
}

/**
 * Delete all relationships for a piece (called when piece is deleted).
 */
export async function deleteRelationshipsForPiece(pieceId: number): Promise<number> {
  const result = await prisma.piece_relationships.deleteMany({
    where: {
      OR: [
        { source_piece_id: pieceId },
        { target_piece_id: pieceId },
      ],
    },
  });
  return result.count;
}
