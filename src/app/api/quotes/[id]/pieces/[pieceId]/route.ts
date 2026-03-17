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
      // CURVE-2a: Prefer top-level edge columns, fallback to shape_config.edges for legacy ROUNDED_RECT data
      edgeTop: p.edge_top ?? (piece.shape_config as any)?.edges?.top ?? null,
      edgeBottom: p.edge_bottom ?? (piece.shape_config as any)?.edges?.bottom ?? null,
      edgeLeft: p.edge_left ?? (piece.shape_config as any)?.edges?.left ?? null,
      edgeRight: p.edge_right ?? (piece.shape_config as any)?.edges?.right ?? null,
      laminationMethod: p.lamination_method,
      sortOrder: p.sort_order,
      requiresGrainMatch: piece.requiresGrainMatch ?? false,
      overrideMaterialCost: piece.override_material_cost
        ? Number(piece.override_material_cost)
        : null,
      overrideSlabPrice: piece.override_slab_price
        ? Number(piece.override_slab_price)
        : null,
      // CURVE-2a: Corner edge camelCase aliases
      cornerEdgeTl: p.corner_edge_tl ?? null,
      cornerEdgeTr: p.corner_edge_tr ?? null,
      cornerEdgeBl: p.corner_edge_bl ?? null,
      cornerEdgeBr: p.corner_edge_br ?? null,
      noStripEdges: (p.no_strip_edges as unknown as string[]) ?? [],
      stripWidthOverrides: (piece.strip_width_overrides as unknown as Record<string, number> | null) ?? null,
      edgeBuildups: p.edge_buildups ?? null,
      mitredCornerTreatment: p.mitred_corner_treatment ?? 'RAW',
      promotedFromPieceId: p.promoted_from_piece_id ?? null,
      promotedEdgePosition: p.promoted_edge_position ?? null,
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
      overrideMaterialCost,
      overrideSlabPrice,
      applyToAllMaterial,
      shapeConfig,
      noStripEdges,
      stripWidthOverrides,
      pieceType,
      edgeArcConfig,
      edgeBuildups,
    } = data;
    const mitredCornerTreatment = data.mitredCornerTreatment as string | undefined;

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

    // Collect the 4 final edge IDs (new value if being updated, else current value)
    const finalEdgeIds = [
      edgeTop     !== undefined ? edgeTop     : currentPiece.edge_top,
      edgeBottom  !== undefined ? edgeBottom  : currentPiece.edge_bottom,
      edgeLeft    !== undefined ? edgeLeft    : currentPiece.edge_left,
      edgeRight   !== undefined ? edgeRight   : currentPiece.edge_right,
    ].filter((id): id is string => Boolean(id));

    // Derive lamination method from edge types
    let derivedLaminationMethod: string | undefined;
    if (finalEdgeIds.length > 0) {
      const assignedEdgeTypes = await prisma.edge_types.findMany({
        where: { id: { in: finalEdgeIds } },
        select: { isMitred: true },
      });
      const hasMitredEdge = assignedEdgeTypes.some(et => et.isMitred);
      const effectiveThickness = (thicknessMm as number | undefined) ?? currentPiece.thickness_mm ?? 20;
      derivedLaminationMethod = hasMitredEdge
        ? 'MITRED'
        : effectiveThickness >= 40 ? 'LAMINATED' : 'NONE';
    }

    // CURVE-2a: If shapeConfig.edges exists (ROUNDED_RECT pieces), sync to top-level edge columns
    const scEdgesPatch = (shapeConfig as Record<string, unknown> | undefined)?.edges as Record<string, string | null> | undefined;
    const patchEdgeTop = scEdgesPatch?.top !== undefined ? (scEdgesPatch.top ?? null) : (edgeTop !== undefined ? edgeTop : currentPiece.edge_top);
    const patchEdgeBottom = scEdgesPatch?.bottom !== undefined ? (scEdgesPatch.bottom ?? null) : (edgeBottom !== undefined ? edgeBottom : currentPiece.edge_bottom);
    const patchEdgeLeft = scEdgesPatch?.left !== undefined ? (scEdgesPatch.left ?? null) : (edgeLeft !== undefined ? edgeLeft : currentPiece.edge_left);
    const patchEdgeRight = scEdgesPatch?.right !== undefined ? (scEdgesPatch.right ?? null) : (edgeRight !== undefined ? edgeRight : currentPiece.edge_right);
    // CURVE-2a: Corner edge sync from shapeConfig
    const scForCornersPatch = shapeConfig as Record<string, unknown> | undefined;

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
        edge_top: patchEdgeTop,
        edge_bottom: patchEdgeBottom,
        edge_left: patchEdgeLeft,
        edge_right: patchEdgeRight,
        cutouts: cutouts !== undefined ? cutouts : currentPiece.cutouts,
        lamination_method: derivedLaminationMethod ?? (laminationMethod !== undefined ? laminationMethod : currentPiece.lamination_method),
        ...(mitredCornerTreatment !== undefined && {
          mitred_corner_treatment: mitredCornerTreatment,
        }),
        requiresGrainMatch: requiresGrainMatch !== undefined ? requiresGrainMatch : currentPiece.requiresGrainMatch,
        override_material_cost: overrideMaterialCost !== undefined
          ? overrideMaterialCost
          : undefined,
        ...(overrideSlabPrice !== undefined && {
          override_slab_price: overrideSlabPrice,
        }),
        // shape_config: stores extra L/U shape data including extended edge profiles
        ...(shapeConfig !== undefined && { shape_config: shapeConfig as unknown as Prisma.InputJsonValue }),
        // CURVE-2a: Corner edge columns for ROUNDED_RECT pieces
        ...(scForCornersPatch?.corner_edge_tl !== undefined && { corner_edge_tl: (scForCornersPatch.corner_edge_tl as string) ?? null }),
        ...(scForCornersPatch?.corner_edge_tr !== undefined && { corner_edge_tr: (scForCornersPatch.corner_edge_tr as string) ?? null }),
        ...(scForCornersPatch?.corner_edge_bl !== undefined && { corner_edge_bl: (scForCornersPatch.corner_edge_bl as string) ?? null }),
        ...(scForCornersPatch?.corner_edge_br !== undefined && { corner_edge_br: (scForCornersPatch.corner_edge_br as string) ?? null }),
        // no_strip_edges: wall edges that don't need lamination strips
        ...(noStripEdges !== undefined && { no_strip_edges: noStripEdges as unknown as Prisma.InputJsonValue }),
        ...(edgeBuildups !== undefined && { edge_buildups: edgeBuildups as unknown as Prisma.InputJsonValue }),
        ...(pieceType !== undefined && { piece_type: pieceType }),
        ...(edgeArcConfig !== undefined && { edge_arc_config: edgeArcConfig as unknown as Prisma.InputJsonValue }),
        strip_width_overrides: stripWidthOverrides !== undefined
          ? stripWidthOverrides as unknown as Prisma.InputJsonValue
          : undefined,
      },
      include: {
        materials: true,
        quote_rooms: true,
      },
    });

    // Apply override slab price to all pieces with same material in this quote
    if (applyToAllMaterial && overrideSlabPrice !== undefined && updatedPiece.material_id) {
      const allPiecesInQuote = await prisma.quote_pieces.findMany({
        where: {
          quote_rooms: { quote_id: quoteId },
          material_id: updatedPiece.material_id,
          id: { not: updatedPiece.id },
        },
        select: { id: true },
      });
      if (allPiecesInQuote.length > 0) {
        await prisma.quote_pieces.updateMany({
          where: { id: { in: allPiecesInQuote.map(p => p.id) } },
          data: { override_slab_price: overrideSlabPrice },
        });
      }
    }

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
      // CURVE-2a: Corner edge camelCase aliases
      cornerEdgeTl: pu.corner_edge_tl ?? null,
      cornerEdgeTr: pu.corner_edge_tr ?? null,
      cornerEdgeBl: pu.corner_edge_bl ?? null,
      cornerEdgeBr: pu.corner_edge_br ?? null,
      edgeArcConfig: pu.edge_arc_config ?? null,
      overrideMaterialCost: updatedPiece.override_material_cost
        ? Number(updatedPiece.override_material_cost)
        : null,
      overrideSlabPrice: updatedPiece.override_slab_price
        ? Number(updatedPiece.override_slab_price)
        : null,
      noStripEdges: (pu.no_strip_edges as unknown as string[]) ?? [],
      stripWidthOverrides: (updatedPiece.strip_width_overrides as unknown as Record<string, number> | null) ?? null,
      mitredCornerTreatment: pu.mitred_corner_treatment ?? 'RAW',
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
      shapeConfig: putShapeConfig,
      noStripEdges: putNoStripEdges,
      edgeBuildups: putEdgeBuildups,
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

    // CURVE-2a: If putShapeConfig.edges exists (ROUNDED_RECT pieces), sync to top-level edge columns
    const scEdgesPut = (putShapeConfig as Record<string, unknown> | undefined)?.edges as Record<string, string | null> | undefined;
    const putEdgeTop = scEdgesPut?.top !== undefined ? (scEdgesPut.top ?? null) : (edgeTop !== undefined ? edgeTop : currentPiece.edge_top);
    const putEdgeBottom = scEdgesPut?.bottom !== undefined ? (scEdgesPut.bottom ?? null) : (edgeBottom !== undefined ? edgeBottom : currentPiece.edge_bottom);
    const putEdgeLeft = scEdgesPut?.left !== undefined ? (scEdgesPut.left ?? null) : (edgeLeft !== undefined ? edgeLeft : currentPiece.edge_left);
    const putEdgeRight = scEdgesPut?.right !== undefined ? (scEdgesPut.right ?? null) : (edgeRight !== undefined ? edgeRight : currentPiece.edge_right);
    // CURVE-2a: Corner edge sync from putShapeConfig
    const scForCornersPut = putShapeConfig as Record<string, unknown> | undefined;

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
        edge_top: putEdgeTop,
        edge_bottom: putEdgeBottom,
        edge_left: putEdgeLeft,
        edge_right: putEdgeRight,
        cutouts: cutouts !== undefined ? cutouts : currentPiece.cutouts,
        lamination_method: laminationMethod !== undefined ? laminationMethod : currentPiece.lamination_method,
        requiresGrainMatch: reqGrainMatch !== undefined ? reqGrainMatch : currentPiece.requiresGrainMatch,
        // shape_config: stores extra L/U shape data including extended edge profiles
        ...(putShapeConfig !== undefined && { shape_config: putShapeConfig as unknown as Prisma.InputJsonValue }),
        // CURVE-2a: Corner edge columns for ROUNDED_RECT pieces
        ...(scForCornersPut?.corner_edge_tl !== undefined && { corner_edge_tl: (scForCornersPut.corner_edge_tl as string) ?? null }),
        ...(scForCornersPut?.corner_edge_tr !== undefined && { corner_edge_tr: (scForCornersPut.corner_edge_tr as string) ?? null }),
        ...(scForCornersPut?.corner_edge_bl !== undefined && { corner_edge_bl: (scForCornersPut.corner_edge_bl as string) ?? null }),
        ...(scForCornersPut?.corner_edge_br !== undefined && { corner_edge_br: (scForCornersPut.corner_edge_br as string) ?? null }),
        // no_strip_edges: wall edges that don't need lamination strips
        ...(putNoStripEdges !== undefined && { no_strip_edges: putNoStripEdges as unknown as Prisma.InputJsonValue }),
        ...(putEdgeBuildups !== undefined && { edge_buildups: putEdgeBuildups as unknown as Prisma.InputJsonValue }),
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
      // CURVE-2a: Corner edge camelCase aliases
      cornerEdgeTl: pu.corner_edge_tl ?? null,
      cornerEdgeTr: pu.corner_edge_tr ?? null,
      cornerEdgeBl: pu.corner_edge_bl ?? null,
      cornerEdgeBr: pu.corner_edge_br ?? null,
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

    // If this is a promoted strip, restore the parent piece's edge
    // by removing this edge from the parent's no_strip_edges array
    if (piece.promoted_from_piece_id && piece.promoted_edge_position) {
      const parentPiece = await prisma.quote_pieces.findUnique({
        where: { id: piece.promoted_from_piece_id },
        select: { no_strip_edges: true },
      });
      if (parentPiece) {
        const currentNoStrip = (parentPiece.no_strip_edges as unknown as string[]) ?? [];
        const restored = currentNoStrip.filter(e => e !== piece.promoted_edge_position);
        await prisma.quote_pieces.update({
          where: { id: piece.promoted_from_piece_id },
          data: { no_strip_edges: restored as unknown as Prisma.InputJsonValue },
        });
      }
    }

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
