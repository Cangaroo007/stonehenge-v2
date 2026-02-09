import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// GET - Get a single piece
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const { pieceId } = await params;
    const pieceIdNum = parseInt(pieceId);

    if (isNaN(pieceIdNum)) {
      return NextResponse.json({ error: 'Invalid piece ID' }, { status: 400 });
    }

    const piece = await prisma.quote_pieces.findUnique({
      where: { id: pieceIdNum },
      include: {
        materials: true,
        quote_rooms: true,
        piece_features: true,
      },
    });

    if (!piece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    const p = piece as any;
    return NextResponse.json({
      ...piece,
      quote_rooms: { id: piece.quote_rooms.id, name: piece.quote_rooms.name },
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
      totalCost: Number(p.total_cost || 0),
      areaSqm: Number(p.area_sqm || 0),
      materialCost: Number(p.material_cost || 0),
      featuresCost: Number(p.features_cost || 0),
    });
  } catch (error) {
    console.error('Error fetching piece:', error);
    return NextResponse.json({ error: 'Failed to fetch piece' }, { status: 500 });
  }
}

// PUT - Update a piece
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const { id, pieceId } = await params;
    const quoteId = parseInt(id);
    const pieceIdNum = parseInt(pieceId);

    if (isNaN(quoteId) || isNaN(pieceIdNum)) {
      return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 });
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
        materialCost = areaSqm * material.price_per_sqm.toNumber();
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
        material_cost: materialCost,
        total_cost: materialCost + currentPiece.features_cost.toNumber(),
        edge_top: edgeTop !== undefined ? edgeTop : currentPiece.edge_top,
        edge_bottom: edgeBottom !== undefined ? edgeBottom : currentPiece.edge_bottom,
        edge_left: edgeLeft !== undefined ? edgeLeft : currentPiece.edge_left,
        edge_right: edgeRight !== undefined ? edgeRight : currentPiece.edge_right,
        cutouts: cutouts !== undefined ? cutouts : currentPiece.cutouts,
        lamination_method: laminationMethod !== undefined ? laminationMethod : currentPiece.lamination_method,
      },
      include: {
        materials: true,
        quote_rooms: true,
      },
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
      totalCost: Number(pu.total_cost || 0),
      areaSqm: Number(pu.area_sqm || 0),
      materialCost: Number(pu.material_cost || 0),
      featuresCost: Number(pu.features_cost || 0),
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
    const { pieceId } = await params;
    const pieceIdNum = parseInt(pieceId);

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
