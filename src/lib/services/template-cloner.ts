/**
 * Template Cloning Service
 *
 * Takes a unit type template and creates a fully structured quote
 * with rooms, pieces, edges, and cutouts. Material assignments are
 * provided via materialRole → materialId mapping.
 *
 * Supports two calling patterns:
 * 1. Direct: cloneTemplateToQuote() with explicit materialAssignments
 * 2. Finish-based: cloneTemplateToQuoteByFinish() resolves materials from finish tier mapping
 *
 * After creating the quote structure, the pricing calculator is
 * called to price the quote.
 */

import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type {
  TemplateData,
  TemplatePiece,
  TemplateEdge,
  MaterialAssignments,
  EdgeOverrides,
  CloneByFinishOptions,
} from '@/lib/types/unit-templates';
import { calculateQuotePrice } from './pricing-calculator-v2';

export interface CloneOptions {
  templateId: number;
  customerId: number;
  unitNumber: string;
  projectName?: string;
  materialAssignments: Record<string, number>; // materialRole → materialId
  edgeOverrides?: EdgeOverrides;
}

export interface CloneResult {
  quoteId: number;
  totalExGst: number;
  totalIncGst: number;
  pieceCount: number;
}

/**
 * Resolve a TemplateEdge to an edge_type ID from the database.
 * Returns null if the edge is RAW (no finish needed).
 */
