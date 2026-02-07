import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const edgeTypes = await prisma.edge_types.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Properly serialize Decimal fields to numbers and ensure boolean fields are set
    const serialized = edgeTypes.map((et: typeof edgeTypes[number]) => ({
      id: et.id,
      name: et.name,
      description: et.description,
      category: et.category,
      baseRate: Number(et.baseRate),
      isActive: et.isActive ?? true, // Default to true if null/undefined
      sortOrder: et.sortOrder,
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching edge types:', error);
    return NextResponse.json({ error: 'Failed to fetch edge types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const edgeType = await prisma.edge_types.create({
      data: {
        id: crypto.randomUUID(),
        name: data.name,
        description: data.description || null,
        category: data.category || 'polish',
        baseRate: data.baseRate || 0,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(edgeType, { status: 201 });
  } catch (error) {
    console.error('Error creating edge type:', error);
    return NextResponse.json({ error: 'Failed to create edge type' }, { status: 500 });
  }
}
