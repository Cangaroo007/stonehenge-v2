import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { applyPriceListUpdate } from '@/lib/services/price-list-applier';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN', 'SALES_MANAGER']);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id: supplierId, uploadId } = await params;

    // Verify supplier belongs to user's company
    const supplier = await prisma.suppliers.findFirst({
      where: { id: supplierId, company_id: auth.user.companyId },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Verify upload belongs to this supplier and is in REVIEW status
    const upload = await prisma.price_list_uploads.findFirst({
      where: {
        id: uploadId,
        supplier_id: supplierId,
        company_id: auth.user.companyId,
      },
    });

    if (!upload) {
      return NextResponse.json(
        { error: 'Price list upload not found' },
        { status: 404 }
      );
    }

    if (upload.status !== 'REVIEW') {
      return NextResponse.json(
        { error: `Cannot apply upload with status: ${upload.status}` },
        { status: 400 }
      );
    }

    const body = await request.json();

    const result = await applyPriceListUpdate(
      auth.user.companyId,
      supplierId,
      uploadId,
      body.matches,
      body.fabricationCategory || 'ENGINEERED',
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error applying price list:', error);
    return NextResponse.json(
      { error: 'Failed to apply price list update' },
      { status: 500 }
    );
  }
}
