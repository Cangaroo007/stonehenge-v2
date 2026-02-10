import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/service-rates/[id] - Get single service rate
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request, ['ADMIN', 'SALES_MANAGER']);

    const { id } = await params;

    const rate = await prisma.service_rates.findUnique({
      where: { id },
      include: { pricing_settings: true }
    });

    if (!rate) {
      return NextResponse.json(
        { error: 'Service rate not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(rate);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch service rate';
    console.error('Error fetching service rate:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// PUT /api/admin/pricing/service-rates/[id] - Update service rate
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request, ['ADMIN']);

    const { id } = await params;
    const body = await request.json();

    const rate = await prisma.service_rates.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.rate20mm !== undefined && { rate20mm: body.rate20mm }),
        ...(body.rate40mm !== undefined && { rate40mm: body.rate40mm }),
        ...(body.minimumCharge !== undefined && { minimumCharge: body.minimumCharge }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.fabricationCategory !== undefined && { fabricationCategory: body.fabricationCategory }),
        updated_at: new Date(),
      }
    });

    return NextResponse.json(rate);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update service rate';
    console.error('Error updating service rate:', error);
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

// DELETE /api/admin/pricing/service-rates/[id] - Delete service rate
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request, ['ADMIN']);

    const { id } = await params;

    await prisma.service_rates.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'Service rate deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete service rate';
    console.error('Error deleting service rate:', error);
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
