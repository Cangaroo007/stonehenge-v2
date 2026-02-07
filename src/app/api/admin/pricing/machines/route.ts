import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/admin/pricing/machines - Fetch all machine profiles
export async function GET() {
  try {
    const machines = await prisma.machine_profiles.findMany({
      orderBy: [
        { is_default: 'desc' },
        { name: 'asc' }
      ]
    });
    // Add camelCase aliases for client components
    const transformed = machines.map((m: any) => ({
      ...m,
      kerfWidthMm: m.kerf_width_mm,
      maxSlabLengthMm: m.max_slab_length_mm,
      maxSlabWidthMm: m.max_slab_width_mm,
      isDefault: m.is_default,
      isActive: m.is_active,
    }));
    return NextResponse.json(transformed);
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
      await prisma.machine_profiles.updateMany({
        where: { is_default: true },
        data: { is_default: false, updated_at: new Date() }
      });
    }

    const machine = await prisma.machine_profiles.create({
      data: {
        id: crypto.randomUUID(),
        name: data.name,
        kerf_width_mm: data.kerfWidthMm,
        max_slab_length_mm: data.maxSlabLengthMm || null,
        max_slab_width_mm: data.maxSlabWidthMm || null,
        is_default: data.isDefault || false,
        is_active: data.isActive !== false,
        updated_at: new Date(),
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
