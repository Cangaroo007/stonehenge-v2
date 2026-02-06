import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';

// PUT /api/admin/pricing/delivery-zones/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid delivery zone ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    const zone = await prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.maxDistanceKm !== undefined && { maxDistanceKm: body.maxDistanceKm }),
        ...(body.ratePerKm !== undefined && { ratePerKm: body.ratePerKm }),
        ...(body.baseCharge !== undefined && { baseCharge: body.baseCharge }),
        ...(body.isActive !== undefined && { isActive: body.isActive })
      }
    });
    
    return NextResponse.json(zone);
  } catch (error: any) {
    console.error('Error updating delivery zone:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update delivery zone' },
      { status: 400 }
    );
  }
}

// DELETE /api/admin/pricing/delivery-zones/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid delivery zone ID' },
        { status: 400 }
      );
    }
    
    await prisma.deliveryZone.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true, message: 'Delivery zone deleted' });
  } catch (error: any) {
    console.error('Error deleting delivery zone:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete delivery zone' },
      { status: 400 }
    );
  }
}
