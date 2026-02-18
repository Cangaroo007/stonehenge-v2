import { NextRequest, NextResponse } from 'next/server';
import { getDrawingsForCustomer } from '@/lib/services/drawingService';
import { requireAuth, verifyCustomerOwnership } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const { id } = await params;
    const customerId = parseInt(id);

    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const ownerCheck = await verifyCustomerOwnership(customerId, companyId);
    if (!ownerCheck) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const drawings = await getDrawingsForCustomer(customerId);
    return NextResponse.json(drawings);
  } catch (error) {
    console.error('Error fetching customer drawings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch drawings' },
      { status: 500 }
    );
  }
}
