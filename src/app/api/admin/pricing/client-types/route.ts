import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const clientTypes = await prisma.client_types.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(clientTypes);
  } catch (error) {
    console.error('Error fetching client types:', error);
    return NextResponse.json({ error: 'Failed to fetch client types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const clientType = await prisma.client_types.create({
      data: {
        name: data.name,
        description: data.description || null,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(clientType, { status: 201 });
  } catch (error) {
    console.error('Error creating client type:', error);
    return NextResponse.json({ error: 'Failed to create client type' }, { status: 500 });
  }
}
