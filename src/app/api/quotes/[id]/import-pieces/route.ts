import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

interface ImportPieceData {
  name: string;
  length: number;
  width: number;
  thickness?: number;
  room?: string;
  material?: string;
  notes?: string;
  edgeTop?: string;
  edgeBottom?: string;
  edgeLeft?: string;
  edgeRight?: string;
}

interface ImportRequest {
  pieces: ImportPieceData[];
  sourceAnalysisId?: string;
  replaceExisting?: boolean;
}

// POST - Import multiple pieces from drawing analysis
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Verify quote exists
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const data: ImportRequest = await request.json();
    const { pieces, sourceAnalysisId, replaceExisting } = data;

    if (!pieces || !Array.isArray(pieces) || pieces.length === 0) {
      return NextResponse.json(
        { error: 'At least one piece is required' },
        { status: 400 }
      );
    }

    // Look up default edge type (Pencil Round) for pieces without edges
    const defaultEdgeType = await prisma.edge_types.findFirst({
      where: { category: 'polish', isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    const defaultEdgeId = defaultEdgeType?.id ?? null;

    // Validate all pieces have required fields
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      if (!piece.name || !piece.length || !piece.width) {
        return NextResponse.json(
          { error: `Piece ${i + 1} is missing required fields (name, length, width)` },
          { status: 400 }
        );
      }
    }

    // If replaceExisting, delete all existing rooms and pieces for this quote
    if (replaceExisting) {
      const existingRooms = await prisma.quote_rooms.findMany({
        where: { quoteId },
        select: { id: true },
      });
      const roomIds = existingRooms.map(r => r.id);
      if (roomIds.length > 0) {
        await prisma.quote_pieces.deleteMany({
          where: { roomId: { in: roomIds } },
        });
        await prisma.quote_rooms.deleteMany({
          where: { quoteId },
        });
      }
    }

    // Group pieces by room
    const piecesByRoom: Record<string, ImportPieceData[]> = {};
    for (const piece of pieces) {
      const roomName = piece.room || 'Kitchen';
      if (!piecesByRoom[roomName]) {
        piecesByRoom[roomName] = [];
      }
      piecesByRoom[roomName].push(piece);
    }

    const createdPieces: { id: number; name: string; room: string }[] = [];

    // Process each room
    for (const [roomName, roomPieces] of Object.entries(piecesByRoom)) {
      // Find or create the room
      let room = await prisma.quote_rooms.findFirst({
        where: {
          quoteId,
          name: roomName,
        },
      });

      if (!room) {
        // Get the highest sort order for rooms
        const maxRoom = await prisma.quote_rooms.findFirst({
          where: { quoteId },
          orderBy: { sortOrder: 'desc' },
        });

        room = await prisma.quote_rooms.create({
          data: {
            quoteId,
            name: roomName,
            sortOrder: (maxRoom?.sortOrder ?? -1) + 1,
          },
        });
      }

      // Get the highest piece sort order in the room
      const maxPiece = await prisma.quote_pieces.findFirst({
        where: { roomId: room.id },
        orderBy: { sortOrder: 'desc' },
      });

      let sortOrder = (maxPiece?.sortOrder ?? -1) + 1;

      // Create each piece
      for (const pieceData of roomPieces) {
        const lengthMm = Math.round(pieceData.length);
        const widthMm = Math.round(pieceData.width);
        const thicknessMm = pieceData.thickness || 20;

        // Calculate area
        const areaSqm = (lengthMm * widthMm) / 1_000_000;

        const piece = await prisma.quote_pieces.create({
          data: {
            roomId: room.id,
            name: pieceData.name,
            description: pieceData.notes || null,
            lengthMm,
            widthMm,
            thicknessMm,
            areaSqm,
            materialId: null,
            materialName: pieceData.material || null,
            materialCost: 0,
            totalCost: 0,
            sortOrder: sortOrder++,
            cutouts: [],
            edgeTop: pieceData.edgeTop || defaultEdgeId,
            edgeBottom: pieceData.edgeBottom || null,
            edgeLeft: pieceData.edgeLeft || defaultEdgeId,
            edgeRight: pieceData.edgeRight || null,
          },
        });

        createdPieces.push({
          id: piece.id,
          name: piece.name,
          room: roomName,
        });
      }
    }

    // If sourceAnalysisId is provided, update the analysis record with imported piece IDs
    if (sourceAnalysisId) {
      const analysisId = parseInt(sourceAnalysisId);
      if (!isNaN(analysisId)) {
        await prisma.quote_drawing_analysis.update({
          where: { id: analysisId },
          data: {
            importedPieces: createdPieces.map(p => p.id.toString()),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      imported: createdPieces,
      count: createdPieces.length,
    });

  } catch (error) {
    console.error('Error importing pieces:', error);
    return NextResponse.json(
      { error: 'Failed to import pieces' },
      { status: 500 }
    );
  }
}
