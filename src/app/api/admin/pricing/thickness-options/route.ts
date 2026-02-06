import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const thicknessOptions = await prisma.thicknessOption.findMany({
      orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
    });
    return NextResponse.json(thicknessOptions);
  } catch (error) {
    console.error('Error fetching thickness options:', error);
    return NextResponse.json({ error: 'Failed to fetch thickness options' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const thicknessOption = await prisma.thicknessOption.create({
      data: {
        name: data.name,
        value: data.value,
        multiplier: data.multiplier || 1.0,
        isDefault: data.isDefault || false,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(thicknessOption, { status: 201 });
  } catch (error) {
    console.error('Error creating thickness option:', error);
    return NextResponse.json({ error: 'Failed to create thickness option' }, { status: 500 });
  }
}
