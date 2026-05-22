import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { Prisma, RelationshipType } from '@prisma/client';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import { buildQuotePricingUpdate } from '@/lib/services/quote-pricing-persistence';
import { syncEdgeSemanticsForRelationship } from '@/lib/services/piece-relationship-service';
import { normaliseRectEdgeSide } from '@/lib/utils/edge-side';
import type { EdgeBuildupConfig } from '@/types/edge-buildup';
import { getShapeGeometry, isCanonicalPolygonShapeConfig, type ShapeConfig, type ShapeType } from '@/lib/types/shapes';
import { normaliseCanonicalPolygonV2Patch } from '@/lib/services/proto-geometry-adapter';


interface ImportPieceData {
  name: string;
  length: number;
  width: number;
  thickness?: number;
  room?: string;
  pieceType?: string | null;
  materialId?: number | null;
  material?: string;
  notes?: string;
  shape?: string | null;
  shapeType?: string | null;
  shapeConfig?: Record<string, unknown> | null;
  edgeArcConfig?: Record<string, string | null> | null;
  edgeTop?: string;
  edgeBottom?: string;
  edgeLeft?: string;
  edgeRight?: string;
  edgeBuildups?: Record<string, EdgeBuildupConfig | number | boolean | null>;
  noStripEdges?: string[];
  relatedTo?: {
    pieceName?: string | null;
    relationshipType?: string | null;
    relationType?: string | null;
    joinPosition?: string | null;
    side?: string | null;
  } | null;
  cutouts?: Array<{
    name?: string;
    type?: string;
    quantity?: number;
  }>;
}

type RectEdgeKey = 'top' | 'bottom' | 'left' | 'right';

type ImportEdgeType = {
  id: string;
  name: string;
  code: string | null;
  isMitred: boolean | null;
};

interface ImportRequest {
  pieces: ImportPieceData[];
  sourceAnalysisId?: string;
  replaceExisting?: boolean;
}

type CreatedImportPiece = {
  id: number;
  name: string;
  room: string;
  pieceType: string | null;
  notes: string | null;
  lengthMm: number;
  widthMm: number;
  source: ImportPieceData;
};

const ATTACHED_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  RelationshipType.WATERFALL,
  RelationshipType.SPLASHBACK,
]);

const PRIMARY_PIECE_TYPES = new Set([
  'BENCHTOP',
  'ISLAND',
  'VANITY',
  'LAUNDRY',
  'WINDOW_SILL',
  'WINDOWSILL',
]);

async function recalculateQuote(quoteId: number) {
  const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
  await prisma.quotes.update({
    where: { id: quoteId },
    data: buildQuotePricingUpdate(calcResult),
  });
}

function normalisePieceType(value?: string | null): string | null {
  if (!value) return null;
  return value.trim().replace(/[\s-]+/g, '_').toUpperCase();
}

function inferRelationshipType(piece: CreatedImportPiece): RelationshipType | null {
  const explicit = piece.source.relatedTo?.relationshipType ?? piece.source.relatedTo?.relationType;
  const explicitType = normalisePieceType(explicit);
  if (explicitType === 'WATERFALL') return RelationshipType.WATERFALL;
  if (explicitType === 'SPLASHBACK') return RelationshipType.SPLASHBACK;

  const pieceType = normalisePieceType(piece.pieceType);
  if (pieceType === 'WATERFALL') return RelationshipType.WATERFALL;
  if (pieceType === 'SPLASHBACK') return RelationshipType.SPLASHBACK;

  const text = `${piece.name} ${piece.notes ?? ''}`.toLowerCase();
  if (/\bwater\s*fall\b|\bwaterfall\b/.test(text)) return RelationshipType.WATERFALL;
  if (/\bsplash\s*back\b|\bsplashback\b/.test(text)) return RelationshipType.SPLASHBACK;
  return null;
}

function inferJoinSide(piece: CreatedImportPiece, relationshipType: RelationshipType): string | null {
  const explicit = normaliseRectEdgeSide(piece.source.relatedTo?.joinPosition ?? piece.source.relatedTo?.side);
  if (explicit) return explicit;

  const text = `${piece.name} ${piece.notes ?? ''}`.toLowerCase();
  const inferred = normaliseRectEdgeSide(
    /\bleft\b|\blhs\b/.test(text) ? 'left'
      : /\bright\b|\brhs\b/.test(text) ? 'right'
      : /\bfront\b|\bbottom\b/.test(text) ? 'bottom'
      : /\bback\b|\brear\b|\bwall\b|\btop\b/.test(text) ? 'top'
      : null
  );
  if (inferred) return inferred;

  return relationshipType === RelationshipType.SPLASHBACK ? 'top' : null;
}