async function resolveEdgeTypeId(
  edge: TemplateEdge,
  edgeTypeCache: Map<string, string>
): Promise<string | null> {
  if (edge.finish === 'RAW') {
    return null;
  }

  // Try profile type first (more specific)
  if (edge.profileType) {
    const cacheKey = `profile:${edge.profileType}`;
    if (edgeTypeCache.has(cacheKey)) {
      return edgeTypeCache.get(cacheKey)!;
    }

    const edgeType = await prisma.edge_types.findFirst({
      where: {
        isActive: true,
        name: { contains: edge.profileType.replace(/_/g, ' '), mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (edgeType) {
      edgeTypeCache.set(cacheKey, edgeType.id);
      return edgeType.id;
    }
  }

  // Fall back to finish-based lookup
  const cacheKey = `finish:${edge.finish}`;
  if (edgeTypeCache.has(cacheKey)) {
    return edgeTypeCache.get(cacheKey)!;
  }

  // Map finish to edge category/search
  const edgeType = await prisma.edge_types.findFirst({
    where: {
      isActive: true,
      category: 'polish',
    },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });

  if (edgeType) {
    edgeTypeCache.set(cacheKey, edgeType.id);
    return edgeType.id;
  }

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

  // Extract numeric part and increment
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
 * Apply edge overrides to a template piece's edges.
 * Override edges take priority over the template's defaults.
 */
function applyEdgeOverrides(
  piece: TemplatePiece,
  edgeOverrides?: EdgeOverrides
): { top: TemplateEdge; bottom: TemplateEdge; left: TemplateEdge; right: TemplateEdge } {
  const edges = { ...piece.edges };

  if (edgeOverrides?.[piece.materialRole]?.edges) {
    const overrides = edgeOverrides[piece.materialRole].edges;
    if (overrides.top) edges.top = overrides.top;
    if (overrides.bottom) edges.bottom = overrides.bottom;
    if (overrides.left) edges.left = overrides.left;
    if (overrides.right) edges.right = overrides.right;
  }

  return edges;
}

/**
 * Clone a template into a fully structured quote.
 * Supports optional edge overrides for finish-tier-specific edge profiles.
 */
export async function cloneTemplateToQuote(options: CloneOptions): Promise<CloneResult> {
  const { templateId, customerId, unitNumber, projectName, materialAssignments, edgeOverrides } = options;

  // 1. Load template from DB
  const template = await prisma.unit_type_templates.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  if (!template.isActive) {
    throw new Error(`Template ${templateId} is inactive`);
  }

  // 2. Parse templateData (double cast!)
  const templateData = template.templateData as unknown as TemplateData;

  // 3. Load materials for all assigned roles
  const materialIds = Array.from(new Set(Object.values(materialAssignments)));
  const materials = await prisma.materials.findMany({
    where: { id: { in: materialIds } },
  });
  const materialMap = new Map(materials.map(m => [m.id, m]));

  // Cache for edge type lookups
  const edgeTypeCache = new Map<string, string>();

  // 4. Create quote with rooms and pieces in a transaction
  const quoteNumber = await generateQuoteNumber();

  const result = await prisma.$transaction(async (tx) => {
    // Create the quote
    const quote = await tx.quotes.create({
      data: {
        quote_number: quoteNumber,
        customer_id: customerId,
        project_name: projectName || `${template.name} — Unit ${unitNumber}`,
        status: 'draft',
        subtotal: 0,
        tax_rate: 10,
        tax_amount: 0,
        total: 0,
        updated_at: new Date(),
      },
    });

    let totalPieceCount = 0;

    // For each room in template
    for (let roomIdx = 0; roomIdx < templateData.rooms.length; roomIdx++) {
      const templateRoom = templateData.rooms[roomIdx];

      // Create quote room
      const room = await tx.quote_rooms.create({
        data: {
          quote_id: quote.id,
          name: templateRoom.name,
          sort_order: roomIdx,
        },
      });

      // For each piece in room
      for (let pieceIdx = 0; pieceIdx < templateRoom.pieces.length; pieceIdx++) {
        const templatePiece = templateRoom.pieces[pieceIdx];

        // Apply edge overrides before resolving
        const edges = applyEdgeOverrides(templatePiece, edgeOverrides);

        // Resolve material from role assignment
        const materialId = materialAssignments[templatePiece.materialRole];
        const material = materialId ? materialMap.get(materialId) : null;

        // Calculate area
        const areaSqm = (templatePiece.length_mm * templatePiece.width_mm) / 1_000_000;

        // Calculate material cost
        let materialCost = 0;
        if (material) {
          materialCost = areaSqm * material.price_per_sqm.toNumber();
        }

        // Resolve edge type IDs (using overridden edges)
        const edgeTop = await resolveEdgeTypeId(edges.top, edgeTypeCache);
        const edgeBottom = await resolveEdgeTypeId(edges.bottom, edgeTypeCache);
        const edgeLeft = await resolveEdgeTypeId(edges.left, edgeTypeCache);
        const edgeRight = await resolveEdgeTypeId(edges.right, edgeTypeCache);

        // Determine lamination method from edge finishes
        let laminationMethod: 'NONE' | 'LAMINATED' | 'MITRED' = 'NONE';
        const edgeFinishes = [
          edges.top.finish,
          edges.bottom.finish,
          edges.left.finish,
          edges.right.finish,
        ];
        if (edgeFinishes.includes('MITRED')) {
          laminationMethod = 'MITRED';
        } else if (edgeFinishes.includes('LAMINATED')) {
          laminationMethod = 'LAMINATED';
        }

        // Build cutouts JSON
        const cutoutsJson = templatePiece.cutouts.map(c => ({
          type: c.type,
          quantity: c.quantity,
        }));

        // Create quote piece
        await tx.quote_pieces.create({
          data: {
            room_id: room.id,
            name: templatePiece.label,
            description: templatePiece.notes || null,
            length_mm: templatePiece.length_mm,
            width_mm: templatePiece.width_mm,
            thickness_mm: templatePiece.thickness_mm,
            area_sqm: areaSqm,
            material_id: materialId || null,
            material_name: material?.name || null,
            material_cost: materialCost,
            total_cost: materialCost,
            sort_order: pieceIdx,
            cutouts: cutoutsJson as unknown as Prisma.InputJsonValue,
            edge_top: edgeTop,
            edge_bottom: edgeBottom,
            edge_left: edgeLeft,
            edge_right: edgeRight,
            lamination_method: laminationMethod,
          },
        });

        totalPieceCount++;
      }
    }

    return { quoteId: quote.id, pieceCount: totalPieceCount };
  });

  // 5. Run pricing calculator on the new quote
  let totalExGst = 0;
  let totalIncGst = 0;

  try {
    const pricingResult = await calculateQuotePrice(String(result.quoteId));
    totalExGst = pricingResult.subtotal;
    // GST rate is typically 10%
    totalIncGst = Math.round(totalExGst * 1.1 * 100) / 100;

    // Update quote with calculated totals
    await prisma.quotes.update({
      where: { id: result.quoteId },
      data: {
        subtotal: totalExGst,
        tax_amount: Math.round(totalExGst * 0.1 * 100) / 100,
        total: totalIncGst,
        calculated_at: new Date(),
        calculation_breakdown: pricingResult.breakdown as unknown as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
  } catch (pricingError) {
    // Pricing may fail if settings aren't configured — still return the created quote
    console.warn('Template cloner: pricing calculation failed, quote created without pricing:', pricingError);
  }

  return {
    quoteId: result.quoteId,
    totalExGst,
    totalIncGst,
    pieceCount: result.pieceCount,
  };
}

/**
 * Clone a template to a quote by resolving materials from a finish tier mapping.
 * Used by bulk generation — looks up the mapping for the given finish level.
 *
 * Resolution strategy:
 * 1. Try exact match: templateId + finishLevel + colourScheme
 * 2. Fall back to: templateId + finishLevel (colourScheme=null)
 * 3. If no match found, throw with helpful error
 */
export async function cloneTemplateToQuoteByFinish(
  options: CloneByFinishOptions
): Promise<CloneResult> {
  const { templateId, finishLevel, colourScheme } = options;

  // Try exact match first (with colourScheme)
  let mapping = colourScheme
    ? await prisma.finish_tier_mappings.findFirst({
        where: {
          templateId,
          finishLevel,
          colourScheme,
          isActive: true,
        },
      })
    : null;

  // Fall back to finishLevel-only match (colourScheme=null)
  if (!mapping) {
    mapping = await prisma.finish_tier_mappings.findFirst({
      where: {
        templateId,
        finishLevel,
        colourScheme: null,
        isActive: true,
      },
    });
  }

  if (!mapping) {
    throw new Error(
      `No active finish tier mapping found for template ${templateId} ` +
      `with finishLevel="${finishLevel}"${colourScheme ? ` and colourScheme="${colourScheme}"` : ''}`
    );
  }

  const materialAssignments = mapping.materialAssignments as unknown as MaterialAssignments;
  const edgeOverrides = mapping.edgeOverrides as unknown as EdgeOverrides | null;

  return cloneTemplateToQuote({
    ...options,
    materialAssignments,
    edgeOverrides: edgeOverrides ?? undefined,
  });
}
