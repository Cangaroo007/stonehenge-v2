import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';

// GET - Get a single piece with full detail for expanded view
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, pieceId } = await params;
    const quoteId = parseInt(id);
    const pieceIdNum = parseInt(pieceId);

    if (isNaN(quoteId) || isNaN(pieceIdNum)) {
      return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 });
    }

    // Verify quote belongs to user's company
    const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Validate quote exists and get calculation data
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        quote_number: true,
        calculation_breakdown: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const piece = await prisma.quote_pieces.findUnique({
      where: { id: pieceIdNum },
      include: {
        materials: {
          select: {
            id: true,
            name: true,
            collection: true,
            fabrication_category: true,
            price_per_sqm: true,
            price_per_slab: true,
          },
        },
        quote_rooms: {
          select: {
            id: true,
            name: true,
            quote_id: true,
          },
        },
        piece_features: true,
        sourceRelationships: {
          include: {
            targetPiece: {
              select: { id: true, name: true, length_mm: true, width_mm: true, thickness_mm: true },
            },
          },
        },
        targetRelationships: {
          include: {
            sourcePiece: {
              select: { id: true, name: true, length_mm: true, width_mm: true, thickness_mm: true },
            },
          },
        },
      },
    });

    if (!piece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    // Verify piece belongs to the requested quote
    if (piece.quote_rooms.quote_id !== quoteId) {
      return NextResponse.json({ error: 'Piece not found in this quote' }, { status: 404 });
    }

    // Resolve edge type names
    const edgeIds = Array.from(new Set(
      [piece.edge_top, piece.edge_bottom, piece.edge_left, piece.edge_right].filter(Boolean) as string[]
    ));
    const edgeTypesMap = new Map<string, { id: string; name: string; category: string }>();
    if (edgeIds.length > 0) {
      const edgeTypes = await prisma.edge_types.findMany({
        where: { id: { in: edgeIds } },
        select: { id: true, name: true, category: true },
      });
      for (const et of edgeTypes) {
        edgeTypesMap.set(et.id, et);
      }
    }

    // Extract per-piece cost breakdown from quote calculation_breakdown
    let costBreakdown = null;
    if (quote.calculation_breakdown) {
      const calcData = quote.calculation_breakdown as unknown as {
        breakdown?: { pieces?: Array<{ pieceId: number; [key: string]: unknown }> };
      };
      if (calcData.breakdown?.pieces) {
        costBreakdown = calcData.breakdown.pieces.find(
          (pb) => pb.pieceId === pieceIdNum
        ) ?? null;
      }
    }

    // Build related pieces array (?? [] guards against missing relation data)
    const relatedPieces = [
      ...(piece.sourceRelationships ?? []).map((r) => ({
        id: r.id,
        relationType: r.relation_type,
        side: r.side,
        piece: {
          id: r.targetPiece.id,
          name: r.targetPiece.name,
          lengthMm: r.targetPiece.length_mm,
          widthMm: r.targetPiece.width_mm,
          thicknessMm: r.targetPiece.thickness_mm,
        },
      })),
      ...(piece.targetRelationships ?? []).map((r) => ({
        id: r.id,
        relationType: r.relation_type,
        side: r.side,
        piece: {
          id: r.sourcePiece.id,
          name: r.sourcePiece.name,
          lengthMm: r.sourcePiece.length_mm,
          widthMm: r.sourcePiece.width_mm,
          thicknessMm: r.sourcePiece.thickness_mm,
        },
      })),
    ];

    const resolveEdge = (edgeId: string | null) => {
      if (!edgeId) return null;
      const et = edgeTypesMap.get(edgeId);
      return et ? { id: et.id, name: et.name, category: et.category } : { id: edgeId, name: edgeId, category: 'unknown' };
    };

    const p = piece as unknown as Record<string, unknown>;
    return NextResponse.json({
      ...piece,
      quote_rooms: { id: piece.quote_rooms.id, name: piece.quote_rooms.name },
      quoteNumber: quote.quote_number,
      // camelCase aliases for client components
      lengthMm: p.length_mm,
      widthMm: p.width_mm,
      thicknessMm: p.thickness_mm,
      materialId: p.material_id,
      materialName: p.material_name,
      edgeTop: p.edge_top,
      edgeBottom: p.edge_bottom,
      edgeLeft: p.edge_left,
      edgeRight: p.edge_right,
      laminationMethod: p.lamination_method,
      sortOrder: p.sort_order,
      requiresGrainMatch: piece.requiresGrainMatch ?? false,
      // DEPRECATED: total_cost/material_cost are unreliable — use quotes.calculation_breakdown
      // Kept for API response shape compatibility. Do not read these values for display.
      totalCost: Number(p.total_cost || 0),
      areaSqm: Number(p.area_sqm || 0),
      materialCost: Number(p.material_cost || 0),
      featuresCost: Number(p.features_cost || 0),
      // Extra detail for expanded view
      edgeDetails: {
        top: resolveEdge(piece.edge_top),
        bottom: resolveEdge(piece.edge_bottom),
        left: resolveEdge(piece.edge_left),
        right: resolveEdge(piece.edge_right),
      },
      materialDetails: piece.materials
        ? {
            id: piece.materials.id,
            name: piece.materials.name,
            collection: piece.materials.collection,
            fabricationCategory: piece.materials.fabrication_category,
            pricePerSqm: Number(piece.materials.price_per_sqm),
            pricePerSlab: Number(piece.materials.price_per_slab),
          }
        : null,
      relatedPieces,
      costBreakdown,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to fetch piece', details: msg }, { status: 500 });
  }
}

// PATCH - Update piece and trigger recalculation
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, pieceId } = await params;
    const quoteId = parseInt(id);
    const pieceIdNum = parseInt(pieceId);

    if (isNaN(quoteId) || isNaN(pieceIdNum)) {
      return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 });
    }

    // Verify quote belongs to user's company
    const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const data = await request.json();
    const {
      name,
      description,
      lengthMm,
      widthMm,
      thicknessMm,
      materialId,
      materialName,
      roomName,
      edgeTop,
      edgeBottom,
      edgeLeft,
      edgeRight,
      cutouts,
      laminationMethod,
      requiresGrainMatch,
    } = data;

    // Get the current piece
    const currentPiece = await prisma.quote_pieces.findUnique({
      where: { id: pieceIdNum },
      include: { quote_rooms: true },
    });

    if (!currentPiece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    // Verify piece belongs to the requested quote
    if (currentPiece.quote_rooms.quote_id !== quoteId) {
      return NextResponse.json({ error: 'Piece not found in this quote' }, { status: 404 });
    }

    // Validate lamination method if provided
    if (laminationMethod !== undefined) {
      const validLaminationMethods = ['NONE', 'LAMINATED', 'MITRED'];
      if (!validLaminationMethods.includes(laminationMethod)) {
        return NextResponse.json(
          { error: `Invalid laminationMethod. Must be one of: ${validLaminationMethods.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Mitred constraint
    const effectiveLamination = laminationMethod ?? currentPiece.lamination_method;
    if (effectiveLamination === 'MITRED') {
      const effectiveEdges = [
        edgeTop !== undefined ? edgeTop : currentPiece.edge_top,
        edgeBottom !== undefined ? edgeBottom : currentPiece.edge_bottom,
        edgeLeft !== undefined ? edgeLeft : currentPiece.edge_left,
        edgeRight !== undefined ? edgeRight : currentPiece.edge_right,
      ].filter(Boolean);

      if (effectiveEdges.length > 0) {
        const edgeTypes = await prisma.edge_types.findMany({
          where: { id: { in: effectiveEdges } },
          select: { id: true, name: true },
        });
        for (const et of edgeTypes) {
          const nameLower = et.name.toLowerCase();
          if (!nameLower.includes('pencil') && !nameLower.includes('raw')) {
            return NextResponse.json(
              {
                error: `Mitred edges only support Pencil Round profile. Found "${et.name}".`,
                code: 'MITRED_PROFILE_CONSTRAINT',
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // Handle room change if needed
    let roomId = currentPiece.room_id;
    if (roomName && roomName !== currentPiece.quote_rooms.name) {
      let newRoom = await prisma.quote_rooms.findFirst({
        where: { quote_id: quoteId, name: roomName },
      });
      if (!newRoom) {
        const maxRoom = await prisma.quote_rooms.findFirst({
          where: { quote_id: quoteId },
          orderBy: { sort_order: 'desc' },
        });
        newRoom = await prisma.quote_rooms.create({
          data: {
            quote_id: quoteId,
            name: roomName,
            sort_order: (maxRoom?.sort_order ?? -1) + 1,
          },
        });
      }
      roomId = newRoom.id;
    }

    // Calculate area
    const length = lengthMm ?? currentPiece.length_mm;
    const width = widthMm ?? currentPiece.width_mm;
    const areaSqm = (length * width) / 1_000_000;

    // Calculate material cost
    let materialCost = 0;
    const matId = materialId !== undefined ? materialId : currentPiece.material_id;
    if (matId) {
      const material = await prisma.materials.findUnique({ where: { id: matId } });
      if (material) {
        const pricingSettingsForCost = await prisma.pricing_settings.findUnique({
          where: { organisation_id: `company-${authResult.user.companyId}` },
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

    // Update the piece
    const updatedPiece = await prisma.quote_pieces.update({
      where: { id: pieceIdNum },
      data: {
        room_id: roomId,
        name: name ?? currentPiece.name,
        description: description !== undefined ? description : currentPiece.description,
        length_mm: length,
        width_mm: width,
        thickness_mm: thicknessMm ?? currentPiece.thickness_mm,
        area_sqm: areaSqm,
        material_id: matId,
        material_name: materialName !== undefined ? materialName : currentPiece.material_name,
        // DEPRECATED: material_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        material_cost: materialCost,
        // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        total_cost: materialCost + currentPiece.features_cost.toNumber(),
        edge_top: edgeTop !== undefined ? edgeTop : currentPiece.edge_top,
        edge_bottom: edgeBottom !== undefined ? edgeBottom : currentPiece.edge_bottom,
        edge_left: edgeLeft !== undefined ? edgeLeft : currentPiece.edge_left,
        edge_right: edgeRight !== undefined ? edgeRight : currentPiece.edge_right,
        cutouts: cutouts !== undefined ? cutouts : currentPiece.cutouts,
        lamination_method: laminationMethod !== undefined ? laminationMethod : currentPiece.lamination_method,
        requiresGrainMatch: requiresGrainMatch !== undefined ? requiresGrainMatch : currentPiece.requiresGrainMatch,
      },
      include: {
        materials: true,
        quote_rooms: true,
      },
    });

    // Invalidate stale optimizer results — piece data has changed
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    // Clean up empty rooms
    const oldRoomPiecesCount = await prisma.quote_pieces.count({
      where: { room_id: currentPiece.room_id },
    });
    if (oldRoomPiecesCount === 0 && currentPiece.room_id !== roomId) {
      await prisma.quote_rooms.delete({ where: { id: currentPiece.room_id } });
    }

    // Trigger recalculation and persist to keep calculation_breakdown current
    // Uses same pattern as POST /api/quotes/[id]/calculate
    let calcResult = null;
    try {
      calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });

      // Persist recalculation results to DB
      await prisma.quotes.update({
        where: { id: quoteId },
        data: {
          subtotal: calcResult.subtotal,
          tax_amount: calcResult.gstAmount,
          total: calcResult.totalIncGst,
          calculated_at: new Date(),
          calculation_breakdown: calcResult as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (recalcError) {
      // Non-fatal — log but do not fail the PATCH response
      console.error('Post-PATCH recalculation failed:', recalcError);
    }

    // Extract the updated piece cost from calculation
    let pieceCostBreakdown = null;
    if (calcResult?.breakdown?.pieces) {
      pieceCostBreakdown = calcResult.breakdown.pieces.find(
        (pb) => pb.pieceId === pieceIdNum
      ) ?? null;
    }

    const pu = updatedPiece as unknown as Record<string, unknown>;
    return NextResponse.json({
      ...updatedPiece,
      quote_rooms: { id: updatedPiece.quote_rooms.id, name: updatedPiece.quote_rooms.name },
      lengthMm: pu.length_mm,
      widthMm: pu.width_mm,
      thicknessMm: pu.thickness_mm,
      materialId: pu.material_id,
      materialName: pu.material_name,
      edgeTop: pu.edge_top,
      edgeBottom: pu.edge_bottom,
      edgeLeft: pu.edge_left,
      edgeRight: pu.edge_right,
      laminationMethod: pu.lamination_method,
      sortOrder: pu.sort_order,
      requiresGrainMatch: updatedPiece.requiresGrainMatch ?? false,
      // DEPRECATED: total_cost/material_cost are unreliable — use quotes.calculation_breakdown
      // Kept for API response shape compatibility. Do not read these values for display.
      totalCost: Number(pu.total_cost || 0),
      areaSqm: Number(pu.area_sqm || 0),
      materialCost: Number(pu.material_cost || 0),
      featuresCost: Number(pu.features_cost || 0),
      costBreakdown: pieceCostBreakdown,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to update piece', details: msg }, { status: 500 });
  }
}

// PUT - Update a piece
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, pieceId } = await params;
    const quoteId = parseInt(id);
    const pieceIdNum = parseInt(pieceId);

    if (isNaN(quoteId) || isNaN(pieceIdNum)) {
      return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const data = await request.json();
    const {
      name,
      description,
      lengthMm,
      widthMm,
      thicknessMm,
      materialId,
      materialName,
      roomName,
      edgeTop,
      edgeBottom,
      edgeLeft,
      edgeRight,
      cutouts,
      laminationMethod,
      requiresGrainMatch: reqGrainMatch,
    } = data;

    // Get the current piece
    const currentPiece = await prisma.quote_pieces.findUnique({
      where: { id: pieceIdNum },
      include: { quote_rooms: true },
    });

    if (!currentPiece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    // Validate lamination method if provided
    if (laminationMethod !== undefined) {
      const validLaminationMethods = ['NONE', 'LAMINATED', 'MITRED'];
      if (!validLaminationMethods.includes(laminationMethod)) {
        return NextResponse.json(
          { error: `Invalid laminationMethod. Must be one of: ${validLaminationMethods.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Mitred constraint: only Pencil Round edge profiles allowed
    const effectiveLamination = laminationMethod ?? currentPiece.lamination_method;
    if (effectiveLamination === 'MITRED') {
      const effectiveEdges = [
        edgeTop !== undefined ? edgeTop : currentPiece.edge_top,
        edgeBottom !== undefined ? edgeBottom : currentPiece.edge_bottom,
        edgeLeft !== undefined ? edgeLeft : currentPiece.edge_left,
        edgeRight !== undefined ? edgeRight : currentPiece.edge_right,
      ].filter(Boolean);

      if (effectiveEdges.length > 0) {
        const edgeTypes = await prisma.edge_types.findMany({
          where: { id: { in: effectiveEdges } },
          select: { id: true, name: true },
        });
        for (const et of edgeTypes) {
          const nameLower = et.name.toLowerCase();
          if (!nameLower.includes('pencil') && !nameLower.includes('raw')) {
            return NextResponse.json(
              {
                error: `Mitred edges only support Pencil Round profile. Found "${et.name}". Change to Pencil Round or switch to Laminated.`,
                code: 'MITRED_PROFILE_CONSTRAINT',
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // Material → Edge compatibility check
    const edgeCompatibilityWarnings: string[] = [];
    const effectiveMatId = materialId !== undefined ? materialId : currentPiece.material_id;
    if (effectiveMatId) {
      const matForCompat = await prisma.materials.findUnique({
        where: { id: effectiveMatId },
        select: { fabrication_category: true },
      });

      if (matForCompat) {
        const effectiveEdgeIds = Array.from(new Set(
          [
            edgeTop !== undefined ? edgeTop : currentPiece.edge_top,
            edgeBottom !== undefined ? edgeBottom : currentPiece.edge_bottom,
            edgeLeft !== undefined ? edgeLeft : currentPiece.edge_left,
            edgeRight !== undefined ? edgeRight : currentPiece.edge_right,
          ].filter(Boolean) as string[]
        ));

        if (effectiveEdgeIds.length > 0) {
          const pricingSettings = await prisma.pricing_settings.findFirst();
          if (pricingSettings) {
            const compatibilityRules = await prisma.material_edge_compatibility.findMany({
              where: {
                pricingSettingsId: pricingSettings.id,
                fabricationCategory: matForCompat.fabrication_category,
                edgeTypeId: { in: effectiveEdgeIds },
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

    // Handle room change if needed
    let roomId = currentPiece.room_id;
    if (roomName && roomName !== currentPiece.quote_rooms.name) {
      // Find or create the new room
      let newRoom = await prisma.quote_rooms.findFirst({
        where: {
          quote_id: quoteId,
          name: roomName,
        },
      });

      if (!newRoom) {
        const maxRoom = await prisma.quote_rooms.findFirst({
          where: { quote_id: quoteId },
          orderBy: { sort_order: 'desc' },
        });

        newRoom = await prisma.quote_rooms.create({
          data: {
            quote_id: quoteId,
            name: roomName,
            sort_order: (maxRoom?.sort_order ?? -1) + 1,
          },
        });
      }

      roomId = newRoom.id;
    }

    // Calculate area
    const length = lengthMm ?? currentPiece.length_mm;
    const width = widthMm ?? currentPiece.width_mm;
    const areaSqm = (length * width) / 1_000_000;

    // Calculate material cost if material is provided
    let materialCost = 0;
    const matId = materialId !== undefined ? materialId : currentPiece.material_id;
    if (matId) {
      const material = await prisma.materials.findUnique({
        where: { id: matId },
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

    // Update the piece
    const piece = await prisma.quote_pieces.update({
      where: { id: pieceIdNum },
      data: {
        room_id: roomId,
        name: name ?? currentPiece.name,
        description: description !== undefined ? description : currentPiece.description,
        length_mm: length,
        width_mm: width,
        thickness_mm: thicknessMm ?? currentPiece.thickness_mm,
        area_sqm: areaSqm,
        material_id: matId,
        material_name: materialName !== undefined ? materialName : currentPiece.material_name,
        // DEPRECATED: material_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        material_cost: materialCost,
        // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        total_cost: materialCost + currentPiece.features_cost.toNumber(),
        edge_top: edgeTop !== undefined ? edgeTop : currentPiece.edge_top,
        edge_bottom: edgeBottom !== undefined ? edgeBottom : currentPiece.edge_bottom,
        edge_left: edgeLeft !== undefined ? edgeLeft : currentPiece.edge_left,
        edge_right: edgeRight !== undefined ? edgeRight : currentPiece.edge_right,
        cutouts: cutouts !== undefined ? cutouts : currentPiece.cutouts,
        lamination_method: laminationMethod !== undefined ? laminationMethod : currentPiece.lamination_method,
        requiresGrainMatch: reqGrainMatch !== undefined ? reqGrainMatch : currentPiece.requiresGrainMatch,
      },
      include: {
        materials: true,
        quote_rooms: true,
      },
    });

    // Invalidate stale optimizer results — piece data has changed
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    // Clean up empty rooms
    const oldRoomPiecesCount = await prisma.quote_pieces.count({
      where: { room_id: currentPiece.room_id },
    });
    if (oldRoomPiecesCount === 0 && currentPiece.room_id !== roomId) {
      await prisma.quote_rooms.delete({
        where: { id: currentPiece.room_id },
      });
    }

    const pu = piece as any;
    return NextResponse.json({
      ...piece,
      quote_rooms: { id: piece.quote_rooms.id, name: piece.quote_rooms.name },
      // camelCase aliases for client components
      lengthMm: pu.length_mm,
      widthMm: pu.width_mm,
      thicknessMm: pu.thickness_mm,
      materialId: pu.material_id,
      materialName: pu.material_name,
      edgeTop: pu.edge_top,
      edgeBottom: pu.edge_bottom,
      edgeLeft: pu.edge_left,
      edgeRight: pu.edge_right,
      laminationMethod: pu.lamination_method,
      sortOrder: pu.sort_order,
      requiresGrainMatch: piece.requiresGrainMatch ?? false,
      // DEPRECATED: total_cost/material_cost are unreliable — use quotes.calculation_breakdown
      // Kept for API response shape compatibility. Do not read these values for display.
      totalCost: Number(pu.total_cost || 0),
      areaSqm: Number(pu.area_sqm || 0),
      materialCost: Number(pu.material_cost || 0),
      featuresCost: Number(pu.features_cost || 0),
      ...(edgeCompatibilityWarnings.length > 0 && { edgeCompatibilityWarnings }),
    });
  } catch (error) {
    console.error('Error updating piece:', error);
    return NextResponse.json({ error: 'Failed to update piece' }, { status: 500 });
  }
}

// DELETE - Delete a piece
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, pieceId } = await params;
    const quoteId = parseInt(id);
    const pieceIdNum = parseInt(pieceId);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (isNaN(pieceIdNum)) {
      return NextResponse.json({ error: 'Invalid piece ID' }, { status: 400 });
    }

    // Get the piece first to check the room
    const piece = await prisma.quote_pieces.findUnique({
      where: { id: pieceIdNum },
    });

    if (!piece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    const roomId = piece.room_id;

    // Delete the piece
    await prisma.quote_pieces.delete({
      where: { id: pieceIdNum },
    });

    // Invalidate stale optimizer results — piece data has changed
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    // Check if the room is now empty
    const roomPiecesCount = await prisma.quote_pieces.count({
      where: { room_id: roomId },
    });

    // Delete empty room
    if (roomPiecesCount === 0) {
      await prisma.quote_rooms.delete({
        where: { id: roomId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting piece:', error);
    return NextResponse.json({ error: 'Failed to delete piece' }, { status: 500 });
  }
}
