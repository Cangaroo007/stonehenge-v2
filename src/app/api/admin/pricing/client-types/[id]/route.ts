import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientType = await prisma.clientType.findUnique({
      where: { id },
    });

    if (!clientType) {
      return NextResponse.json({ error: 'Client type not found' }, { status: 404 });
    }

    return NextResponse.json(clientType);
  } catch (error) {
    console.error('Error fetching client type:', error);
    return NextResponse.json({ error: 'Failed to fetch client type' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const clientType = await prisma.clientType.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description || null,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(clientType);
  } catch (error) {
    console.error('Error updating client type:', error);
    return NextResponse.json({ error: 'Failed to update client type' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.clientType.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting client type:', error);
    return NextResponse.json({ error: 'Failed to delete client type' }, { status: 500 });
  }
}
