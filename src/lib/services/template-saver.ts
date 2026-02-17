/**
 * Template Saver Service
 *
 * Takes an existing quote's pieces and captures them as a reusable
 * starter template. This is the reverse of template-applier.
 *
 * Edge type IDs are resolved back to simple string names for the template format.
 * Material IDs are replaced with material roles based on room/piece context.
 */

import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type {
  StarterTemplateData,
  StarterTemplateRoom,
  StarterTemplatePiece,
  StarterTemplateCutout,
  SaveAsTemplateRequest,
} from '@/lib/types/starter-templates';
import { inferMaterialRole } from '@/lib/types/starter-templates';

/**
 * Resolve an edge_type ID back to a simple string name for template storage.
 * Returns "raw" if no edge type ID is set (null).
 */
async function resolveEdgeIdToString(
  edgeTypeId: string | null,
  edgeNameCache: Map<string, string>
): Promise<string> {
  if (!edgeTypeId) {
    return 'raw';
  }

  if (edgeNameCache.has(edgeTypeId)) {
    return edgeNameCache.get(edgeTypeId)!;
  }

  const edgeType = await prisma.edge_types.findUnique({
    where: { id: edgeTypeId },
    select: { name: true, category: true },
  });

  if (edgeType) {
    // Use the edge type name in lowercase for template format
    const name = edgeType.name.toLowerCase();
    edgeNameCache.set(edgeTypeId, name);
    return name;
  }

  edgeNameCache.set(edgeTypeId, 'polished');
  return 'polished';
}

/**
 * Save an existing quote's pieces as a reusable starter template.
 */
export async function saveQuoteAsTemplate(
  request: SaveAsTemplateRequest,
  companyId: number,
  userId: number
): Promise<{ templateId: string; name: string; pieceCount: number }> {
  const { quoteId, name, description, category } = request;

  // 1. Load the quote with all rooms, pieces
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      quote_rooms: {
        orderBy: { sort_order: 'asc' },
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
          },
        },
      },
    },
  });

  if (!quote) {
    throw new Error(`Quote not found: ${quoteId}`);
  }

  if (quote.quote_rooms.length === 0) {
    throw new Error('Quote has no rooms — cannot save as template');
  }

  // Cache for edge ID → name resolution
  const edgeNameCache = new Map<string, string>();

  // 2. Build the template structure
  const templateRooms: StarterTemplateRoom[] = [];
  let totalPieceCount = 0;

  for (const room of quote.quote_rooms) {
    const pieces: StarterTemplatePiece[] = [];

    for (const piece of room.quote_pieces) {
      // Resolve edges back to template string format
      const edgeTop = await resolveEdgeIdToString(piece.edge_top, edgeNameCache);
      const edgeBottom = await resolveEdgeIdToString(piece.edge_bottom, edgeNameCache);
      const edgeLeft = await resolveEdgeIdToString(piece.edge_left, edgeNameCache);
      const edgeRight = await resolveEdgeIdToString(piece.edge_right, edgeNameCache);

      // Parse cutouts from JSON
      const rawCutouts = piece.cutouts as unknown as StarterTemplateCutout[];
      const cutouts: StarterTemplateCutout[] = Array.isArray(rawCutouts)
        ? rawCutouts.map(c => ({ type: c.type, quantity: c.quantity }))
        : [];

      // Determine piece type from name/context
      const pieceType = inferPieceType(piece.name, room.name);

      // Infer material role
      const materialRole = inferMaterialRole(room.name, pieceType);

      pieces.push({
        name: piece.name,
        pieceType,
        lengthMm: piece.length_mm,
        widthMm: piece.width_mm,
        thicknessMm: piece.thickness_mm,
        edges: {
          top: edgeTop,
          bottom: edgeBottom,
          left: edgeLeft,
          right: edgeRight,
        },
        cutouts,
        materialRole,
      });

      totalPieceCount++;
    }

    templateRooms.push({
      name: room.name,
      pieces,
    });
  }

  // 3. Build full StarterTemplateData structure
  const templateData: StarterTemplateData = {
    name,
    description: description || '',
    category: category || inferCategory(quote.quote_rooms.map(r => r.name)),
    isBuiltIn: false,
    rooms: templateRooms,
  };

  // 4. Create starter_templates record
  const template = await prisma.starter_templates.create({
    data: {
      companyId,
      name: name.trim(),
      description: description || null,
      category: category || inferCategory(quote.quote_rooms.map(r => r.name)),
      isBuiltIn: false,
      isShared: true,
      templateData: templateData as unknown as Prisma.InputJsonValue,
      createdById: userId,
    },
  });

  return {
    templateId: template.id,
    name: template.name,
    pieceCount: totalPieceCount,
  };
}

/**
 * Infer piece type from piece name and room context.
 */
function inferPieceType(pieceName: string, roomName: string): string {
  const upper = pieceName.toUpperCase();

  if (upper.includes('ISLAND')) return 'ISLAND';
  if (upper.includes('SPLASHBACK')) return 'SPLASHBACK';
  if (upper.includes('WATERFALL')) return 'WATERFALL';
  if (upper.includes('VANITY')) return 'VANITY';
  if (upper.includes('WINDOWSILL') || upper.includes('WINDOW SILL')) return 'WINDOWSILL';

  const upperRoom = roomName.toUpperCase();
  if (upperRoom.includes('BATHROOM') || upperRoom.includes('ENSUITE')) {
    if (upper.includes('TOP') || upper.includes('BENCH')) return 'VANITY';
  }

  return 'BENCHTOP';
}

/**
 * Infer template category from room names.
 */
function inferCategory(roomNames: string[]): string {
  const upper = roomNames.map(n => n.toUpperCase());

  const hasKitchen = upper.some(n => n.includes('KITCHEN'));
  const hasBathroom = upper.some(n => n.includes('BATHROOM') || n.includes('ENSUITE'));
  const hasLaundry = upper.some(n => n.includes('LAUNDRY'));

  const roomCount = roomNames.length;

  if (roomCount > 1) return 'multi-room';
  if (hasKitchen) return 'kitchen';
  if (hasBathroom) return 'bathroom';
  if (hasLaundry) return 'laundry';

  return 'kitchen';
}
