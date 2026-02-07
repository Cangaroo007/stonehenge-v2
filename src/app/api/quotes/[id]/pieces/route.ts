import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// GET - List all pieces for a quote
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Get all rooms with their pieces
    const rooms = await prisma.quote_rooms.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
      include: {
        pieces: {
          orderBy: { sortOrder: 'asc' },
          include: {
            material: true,
          },
        },
      },
    });

    // Flatten pieces with room info
    const pieces = rooms.flatMap(room =>
      room.pieces.map(piece => ({
        ...piece,
        room: { id: room.id, name: room.name },
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
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
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
    } = data;

    // Validate required fields
    if (!name || !lengthMm || !widthMm) {
      return NextResponse.json(
        { error: 'Name, length, and width are required' },
        { status: 400 }
      );
    }

    // Find or create the room
    let room = await prisma.quote_rooms.findFirst({
      where: {
        quoteId,
        name: roomName,
      },
    });

    if (!room) {
      // Get the highest sort order
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

    // Calculate area
    const areaSqm = (lengthMm * widthMm) / 1_000_000;

    // Calculate material cost if material is provided
    let materialCost = 0;
    if (materialId) {
      const material = await prisma.materials.findUnique({
        where: { id: materialId },
      });
      if (material) {
        materialCost = areaSqm * material.pricePerSqm.toNumber();
      }
    }

    // Create the piece
    const piece = await prisma.quote_pieces.create({
      data: {
        roomId: room.id,
        name,
        description: description || null,
        lengthMm,
        widthMm,
        thicknessMm,
        areaSqm,
        materialId: materialId || null,
        materialName: materialName || null,
        materialCost,
        totalCost: materialCost,
        sortOrder: (maxPiece?.sortOrder ?? -1) + 1,
        cutouts: [],
        edgeTop: edgeTop || null,
        edgeBottom: edgeBottom || null,
        edgeLeft: edgeLeft || null,
        edgeRight: edgeRight || null,
      },
      include: {
        material: true,
        room: true,
      },
    });

    return NextResponse.json({
      ...piece,
      room: { id: room.id, name: room.name },
    });
  } catch (error) {
    console.error('Error creating piece:', error);
    return NextResponse.json({ error: 'Failed to create piece' }, { status: 500 });
  }
}
