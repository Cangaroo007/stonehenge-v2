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

function removeEdge(value: unknown, edge: EdgeName): EdgeName[] {
  return Array.isArray(value)
    ? value.filter((item): item is EdgeName =>
        ['top', 'bottom', 'left', 'right'].includes(String(item)) && item !== edge
      )
    : [];
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

async function getMitredEdgeIds(tx: Prisma.TransactionClient): Promise<Set<string>> {
  const edgeTypes = await tx.edge_types.findMany({
    where: { isMitred: true },
    select: { id: true },
  });

  return new Set(edgeTypes.map(edgeType => edgeType.id));
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
      select: {
        id: true,
        no_strip_edges: true,
        edge_buildups: true,
      },
    }),
  ]);

  if (!parentPiece || !childPiece) return;

  const childJoinEdge = OPPOSITE_EDGE[joinEdge];
  const parentUpdate: Prisma.quote_piecesUpdateInput = {
    no_strip_edges: appendUniqueEdge(parentPiece.no_strip_edges, joinEdge) as unknown as Prisma.InputJsonValue,
    edge_buildups: removeEdgeBuildup(parentPiece.edge_buildups, joinEdge) as unknown as Prisma.InputJsonValue,
    lamination_method: 'MITRED',
  };
  const childUpdate: Prisma.quote_piecesUpdateInput = {
    no_strip_edges: appendUniqueEdge(childPiece.no_strip_edges, childJoinEdge) as unknown as Prisma.InputJsonValue,
    edge_buildups: removeEdgeBuildup(childPiece.edge_buildups, childJoinEdge) as unknown as Prisma.InputJsonValue,
    lamination_method: 'MITRED',
  };

  if (mitredEdgeId) {
    parentUpdate[EDGE_FIELD[joinEdge]] = mitredEdgeId;
    childUpdate[EDGE_FIELD[childJoinEdge]] = mitredEdgeId;
  }

  await Promise.all([
    tx.quote_pieces.update({
      where: { id: input.sourceId },
      data: parentUpdate,
    }),
    tx.quote_pieces.update({
      where: { id: input.targetId },
      data: childUpdate,
    }),
  ]);
}

async function clearEdgeSemanticsForRelationship(
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

  const childJoinEdge = OPPOSITE_EDGE[joinEdge];
  const parentEdgeField = EDGE_FIELD[joinEdge];
  const childEdgeField = EDGE_FIELD[childJoinEdge];

  const [parentPiece, childPiece, mitredEdgeIds] = await Promise.all([
    tx.quote_pieces.findUnique({
      where: { id: input.sourceId },
      select: {
        no_strip_edges: true,
        edge_top: true,
        edge_bottom: true,
        edge_left: true,
        edge_right: true,
      },
    }),
    tx.quote_pieces.findUnique({
      where: { id: input.targetId },
      select: {
        no_strip_edges: true,
        edge_top: true,
        edge_bottom: true,
        edge_left: true,
        edge_right: true,
      },
    }),
    getMitredEdgeIds(tx),
  ]);

  if (parentPiece) {
    const parentUpdate: Record<string, unknown> = {
      no_strip_edges: removeEdge(parentPiece.no_strip_edges, joinEdge) as unknown as Prisma.InputJsonValue,
    };
    const parentEdgeId = parentPiece[parentEdgeField];
    if (parentEdgeId && mitredEdgeIds.has(parentEdgeId)) {
      parentUpdate[parentEdgeField] = null;
    }

    await tx.quote_pieces.update({
      where: { id: input.sourceId },
      data: parentUpdate as Prisma.quote_piecesUpdateInput,
    });
  }

  if (childPiece) {
    const childUpdate: Record<string, unknown> = {
      no_strip_edges: removeEdge(childPiece.no_strip_edges, childJoinEdge) as unknown as Prisma.InputJsonValue,
    };
    const childEdgeId = childPiece[childEdgeField];
    if (childEdgeId && mitredEdgeIds.has(childEdgeId)) {
      childUpdate[childEdgeField] = null;
    }

    await tx.quote_pieces.update({
      where: { id: input.targetId },
      data: childUpdate as Prisma.quote_piecesUpdateInput,
    });
  }
}