function isPrimaryPiece(piece: CreatedImportPiece): boolean {
  const type = normalisePieceType(piece.pieceType);
  if (type && PRIMARY_PIECE_TYPES.has(type)) return true;

  const text = `${piece.name} ${piece.notes ?? ''}`.toLowerCase();
  return /\bbench\s*top\b|\bbenchtop\b|\bisland\b|\bvanity\b|\blaundry\b/.test(text);
}

function findRelationshipParent(
  child: CreatedImportPiece,
  roomPieces: CreatedImportPiece[]
): CreatedImportPiece | null {
  const explicitParentName = child.source.relatedTo?.pieceName?.trim().toLowerCase();
  if (explicitParentName) {
    const explicitParent = roomPieces.find(piece =>
      piece.id !== child.id && piece.name.trim().toLowerCase() === explicitParentName
    );
    if (explicitParent) return explicitParent;
  }

  const candidates = roomPieces.filter(piece => piece.id !== child.id && isPrimaryPiece(piece));
  if (candidates.length === 1) return candidates[0];
  return null;
}

function edgeLookupKey(value?: string | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ');
}

function buildEdgeTypeLookup(edgeTypes: ImportEdgeType[]): Map<string, ImportEdgeType> {
  const lookup = new Map<string, ImportEdgeType>();
  for (const edgeType of edgeTypes) {
    for (const value of [edgeType.id, edgeType.name, edgeType.code]) {
      const key = edgeLookupKey(value);
      if (key) lookup.set(key, edgeType);
    }
  }
  return lookup;
}

function isRawEdgeValue(value?: string | null): boolean {
  const key = edgeLookupKey(value);
  return !key || ['raw', 'none', 'null', 'unknown', 'wall', 'against wall'].includes(key);
}

function isBuildUpEdgeValue(value?: string | null): boolean {
  const key = edgeLookupKey(value);
  return /\b(mitre|miter|mitred|mitered|build up|buildup|drop edge|laminated|40mm|60mm)\b/.test(key);
}

function resolveVisibleEdgeId(
  value: string | undefined,
  edgeLookup: Map<string, ImportEdgeType>,
  defaultBuildUpProfileId: string | null
): string | null {
  if (isRawEdgeValue(value)) return null;

  const matched = edgeLookup.get(edgeLookupKey(value));
  if (matched) {
    // A mitred edge type represents construction/build-up, not the visible profile.
    // Use the default visible profile and record the build-up separately.
    return matched.isMitred ? defaultBuildUpProfileId : matched.id;
  }

  return isBuildUpEdgeValue(value) ? defaultBuildUpProfileId : null;
}

function resolveArcEdgeConfig(
  arcConfig: Record<string, string | null>,
  edgeLookup: Map<string, ImportEdgeType>
): Record<string, string | null> {
  const output: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(arcConfig)) {
    if (isRawEdgeValue(value)) {
      output[key] = null;
      continue;
    }
    output[key] = edgeLookup.get(edgeLookupKey(value))?.id ?? value;
  }
  return output;
}

