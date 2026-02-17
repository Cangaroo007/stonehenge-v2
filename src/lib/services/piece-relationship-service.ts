import prisma from '@/lib/db';
import { RelationshipType } from '@prisma/client';
import type {
  PieceRelationshipData,
  CreatePieceRelationshipInput,
  UpdatePieceRelationshipInput,
} from '@/lib/types/piece-relationship';

/**
 * Maps a DB record to the TypeScript interface.
 * This is the ONLY place where DB column names <-> TS property names are mapped.
 */
function toRelationshipData(record: {
  id: number;
  source_piece_id: number;
  target_piece_id: number;
  relationship_type: RelationshipType | null;
  relation_type: string;
  side: string | null;
  notes: string | null;
}): PieceRelationshipData {
  return {
    id: String(record.id),
    parentPieceId: String(record.source_piece_id),
    childPieceId: String(record.target_piece_id),
    relationshipType: record.relationship_type ?? (record.relation_type as RelationshipType),
    joinPosition: record.side,
    notes: record.notes,
  };
}

/**
 * Get all relationships for a quote (via its pieces).
 */
export async function getRelationshipsForQuote(
  quoteId: string | number
): Promise<PieceRelationshipData[]> {
  const numericId = typeof quoteId === 'string' ? parseInt(quoteId, 10) : quoteId;

  const rooms = await prisma.quote_rooms.findMany({
    where: { quote_id: numericId },
    select: {
      quote_pieces: {
        select: { id: true },
      },
    },
  });

  const pieceIds = rooms.flatMap((r) => r.quote_pieces.map((p) => p.id));

  if (pieceIds.length === 0) {
    return [];
  }

  const relationships = await prisma.piece_relationships.findMany({
    where: {
      source_piece_id: { in: pieceIds },
    },
    orderBy: { created_at: 'asc' },
  });

  return relationships.map(toRelationshipData);
}

/**
 * Get all relationships for a specific piece (as parent or child).
 */
export async function getRelationshipsForPiece(
  pieceId: string | number
): Promise<PieceRelationshipData[]> {
  const numericId = typeof pieceId === 'string' ? parseInt(pieceId, 10) : pieceId;

  const relationships = await prisma.piece_relationships.findMany({
    where: {
      OR: [
        { source_piece_id: numericId },
        { target_piece_id: numericId },
      ],
    },
  });

  return relationships.map(toRelationshipData);
}

/**
 * Create a new relationship between two pieces.
 */
export async function createRelationship(
  input: CreatePieceRelationshipInput
): Promise<PieceRelationshipData> {
  const sourceId = typeof input.parentPieceId === 'string'
    ? parseInt(input.parentPieceId, 10) : Number(input.parentPieceId);
  const targetId = typeof input.childPieceId === 'string'
    ? parseInt(input.childPieceId, 10) : Number(input.childPieceId);

  // Validate pieces exist and belong to the same quote
  const [parent, child] = await Promise.all([
    prisma.quote_pieces.findUnique({
      where: { id: sourceId },
      select: { quote_rooms: { select: { quote_id: true } } },
    }),
    prisma.quote_pieces.findUnique({
      where: { id: targetId },
      select: { quote_rooms: { select: { quote_id: true } } },
    }),
  ]);

  if (!parent || !child) {
    throw new Error('One or both pieces not found');
  }
  if (parent.quote_rooms.quote_id !== child.quote_rooms.quote_id) {
    throw new Error('Pieces must belong to the same quote');
  }
  if (sourceId === targetId) {
    throw new Error('A piece cannot have a relationship with itself');
  }

  const relationship = await prisma.piece_relationships.create({
    data: {
      source_piece_id: sourceId,
      target_piece_id: targetId,
      relation_type: input.relationshipType,       // Keep old string column in sync
      relationship_type: input.relationshipType,    // New enum column
      side: input.joinPosition ?? null,
      notes: input.notes ?? null,
    },
  });

  return toRelationshipData(relationship);
}

/**
 * Update an existing relationship.
 */
export async function updateRelationship(
  id: string | number,
  input: UpdatePieceRelationshipInput
): Promise<PieceRelationshipData> {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;

  const updateData: Record<string, unknown> = {};

  if (input.relationshipType !== undefined) {
    updateData.relationship_type = input.relationshipType;
    updateData.relation_type = input.relationshipType; // Keep old column in sync
  }
  if (input.joinPosition !== undefined) {
    updateData.side = input.joinPosition;
  }
  if (input.notes !== undefined) {
    updateData.notes = input.notes;
  }

  const relationship = await prisma.piece_relationships.update({
    where: { id: numericId },
    data: updateData,
  });

  return toRelationshipData(relationship);
}

/**
 * Delete a relationship.
 */
export async function deleteRelationship(id: string | number): Promise<void> {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  await prisma.piece_relationships.delete({ where: { id: numericId } });
}

/**
 * Delete all relationships for a piece (called when piece is deleted).
 * Note: onDelete: Cascade is already configured in the schema,
 * so this is only needed for explicit pre-deletion cleanup.
 */
export async function deleteRelationshipsForPiece(
  pieceId: string | number
): Promise<number> {
  const numericId = typeof pieceId === 'string' ? parseInt(pieceId, 10) : pieceId;

  const result = await prisma.piece_relationships.deleteMany({
    where: {
      OR: [
        { source_piece_id: numericId },
        { target_piece_id: numericId },
      ],
    },
  });
  return result.count;
}
