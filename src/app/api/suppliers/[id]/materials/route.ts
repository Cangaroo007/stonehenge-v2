import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id: supplierId } = await params;

    // Verify supplier belongs to user's company
    const supplier = await prisma.suppliers.findFirst({
      where: { id: supplierId, company_id: auth.user.companyId },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const materials = await prisma.materials.findMany({
      where: { supplier_id: supplierId },
      orderBy: [{ supplier_range: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json(materials);
  } catch (error) {
    console.error('Error fetching supplier materials:', error);
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 });
  }
}
