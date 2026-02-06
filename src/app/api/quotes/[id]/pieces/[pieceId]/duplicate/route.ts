import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// POST - Duplicate a piece
export async function POST(
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

    // Get the original piece
    const originalPiece = await prisma.quotePiece.findUnique({
      where: { id: pieceIdNum },
      include: {
        room: true,
      },
    });

    if (!originalPiece) {
      return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    }

    // Verify the piece belongs to the correct quote
    const room = await prisma.quoteRoom.findUnique({
      where: { id: originalPiece.roomId },
    });

    if (!room || room.quoteId !== quoteId) {
      return NextResponse.json({ error: 'Piece does not belong to this quote' }, { status: 400 });
    }

    // Get the max sortOrder for the quote
    const maxSortOrderPiece = await prisma.quotePiece.findFirst({
      where: {
        room: {
          quoteId,
        },
      },
      orderBy: { sortOrder: 'desc' },
    });
    const newSortOrder = (maxSortOrderPiece?.sortOrder ?? -1) + 1;

    // Create the duplicate piece
    const duplicatedPiece = await prisma.quotePiece.create({
      data: {
        roomId: originalPiece.roomId,
        name: `${originalPiece.name} (copy)`,
        description: originalPiece.description,
        lengthMm: originalPiece.lengthMm,
        widthMm: originalPiece.widthMm,
        thicknessMm: originalPiece.thicknessMm,
        areaSqm: originalPiece.areaSqm,
        materialId: originalPiece.materialId,
        materialName: originalPiece.materialName,
        materialCost: originalPiece.materialCost,
        featuresCost: originalPiece.featuresCost,
        totalCost: originalPiece.totalCost,
        edgeTop: originalPiece.edgeTop,
        edgeBottom: originalPiece.edgeBottom,
        edgeLeft: originalPiece.edgeLeft,
        edgeRight: originalPiece.edgeRight,
        cutouts: originalPiece.cutouts ?? [],
        sortOrder: newSortOrder,
      },
      include: {
        room: true,
      },
    });

    return NextResponse.json({
      ...duplicatedPiece,
      room: { id: duplicatedPiece.room.id, name: duplicatedPiece.room.name },
    }, { status: 201 });
  } catch (error) {
    console.error('Error duplicating piece:', error);
    return NextResponse.json({ error: 'Failed to duplicate piece' }, { status: 500 });
  }
}
