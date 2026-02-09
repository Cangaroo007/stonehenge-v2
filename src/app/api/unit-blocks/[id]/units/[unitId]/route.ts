import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; unitId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, unitId } = await params;
    const projectId = parseInt(id, 10);
    const unitIdNum = parseInt(unitId, 10);
    if (isNaN(projectId) || isNaN(unitIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existing = await prisma.unit_block_units.findFirst({
      where: { id: unitIdNum, projectId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const data = await request.json();

    const allowedFields = [
      'unitNumber', 'level', 'unitTypeCode', 'finishLevel',
      'colourScheme', 'status', 'saleStatus', 'buyerChangeSpec',
      'quoteId', 'templateId', 'notes',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in data) {
        updateData[field] = data[field];
      }
    }

    const unit = await prisma.unit_block_units.update({
      where: { id: unitIdNum },
      data: updateData,
      include: {
        quote: {
          select: {
            id: true,
            quote_number: true,
            status: true,
            subtotal: true,
            total: true,
          },
        },
      },
    });

    return NextResponse.json(unit);
  } catch (error) {
    console.error('Error updating unit:', error);
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; unitId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, unitId } = await params;
    const projectId = parseInt(id, 10);
    const unitIdNum = parseInt(unitId, 10);
    if (isNaN(projectId) || isNaN(unitIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existing = await prisma.unit_block_units.findFirst({
      where: { id: unitIdNum, projectId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.unit_block_units.delete({
        where: { id: unitIdNum },
      }),
      prisma.unit_block_projects.update({
        where: { id: projectId },
        data: { totalUnits: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting unit:', error);
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 });
  }
}
