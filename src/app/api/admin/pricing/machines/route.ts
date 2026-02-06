import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/admin/pricing/machines - Fetch all machine profiles
export async function GET() {
  try {
    const machines = await prisma.machineProfile.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });
    return NextResponse.json(machines);
  } catch (error) {
    console.error('Error fetching machine profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch machine profiles' },
      { status: 500 }
    );
  }
}

// POST /api/admin/pricing/machines - Create new machine profile
export async function POST(request: Request) {
  try {
    const data = await request.json();

    // Validate required fields
    if (!data.name || typeof data.name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!data.kerfWidthMm || typeof data.kerfWidthMm !== 'number') {
      return NextResponse.json(
        { error: 'Kerf width is required' },
        { status: 400 }
      );
    }

    // If this machine is set as default, unset any existing default
    if (data.isDefault) {
      await prisma.machineProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    const machine = await prisma.machineProfile.create({
      data: {
        name: data.name,
        kerfWidthMm: data.kerfWidthMm,
        maxSlabLengthMm: data.maxSlabLengthMm || null,
        maxSlabWidthMm: data.maxSlabWidthMm || null,
        isDefault: data.isDefault || false,
        isActive: data.isActive !== false,
      }
    });

    return NextResponse.json(machine);
  } catch (error: any) {
    console.error('Error creating machine profile:', error);
    
    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A machine with this name already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create machine profile' },
      { status: 500 }
    );
  }
}
