import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';

// PUT /api/admin/pricing/templating-rates/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid templating rate ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    const rate = await prisma.templatingRate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.baseCharge !== undefined && { baseCharge: body.baseCharge }),
        ...(body.ratePerKm !== undefined && { ratePerKm: body.ratePerKm }),
        ...(body.isActive !== undefined && { isActive: body.isActive })
      }
    });
    
    return NextResponse.json(rate);
  } catch (error: any) {
    console.error('Error updating templating rate:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update templating rate' },
      { status: 400 }
    );
  }
}

// DELETE /api/admin/pricing/templating-rates/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid templating rate ID' },
        { status: 400 }
      );
    }
    
    await prisma.templatingRate.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true, message: 'Templating rate deleted' });
  } catch (error: any) {
    console.error('Error deleting templating rate:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete templating rate' },
      { status: 400 }
    );
  }
}
