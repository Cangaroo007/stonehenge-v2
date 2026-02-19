import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

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
      room.quote_pieces.map((piece: any) => ({
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
        totalCost: Number(piece.total_cost || 0),
        areaSqm: Number(piece.area_sqm || 0),
        materialCost: Number(piece.material_cost || 0),
        featuresCost: Number(piece.features_cost || 0),
      }))
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
    const {
      name,
      description,
      lengthMm,
      widthMm,
      thicknessMm = 20,
      materialId,
      materialName,
      roomName = 'Kitchen',
      edgeTop,
      edgeBottom,
      edgeLeft,
      edgeRight,
      laminationMethod = 'NONE',
    } = data;

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

    // Mitred constraint: only Pencil Round edge profiles allowed
    if (laminationMethod === 'MITRED') {
      const edgeIds = [edgeTop, edgeBottom, edgeLeft, edgeRight].filter(Boolean);
      if (edgeIds.length > 0) {
        const edgeTypes = await prisma.edge_types.findMany({
          where: { id: { in: edgeIds } },
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

    // Calculate area
    const areaSqm = (lengthMm * widthMm) / 1_000_000;

    // Calculate material cost if material is provided
    let materialCost = 0;
    if (materialId) {
      const material = await prisma.materials.findUnique({
        where: { id: materialId },
      });
      if (material) {
        materialCost = areaSqm * material.price_per_sqm.toNumber();
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
        material_cost: materialCost,
        total_cost: materialCost,
        sort_order: (maxPiece?.sort_order ?? -1) + 1,
        cutouts: [],
        edge_top: edgeTop || null,
        edge_bottom: edgeBottom || null,
        edge_left: edgeLeft || null,
        edge_right: edgeRight || null,
        lamination_method: laminationMethod,
      },
      include: {
        materials: true,
        quote_rooms: true,
      },
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
      totalCost: Number(pieceAny.total_cost || 0),
      areaSqm: Number(pieceAny.area_sqm || 0),
      materialCost: Number(pieceAny.material_cost || 0),
      featuresCost: Number(pieceAny.features_cost || 0),
      ...(edgeCompatibilityWarnings.length > 0 && { edgeCompatibilityWarnings }),
    });
  } catch (error) {
    console.error('Error creating piece:', error);
    return NextResponse.json({ error: 'Failed to create piece' }, { status: 500 });
  }
}
