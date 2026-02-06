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

    const piece = await prisma.quotePiece.findUnique({
      where: { id: pieceIdNum },
      include: {
        material: true,
        room: true,
        features: true,
      },
    });

    if (!piece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...piece,
      room: { id: piece.room.id, name: piece.room.name },
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
    } = data;

    // Get the current piece
    const currentPiece = await prisma.quotePiece.findUnique({
      where: { id: pieceIdNum },
      include: { room: true },
    });

    if (!currentPiece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    // Handle room change if needed
    let roomId = currentPiece.roomId;
    if (roomName && roomName !== currentPiece.room.name) {
      // Find or create the new room
      let newRoom = await prisma.quoteRoom.findFirst({
        where: {
          quoteId,
          name: roomName,
        },
      });

      if (!newRoom) {
        const maxRoom = await prisma.quoteRoom.findFirst({
          where: { quoteId },
          orderBy: { sortOrder: 'desc' },
        });

        newRoom = await prisma.quoteRoom.create({
          data: {
            quoteId,
            name: roomName,
            sortOrder: (maxRoom?.sortOrder ?? -1) + 1,
          },
        });
      }

      roomId = newRoom.id;
    }

    // Calculate area
    const length = lengthMm ?? currentPiece.lengthMm;
    const width = widthMm ?? currentPiece.widthMm;
    const areaSqm = (length * width) / 1_000_000;

    // Calculate material cost if material is provided
    let materialCost = 0;
    const matId = materialId !== undefined ? materialId : currentPiece.materialId;
    if (matId) {
      const material = await prisma.material.findUnique({
        where: { id: matId },
      });
      if (material) {
        materialCost = areaSqm * material.pricePerSqm.toNumber();
      }
    }

    // Update the piece
    const piece = await prisma.quotePiece.update({
      where: { id: pieceIdNum },
      data: {
        roomId,
        name: name ?? currentPiece.name,
        description: description !== undefined ? description : currentPiece.description,
        lengthMm: length,
        widthMm: width,
        thicknessMm: thicknessMm ?? currentPiece.thicknessMm,
        areaSqm,
        materialId: matId,
        materialName: materialName !== undefined ? materialName : currentPiece.materialName,
        materialCost,
        totalCost: materialCost + currentPiece.featuresCost.toNumber(),
        edgeTop: edgeTop !== undefined ? edgeTop : currentPiece.edgeTop,
        edgeBottom: edgeBottom !== undefined ? edgeBottom : currentPiece.edgeBottom,
        edgeLeft: edgeLeft !== undefined ? edgeLeft : currentPiece.edgeLeft,
        edgeRight: edgeRight !== undefined ? edgeRight : currentPiece.edgeRight,
        cutouts: cutouts !== undefined ? cutouts : currentPiece.cutouts,
      },
      include: {
        material: true,
        room: true,
      },
    });

    // Clean up empty rooms
    const oldRoomPiecesCount = await prisma.quotePiece.count({
      where: { roomId: currentPiece.roomId },
    });
    if (oldRoomPiecesCount === 0 && currentPiece.roomId !== roomId) {
      await prisma.quoteRoom.delete({
        where: { id: currentPiece.roomId },
      });
    }

    return NextResponse.json({
      ...piece,
      room: { id: piece.room.id, name: piece.room.name },
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
    const piece = await prisma.quotePiece.findUnique({
      where: { id: pieceIdNum },
    });

    if (!piece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    const roomId = piece.roomId;

    // Delete the piece
    await prisma.quotePiece.delete({
      where: { id: pieceIdNum },
    });

    // Check if the room is now empty
    const roomPiecesCount = await prisma.quotePiece.count({
      where: { roomId },
    });

    // Delete empty room
    if (roomPiecesCount === 0) {
      await prisma.quoteRoom.delete({
        where: { id: roomId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting piece:', error);
    return NextResponse.json({ error: 'Failed to delete piece' }, { status: 500 });
  }
}
