import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const cutoutType = await prisma.cutout_types.findUnique({
      where: { id },
    });

    if (!cutoutType) {
      return NextResponse.json({ error: 'Cutout type not found' }, { status: 404 });
    }

    return NextResponse.json(cutoutType);
  } catch (error) {
    console.error('Error fetching cutout type:', error);
    return NextResponse.json({ error: 'Failed to fetch cutout type' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const data = await request.json();

    const cutoutType = await prisma.cutout_types.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description || null,
        baseRate: data.baseRate || 0,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(cutoutType);
  } catch (error) {
    console.error('Error updating cutout type:', error);
    return NextResponse.json({ error: 'Failed to update cutout type' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.cutout_types.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting cutout type:', error);
    return NextResponse.json({ error: 'Failed to delete cutout type' }, { status: 500 });
  }
}
