import { NextRequest, NextResponse } from 'next/server';
import { getDrawingsForCustomer } from '@/lib/services/drawingService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customerId = parseInt(id);

    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
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
