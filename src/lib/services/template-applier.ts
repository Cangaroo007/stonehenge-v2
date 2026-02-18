/**
 * Template Applier Service
 *
 * Takes a starter template and creates actual quote pieces from it.
 * Material assignments are provided as role → materialId mappings.
 *
 * Does NOT run the pricing calculator — that is triggered separately
 * by the UI when the quote is loaded.
 */

import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type {
  StarterTemplateData,
  StarterTemplatePiece,
  ApplyTemplateRequest,
  ApplyTemplateResult,
  MaterialRole,
} from '@/lib/types/starter-templates';
import { inferMaterialRole } from '@/lib/types/starter-templates';

/**
 * Resolve a simple edge string (from seed data) to an edge_type ID.
 * Returns null for "raw" edges (no finish).
 */
async function resolveEdgeString(
  edgeValue: string,
  edgeTypeCache: Map<string, string | null>
): Promise<string | null> {
  const normalized = edgeValue.toLowerCase().trim();

  if (normalized === 'raw' || normalized === '') {
    return null;
  }

  if (edgeTypeCache.has(normalized)) {
    return edgeTypeCache.get(normalized)!;
  }

  // Try to find matching edge type by name (case-insensitive)
  const edgeType = await prisma.edge_types.findFirst({
    where: {
      isActive: true,
      name: { contains: normalized, mode: 'insensitive' },
    },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });

  if (edgeType) {
    edgeTypeCache.set(normalized, edgeType.id);
    return edgeType.id;
  }

  // Fall back to first active polish edge type for "polished"
  if (normalized === 'polished') {
    const polishEdge = await prisma.edge_types.findFirst({
      where: {
        isActive: true,
        category: 'polish',
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });

    if (polishEdge) {
      edgeTypeCache.set(normalized, polishEdge.id);
      return polishEdge.id;
    }
  }

  edgeTypeCache.set(normalized, null);
  return null;
}

/**
 * Generate a unique quote number.
 */
async function generateQuoteNumber(): Promise<string> {
  const latest = await prisma.quotes.findFirst({
    orderBy: { id: 'desc' },
    select: { quote_number: true },
  });

  if (latest?.quote_number) {
    const match = latest.quote_number.match(/(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1], 10) + 1;
      return `Q-${String(nextNum).padStart(5, '0')}`;
    }
  }

  return 'Q-00001';
}

/**
 * Apply a starter template to create pieces on a quote.
 * If no quoteId is provided, creates a new quote.
 */
