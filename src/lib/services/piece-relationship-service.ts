import prisma from '@/lib/db';
import { Prisma, RelationshipType } from '@prisma/client';
import type {
  PieceRelationshipData,
  CreatePieceRelationshipInput,
  UpdatePieceRelationshipInput,
} from '@/lib/types/piece-relationship';
import { normaliseRectEdgeSide, type RectEdgeSide } from '@/lib/utils/edge-side';

type EdgeName = RectEdgeSide;

const EDGE_FIELD: Record<EdgeName, 'edge_top' | 'edge_bottom' | 'edge_left' | 'edge_right'> = {
  top: 'edge_top',
  bottom: 'edge_bottom',
  left: 'edge_left',
  right: 'edge_right',
};

const OPPOSITE_EDGE: Record<EdgeName, EdgeName> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

const EDGE_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  RelationshipType.WATERFALL,
  RelationshipType.SPLASHBACK,
]);

const SAME_ROOM_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  RelationshipType.WATERFALL,
  RelationshipType.SPLASHBACK,
  RelationshipType.RETURN,
]);

function normaliseJoinEdge(side: string | null | undefined): EdgeName | null {
  return normaliseRectEdgeSide(side);
}

function appendUniqueEdge(value: unknown, edge: EdgeName): EdgeName[] {
  const current = Array.isArray(value)
    ? value.filter((item): item is EdgeName => ['top', 'bottom', 'left', 'right'].includes(String(item)))
    : [];

  return current.includes(edge) ? current : [...current, edge];
}

function removeEdgeBuildup(value: unknown, edge: EdgeName): Record<string, unknown> {
  const current = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
  delete current[edge];
  return current;
}