function normaliseImportedEdgeBuildups(piece: ImportPieceData): Record<string, EdgeBuildupConfig> | undefined {
  const sides: RectEdgeKey[] = ['top', 'bottom', 'left', 'right'];
  const rawBySide: Record<RectEdgeKey, string | undefined> = {
    top: piece.edgeTop,
    bottom: piece.edgeBottom,
    left: piece.edgeLeft,
    right: piece.edgeRight,
  };
  const output: Record<string, EdgeBuildupConfig> = {};

  for (const side of sides) {
    const explicit = piece.edgeBuildups?.[side];
    if (explicit === false || explicit === null) continue;

    if (typeof explicit === 'number') {
      output[side] = { depth: Math.max(1, Math.round(explicit)), exposed: true, chargeCut: true, chargePolish: true };
      continue;
    }

    if (explicit === true) {
      output[side] = { depth: 40, exposed: true, chargeCut: true, chargePolish: true };
      continue;
    }

    if (explicit && typeof explicit === 'object') {
      output[side] = {
        depth: Math.max(1, Math.round(Number(explicit.depth) || 40)),
        exposed: explicit.exposed ?? true,
        chargeCut: explicit.chargeCut ?? true,
        chargePolish: explicit.chargePolish ?? true,
      };
      continue;
    }

    if (isBuildUpEdgeValue(rawBySide[side])) {
      output[side] = { depth: 40, exposed: true, chargeCut: true, chargePolish: true };
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function normaliseNoStripEdges(edges?: string[]): string[] | undefined {
  if (!Array.isArray(edges)) return undefined;
  const normalised = edges
    .map(edge => normaliseRectEdgeSide(edge))
    .filter((edge): edge is RectEdgeKey => Boolean(edge));
  return normalised.length > 0 ? Array.from(new Set(normalised)) : undefined;
}

function normaliseImportedPolygonPatch(
  pieceData: ImportPieceData,
  pieceId: string,
  edgeLookup: Map<string, ImportEdgeType>,
  defaultBuildUpProfileId: string | null
): ReturnType<typeof normaliseCanonicalPolygonV2Patch> | null {
  if (!isCanonicalPolygonShapeConfig(pieceData.shapeConfig)) return null;

  return normaliseCanonicalPolygonV2Patch({
    id: pieceId,
    name: pieceData.name,
    length_mm: Math.round(pieceData.length),
    width_mm: Math.round(pieceData.width),
    thickness_mm: pieceData.thickness || 20,
    material_id: pieceData.materialId ?? null,
    material_name: pieceData.material ?? null,
    piece_type: pieceData.pieceType || null,
    shape_config: pieceData.shapeConfig,
    edge_top: resolveVisibleEdgeId(pieceData.edgeTop, edgeLookup, defaultBuildUpProfileId),
    edge_right: resolveVisibleEdgeId(pieceData.edgeRight, edgeLookup, defaultBuildUpProfileId),
    edge_bottom: resolveVisibleEdgeId(pieceData.edgeBottom, edgeLookup, defaultBuildUpProfileId),
    edge_left: resolveVisibleEdgeId(pieceData.edgeLeft, edgeLookup, defaultBuildUpProfileId),
    no_strip_edges: normaliseNoStripEdges(pieceData.noStripEdges) ?? [],
    edge_buildups: normaliseImportedEdgeBuildups(pieceData),
    cutouts: pieceData.cutouts ?? [],
  });
}

// POST - Import multiple pieces from drawing analysis
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Verify quote belongs to user's company
    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const data: ImportRequest = await request.json();
    const { pieces, sourceAnalysisId, replaceExisting } = data;

    if (!pieces || !Array.isArray(pieces) || pieces.length === 0) {
      return NextResponse.json(
        { error: 'At least one piece is required' },
        { status: 400 }
      );
    }

    const edgeTypes = await prisma.edge_types.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, code: true, isMitred: true },
    });
    const edgeLookup = buildEdgeTypeLookup(edgeTypes);
    const defaultBuildUpProfileId =
      edgeTypes.find(edgeType => /arris/i.test(edgeType.name) || /arr/i.test(edgeType.code ?? ''))?.id ??
      edgeTypes.find(edgeType => !edgeType.isMitred)?.id ??
      null;

    // Validate all pieces have required fields
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      if (!piece.name || !piece.length || !piece.width) {
        return NextResponse.json(
          { error: `Piece ${i + 1} is missing required fields (name, length, width)` },
          { status: 400 }
        );
      }
      try {
        normaliseImportedPolygonPatch(piece, `import-${quoteId}-${i}`, edgeLookup, defaultBuildUpProfileId);
      } catch (error) {
        return NextResponse.json(
          { error: `Piece ${i + 1} has invalid polygon geometry: ${error instanceof Error ? error.message : 'Invalid polygon geometry'}` },
          { status: 400 }
        );
      }
    }

    const materialIds = Array.from(new Set(
      pieces
        .map((piece) => piece.materialId)
        .filter((materialId): materialId is number =>
          Number.isInteger(materialId) && Number(materialId) > 0
        )
    ));
    if (materialIds.length > 0) {
      const ownedMaterialCount = await prisma.materials.count({
        where: {
          id: { in: materialIds },
          company_id: auth.user.companyId,
        },
      });
      if (ownedMaterialCount !== materialIds.length) {
        return NextResponse.json({ error: 'Material not found' }, { status: 404 });
      }
    }

    // If replaceExisting, delete all existing rooms and pieces for this quote
    if (replaceExisting) {
      const existingRooms = await prisma.quote_rooms.findMany({
        where: { quote_id: quoteId },
        select: { id: true },
      });
      const roomIds = existingRooms.map(r => r.id);
      if (roomIds.length > 0) {
        await prisma.quote_pieces.deleteMany({
          where: { room_id: { in: roomIds } },
        });
        await prisma.quote_rooms.deleteMany({
          where: { quote_id: quoteId },
        });
      }
    }

    // Group pieces by room
    const piecesByRoom: Record<string, ImportPieceData[]> = {};
    for (const piece of pieces) {
      const roomName = piece.room || 'Unassigned';
      if (!piecesByRoom[roomName]) {
        piecesByRoom[roomName] = [];
      }
      piecesByRoom[roomName].push(piece);
    }

    const createdPieces: CreatedImportPiece[] = [];

    // Process each room
    for (const [roomName, roomPieces] of Object.entries(piecesByRoom)) {
      // Find or create the room
      let room = await prisma.quote_rooms.findFirst({
        where: {
          quote_id: quoteId,
          name: roomName,
        },
      });

      if (!room) {
        // Get the highest sort order for rooms
        const maxRoom = await prisma.quote_rooms.findFirst({
          where: { quote_id: quoteId },
          orderBy: { sort_order: 'desc' },
        });

        room = await prisma.quote_rooms.create({
          data: {
            quote_id: quoteId,
            name: roomName,
            sort_order: (maxRoom?.sort_order ?? -1) + 1,
          },
        });
      }

      // Get the highest piece sort order in the room
      const maxPiece = await prisma.quote_pieces.findFirst({
        where: { room_id: room.id },
        orderBy: { sort_order: 'desc' },
      });

      let sortOrder = (maxPiece?.sort_order ?? -1) + 1;
      const createdRoomPieces: CreatedImportPiece[] = [];

      // Create each piece
      for (const pieceData of roomPieces) {
        const lengthMm = Math.round(pieceData.length);
        const widthMm = Math.round(pieceData.width);
        const thicknessMm = pieceData.thickness || 20;
        const cutouts = Array.isArray(pieceData.cutouts)
          ? pieceData.cutouts
              .map((cutout) => ({
                name: cutout.name || cutout.type || 'Cutout',
                quantity: cutout.quantity ?? 1,
              }))
              .filter((cutout) => cutout.name)
          : [];

        const importedShapeType = (pieceData.shapeType || pieceData.shape || 'RECTANGLE') as ShapeType;
        const edgeBuildups = normaliseImportedEdgeBuildups(pieceData);
        const importedNoStripEdges = normaliseNoStripEdges(pieceData.noStripEdges);
        const normalisedPolygonPatch = normaliseImportedPolygonPatch(
          pieceData,
          `import-${quoteId}-${room.id}-${sortOrder}`,
          edgeLookup,
          defaultBuildUpProfileId
        );
        const persistedLengthMm = normalisedPolygonPatch?.length_mm ?? lengthMm;
        const persistedWidthMm = normalisedPolygonPatch?.width_mm ?? widthMm;
        const areaSqm = normalisedPolygonPatch?.area_sqm ?? getShapeGeometry(
          importedShapeType,
          pieceData.shapeConfig as unknown as ShapeConfig,
          persistedLengthMm,
          persistedWidthMm
        ).totalAreaSqm;
        const persistedEdgeBuildups = normalisedPolygonPatch?.edge_buildups ?? edgeBuildups;
        const persistedNoStripEdges = normalisedPolygonPatch?.no_strip_edges ?? importedNoStripEdges;
        const piece = await prisma.quote_pieces.create({
          data: {
            room_id: room.id,
            name: pieceData.name,
            description: pieceData.notes || null,
            length_mm: persistedLengthMm,
            width_mm: persistedWidthMm,
            thickness_mm: thicknessMm,
            area_sqm: areaSqm,
            material_id: pieceData.materialId ?? null,
            material_name: pieceData.material || null,
            // DEPRECATED: material_cost is unreliable — use quotes.calculation_breakdown
            // Kept to avoid null constraint violations. Do not read this value for display.
            material_cost: 0,
            // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
            // Kept to avoid null constraint violations. Do not read this value for display.
            total_cost: 0,
            sort_order: sortOrder++,
            cutouts,
            piece_type: pieceData.pieceType || null,
            edge_top: normalisedPolygonPatch ? normalisedPolygonPatch.edge_top : resolveVisibleEdgeId(pieceData.edgeTop, edgeLookup, defaultBuildUpProfileId),
            edge_bottom: normalisedPolygonPatch ? normalisedPolygonPatch.edge_bottom : resolveVisibleEdgeId(pieceData.edgeBottom, edgeLookup, defaultBuildUpProfileId),
            edge_left: normalisedPolygonPatch ? normalisedPolygonPatch.edge_left : resolveVisibleEdgeId(pieceData.edgeLeft, edgeLookup, defaultBuildUpProfileId),
            edge_right: normalisedPolygonPatch ? normalisedPolygonPatch.edge_right : resolveVisibleEdgeId(pieceData.edgeRight, edgeLookup, defaultBuildUpProfileId),
            shape_type: normalisedPolygonPatch?.shape_type ?? importedShapeType,
            ...((normalisedPolygonPatch?.shape_config ?? pieceData.shapeConfig) && {
              shape_config: (normalisedPolygonPatch?.shape_config ?? pieceData.shapeConfig) as unknown as Prisma.InputJsonValue,
            }),
            ...(pieceData.edgeArcConfig && { edge_arc_config: resolveArcEdgeConfig(pieceData.edgeArcConfig, edgeLookup) as unknown as Prisma.InputJsonValue }),
            ...(persistedEdgeBuildups && { edge_buildups: persistedEdgeBuildups as unknown as Prisma.InputJsonValue }),
            ...(persistedNoStripEdges && { no_strip_edges: persistedNoStripEdges as unknown as Prisma.InputJsonValue }),
          },
        });

        const createdImportPiece: CreatedImportPiece = {
          id: piece.id,
          name: piece.name,
          room: roomName,
          pieceType: pieceData.pieceType || null,
          notes: pieceData.notes || null,
          lengthMm,
          widthMm,
          source: pieceData,
        };

        createdPieces.push(createdImportPiece);
        createdRoomPieces.push(createdImportPiece);
      }

      const relationshipLinks = createdRoomPieces
        .map((child) => {
          const relationshipType = inferRelationshipType(child);
          if (!relationshipType || !ATTACHED_RELATIONSHIP_TYPES.has(relationshipType)) return null;

          const joinPosition = inferJoinSide(child, relationshipType);
          if (!joinPosition) return null;

          const parent = findRelationshipParent(child, createdRoomPieces);
          if (!parent) return null;

          return { parent, child, relationshipType, joinPosition };
        })
        .filter((link): link is {
          parent: CreatedImportPiece;
          child: CreatedImportPiece;
          relationshipType: RelationshipType;
          joinPosition: string;
        } => Boolean(link));

      if (relationshipLinks.length > 0) {
        await prisma.$transaction(async (tx) => {
          for (const link of relationshipLinks) {
            await tx.piece_relationships.create({
              data: {
                source_piece_id: link.parent.id,
                target_piece_id: link.child.id,
                relation_type: link.relationshipType,
                relationship_type: link.relationshipType,
                side: link.joinPosition,
              },
            });

            await syncEdgeSemanticsForRelationship(tx, {
              relationshipType: link.relationshipType,
              sourceId: link.parent.id,
              targetId: link.child.id,
              joinPosition: link.joinPosition,
            });
          }
        });
      }
    }

    // Invalidate stale optimizer results — piece data has changed
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });
    await recalculateQuote(quoteId);

    // If sourceAnalysisId is provided, update the analysis record with imported piece IDs
    if (sourceAnalysisId) {
      const analysisId = parseInt(sourceAnalysisId);
      if (!isNaN(analysisId)) {
        const analysis = await prisma.quote_drawing_analyses.findFirst({
          where: {
            id: analysisId,
            quote_id: quoteId,
          },
          select: { id: true },
        });
        if (analysis) {
          await prisma.quote_drawing_analyses.update({
            where: { id: analysis.id },
            data: {
              imported_pieces: createdPieces.map(p => p.id.toString()),
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported: createdPieces.map(piece => ({
        id: piece.id,
        name: piece.name,
        room: piece.room,
      })),
      count: createdPieces.length,
    });

  } catch (error) {
    console.error('Error importing pieces:', error);
    return NextResponse.json(
      { error: 'Failed to import pieces' },
      { status: 500 }
    );
  }
}
