import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type {
  TemplateData,
  TemplateRoom,
  TemplatePiece,
  MaterialAssignments,
  EdgeOverrides,
  CloneByMaterialOptions,
  CloneByFinishOptions,
} from '@/lib/types/unit-templates';

interface CloneResult {
  quoteId: number;
  quoteNumber: string;
  roomsCreated: number;
  piecesCreated: number;
}

/**
 * Generate a unique quote number for cloned quotes.
 * Format: CLN-YYYYMMDD-NNNN (random 4-digit suffix)
 */
function generateCloneQuoteNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CLN-${datePart}-${rand}`;
}

/**
 * Clone a template to a quote using explicit material assignments.
 * This is the direct-use pattern where the caller provides material mappings.
 */
export async function cloneTemplateToQuote(
  options: CloneByMaterialOptions
): Promise<CloneResult> {
  const { templateId, customerId, unitNumber, projectName, materialAssignments, edgeOverrides } = options;

  const template = await prisma.unit_type_templates.findUnique({
    where: { id: templateId },
  });
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  const templateData = template.templateData as unknown as TemplateData;
  if (!templateData?.rooms || templateData.rooms.length === 0) {
    throw new Error(`Template ${templateId} has no rooms defined`);
  }

  // Validate all materialIds exist
  const materialIds = Array.from(new Set(Object.values(materialAssignments)));
  if (materialIds.length > 0) {
    const existingMaterials = await prisma.materials.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, name: true },
    });
    const existingIds = new Set(existingMaterials.map((m) => m.id));
    const missingIds = materialIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(`Material IDs not found: ${missingIds.join(', ')}`);
    }
  }

  // Fetch material names for the pieces
  const materials = materialIds.length > 0
    ? await prisma.materials.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, name: true },
      })
    : [];
  const materialNameMap = new Map(materials.map((m) => [m.id, m.name]));

  // Build rooms and pieces from template
  let totalPieces = 0;
  const roomsData = templateData.rooms.map((room: TemplateRoom, roomIndex: number) => {
    const pieces = room.pieces.map((piece: TemplatePiece, pieceIndex: number) => {
      totalPieces++;

      // Resolve material for this piece
      const materialId = materialAssignments[piece.materialRole] ?? null;
      const materialName = materialId ? (materialNameMap.get(materialId) ?? null) : null;

      // Start with template edges
      const edges = {
        top: piece.edges?.top?.finish ?? null,
        bottom: piece.edges?.bottom?.finish ?? null,
        left: piece.edges?.left?.finish ?? null,
        right: piece.edges?.right?.finish ?? null,
      };

      // Apply edge overrides if present for this materialRole
      if (edgeOverrides?.[piece.materialRole]?.edges) {
        const roleOverrides = edgeOverrides[piece.materialRole].edges;
        if (roleOverrides.top) edges.top = roleOverrides.top.finish;
        if (roleOverrides.bottom) edges.bottom = roleOverrides.bottom.finish;
        if (roleOverrides.left) edges.left = roleOverrides.left.finish;
        if (roleOverrides.right) edges.right = roleOverrides.right.finish;
      }

      // Build cutouts JSON
      const cutoutsJson = (piece.cutouts ?? []).map((c) => ({
        type: c.type,
        quantity: c.quantity,
      }));

      const areaSqm = (piece.length_mm * piece.width_mm) / 1_000_000;

      return {
        name: piece.name,
        description: piece.name,
        length_mm: piece.length_mm,
        width_mm: piece.width_mm,
        thickness_mm: piece.thickness_mm,
        area_sqm: areaSqm,
        material_id: materialId,
        material_name: materialName,
        material_cost: 0,
        features_cost: 0,
        total_cost: 0,
        sort_order: pieceIndex,
        edge_top: edges.top,
        edge_bottom: edges.bottom,
        edge_left: edges.left,
        edge_right: edges.right,
        cutouts: cutoutsJson as unknown as Prisma.InputJsonValue,
        lamination_method: (piece.laminationMethod as 'NONE' | 'LAMINATED' | 'MITRED') ?? 'NONE',
      };
    });

    return {
      name: room.name,
      sort_order: roomIndex,
      quote_pieces: {
        create: pieces,
      },
    };
  });

  // Generate quote number
  const quoteNumber = generateCloneQuoteNumber();

  // Create quote with nested rooms and pieces
  const quote = await prisma.quotes.create({
    data: {
      quote_number: quoteNumber,
      customer_id: customerId,
      project_name: projectName ?? `Unit ${unitNumber}`,
      status: 'draft',
      subtotal: 0,
      tax_rate: 10,
      tax_amount: 0,
      total: 0,
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes: `Cloned from template ${template.name} for unit ${unitNumber}`,
      quote_rooms: {
        create: roomsData,
      },
    } as unknown as Prisma.quotesCreateInput,
  });

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    roomsCreated: templateData.rooms.length,
    piecesCreated: totalPieces,
  };
}

/**
 * Clone a template to a quote by resolving materials from a finish tier mapping.
 * Used by bulk generation — looks up the mapping for the given finish level.
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
