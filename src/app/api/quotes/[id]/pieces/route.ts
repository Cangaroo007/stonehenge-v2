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
      where: { quote_id: quoteId },
      orderBy: { sort_order: 'asc' },
      include: {
        quote_pieces: {
          orderBy: { sort_order: 'asc' },
          include: {
            materials: true,
          },
        },
      },
    });

    // Flatten pieces with room info
    const pieces = rooms.flatMap(room =>
      room.quote_pieces.map(piece => ({
        ...piece,
        quote_rooms: { id: room.id, name: room.name },
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
      },
      include: {
        materials: true,
        quote_rooms: true,
      },
    });

    return NextResponse.json({
      ...piece,
      quote_rooms: { id: room.id, name: room.name },
    });
  } catch (error) {
    console.error('Error creating piece:', error);
    return NextResponse.json({ error: 'Failed to create piece' }, { status: 500 });
  }
}
