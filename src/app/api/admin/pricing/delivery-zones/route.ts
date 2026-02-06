import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/delivery-zones
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ADMIN', 'SALES_MANAGER']);
    
    // Get user's company
    const userWithCompany = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyId: true }
    });
    
    if (!userWithCompany?.companyId) {
      return NextResponse.json(
        { error: 'User is not associated with a company' },
        { status: 400 }
      );
    }
    
    const zones = await prisma.deliveryZone.findMany({
      where: { companyId: userWithCompany.companyId },
      orderBy: { maxDistanceKm: 'asc' }
    });
    
    return NextResponse.json(zones);
  } catch (error: any) {
    console.error('Error fetching delivery zones:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch delivery zones' },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

// POST /api/admin/pricing/delivery-zones
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ADMIN']);
    
    // Get user's company
    const userWithCompany = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyId: true }
    });
    
    if (!userWithCompany?.companyId) {
      return NextResponse.json(
        { error: 'User is not associated with a company' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    const zone = await prisma.deliveryZone.create({
      data: {
        name: body.name,
        maxDistanceKm: body.maxDistanceKm,
        ratePerKm: body.ratePerKm,
        baseCharge: body.baseCharge,
        isActive: body.isActive !== undefined ? body.isActive : true,
        companyId: userWithCompany.companyId
      }
    });
    
    return NextResponse.json(zone, { status: 201 });
  } catch (error: any) {
    console.error('Error creating delivery zone:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create delivery zone' },
      { status: 400 }
    );
  }
}
