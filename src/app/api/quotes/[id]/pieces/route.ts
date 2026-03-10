import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import type { ShapeType, ShapeConfig } from '@/lib/types/shapes';
import { getShapeGeometry } from '@/lib/types/shapes';
import type { Prisma } from '@prisma/client';


// GET - List all pieces for a quote
export async function GET(
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

    // Fetch the quote's calculation_breakdown for piece pricing lookup
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { calculation_breakdown: true },
    });

    // Build pieceId → pricing lookup from breakdown
    const piecePricingMap = new Map<string, { pieceTotal: number; slabCost: number }>();
    if (quote?.calculation_breakdown) {
      const breakdown = quote.calculation_breakdown as unknown as { pieces: Array<{
        pieceId: number;
        pieceTotal: number;
        materials?: { total: number };
      }> };
      for (const p of breakdown.pieces ?? []) {
        piecePricingMap.set(String(p.pieceId), {
          pieceTotal: p.pieceTotal ?? 0,
          slabCost: p.materials?.total ?? 0,
        });
      }
    }

    // Get all rooms with their pieces
    const rooms = await prisma.quote_rooms.findMany({
      where: { quote_id: quoteId },
      orderBy: { sort_order: 'asc' },
      include: {
        quote_pieces: {
          orderBy: { sort_order: 'asc' },
          include: {
            materials: true,
            sourceRelationships: true,
            targetRelationships: true,
          },
        },
      },
    });

    // Flatten pieces with room info, adding camelCase aliases
    const pieces = rooms.flatMap(room =>
      room.quote_pieces.map((piece: any) => {
        const pricing = piecePricingMap.get(String(piece.id));
        return {
          ...piece,
          quote_rooms: { id: room.id, name: room.name },
          // camelCase aliases for client components
          lengthMm: piece.length_mm,
          widthMm: piece.width_mm,
          thicknessMm: piece.thickness_mm,
          materialId: piece.material_id,
          materialName: piece.material_name,
          edgeTop: piece.edge_top,
          edgeBottom: piece.edge_bottom,
          edgeLeft: piece.edge_left,
          edgeRight: piece.edge_right,
          laminationMethod: piece.lamination_method,
          sortOrder: piece.sort_order,
          // K2: Shape camelCase aliases
          shapeType: piece.shape_type || 'RECTANGLE',
          shapeConfig: piece.shape_config || null,
          requiresGrainMatch: piece.requiresGrainMatch ?? false,
          overrideMaterialCost: piece.override_material_cost
            ? Number(piece.override_material_cost)
            : null,
          stripWidthOverrides: (piece.strip_width_overrides as unknown as Record<string, number> | null) ?? null,
          // Pricing from calculation_breakdown (not runtime-calculated)
          pieceTotal: pricing?.pieceTotal ?? null,
          slabCost: pricing?.slabCost ?? null,
          // DEPRECATED field names — kept for backward compatibility with existing consumers.
          // These values are populated from calculation_breakdown, NOT the stale DB columns.
          material_cost: pricing?.slabCost ?? null,
          total_cost: pricing?.pieceTotal ?? null,
          totalCost: pricing?.pieceTotal ?? null,
          areaSqm: Number(piece.area_sqm || 0),
          materialCost: pricing?.slabCost ?? null,
          featuresCost: Number(piece.features_cost || 0),
        };
      })
    );

    return NextResponse.json(pieces);
  } catch (error) {
    console.error('Error fetching pieces:', error);
    return NextResponse.json({ error: 'Failed to fetch pieces' }, { status: 500 });
  }
}