async function normaliseLaminationMethod(tx: Prisma.TransactionClient, pieceId: number) {
  const piece = await tx.quote_pieces.findUnique({
    where: { id: pieceId },
    select: {
      lamination_method: true,
      edge_buildups: true,
      edge_top: true,
      edge_bottom: true,
      edge_left: true,
      edge_right: true,
    },
  });

  if (!piece || piece.lamination_method !== 'MITRED') return;

  const edgeBuildups = piece.edge_buildups && typeof piece.edge_buildups === 'object' && !Array.isArray(piece.edge_buildups)
    ? piece.edge_buildups as Record<string, unknown>
    : {};
  if (Object.keys(edgeBuildups).length > 0) return;

  const edgeIds = [piece.edge_top, piece.edge_bottom, piece.edge_left, piece.edge_right].filter(Boolean) as string[];
  if (edgeIds.length > 0) {
    const mitredCount = await tx.edge_types.count({
      where: {
        id: { in: edgeIds },
        isMitred: true,
      },
    });
    if (mitredCount > 0) return;
  }

  const activeEdgeRelationshipCount = await tx.piece_relationships.count({
    where: {
      relationship_type: { in: Array.from(EDGE_RELATIONSHIP_TYPES) },
      OR: [
        { source_piece_id: pieceId },
        { target_piece_id: pieceId },
      ],
    },
  });
  if (activeEdgeRelationshipCount > 0) return;

  await tx.quote_pieces.update({
    where: { id: pieceId },
    data: { lamination_method: 'NONE' },
  });
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

    const previousRelationshipType = existing.relationship_type
      ?? (existing.relation_type as RelationshipType);
    const nextRelationshipType = input.relationshipType ?? previousRelationshipType;
    const nextJoinPosition = input.joinPosition !== undefined ? input.joinPosition : existing.side;
    const previousJoinEdge = normaliseJoinEdge(existing.side);
    const nextJoinEdge = normaliseJoinEdge(nextJoinPosition);
    const shouldClearPreviousEdge =
      EDGE_RELATIONSHIP_TYPES.has(previousRelationshipType) &&
      (!EDGE_RELATIONSHIP_TYPES.has(nextRelationshipType) || previousJoinEdge !== nextJoinEdge);

    if (shouldClearPreviousEdge) {
      await clearEdgeSemanticsForRelationship(tx, {
        relationshipType: previousRelationshipType,
        sourceId: existing.source_piece_id,
        targetId: existing.target_piece_id,
        joinPosition: existing.side,
      });
    }

    const updated = await tx.piece_relationships.update({
      where: { id: numericId },
      data: updateData,
    });

    await syncRoomSemanticsForRelationship(tx, {
      relationshipType: nextRelationshipType,
      sourceId: existing.source_piece_id,
      targetId: existing.target_piece_id,
    });

    await syncEdgeSemanticsForRelationship(tx, {
      relationshipType: nextRelationshipType,
      sourceId: existing.source_piece_id,
      targetId: existing.target_piece_id,
      joinPosition: nextJoinPosition,
    });

    if (shouldClearPreviousEdge && !EDGE_RELATIONSHIP_TYPES.has(nextRelationshipType)) {
      await normaliseLaminationMethod(tx, existing.source_piece_id);
      await normaliseLaminationMethod(tx, existing.target_piece_id);
    }

    return updated;
  });

  return toRelationshipData(relationship);
}

/**
 * Delete a relationship.
 */
export async function deleteRelationship(id: string | number): Promise<void> {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  await prisma.$transaction(async (tx) => {
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

    const relationshipType = existing.relationship_type ?? (existing.relation_type as RelationshipType);
    await clearEdgeSemanticsForRelationship(tx, {
      relationshipType,
      sourceId: existing.source_piece_id,
      targetId: existing.target_piece_id,
      joinPosition: existing.side,
    });

    await tx.piece_relationships.delete({ where: { id: numericId } });

    await normaliseLaminationMethod(tx, existing.source_piece_id);
    await normaliseLaminationMethod(tx, existing.target_piece_id);
  });
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

  return prisma.$transaction((tx) => deleteRelationshipsForPieceInTransaction(tx, numericId));
}

export async function deleteRelationshipsForPieceInTransaction(
  tx: Prisma.TransactionClient,
  pieceId: string | number
): Promise<number> {
  const numericId = typeof pieceId === 'string' ? parseInt(pieceId, 10) : pieceId;

  const relationships = await tx.piece_relationships.findMany({
    where: {
      OR: [
        { source_piece_id: numericId },
        { target_piece_id: numericId },
      ],
    },
    select: {
      id: true,
      source_piece_id: true,
      target_piece_id: true,
      relationship_type: true,
      relation_type: true,
      side: true,
    },
  });

  for (const relationship of relationships) {
    const relationshipType = relationship.relationship_type
      ?? (relationship.relation_type as RelationshipType);
    await clearEdgeSemanticsForRelationship(tx, {
      relationshipType,
      sourceId: relationship.source_piece_id,
      targetId: relationship.target_piece_id,
      joinPosition: relationship.side,
    });
  }

  await tx.piece_relationships.deleteMany({
    where: {
      id: { in: relationships.map((relationship) => relationship.id) },
    },
  });

  const affectedPieceIds = new Set<number>();
  relationships.forEach((relationship) => {
    affectedPieceIds.add(relationship.source_piece_id);
    affectedPieceIds.add(relationship.target_piece_id);
  });
  for (const affectedPieceId of Array.from(affectedPieceIds)) {
    await normaliseLaminationMethod(tx, affectedPieceId);
  }

  return relationships.length;
}
