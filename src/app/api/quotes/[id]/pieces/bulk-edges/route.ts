import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

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
      // Check mitred constraint
      if (piece.lamination_method === 'MITRED') {
        const nonPencilEdge = edgeTypeIds.find((etId) => {
          const name = edgeTypesMap.get(etId) || '';
          return !name.toLowerCase().includes('pencil') && !name.toLowerCase().includes('raw');
        });
        if (nonPencilEdge) {
          skipped++;
          skippedReasons.push(
            `Skipped ${piece.name} (#${piece.id}) — mitred edges only support Pencil Round`
          );
          continue;
        }
      }

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

      // Build update data
      const updateData: Record<string, string | null> = {};
      if (edges.top !== undefined) updateData.edge_top = edges.top;
      if (edges.bottom !== undefined) updateData.edge_bottom = edges.bottom;
      if (edges.left !== undefined) updateData.edge_left = edges.left;
      if (edges.right !== undefined) updateData.edge_right = edges.right;

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
