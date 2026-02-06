import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const cutoutTypes = await prisma.cutoutType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Properly serialize Decimal fields to numbers and ensure boolean fields are set
    const serialized = cutoutTypes.map((ct: typeof cutoutTypes[number]) => ({
      id: ct.id,
      name: ct.name,
      description: ct.description,
      baseRate: Number(ct.baseRate),
      isActive: ct.isActive ?? true, // Default to true if null/undefined
      sortOrder: ct.sortOrder,
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching cutout types:', error);
    return NextResponse.json({ error: 'Failed to fetch cutout types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const cutoutType = await prisma.cutoutType.create({
      data: {
        name: data.name,
        description: data.description || null,
        baseRate: data.baseRate || 0,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(cutoutType, { status: 201 });
  } catch (error) {
    console.error('Error creating cutout type:', error);
    return NextResponse.json({ error: 'Failed to create cutout type' }, { status: 500 });
  }
}
