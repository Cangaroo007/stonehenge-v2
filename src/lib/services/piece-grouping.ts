import type {
  PieceGroup,
  GroupedPiece,
  SpatialPosition,
  PieceRelationType,
  QuotePieceInput,
  RoomInput,
} from '@/lib/types/piece-groups';

/**
 * Converts a Decimal-like value to a plain number.
 * Handles both raw numbers and Prisma Decimal objects.
 */
function toNumber(val: number | { toNumber(): number }): number {
  if (typeof val === 'number') return val;
  if (val && typeof val.toNumber === 'function') return val.toNumber();
  return Number(val) || 0;
}

/**
 * Groups a flat list of quote pieces into spatial groups
 * for the Complete Job View.
 *
 * This is a pure function with NO side effects — no API calls,
 * no database queries. The caller loads data and passes it in.
 *
 * @param pieces - All pieces in the quote (snake_case DB shape)
 * @param rooms  - Room data for the quote
 * @returns Array of PieceGroups, ordered by room then position
 */
export function groupPiecesForJobView(
  pieces: QuotePieceInput[],
  rooms: RoomInput[]
): PieceGroup[] {
  if (pieces.length === 0) return [];

  const roomMap = new Map<number, string>();
  for (const room of rooms) {
    roomMap.set(room.id, room.name);
  }

  // Track which pieces have been claimed by a group
  const claimed = new Set<number>();
  const groups: PieceGroup[] = [];

  // ---------- Phase 1: Explicit relationships from DB ----------
  const explicitTargets = new Map<number, { sourcePieceId: number; relationType: string; side: string | null }>();

  for (const piece of pieces) {
    if (piece.sourceRelationships) {
      for (const rel of piece.sourceRelationships) {
        explicitTargets.set(rel.targetPieceId, {
          sourcePieceId: rel.sourcePieceId,
          relationType: rel.relationType,
          side: rel.side,
        });
      }
    }
  }

  // Build groups from explicit source pieces first
  const sourcePieceIds = new Set(
    Array.from(explicitTargets.values()).map((r) => r.sourcePieceId)
  );

  for (const sourcePieceId of Array.from(sourcePieceIds)) {
    const sourcePiece = pieces.find((p) => p.id === sourcePieceId);
    if (!sourcePiece || claimed.has(sourcePieceId)) continue;

    const relatedPieceInputs = pieces.filter(
      (p) => explicitTargets.has(p.id) && explicitTargets.get(p.id)!.sourcePieceId === sourcePieceId
    );

    const relatedGrouped: GroupedPiece[] = relatedPieceInputs.map((p) => {
      const rel = explicitTargets.get(p.id)!;
      return toGroupedPiece(p, rel.relationType as PieceRelationType, rel.side);
    });

    const group = buildGroup(
      sourcePiece,
      relatedGrouped,
      roomMap.get(sourcePiece.room_id) || 'Unassigned'
    );
    groups.push(group);

    claimed.add(sourcePieceId);
    for (const rp of relatedPieceInputs) {
      claimed.add(rp.id);
    }
  }

  // ---------- Phase 2: Infer relationships by type within rooms ----------
  const piecesByRoom = new Map<number, QuotePieceInput[]>();
  for (const piece of pieces) {
    if (claimed.has(piece.id)) continue;
    const roomPieces = piecesByRoom.get(piece.room_id) || [];
    roomPieces.push(piece);
    piecesByRoom.set(piece.room_id, roomPieces);
  }

  for (const [roomId, roomPieces] of Array.from(piecesByRoom.entries())) {
    const roomName = roomMap.get(roomId) || 'Unassigned';

    // Identify benchtop-like pieces (primary candidates)
    const primaries: QuotePieceInput[] = [];
    const secondaries: QuotePieceInput[] = [];

    for (const piece of roomPieces) {
      if (claimed.has(piece.id)) continue;
      const inferredType = inferRelationType(piece);
      if (inferredType === 'STANDALONE' || inferredType === 'ISLAND') {
        primaries.push(piece);
      } else {
        secondaries.push(piece);
      }
    }

    // For each secondary, try to attach to the best matching primary
    const attachedToPrimary = new Map<number, { piece: QuotePieceInput; relation: PieceRelationType; side: string | null }[]>();

    for (const sec of secondaries) {
      if (claimed.has(sec.id)) continue;
      const inferredType = inferRelationType(sec);

      // Try name-based matching first
      const matchedPrimary = findBestPrimary(sec, primaries, roomPieces);
      if (matchedPrimary) {
        const side = inferSide(sec);
        const existing = attachedToPrimary.get(matchedPrimary.id) || [];
        existing.push({ piece: sec, relation: inferredType, side });
        attachedToPrimary.set(matchedPrimary.id, existing);
        claimed.add(sec.id);
      }
    }

    // Create groups for primaries with their attached secondaries
    for (const primary of primaries) {
      if (claimed.has(primary.id)) continue;
      const attached = attachedToPrimary.get(primary.id) || [];
      const relatedGrouped = attached.map(({ piece, relation, side }) =>
        toGroupedPiece(piece, relation, side)
      );

      groups.push(buildGroup(primary, relatedGrouped, roomName));
      claimed.add(primary.id);
    }

    // Any remaining unclaimed secondaries become standalone groups
    for (const sec of secondaries) {
      if (claimed.has(sec.id)) continue;
      groups.push(buildGroup(sec, [], roomName));
      claimed.add(sec.id);
    }
  }

  // ---------- Phase 3: Any completely unclaimed pieces ----------
  for (const piece of pieces) {
    if (claimed.has(piece.id)) continue;
    const roomName = roomMap.get(piece.room_id) || 'Unassigned';
    groups.push(buildGroup(piece, [], roomName));
    claimed.add(piece.id);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Infer the relationship type of a piece from its name and properties.
 */
function inferRelationType(piece: QuotePieceInput): PieceRelationType {
  const name = piece.name.toLowerCase();

  if (piece.waterfall_height_mm && piece.waterfall_height_mm > 0) return 'WATERFALL';
  if (name.includes('waterfall')) return 'WATERFALL';
  if (name.includes('splashback') || name.includes('splash back')) return 'SPLASHBACK';
  if (name.includes('return end') || name.includes('return_end')) return 'RETURN_END';
  if (name.includes('window sill') || name.includes('windowsill')) return 'WINDOW_SILL';
  if (name.includes('island')) return 'ISLAND';
  if (name.includes('lamination') || name.includes('lam strip')) return 'LAMINATION';

  // If lamination_method is MITRED, it's likely a mitre join piece
  if (piece.lamination_method === 'MITRED') return 'MITRE_JOIN';

  return 'STANDALONE';
}

/**
 * Infer which side a secondary piece attaches to from its name.
 */
function inferSide(piece: QuotePieceInput): string | null {
  const name = piece.name.toLowerCase();
  if (name.includes(' l') || name.includes('left') || name.includes('lhs')) return 'left';
  if (name.includes(' r') || name.includes('right') || name.includes('rhs')) return 'right';
  if (name.includes('back') || name.includes('rear')) return 'top';
  if (name.includes('front')) return 'bottom';
  return null;
}

/**
 * Find the best primary piece for a secondary piece.
 * Uses name prefix matching, then falls back to the first primary in the room.
 */
function findBestPrimary(
  secondary: QuotePieceInput,
  primaries: QuotePieceInput[],
  _allInRoom: QuotePieceInput[]
): QuotePieceInput | null {
  if (primaries.length === 0) return null;

  const secName = secondary.name.toLowerCase();

  // Extract prefix: e.g. "Kitchen Waterfall L" -> "kitchen"
  const secWords = secName.split(/\s+/);
  const prefix = secWords[0];

  // Try to find a primary whose name starts with the same prefix
  for (const primary of primaries) {
    const priName = primary.name.toLowerCase();
    if (priName.startsWith(prefix) && prefix.length >= 3) {
      return primary;
    }
  }

  // Fall back to nearest primary by sort order
  let bestPrimary = primaries[0];
  let bestDistance = Math.abs(bestPrimary.sort_order - secondary.sort_order);
  for (let i = 1; i < primaries.length; i++) {
    const dist = Math.abs(primaries[i].sort_order - secondary.sort_order);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestPrimary = primaries[i];
    }
  }

  return bestPrimary;
}

/**
 * Get spatial position for a piece based on its relationship type and side.
 */
function getSpatialPosition(
  relationship: PieceRelationType,
  side: string | null
): SpatialPosition {
  switch (relationship) {
    case 'WATERFALL':
      if (side === 'right') return { x: 1, y: 0, rotation: 90, side: 'right' };
      return { x: -1, y: 0, rotation: 90, side: 'left' };

    case 'SPLASHBACK':
      return { x: 0, y: -1, rotation: 0, side: 'top' };

    case 'RETURN_END':
      if (side === 'right') return { x: 1, y: 0, rotation: 0, side: 'right' };
      return { x: -1, y: 0, rotation: 0, side: 'left' };

    case 'WINDOW_SILL':
      return { x: 0, y: -1, rotation: 0, side: 'top' };

    case 'MITRE_JOIN':
      return { x: 1, y: 0, rotation: 0, side: 'right' };

    case 'BUTT_JOIN':
      return { x: 1, y: 0, rotation: 0, side: 'right' };

    case 'LAMINATION':
      // Laminations are rendered as indicators on the parent, not separately
      return { x: 0, y: 0, rotation: 0, side: null };

    case 'ISLAND':
    case 'STANDALONE':
    default:
      return { x: 0, y: 0, rotation: 0, side: 'centre' };
  }
}

/**
 * Convert a raw piece to a GroupedPiece.
 */
function toGroupedPiece(
  piece: QuotePieceInput,
  relationship: PieceRelationType,
  side: string | null
): GroupedPiece {
  return {
    pieceId: piece.id,
    pieceName: piece.name,
    relationship,
    position: getSpatialPosition(relationship, side),
    dimensions: {
      lengthMm: piece.length_mm,
      widthMm: piece.width_mm,
      thicknessMm: piece.thickness_mm,
    },
    edges: {
      top: piece.edge_top,
      bottom: piece.edge_bottom,
      left: piece.edge_left,
      right: piece.edge_right,
    },
    material: {
      id: piece.material_id,
      name: piece.material_name,
    },
    areaSqm: toNumber(piece.area_sqm),
    cost: toNumber(piece.total_cost),
  };
}

/**
 * Build a PieceGroup from a primary piece and its related pieces.
 */
function buildGroup(
  primary: QuotePieceInput,
  relatedPieces: GroupedPiece[],
  roomName: string
): PieceGroup {
  const primaryType = inferRelationType(primary);
  const primaryGrouped = toGroupedPiece(
    primary,
    primaryType === 'STANDALONE' ? 'STANDALONE' : primaryType,
    'centre'
  );
  // Primary always at origin
  primaryGrouped.position = { x: 0, y: 0, rotation: 0, side: 'centre' };

  const allArea = primaryGrouped.areaSqm + relatedPieces.reduce((sum, p) => sum + p.areaSqm, 0);
  const allCost = primaryGrouped.cost + relatedPieces.reduce((sum, p) => sum + p.cost, 0);

  return {
    id: `group-${primary.id}`,
    label: primary.name,
    room: roomName,
    primaryPiece: primaryGrouped,
    relatedPieces,
    totalArea: Math.round(allArea * 10000) / 10000,
    totalCost: Math.round(allCost * 100) / 100,
  };
}
