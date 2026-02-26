import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const thicknessOptions = await prisma.thickness_options.findMany({
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
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await request.json();

    const thicknessOption = await prisma.thickness_options.create({
      data: {
        id: crypto.randomUUID(),
        name: data.name,
        value: data.value,
        multiplier: data.multiplier || 1.0,
        isDefault: data.isDefault || false,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(thicknessOption, { status: 201 });
  } catch (error) {
    console.error('Error creating thickness option:', error);
    return NextResponse.json({ error: 'Failed to create thickness option' }, { status: 500 });
  }
}
