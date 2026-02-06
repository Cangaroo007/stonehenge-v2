import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/templating-rates
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
    
    const rates = await prisma.templatingRate.findMany({
      where: { companyId: userWithCompany.companyId },
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json(rates);
  } catch (error: any) {
    console.error('Error fetching templating rates:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch templating rates' },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

// POST /api/admin/pricing/templating-rates
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
    
    const rate = await prisma.templatingRate.create({
      data: {
        name: body.name || 'Standard Templating',
        baseCharge: body.baseCharge,
        ratePerKm: body.ratePerKm,
        isActive: body.isActive !== undefined ? body.isActive : true,
        companyId: userWithCompany.companyId
      }
    });
    
    return NextResponse.json(rate, { status: 201 });
  } catch (error: any) {
    console.error('Error creating templating rate:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create templating rate' },
      { status: 400 }
    );
  }
}