export async function applyTemplateToQuote(
  request: ApplyTemplateRequest
): Promise<ApplyTemplateResult> {
  const { templateId, materialAssignments, quoteId, customerId, contactId, projectName } = request;

  // 1. Load template
  const template = await prisma.starter_templates.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // 2. Parse templateData (double cast)
  const templateData = template.templateData as unknown as StarterTemplateData;
  const rooms = templateData.rooms || [];

  if (rooms.length === 0) {
    throw new Error('Template has no rooms defined');
  }

  // 3. Load materials for all assigned roles
  const materialIds = Array.from(new Set(Object.values(materialAssignments)));
  const materials = await prisma.materials.findMany({
    where: { id: { in: materialIds } },
  });
  const materialMap = new Map(materials.map(m => [m.id, m]));

  // Cache for edge type lookups
  const edgeTypeCache = new Map<string, string | null>();

  // 4. Determine target quote
  let targetQuoteId: number;
  let roomsCreated = 0;

  if (quoteId) {
    // Verify quote exists
    const existingQuote = await prisma.quotes.findUnique({
      where: { id: quoteId },
    });
    if (!existingQuote) {
      throw new Error(`Quote not found: ${quoteId}`);
    }
    targetQuoteId = quoteId;
  } else {
    // Need customerId to create new quote
    if (!customerId) {
      throw new Error('customerId is required when creating a new quote');
    }
    targetQuoteId = -1; // Will be set inside transaction
  }

  // 5. Create pieces in a transaction
  const result = await prisma.$transaction(async (tx) => {
    let actualQuoteId = targetQuoteId;

    // Create new quote if needed
    if (actualQuoteId === -1) {
      const quoteNumber = await generateQuoteNumber();
      const newQuote = await tx.quotes.create({
        data: {
          quote_number: quoteNumber,
          customer_id: customerId!,
          contact_id: contactId || null,
          project_name: projectName || template.name,
          status: 'draft',
          subtotal: 0,
          tax_rate: 10,
          tax_amount: 0,
          total: 0,
          updated_at: new Date(),
        },
      });
      actualQuoteId = newQuote.id;
    }

    let piecesCreated = 0;
    let totalAreaSqm = 0;

    // Get existing room count for sort_order offset
    const existingRoomCount = await tx.quote_rooms.count({
      where: { quote_id: actualQuoteId },
    });

    // Track created pieces by name for relationship linking
    const pieceIdsByName = new Map<string, number>();

    for (let roomIdx = 0; roomIdx < rooms.length; roomIdx++) {
      const templateRoom = rooms[roomIdx];

      // Create room
      const room = await tx.quote_rooms.create({
        data: {
          quote_id: actualQuoteId,
          name: templateRoom.name,
          sort_order: existingRoomCount + roomIdx,
        },
      });
      roomsCreated++;

      // Create pieces in this room
      for (let pieceIdx = 0; pieceIdx < templateRoom.pieces.length; pieceIdx++) {
        const templatePiece = templateRoom.pieces[pieceIdx];

        // Resolve material from role assignment
        const role = templatePiece.materialRole || inferMaterialRole(templateRoom.name, templatePiece.pieceType);
        const materialId = materialAssignments[role as MaterialRole];
        const material = materialId ? materialMap.get(materialId) : null;

        // Skip piece if no material assigned and role is required
        // (but still create it with null material — don't throw)

        // Calculate area
        const areaSqm = (templatePiece.lengthMm * templatePiece.widthMm) / 1_000_000;
        totalAreaSqm += areaSqm;

        // Resolve edge type IDs
        const edgeTop = await resolveEdgeString(templatePiece.edges.top, edgeTypeCache);
        const edgeBottom = await resolveEdgeString(templatePiece.edges.bottom, edgeTypeCache);
        const edgeLeft = await resolveEdgeString(templatePiece.edges.left, edgeTypeCache);
        const edgeRight = await resolveEdgeString(templatePiece.edges.right, edgeTypeCache);

        // Build cutouts JSON
        const cutoutsJson = templatePiece.cutouts.map(c => ({
          type: c.type,
          quantity: c.quantity,
        }));

        // Determine waterfall height if applicable
        const waterfallHeightMm = templatePiece.pieceType === 'WATERFALL'
          ? templatePiece.lengthMm
          : null;

        // Create the piece
        const piece = await tx.quote_pieces.create({
          data: {
            room_id: room.id,
            name: templatePiece.name,
            description: templatePiece.notes || null,
            length_mm: templatePiece.lengthMm,
            width_mm: templatePiece.widthMm,
            thickness_mm: templatePiece.thicknessMm,
            area_sqm: areaSqm,
            material_id: materialId || null,
            material_name: material?.name || null,
            material_cost: 0,
            features_cost: 0,
            total_cost: 0,
            sort_order: pieceIdx,
            cutouts: cutoutsJson as unknown as Prisma.InputJsonValue,
            edge_top: edgeTop,
            edge_bottom: edgeBottom,
            edge_left: edgeLeft,
            edge_right: edgeRight,
            lamination_method: 'NONE',
            waterfall_height_mm: waterfallHeightMm,
          },
        });

        // Track for relationships
        pieceIdsByName.set(templatePiece.name, piece.id);
        piecesCreated++;
      }

      // Create piece relationships after all pieces in the room exist
      for (const templatePiece of templateRoom.pieces) {
        if (templatePiece.relatedTo) {
          const sourcePieceId = pieceIdsByName.get(templatePiece.relatedTo.pieceName);
          const targetPieceId = pieceIdsByName.get(templatePiece.name);

          if (sourcePieceId && targetPieceId) {
            try {
              await tx.piece_relationships.create({
                data: {
                  source_piece_id: sourcePieceId,
                  target_piece_id: targetPieceId,
                  relation_type: templatePiece.relatedTo.relationType,
                },
              });
            } catch (err) {
              console.error('Failed to create piece relationship:', err);
              // Continue without failing the whole operation
            }
          }
        }
      }
    }

    return {
      quoteId: actualQuoteId,
      piecesCreated,
      roomsCreated,
      totalAreaSqm: Math.round(totalAreaSqm * 100) / 100,
    };
  });

  return result;
}
