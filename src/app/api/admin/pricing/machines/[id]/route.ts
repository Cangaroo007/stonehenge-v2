import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/machines/[id] - Fetch single machine profile
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const machine = await prisma.machine_profiles.findUnique({
      where: { id }
    });

    if (!machine) {
      return NextResponse.json(
        { error: 'Machine profile not found' },
        { status: 404 }
      );
    }

    const m = machine as any;
    return NextResponse.json({
      ...machine,
      kerfWidthMm: m.kerf_width_mm,
      maxSlabLengthMm: m.max_slab_length_mm,
      maxSlabWidthMm: m.max_slab_width_mm,
      isDefault: m.is_default,
      isActive: m.is_active,
    });
  } catch (error) {
    console.error('Error fetching machine profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch machine profile' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/pricing/machines/[id] - Update machine profile
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const data = await request.json();

    // Validate required fields
    if (data.name && typeof data.name !== 'string') {
      return NextResponse.json(
        { error: 'Invalid name' },
        { status: 400 }
      );
    }

    if (data.kerfWidthMm !== undefined && typeof data.kerfWidthMm !== 'number') {
      return NextResponse.json(
        { error: 'Invalid kerf width' },
        { status: 400 }
      );
    }

    // If this machine is being set as default, unset any existing default
    if (data.isDefault) {
      await prisma.machine_profiles.updateMany({
        where: {
          is_default: true,
          id: { not: id }
        },
        data: { is_default: false, updated_at: new Date() }
      });
    }

    const machine = await prisma.machine_profiles.update({
      where: { id },
      data: {
        name: data.name,
        kerf_width_mm: data.kerfWidthMm,
        max_slab_length_mm: data.maxSlabLengthMm !== undefined ? data.maxSlabLengthMm : undefined,
        max_slab_width_mm: data.maxSlabWidthMm !== undefined ? data.maxSlabWidthMm : undefined,
        is_default: data.isDefault,
        is_active: data.isActive !== undefined ? data.isActive : undefined,
        updated_at: new Date(),
      }
    });

    const mu = machine as any;
    return NextResponse.json({
      ...machine,
      kerfWidthMm: mu.kerf_width_mm,
      maxSlabLengthMm: mu.max_slab_length_mm,
      maxSlabWidthMm: mu.max_slab_width_mm,
      isDefault: mu.is_default,
      isActive: mu.is_active,
    });
  } catch (error: any) {
    console.error('Error updating machine profile:', error);

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A machine with this name already exists' },
        { status: 409 }
      );
    }

    // Handle not found
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Machine profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update machine profile' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/pricing/machines/[id] - Soft delete machine profile
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    // Check if this is the only active machine or the default
    const machine = await prisma.machine_profiles.findUnique({
      where: { id }
    });

    if (!machine) {
      return NextResponse.json(
        { error: 'Machine profile not found' },
        { status: 404 }
      );
    }

    // Prevent deleting the default machine
    if (machine.is_default) {
      return NextResponse.json(
        { error: 'Cannot delete the default machine. Set another machine as default first.' },
        { status: 400 }
      );
    }

    // Soft delete by setting is_active to false
    await prisma.machine_profiles.update({
      where: { id },
      data: { is_active: false, updated_at: new Date() }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting machine profile:', error);

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Machine profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete machine profile' },
      { status: 500 }
    );
  }
}
