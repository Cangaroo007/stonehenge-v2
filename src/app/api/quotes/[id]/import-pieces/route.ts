import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

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
        where: { quote_id: quoteId },
        select: { id: true },
      });
      const roomIds = existingRooms.map(r => r.id);
      if (roomIds.length > 0) {
        await prisma.quote_pieces.deleteMany({
          where: { room_id: { in: roomIds } },
        });
        await prisma.quote_rooms.deleteMany({
          where: { quote_id: quoteId },
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
          quote_id: quoteId,
          name: roomName,
        },
      });

      if (!room) {
        // Get the highest sort order for rooms
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

      let sortOrder = (maxPiece?.sort_order ?? -1) + 1;

      // Create each piece
      for (const pieceData of roomPieces) {
        const lengthMm = Math.round(pieceData.length);
        const widthMm = Math.round(pieceData.width);
        const thicknessMm = pieceData.thickness || 20;

        // Calculate area
        const areaSqm = (lengthMm * widthMm) / 1_000_000;

        const piece = await prisma.quote_pieces.create({
          data: {
            room_id: room.id,
            name: pieceData.name,
            description: pieceData.notes || null,
            length_mm: lengthMm,
            width_mm: widthMm,
            thickness_mm: thicknessMm,
            area_sqm: areaSqm,
            material_id: null,
            material_name: pieceData.material || null,
            // DEPRECATED: material_cost is unreliable — use quotes.calculation_breakdown
            // Kept to avoid null constraint violations. Do not read this value for display.
            material_cost: 0,
            // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
            // Kept to avoid null constraint violations. Do not read this value for display.
            total_cost: 0,
            sort_order: sortOrder++,
            cutouts: [],
            edge_top: pieceData.edgeTop || defaultEdgeId,
            edge_bottom: pieceData.edgeBottom || null,
            edge_left: pieceData.edgeLeft || defaultEdgeId,
            edge_right: pieceData.edgeRight || null,
          },
        });

        createdPieces.push({
          id: piece.id,
          name: piece.name,
          room: roomName,
        });
      }
    }

    // Invalidate stale optimizer results — piece data has changed
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    // If sourceAnalysisId is provided, update the analysis record with imported piece IDs
    if (sourceAnalysisId) {
      const analysisId = parseInt(sourceAnalysisId);
      if (!isNaN(analysisId)) {
        await prisma.quote_drawing_analyses.update({
          where: { id: analysisId },
          data: {
            imported_pieces: createdPieces.map(p => p.id.toString()),
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
