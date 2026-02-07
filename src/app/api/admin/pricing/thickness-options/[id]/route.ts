import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const thicknessOption = await prisma.thickness_options.findUnique({
      where: { id },
    });

    if (!thicknessOption) {
      return NextResponse.json({ error: 'Thickness option not found' }, { status: 404 });
    }

    return NextResponse.json(thicknessOption);
  } catch (error) {
    console.error('Error fetching thickness option:', error);
    return NextResponse.json({ error: 'Failed to fetch thickness option' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const thicknessOption = await prisma.thickness_options.update({
      where: { id },
      data: {
        name: data.name,
        value: data.value,
        multiplier: data.multiplier || 1.0,
        isDefault: data.isDefault || false,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(thicknessOption);
  } catch (error) {
    console.error('Error updating thickness option:', error);
    return NextResponse.json({ error: 'Failed to update thickness option' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.thickness_options.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting thickness option:', error);
    return NextResponse.json({ error: 'Failed to delete thickness option' }, { status: 500 });
  }
}