// POST - Create a new piece
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

    const data = await request.json();

    // Load tenant default edge type (if configured)
    const pricingSettingsForDefault = await prisma.pricing_settings.findFirst();
    const tenantDefaultEdge = pricingSettingsForDefault?.default_edge_type_id ?? null;

    const {
      name,
      description,
      lengthMm,
      widthMm,
      thicknessMm = 20,
      materialId,
      materialName,
      roomName = 'Kitchen',
      edgeTop = tenantDefaultEdge,
      edgeBottom = tenantDefaultEdge,
      edgeLeft = tenantDefaultEdge,
      edgeRight = tenantDefaultEdge,
      laminationMethod = 'NONE',
      shapeType = 'RECTANGLE',
      shapeConfig = null,
      requiresGrainMatch,
      promotedFromPieceId,
      promotedEdgePosition,
      pieceType = 'BENCHTOP',
    } = data;

    // Splashback: only top edge is polished — bottom/left/right are hidden (raw)
    const resolvedEdgeTop    = edgeTop;
    const resolvedEdgeBottom = pieceType === 'SPLASHBACK' ? null : edgeBottom;
    const resolvedEdgeLeft   = pieceType === 'SPLASHBACK' ? null : edgeLeft;
    const resolvedEdgeRight  = pieceType === 'SPLASHBACK' ? null : edgeRight;

    // Validate required fields
    if (!name || !lengthMm || !widthMm) {
      return NextResponse.json(
        { error: 'Name, length, and width are required' },
        { status: 400 }
      );
    }

    // Validate lamination method
    const validLaminationMethods = ['NONE', 'LAMINATED', 'MITRED'];
    if (!validLaminationMethods.includes(laminationMethod)) {
      return NextResponse.json(
        { error: `Invalid laminationMethod. Must be one of: ${validLaminationMethods.join(', ')}` },
        { status: 400 }
      );
    }

    // Material → Edge compatibility check
    const edgeCompatibilityWarnings: string[] = [];
    if (materialId) {
      const material = await prisma.materials.findUnique({
        where: { id: materialId },
        select: { fabrication_category: true },
      });

      if (material) {
        const edgeIds = Array.from(new Set(
          [edgeTop, edgeBottom, edgeLeft, edgeRight].filter(Boolean) as string[]
        ));

        if (edgeIds.length > 0) {
          const pricingSettings = await prisma.pricing_settings.findUnique({
            where: { organisation_id: `company-${auth.user.companyId}` },
          });
          if (pricingSettings) {
            const compatibilityRules = await prisma.material_edge_compatibility.findMany({
              where: {
                pricingSettingsId: pricingSettings.id,
                fabricationCategory: material.fabrication_category,
                edgeTypeId: { in: edgeIds },
              },
              include: { edgeType: { select: { name: true } } },
            });

            for (const rule of compatibilityRules) {
              if (!rule.isAllowed) {
                return NextResponse.json(
                  {
                    error: rule.warningMessage || `${rule.edgeType.name} is not available for ${rule.fabricationCategory} materials.`,
                    code: 'EDGE_MATERIAL_INCOMPATIBLE',
                  },
                  { status: 400 }
                );
              }
              if (rule.warningMessage) {
                edgeCompatibilityWarnings.push(rule.warningMessage);
              }
            }
          }
        }
      }
    }

    // Find or create the room
    let room = await prisma.quote_rooms.findFirst({
      where: {
        quote_id: quoteId,
        name: roomName,
      },
    });

    if (!room) {
      // Get the highest sort order
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

    // Calculate area — use shape geometry for L/U shapes (K2)
    const shapeGeo = getShapeGeometry(
      (shapeType || 'RECTANGLE') as ShapeType,
      shapeConfig as unknown as ShapeConfig,
      lengthMm,
      widthMm
    );
    const areaSqm = shapeGeo.totalAreaSqm;

    // Calculate material cost if material is provided
    let materialCost = 0;
    if (materialId) {
      const material = await prisma.materials.findUnique({
        where: { id: materialId },
      });
      if (material) {
        const pricingSettingsForCost = await prisma.pricing_settings.findUnique({
          where: { organisation_id: `company-${auth.user.companyId}` },
        });
        const basis = pricingSettingsForCost?.material_pricing_basis ?? 'PER_SQUARE_METRE';

        if (basis === 'PER_SLAB' && material.slab_length_mm && material.slab_width_mm && material.price_per_slab) {
          const slabAreaSqm = (material.slab_length_mm * material.slab_width_mm) / 1_000_000;
          const slabsNeeded = Math.ceil(areaSqm / slabAreaSqm);
          materialCost = slabsNeeded * material.price_per_slab.toNumber();
        } else {
          materialCost = areaSqm * material.price_per_sqm.toNumber();
        }
      }
    }

    // Create the piece
    const piece = await prisma.quote_pieces.create({
      data: {
        room_id: room.id,
        name,
        description: description || null,
        length_mm: lengthMm,
        width_mm: widthMm,
        thickness_mm: thicknessMm,
        area_sqm: areaSqm,
        material_id: materialId || null,
        material_name: materialName || null,
        // DEPRECATED: material_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        material_cost: materialCost,
        // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        total_cost: materialCost,
        sort_order: (maxPiece?.sort_order ?? -1) + 1,
        cutouts: [],
        edge_top:    resolvedEdgeTop    || null,
        edge_bottom: resolvedEdgeBottom || null,
        edge_left:   resolvedEdgeLeft   || null,
        edge_right:  resolvedEdgeRight  || null,
        ...({ piece_type: pieceType } as any),
        lamination_method: laminationMethod,
        // K2: Shape support — save shape_type and shape_config
        shape_type: shapeType || 'RECTANGLE',
        shape_config: shapeConfig ? (shapeConfig as unknown as Prisma.InputJsonValue) : undefined,
        requiresGrainMatch: requiresGrainMatch ?? false,
        promoted_from_piece_id: promotedFromPieceId ? parseInt(String(promotedFromPieceId), 10) : null,
        promoted_edge_position: promotedEdgePosition || null,
      },
      include: {
        materials: true,
        quote_rooms: true,
      },
    });

    // If this is a promoted strip, add the edge to the parent piece's no_strip_edges
    // so the calculator/optimizer no longer charges lamination or generates a strip for it
    if (promotedFromPieceId && promotedEdgePosition) {
      const parentPiece = await prisma.quote_pieces.findUnique({
        where: { id: parseInt(String(promotedFromPieceId), 10) },
        select: { no_strip_edges: true },
      });
      if (parentPiece) {
        const currentNoStrip = (parentPiece.no_strip_edges as unknown as string[]) ?? [];
        if (!currentNoStrip.includes(promotedEdgePosition)) {
          await prisma.quote_pieces.update({
            where: { id: parseInt(String(promotedFromPieceId), 10) },
            data: {
              no_strip_edges: [...currentNoStrip, promotedEdgePosition] as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
    }

    // Invalidate stale optimizer results — piece data has changed
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    const pieceAny = piece as any;
    return NextResponse.json({
      ...piece,
      quote_rooms: { id: room.id, name: room.name },
      // camelCase aliases for client components
      lengthMm: pieceAny.length_mm,
      widthMm: pieceAny.width_mm,
      thicknessMm: pieceAny.thickness_mm,
      materialId: pieceAny.material_id,
      materialName: pieceAny.material_name,
      edgeTop: pieceAny.edge_top,
      edgeBottom: pieceAny.edge_bottom,
      edgeLeft: pieceAny.edge_left,
      edgeRight: pieceAny.edge_right,
      laminationMethod: pieceAny.lamination_method,
      sortOrder: pieceAny.sort_order,
      // K2: Shape camelCase aliases
      shapeType: pieceAny.shape_type || 'RECTANGLE',
      shapeConfig: pieceAny.shape_config || null,
      requiresGrainMatch: pieceAny.requiresGrainMatch ?? false,
      // DEPRECATED: total_cost/material_cost are unreliable — use quotes.calculation_breakdown
      // Kept for API response shape compatibility. Do not read these values for display.
      totalCost: Number(pieceAny.total_cost || 0),
      areaSqm: Number(pieceAny.area_sqm || 0),
      materialCost: Number(pieceAny.material_cost || 0),
      featuresCost: Number(pieceAny.features_cost || 0),
      promotedFromPieceId: pieceAny.promoted_from_piece_id ?? null,
      promotedEdgePosition: pieceAny.promoted_edge_position ?? null,
      ...(edgeCompatibilityWarnings.length > 0 && { edgeCompatibilityWarnings }),
    });
  } catch (error) {
    console.error('Error creating piece:', error);
    return NextResponse.json({ error: 'Failed to create piece' }, { status: 500 });
  }
}