async function getDefaultMitredEdgeId(tx: Prisma.TransactionClient): Promise<string | null> {
  const edgeType = await tx.edge_types.findFirst({
    where: {
      isActive: true,
      isMitred: true,
    },
    orderBy: [
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
    select: { id: true },
  });

  return edgeType?.id ?? null;
}

async function syncRoomSemanticsForRelationship(
  tx: Prisma.TransactionClient,
  input: {
    relationshipType: RelationshipType;
    sourceId: number;
    targetId: number;
  }
) {
  if (!SAME_ROOM_RELATIONSHIP_TYPES.has(input.relationshipType)) return;

  const [parent, child] = await Promise.all([
    tx.quote_pieces.findUnique({
      where: { id: input.sourceId },
      select: { room_id: true },
    }),
    tx.quote_pieces.findUnique({
      where: { id: input.targetId },
      select: { room_id: true },
    }),
  ]);

  if (!parent || !child || parent.room_id === child.room_id) return;

  await tx.quote_pieces.update({
    where: { id: input.targetId },
    data: { room_id: parent.room_id },
  });
}

export async function syncEdgeSemanticsForRelationship(
  tx: Prisma.TransactionClient,
  input: {
    relationshipType: RelationshipType;
    sourceId: number;
    targetId: number;
    joinPosition: string | null | undefined;
  }
) {
  if (!EDGE_RELATIONSHIP_TYPES.has(input.relationshipType)) return;

  const joinEdge = normaliseJoinEdge(input.joinPosition);
  if (!joinEdge) return;

  const mitredEdgeId = await getDefaultMitredEdgeId(tx);
  if (!mitredEdgeId) return;

  const [parentPiece, childPiece] = await Promise.all([
    tx.quote_pieces.findUnique({
      where: { id: input.sourceId },
      select: {
        no_strip_edges: true,
        edge_buildups: true,
      },
    }),
    tx.quote_pieces.findUnique({
      where: { id: input.targetId },
      select: { id: true },
    }),
  ]);

  if (!parentPiece || !childPiece) return;

  const childJoinEdge = OPPOSITE_EDGE[joinEdge];

  await Promise.all([
    tx.quote_pieces.update({
      where: { id: input.sourceId },
      data: {
        [EDGE_FIELD[joinEdge]]: mitredEdgeId,
        no_strip_edges: appendUniqueEdge(parentPiece.no_strip_edges, joinEdge) as unknown as Prisma.InputJsonValue,
        edge_buildups: removeEdgeBuildup(parentPiece.edge_buildups, joinEdge) as unknown as Prisma.InputJsonValue,
        lamination_method: 'MITRED',
      },
    }),
    tx.quote_pieces.update({
      where: { id: input.targetId },
      data: {
        [EDGE_FIELD[childJoinEdge]]: mitredEdgeId,
        lamination_method: 'MITRED',
      },
    }),
  ]);
}

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
  grain_match: boolean;
  notes: string | null;
  position_mm: number | null;
  position_reference: string | null;
  coverage_mm: number | null;
}): PieceRelationshipData {
  return {
    id: String(record.id),
    parentPieceId: String(record.source_piece_id),
    childPieceId: String(record.target_piece_id),
    relationshipType: record.relationship_type ?? (record.relation_type as RelationshipType),
    joinPosition: record.side,
    grainMatch: record.grain_match,
    notes: record.notes,
    positionMm: record.position_mm ?? null,
    positionReference: record.position_reference ?? null,
    coverageMm: record.coverage_mm ?? null,
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
  const relationshipType = input.relationshipType;

  // Validate pieces exist and belong to the same quote
  const [parent, child] = await Promise.all([
    prisma.quote_pieces.findUnique({
      where: { id: sourceId },
      select: { room_id: true, quote_rooms: { select: { quote_id: true } } },
    }),
    prisma.quote_pieces.findUnique({
      where: { id: targetId },
      select: { room_id: true, quote_rooms: { select: { quote_id: true } } },
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

  const relationship = await prisma.$transaction(async (tx) => {
    await syncRoomSemanticsForRelationship(tx, {
      relationshipType,
      sourceId,
      targetId,
    });

    const created = await tx.piece_relationships.create({
      data: {
        source_piece_id: sourceId,
        target_piece_id: targetId,
        relation_type: relationshipType,       // Keep old string column in sync
        relationship_type: relationshipType,    // New enum column
        side: input.joinPosition ?? null,
        notes: input.notes ?? null,
        position_mm: input.positionMm ?? null,
        position_reference: input.positionReference ?? null,
        coverage_mm: input.coverageMm ?? null,
      },
    });

    await syncEdgeSemanticsForRelationship(tx, {
      relationshipType,
      sourceId,
      targetId,
      joinPosition: input.joinPosition,
    });

    return created;
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
  if (input.positionMm !== undefined) {
    updateData.position_mm = input.positionMm;
  }
  if (input.positionReference !== undefined) {
    updateData.position_reference = input.positionReference;
  }
  if (input.coverageMm !== undefined) {
    updateData.coverage_mm = input.coverageMm;
  }

  const relationship = await prisma.$transaction(async (tx) => {
    const existing = await tx.piece_relationships.findUnique({
      where: { id: numericId },
      select: {
        source_piece_id: true,
        target_piece_id: true,
        relationship_type: true,
        relation_type: true,
        side: true,
      },
    });

    if (!existing) {
      throw new Error('Relationship not found');
    }

    const updated = await tx.piece_relationships.update({
      where: { id: numericId },
      data: updateData,
    });

    const effectiveRelationshipType = input.relationshipType
      ?? existing.relationship_type
      ?? (existing.relation_type as RelationshipType);

    await syncRoomSemanticsForRelationship(tx, {
      relationshipType: effectiveRelationshipType,
      sourceId: existing.source_piece_id,
      targetId: existing.target_piece_id,
    });

    await syncEdgeSemanticsForRelationship(tx, {
      relationshipType: effectiveRelationshipType,
      sourceId: existing.source_piece_id,
      targetId: existing.target_piece_id,
      joinPosition: input.joinPosition !== undefined ? input.joinPosition : existing.side,
    });

    return updated;
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
