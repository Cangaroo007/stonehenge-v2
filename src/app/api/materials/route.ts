import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const materials = await prisma.material.findMany({
      orderBy: [{ collection: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const material = await prisma.material.create({
      data: {
        name: data.name,
        collection: data.collection || null,
        description: data.description || null,
        pricePerSqm: data.pricePerSqm,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    console.error('Error creating material:', error);
    return NextResponse.json({ error: 'Failed to create material' }, { status: 500 });
  }
}
