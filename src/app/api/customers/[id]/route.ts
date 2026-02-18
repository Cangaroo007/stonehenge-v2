import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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
    const customer = await prisma.customers.findUnique({
      where: { id: parseInt(id) },
      include: {
        client_types: true,
        client_tiers: true,
        price_books: true,
        _count: {
          select: {
            quotes: true,
            user: true,
          },
        },
      },
    });

    if (!customer || customer.company_id !== companyId) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }
}

export async function PUT(
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

    // Verify customer belongs to user's company
    const ownerCheck = await verifyCustomerOwnership(customerId, companyId);
    if (!ownerCheck) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const data = await request.json();

    const customer = await prisma.customers.update({
      where: { id: customerId },
      data: {
        name: data.name,
        company: data.company || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        notes: data.notes || null,
        client_type_id: data.clientTypeId || null,
        client_tier_id: data.clientTierId || null,
        default_price_book_id: data.defaultPriceBookId || null,
      },
      include: {
        client_types: true,
        client_tiers: true,
        price_books: true,
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(
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

    // Verify customer belongs to user's company
    const ownerCheck = await verifyCustomerOwnership(customerId, companyId);
    if (!ownerCheck) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    await prisma.customers.delete({
      where: { id: customerId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
