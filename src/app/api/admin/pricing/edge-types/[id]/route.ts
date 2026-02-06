import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const edgeType = await prisma.edgeType.findUnique({
      where: { id },
    });

    if (!edgeType) {
      return NextResponse.json({ error: 'Edge type not found' }, { status: 404 });
    }

    return NextResponse.json(edgeType);
  } catch (error) {
    console.error('Error fetching edge type:', error);
    return NextResponse.json({ error: 'Failed to fetch edge type' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const edgeType = await prisma.edgeType.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description || null,
        category: data.category || 'polish',
        baseRate: data.baseRate || 0,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(edgeType);
  } catch (error) {
    console.error('Error updating edge type:', error);
    return NextResponse.json({ error: 'Failed to update edge type' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.edgeType.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting edge type:', error);
    return NextResponse.json({ error: 'Failed to delete edge type' }, { status: 500 });
  }
}
