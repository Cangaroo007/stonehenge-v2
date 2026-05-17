import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { normaliseRectEdgeSide, type RectEdgeSide } from '@/lib/utils/edge-side';

const OPPOSITE_EDGE: Record<RectEdgeSide, RectEdgeSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

function edgeListIncludes(edges: unknown, edgeId: string): boolean {
  if (!Array.isArray(edges)) return false;
  const target = edgeId.toLowerCase();
  return edges.some(edge => String(edge).toLowerCase() === target);
}

// PATCH — Bulk update edges on multiple pieces
export async function PATCH(
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

    const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const data = await request.json();
    const { pieceIds, edges } = data as {
      pieceIds: number[];
      edges: {
        top?: string | null;
        bottom?: string | null;
        left?: string | null;
        right?: string | null;
      };
    };

    if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
      return NextResponse.json({ error: 'pieceIds array is required' }, { status: 400 });
    }

    if (!edges || typeof edges !== 'object') {
      return NextResponse.json({ error: 'edges object is required' }, { status: 400 });
    }

    // Fetch all pieces with their materials
    const pieces = await prisma.quote_pieces.findMany({
      where: {
        id: { in: pieceIds },
        quote_rooms: { quote_id: quoteId },
      },
      include: {
        materials: { select: { fabrication_category: true, name: true } },
        sourceRelationships: {
          select: { relation_type: true, relationship_type: true, side: true },
        },
        targetRelationships: {
          select: { relation_type: true, relationship_type: true, side: true },
        },
      },
    });

    if (pieces.length === 0) {
      return NextResponse.json({ error: 'No matching pieces found' }, { status: 404 });
    }

    // Collect all edge type IDs being applied
    const edgeTypeIds = Array.from(new Set(
      [edges.top, edges.bottom, edges.left, edges.right].filter(Boolean) as string[]
    ));

    // Fetch edge type names for compatibility messages
    const edgeTypesMap = new Map<string, string>();
    if (edgeTypeIds.length > 0) {
      const edgeTypes = await prisma.edge_types.findMany({
        where: { id: { in: edgeTypeIds } },
        select: { id: true, name: true },
      });
      for (const et of edgeTypes) {
        edgeTypesMap.set(et.id, et.name);
      }
    }

    // Fetch compatibility rules
    const pricingSettings = await prisma.pricing_settings.findUnique({
      where: { organisation_id: `company-${authResult.user.companyId}` },
    });
    let compatRules: Array<{
      fabricationCategory: string;
      edgeTypeId: string;
      isAllowed: boolean;
      warningMessage: string | null;
    }> = [];

    if (pricingSettings && edgeTypeIds.length > 0) {
      compatRules = await prisma.material_edge_compatibility.findMany({
        where: {
          pricingSettingsId: pricingSettings.id,
          edgeTypeId: { in: edgeTypeIds },
        },
        select: {
          fabricationCategory: true,
          edgeTypeId: true,
          isAllowed: true,
          warningMessage: true,
        },
      });
    }

    let updated = 0;
    let skipped = 0;
    const skippedReasons: string[] = [];

    for (const piece of pieces) {
      // Check material-edge compatibility
      if (piece.materials) {
        const fabCat = piece.materials.fabrication_category;
        const incompatible = compatRules.find(
          (r) => r.fabricationCategory === fabCat && !r.isAllowed
        );
        if (incompatible) {
          const edgeName = edgeTypesMap.get(incompatible.edgeTypeId) || 'Unknown';
          skipped++;
          skippedReasons.push(
            `Skipped ${piece.name} (#${piece.id}) — ${piece.materials.name} does not support ${edgeName}`
          );
          continue;
        }
      }

      // Build update data, skipping wall edges and waterfall/splashback join edges.
      const updateData: Record<string, string | null> = {};
      const requestedEdges = [
        ['top', edges.top, 'edge_top'],
        ['bottom', edges.bottom, 'edge_bottom'],
        ['left', edges.left, 'edge_left'],
        ['right', edges.right, 'edge_right'],
      ] as const;

      for (const [side, profileId, column] of requestedEdges) {
        if (profileId === undefined) continue;

        const isAttachedJoin = [
          ...(piece.sourceRelationships ?? []).map(rel => ({ ...rel, direction: 'SOURCE' as const })),
          ...(piece.targetRelationships ?? []).map(rel => ({ ...rel, direction: 'TARGET' as const })),
        ].some((rel) => {
          const type = rel.relationship_type ?? rel.relation_type;
          if (type !== 'WATERFALL' && type !== 'SPLASHBACK') return false;

          const parentJoinEdge = normaliseRectEdgeSide(rel.side);
          if (!parentJoinEdge) return false;

          const protectedEdge = rel.direction === 'TARGET'
            ? OPPOSITE_EDGE[parentJoinEdge]
            : parentJoinEdge;
          return protectedEdge === side;
        });

        if (edgeListIncludes(piece.no_strip_edges, side) || isAttachedJoin) {
          skippedReasons.push(
            `Skipped ${piece.name} (#${piece.id}) ${side} edge — wall/join edges are protected`
          );
          continue;
        }

        updateData[column] = profileId;
      }

      if (Object.keys(updateData).length === 0) {
        skipped++;
        continue;
      }

      await prisma.quote_pieces.update({
        where: { id: piece.id },
        data: updateData,
      });

      updated++;
    }

    return NextResponse.json({
      updated,
      skipped,
      skippedReasons,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to bulk update edges';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
